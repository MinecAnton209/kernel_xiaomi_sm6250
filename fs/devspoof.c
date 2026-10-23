/* SPDX-License-Identifier: GPL-2.0 */
#include <linux/init.h>
#include <linux/kernel.h>
#include <linux/kobject.h>
#include <linux/mutex.h>
#include <linux/string.h>
#include <linux/sysfs.h>
#include <linux/types.h>
#include <linux/devspoof.h>

#define DS_SCOPE_APPS		0
#define DS_SCOPE_ALL		1
#define DS_SCOPE_ROOT		2
#define DS_SCOPE_SELECTED	3

static const char *const devspoof_scope_names[] = {
	[DS_SCOPE_APPS]		= "apps",
	[DS_SCOPE_ALL]		= "all",
	[DS_SCOPE_ROOT]		= "root",
	[DS_SCOPE_SELECTED]	= "selected",
};

struct devspoof_state {
	bool enabled;
	unsigned int scope;
	uid_t appids[DEVSPOOF_MAX_APPIDS];
	unsigned int appid_count;

	bool cpu_hardware_set;
	char cpu_hardware[DEVSPOOF_STR_LEN];
	bool cpu_processor_set;
	char cpu_processor[DEVSPOOF_STR_LEN];
	bool cpu_model_name_set;
	char cpu_model_name[DEVSPOOF_STR_LEN];
	bool cpu_implementer_set;
	u32 cpu_implementer;
	bool cpu_architecture_set;
	u32 cpu_architecture;
	bool cpu_variant_set;
	u32 cpu_variant;
	bool cpu_part_set;
	u32 cpu_part;
	bool cpu_revision_set;
	u32 cpu_revision;
	bool cpu_freq_set[DEVSPOOF_MAX_CPUS];
	u32 cpu_freq[DEVSPOOF_MAX_CPUS];

	bool gpu_model_set;
	char gpu_model[DEVSPOOF_STR_LEN];
	bool gpu_max_clk_set;
	u32 gpu_max_clk;

	bool soc_machine_set;
	char soc_machine[DEVSPOOF_STR_LEN];
	bool soc_family_set;
	char soc_family[DEVSPOOF_STR_LEN];
	bool soc_id_set;
	char soc_id[DEVSPOOF_STR_LEN];
	bool soc_revision_set;
	char soc_revision[DEVSPOOF_STR_LEN];

	bool mem_total_set;
	u64 mem_total_kb;

	bool dt_model_set;
	char dt_model[DEVSPOOF_MODEL_LEN];
	bool dt_compatible_set;
	char dt_compatible[DEVSPOOF_COMPAT_LEN];
};

static struct devspoof_state devspoof_state;
static DEFINE_MUTEX(devspoof_lock);
static struct kobject *devspoof_kobj;

#ifdef CONFIG_KSU
extern bool __ksu_is_allow_uid(uid_t uid);
static inline bool devspoof_is_su(uid_t uid)
{
	return __ksu_is_allow_uid(uid);
}
#else
static inline bool devspoof_is_su(uid_t uid)
{
	return uid == 0;
}
#endif

/*
 * App ids repeat per Android user: uid 1010123 and 10123 are the same app.
 * Isolated processes have ids in 90000..99999 and no package name, but they
 * still have to be covered by the "apps" and "all" scopes.
 */
static inline bool devspoof_is_app(uid_t uid)
{
	uid_t appid = uid % 100000;

	return (appid >= 10000 && appid < 20000) ||
	       (appid >= 90000 && appid < 100000);
}

static bool devspoof_applies_locked(uid_t uid)
{
	uid_t appid;
	unsigned int i;

	if (!devspoof_state.enabled)
		return false;

	/*
	 * "root" is not only uid 0: the shell and every KSU-granted app are
	 * included, which is what selecting "only root" is expected to mean.
	 */
	switch (devspoof_state.scope) {
	case DS_SCOPE_APPS:
		return devspoof_is_app(uid) && !devspoof_is_su(uid);
	case DS_SCOPE_ALL:
		return devspoof_is_app(uid);
	case DS_SCOPE_ROOT:
		return uid == 0 || uid == 2000 || devspoof_is_su(uid);
	case DS_SCOPE_SELECTED:
		appid = uid % 100000;
		for (i = 0; i < devspoof_state.appid_count; i++) {
			if (devspoof_state.appids[i] == appid)
				return true;
		}
		return false;
	default:
		return false;
	}
}

/*
 * "default" (or "-") clears a field.  A bare newline is rejected instead of
 * silently clearing it, so a truncated write cannot wipe a setting.  The length
 * is checked after the trailing newline from echo is dropped, so a value fits
 * whenever it leaves room for the terminating NUL in @size; the WebUI and
 * spoof.sh use the same limit.
 */
static ssize_t devspoof_store_str(const char *buf, size_t count,
				  char *dst, size_t size, bool *set)
{
	char tmp[DEVSPOOF_COMPAT_LEN + 1];
	size_t len;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	len = strlen(tmp);
	while (len > 0) {
		char c = tmp[len - 1];

		if (c != '\n' && c != '\r' && c != ' ' && c != '\t')
			break;
		tmp[--len] = '\0';
	}

	mutex_lock(&devspoof_lock);
	if (!strcmp(tmp, "default") || !strcmp(tmp, "-")) {
		dst[0] = '\0';
		*set = false;
	} else if (len == 0 || len >= size) {
		mutex_unlock(&devspoof_lock);
		return -EINVAL;
	} else {
		strscpy(dst, tmp, size);
		*set = true;
	}
	mutex_unlock(&devspoof_lock);

	return count;
}

static ssize_t devspoof_store_u32(const char *buf, size_t count,
				  u32 *dst, bool *set)
{
	char tmp[32];
	size_t len;
	u32 value;
	int ret;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	len = strlen(tmp);
	while (len > 0) {
		char c = tmp[len - 1];

		if (c != '\n' && c != '\r' && c != ' ' && c != '\t')
			break;
		tmp[--len] = '\0';
	}

	mutex_lock(&devspoof_lock);
	if (!strcmp(tmp, "default") || !strcmp(tmp, "-")) {
		*dst = 0;
		*set = false;
		mutex_unlock(&devspoof_lock);
		return count;
	}
	ret = kstrtou32(tmp, 0, &value);
	if (ret) {
		mutex_unlock(&devspoof_lock);
		return ret;
	}
	*dst = value;
	*set = true;
	mutex_unlock(&devspoof_lock);

	return count;
}

static ssize_t devspoof_store_u64(const char *buf, size_t count,
				  u64 *dst, bool *set)
{
	char tmp[32];
	size_t len;
	u64 value;
	int ret;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	len = strlen(tmp);
	while (len > 0) {
		char c = tmp[len - 1];

		if (c != '\n' && c != '\r' && c != ' ' && c != '\t')
			break;
		tmp[--len] = '\0';
	}

	mutex_lock(&devspoof_lock);
	if (!strcmp(tmp, "default") || !strcmp(tmp, "-")) {
		*dst = 0;
		*set = false;
		mutex_unlock(&devspoof_lock);
		return count;
	}
	ret = kstrtou64(tmp, 0, &value);
	if (ret) {
		mutex_unlock(&devspoof_lock);
		return ret;
	}
	*dst = value;
	*set = true;
	mutex_unlock(&devspoof_lock);

	return count;
}

#define DS_STR_ATTR(_name)						\
static ssize_t _name##_show(struct kobject *kobj,			\
			    struct kobj_attribute *attr, char *buf)	\
{									\
	ssize_t ret;							\
									\
	mutex_lock(&devspoof_lock);					\
	ret = scnprintf(buf, PAGE_SIZE, "%s\n",			\
			devspoof_state._name##_set ?			\
			devspoof_state._name : "");			\
	mutex_unlock(&devspoof_lock);					\
	return ret;							\
}									\
static ssize_t _name##_store(struct kobject *kobj,			\
			     struct kobj_attribute *attr,		\
			     const char *buf, size_t count)		\
{									\
	return devspoof_store_str(buf, count,				\
				  devspoof_state._name,			\
				  sizeof(devspoof_state._name),		\
				  &devspoof_state._name##_set);		\
}									\
static struct kobj_attribute _name##_attr =				\
	__ATTR(_name, 0600, _name##_show, _name##_store)

#define DS_U32_ATTR(_name)						\
static ssize_t _name##_show(struct kobject *kobj,			\
			    struct kobj_attribute *attr, char *buf)	\
{									\
	ssize_t ret;							\
									\
	mutex_lock(&devspoof_lock);					\
	ret = devspoof_state._name##_set ?				\
	      scnprintf(buf, PAGE_SIZE, "%u\n", devspoof_state._name) :	\
	      scnprintf(buf, PAGE_SIZE, "\n");				\
	mutex_unlock(&devspoof_lock);					\
	return ret;							\
}									\
static ssize_t _name##_store(struct kobject *kobj,			\
			     struct kobj_attribute *attr,		\
			     const char *buf, size_t count)		\
{									\
	return devspoof_store_u32(buf, count,				\
				  &devspoof_state._name,			\
				  &devspoof_state._name##_set);		\
}									\
static struct kobj_attribute _name##_attr =				\
	__ATTR(_name, 0600, _name##_show, _name##_store)

static ssize_t enabled_show(struct kobject *kobj,
			    struct kobj_attribute *attr, char *buf)
{
	ssize_t ret;

	mutex_lock(&devspoof_lock);
	ret = scnprintf(buf, PAGE_SIZE, "%d\n", devspoof_state.enabled);
	mutex_unlock(&devspoof_lock);
	return ret;
}

static ssize_t enabled_store(struct kobject *kobj,
			     struct kobj_attribute *attr,
			     const char *buf, size_t count)
{
	bool value;
	int ret;

	ret = kstrtobool(buf, &value);
	if (ret)
		return ret;

	mutex_lock(&devspoof_lock);
	devspoof_state.enabled = value;
	mutex_unlock(&devspoof_lock);

	return count;
}
static struct kobj_attribute enabled_attr =
	__ATTR(enabled, 0600, enabled_show, enabled_store);

static ssize_t scope_show(struct kobject *kobj,
			  struct kobj_attribute *attr, char *buf)
{
	ssize_t ret;

	mutex_lock(&devspoof_lock);
	if (devspoof_state.scope < ARRAY_SIZE(devspoof_scope_names))
		ret = scnprintf(buf, PAGE_SIZE, "%s\n",
				devspoof_scope_names[devspoof_state.scope]);
	else
		ret = scnprintf(buf, PAGE_SIZE, "apps\n");
	mutex_unlock(&devspoof_lock);
	return ret;
}

static ssize_t scope_store(struct kobject *kobj,
			   struct kobj_attribute *attr,
			   const char *buf, size_t count)
{
	char tmp[16];
	unsigned int i;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	strim(tmp);

	for (i = 0; i < ARRAY_SIZE(devspoof_scope_names); i++) {
		if (!strcmp(tmp, devspoof_scope_names[i])) {
			mutex_lock(&devspoof_lock);
			devspoof_state.scope = i;
			mutex_unlock(&devspoof_lock);
			return count;
		}
	}
	return -EINVAL;
}
static struct kobj_attribute scope_attr =
	__ATTR(scope, 0600, scope_show, scope_store);

static ssize_t uids_show(struct kobject *kobj,
			 struct kobj_attribute *attr, char *buf)
{
	ssize_t len = 0;
	unsigned int i;

	mutex_lock(&devspoof_lock);
	for (i = 0; i < devspoof_state.appid_count; i++)
		len += scnprintf(buf + len, PAGE_SIZE - len, "%u ",
				 devspoof_state.appids[i]);
	mutex_unlock(&devspoof_lock);

	if (len == 0)
		len = scnprintf(buf, PAGE_SIZE, "\n");
	else if (len < PAGE_SIZE - 1)
		len += scnprintf(buf + len, PAGE_SIZE - len, "\n");
	return len;
}

/*
 * Accept both full uids and app ids.  Storing the app id once covers every
 * Android user, so the selection survives a secondary profile.
 */
static ssize_t uids_store(struct kobject *kobj,
			  struct kobj_attribute *attr,
			  const char *buf, size_t count)
{
	char tmp[512];
	char *cur, *token;
	uid_t ids[DEVSPOOF_MAX_APPIDS];
	unsigned int n = 0;
	bool clear = false;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	strim(tmp);

	if (!strcmp(tmp, "default") || !strcmp(tmp, "-")) {
		clear = true;
	} else {
		cur = tmp;
		while ((token = strsep(&cur, " ,\t")) != NULL) {
			unsigned int value;
			uid_t appid;
			int ret;

			if (*token == '\0')
				continue;
			ret = kstrtouint(token, 0, &value);
			if (ret)
				return ret;
			appid = value % 100000;
			if (!devspoof_is_app(value) && !devspoof_is_app(appid))
				return -EINVAL;
			if (n >= DEVSPOOF_MAX_APPIDS)
				return -E2BIG;
			ids[n++] = appid;
		}
	}

	mutex_lock(&devspoof_lock);
	if (clear) {
		devspoof_state.appid_count = 0;
	} else {
		memcpy(devspoof_state.appids, ids, n * sizeof(ids[0]));
		devspoof_state.appid_count = n;
	}
	mutex_unlock(&devspoof_lock);

	return count;
}
static struct kobj_attribute uids_attr =
	__ATTR(uids, 0600, uids_show, uids_store);

static ssize_t cpu_max_freqs_show(struct kobject *kobj,
				  struct kobj_attribute *attr, char *buf)
{
	ssize_t len = 0;
	unsigned int i;

	mutex_lock(&devspoof_lock);
	for (i = 0; i < DEVSPOOF_MAX_CPUS; i++) {
		if (!devspoof_state.cpu_freq_set[i])
			continue;
		len += scnprintf(buf + len, PAGE_SIZE - len, "%u ",
				 devspoof_state.cpu_freq[i]);
	}
	mutex_unlock(&devspoof_lock);

	if (len == 0)
		len = scnprintf(buf, PAGE_SIZE, "\n");
	else if (len < PAGE_SIZE - 1)
		len += scnprintf(buf + len, PAGE_SIZE - len, "\n");
	return len;
}

/* One value per logical CPU, in the order the cpufreq policies are registered. */
static ssize_t cpu_max_freqs_store(struct kobject *kobj,
				   struct kobj_attribute *attr,
				   const char *buf, size_t count)
{
	char tmp[256];
	char *cur, *token;
	u32 freqs[DEVSPOOF_MAX_CPUS];
	bool set[DEVSPOOF_MAX_CPUS];
	unsigned int n = 0;
	bool clear = false;

	if (count == 0 || count >= sizeof(tmp))
		return -EINVAL;

	memcpy(tmp, buf, count);
	tmp[count] = '\0';
	strim(tmp);
	memset(set, 0, sizeof(set));

	if (!strcmp(tmp, "default") || !strcmp(tmp, "-")) {
		clear = true;
	} else {
		cur = tmp;
		while ((token = strsep(&cur, " ,\t")) != NULL) {
			u32 value;
			int ret;

			if (*token == '\0')
				continue;
			if (n >= DEVSPOOF_MAX_CPUS)
				return -E2BIG;
			ret = kstrtou32(token, 0, &value);
			if (ret)
				return ret;
			freqs[n] = value;
			set[n] = true;
			n++;
		}
	}

	mutex_lock(&devspoof_lock);
	memset(devspoof_state.cpu_freq, 0,
	       sizeof(devspoof_state.cpu_freq));
	memset(devspoof_state.cpu_freq_set, 0,
	       sizeof(devspoof_state.cpu_freq_set));
	if (!clear) {
		memcpy(devspoof_state.cpu_freq, freqs, n * sizeof(freqs[0]));
		memcpy(devspoof_state.cpu_freq_set, set, n * sizeof(set[0]));
	}
	mutex_unlock(&devspoof_lock);

	return count;
}
static struct kobj_attribute cpu_max_freqs_attr =
	__ATTR(cpu_max_freqs, 0600, cpu_max_freqs_show, cpu_max_freqs_store);

static ssize_t mem_total_kb_show(struct kobject *kobj,
				 struct kobj_attribute *attr, char *buf)
{
	ssize_t ret;

	mutex_lock(&devspoof_lock);
	ret = devspoof_state.mem_total_set ?
	      scnprintf(buf, PAGE_SIZE, "%llu\n", devspoof_state.mem_total_kb) :
	      scnprintf(buf, PAGE_SIZE, "\n");
	mutex_unlock(&devspoof_lock);
	return ret;
}

static ssize_t mem_total_kb_store(struct kobject *kobj,
				  struct kobj_attribute *attr,
				  const char *buf, size_t count)
{
	return devspoof_store_u64(buf, count,
				  &devspoof_state.mem_total_kb,
				  &devspoof_state.mem_total_set);
}
static struct kobj_attribute mem_total_kb_attr =
	__ATTR(mem_total_kb, 0600, mem_total_kb_show, mem_total_kb_store);

static ssize_t reset_store(struct kobject *kobj,
			   struct kobj_attribute *attr,
			   const char *buf, size_t count)
{
	mutex_lock(&devspoof_lock);
	memset(&devspoof_state, 0, sizeof(devspoof_state));
	devspoof_state.scope = DS_SCOPE_APPS;
	mutex_unlock(&devspoof_lock);

	return count;
}
static struct kobj_attribute reset_attr =
	__ATTR(reset, 0200, NULL, reset_store);

DS_STR_ATTR(cpu_hardware);
DS_STR_ATTR(cpu_processor);
DS_STR_ATTR(cpu_model_name);
DS_U32_ATTR(cpu_implementer);
DS_U32_ATTR(cpu_architecture);
DS_U32_ATTR(cpu_variant);
DS_U32_ATTR(cpu_part);
DS_U32_ATTR(cpu_revision);

DS_STR_ATTR(gpu_model);
DS_U32_ATTR(gpu_max_clk);

DS_STR_ATTR(soc_machine);
DS_STR_ATTR(soc_family);
DS_STR_ATTR(soc_id);
DS_STR_ATTR(soc_revision);

DS_STR_ATTR(dt_model);
DS_STR_ATTR(dt_compatible);

static struct attribute *devspoof_attrs[] = {
	&enabled_attr.attr,
	&scope_attr.attr,
	&uids_attr.attr,
	&cpu_hardware_attr.attr,
	&cpu_processor_attr.attr,
	&cpu_model_name_attr.attr,
	&cpu_implementer_attr.attr,
	&cpu_architecture_attr.attr,
	&cpu_variant_attr.attr,
	&cpu_part_attr.attr,
	&cpu_revision_attr.attr,
	&cpu_max_freqs_attr.attr,
	&gpu_model_attr.attr,
	&gpu_max_clk_attr.attr,
	&soc_machine_attr.attr,
	&soc_family_attr.attr,
	&soc_id_attr.attr,
	&soc_revision_attr.attr,
	&mem_total_kb_attr.attr,
	&dt_model_attr.attr,
	&dt_compatible_attr.attr,
	&reset_attr.attr,
	NULL,
};

static const struct attribute_group devspoof_group = {
	.attrs = devspoof_attrs,
};

/*
 * Snapshot under the mutex: a show callback must never observe a string half
 * replaced by a concurrent write.
 */
bool devspoof_get_cpu(uid_t uid, struct devspoof_cpu *out)
{
	unsigned int i;
	bool applies;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid);
	if (applies) {
		memset(out, 0, sizeof(*out));
		out->hardware_set = devspoof_state.cpu_hardware_set;
		strscpy(out->hardware, devspoof_state.cpu_hardware,
			sizeof(out->hardware));
		out->processor_set = devspoof_state.cpu_processor_set;
		strscpy(out->processor, devspoof_state.cpu_processor,
			sizeof(out->processor));
		out->model_name_set = devspoof_state.cpu_model_name_set;
		strscpy(out->model_name, devspoof_state.cpu_model_name,
			sizeof(out->model_name));
		out->implementer_set = devspoof_state.cpu_implementer_set;
		out->implementer = devspoof_state.cpu_implementer;
		out->architecture_set = devspoof_state.cpu_architecture_set;
		out->architecture = devspoof_state.cpu_architecture;
		out->variant_set = devspoof_state.cpu_variant_set;
		out->variant = devspoof_state.cpu_variant;
		out->part_set = devspoof_state.cpu_part_set;
		out->part = devspoof_state.cpu_part;
		out->revision_set = devspoof_state.cpu_revision_set;
		out->revision = devspoof_state.cpu_revision;
		for (i = 0; i < DEVSPOOF_MAX_CPUS; i++) {
			out->freq_set[i] = devspoof_state.cpu_freq_set[i];
			out->freq[i] = devspoof_state.cpu_freq[i];
		}
	}
	mutex_unlock(&devspoof_lock);

	return applies;
}

bool devspoof_get_gpu(uid_t uid, struct devspoof_gpu *out)
{
	bool applies;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid);
	if (applies) {
		memset(out, 0, sizeof(*out));
		out->model_set = devspoof_state.gpu_model_set;
		strscpy(out->model, devspoof_state.gpu_model,
			sizeof(out->model));
		out->max_clk_set = devspoof_state.gpu_max_clk_set;
		out->max_clk = devspoof_state.gpu_max_clk;
	}
	mutex_unlock(&devspoof_lock);

	return applies;
}

bool devspoof_get_soc(uid_t uid, struct devspoof_soc *out)
{
	bool applies;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid);
	if (applies) {
		memset(out, 0, sizeof(*out));
		out->machine_set = devspoof_state.soc_machine_set;
		strscpy(out->machine, devspoof_state.soc_machine,
			sizeof(out->machine));
		out->family_set = devspoof_state.soc_family_set;
		strscpy(out->family, devspoof_state.soc_family,
			sizeof(out->family));
		out->soc_id_set = devspoof_state.soc_id_set;
		strscpy(out->soc_id, devspoof_state.soc_id,
			sizeof(out->soc_id));
		out->revision_set = devspoof_state.soc_revision_set;
		strscpy(out->revision, devspoof_state.soc_revision,
			sizeof(out->revision));
	}
	mutex_unlock(&devspoof_lock);

	return applies;
}

bool devspoof_get_mem(uid_t uid, struct devspoof_mem *out)
{
	bool applies;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid);
	if (applies) {
		memset(out, 0, sizeof(*out));
		out->total_set = devspoof_state.mem_total_set;
		out->total_kb = devspoof_state.mem_total_kb;
	}
	mutex_unlock(&devspoof_lock);

	return applies;
}

bool devspoof_get_dt(uid_t uid, struct devspoof_dt *out)
{
	bool applies;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid);
	if (applies) {
		memset(out, 0, sizeof(*out));
		out->model_set = devspoof_state.dt_model_set;
		strscpy(out->model, devspoof_state.dt_model,
			sizeof(out->model));
		out->compatible_set = devspoof_state.dt_compatible_set;
		strscpy(out->compatible, devspoof_state.dt_compatible,
			sizeof(out->compatible));
	}
	mutex_unlock(&devspoof_lock);

	return applies;
}

bool devspoof_get_cpu_freq(uid_t uid, unsigned int cpu, u32 *freq)
{
	bool applies;

	if (cpu >= DEVSPOOF_MAX_CPUS)
		return false;

	mutex_lock(&devspoof_lock);
	applies = devspoof_applies_locked(uid) &&
		  devspoof_state.cpu_freq_set[cpu];
	if (applies)
		*freq = devspoof_state.cpu_freq[cpu];
	mutex_unlock(&devspoof_lock);

	return applies;
}

/* /sys/kernel is created by ksysfs_init(), so a late initcall can attach here. */
static int __init devspoof_init(void)
{
	int ret;

	devspoof_state.scope = DS_SCOPE_APPS;

	devspoof_kobj = kobject_create_and_add("device_spoof", kernel_kobj);
	if (!devspoof_kobj)
		return -ENOMEM;

	ret = sysfs_create_group(devspoof_kobj, &devspoof_group);
	if (ret) {
		kobject_put(devspoof_kobj);
		devspoof_kobj = NULL;
		return ret;
	}

	pr_info("devspoof: control interface at /sys/kernel/device_spoof\n");
	return 0;
}
late_initcall(devspoof_init);
