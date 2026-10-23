/* SPDX-License-Identifier: GPL-2.0 */
#ifndef _LINUX_DEVSPOOF_H
#define _LINUX_DEVSPOOF_H

#include <linux/types.h>

#define DEVSPOOF_MAX_CPUS	16
#define DEVSPOOF_MAX_APPIDS	64
#define DEVSPOOF_STR_LEN	64
#define DEVSPOOF_MODEL_LEN	128
#define DEVSPOOF_COMPAT_LEN	256

struct devspoof_cpu {
	bool hardware_set;
	char hardware[DEVSPOOF_STR_LEN];

	bool processor_set;
	char processor[DEVSPOOF_STR_LEN];

	bool model_name_set;
	char model_name[DEVSPOOF_STR_LEN];

	bool implementer_set;
	bool architecture_set;
	bool variant_set;
	bool part_set;
	bool revision_set;
	u32 implementer;
	u32 architecture;
	u32 variant;
	u32 part;
	u32 revision;

	bool freq_set[DEVSPOOF_MAX_CPUS];
	u32 freq[DEVSPOOF_MAX_CPUS];
};

struct devspoof_gpu {
	bool model_set;
	char model[DEVSPOOF_STR_LEN];
	bool max_clk_set;
	u32 max_clk;
};

struct devspoof_soc {
	bool machine_set;
	char machine[DEVSPOOF_STR_LEN];
	bool family_set;
	char family[DEVSPOOF_STR_LEN];
	bool soc_id_set;
	char soc_id[DEVSPOOF_STR_LEN];
	bool revision_set;
	char revision[DEVSPOOF_STR_LEN];
};

struct devspoof_mem {
	bool total_set;
	u64 total_kb;
};

struct devspoof_dt {
	bool model_set;
	char model[DEVSPOOF_MODEL_LEN];
	bool compatible_set;
	char compatible[DEVSPOOF_COMPAT_LEN];
};

#ifdef CONFIG_DEVSPOOF

/*
 * Each getter returns false when the current process is outside the configured
 * scope; callers then use the real value.  When it returns true, @out is a
 * complete snapshot and may be used without holding any lock.
 */
bool devspoof_get_cpu(uid_t uid, struct devspoof_cpu *out);
bool devspoof_get_gpu(uid_t uid, struct devspoof_gpu *out);
bool devspoof_get_soc(uid_t uid, struct devspoof_soc *out);
bool devspoof_get_mem(uid_t uid, struct devspoof_mem *out);
bool devspoof_get_dt(uid_t uid, struct devspoof_dt *out);
bool devspoof_get_cpu_freq(uid_t uid, unsigned int cpu, u32 *freq);

#else /* !CONFIG_DEVSPOOF */

static inline bool devspoof_get_cpu(uid_t uid, struct devspoof_cpu *out)
{
	(void)uid;
	(void)out;
	return false;
}

static inline bool devspoof_get_gpu(uid_t uid, struct devspoof_gpu *out)
{
	(void)uid;
	(void)out;
	return false;
}

static inline bool devspoof_get_soc(uid_t uid, struct devspoof_soc *out)
{
	(void)uid;
	(void)out;
	return false;
}

static inline bool devspoof_get_mem(uid_t uid, struct devspoof_mem *out)
{
	(void)uid;
	(void)out;
	return false;
}

static inline bool devspoof_get_dt(uid_t uid, struct devspoof_dt *out)
{
	(void)uid;
	(void)out;
	return false;
}

static inline bool devspoof_get_cpu_freq(uid_t uid, unsigned int cpu, u32 *freq)
{
	(void)uid;
	(void)cpu;
	(void)freq;
	return false;
}

#endif /* CONFIG_DEVSPOOF */

#endif /* _LINUX_DEVSPOOF_H */
