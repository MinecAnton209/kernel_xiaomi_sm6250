#include <linux/capability.h>
#include <linux/cred.h>
#include <linux/fs.h>
#include <linux/mount.h>
#include <linux/namei.h>
#include <linux/sched.h>
#include <linux/init.h>
#include <linux/uaccess.h>
#include <linux/susfs.h>
#include <linux/susfs_def.h>
#include <linux/susfs_ksu.h>
#include "internal.h"

/* Provided by KernelSU-Next (drivers/kernelsu/selinux/selinux.c, kernel/core/init.c). */
extern bool is_ksu_domain(void);
extern bool is_zygote(const struct cred *cred);
extern struct cred *ksu_cred;
extern bool __ksu_is_allow_uid_for_current(uid_t uid);
extern bool ksu_uid_should_umount(uid_t uid);
extern void escape_to_root_for_adb_root(void);
extern bool susfs_is_auto_add_sus_bind_mount_enabled;
extern bool susfs_is_auto_add_sus_ksu_default_mount_enabled;
extern bool susfs_is_auto_add_try_umount_for_bind_mount_enabled;
#ifdef CONFIG_KSU_SUSFS_TRY_UMOUNT
extern void susfs_try_umount(uid_t target_uid);
#endif
#ifdef CONFIG_KSU_SUSFS_SUS_SU
#include <linux/sus_su.h>
#endif

bool susfs_is_current_ksu_domain(void)
{
	return is_ksu_domain();
}

bool susfs_is_current_zygote_domain(void)
{
	return is_zygote(current_cred());
}

/*
 * Zygote children have no CAP_SYS_ADMIN in their own userns, so
 * path_umount()'s may_mount() check would reject them. Run the umount
 * with KernelSU's credentials, the same way kernel_umount does.
 */
void ksu_try_umount(const char *mnt, bool check_mnt, int flags, uid_t uid)
{
	struct path path;
	const struct cred *saved = NULL;
	int err;

	if (kern_path(mnt, 0, &path))
		return;

	if (check_mnt && path.dentry != path.mnt->mnt_root) {
		path_put(&path);
		return;
	}

	if (ksu_cred)
		saved = override_creds(ksu_cred);

	err = path_umount(&path, flags);
	if (err)
		pr_info("susfs: umount %s for uid %u failed: %d\n", mnt, uid, err);

	if (saved)
		revert_creds(saved);
}

#ifdef CONFIG_KSU_SUSFS_TRY_UMOUNT
void susfs_try_umount_all(uid_t uid)
{
	susfs_try_umount(uid);
}

#ifdef CONFIG_KSU_SUSFS_SUS_MOUNT
static bool susfs_umount_zygote_system_process;
#endif

static bool susfs_is_zygote_system_umount(uid_t uid)
{
#ifdef CONFIG_KSU_SUSFS_SUS_MOUNT
	return uid >= 1000 && uid < 10000 && susfs_umount_zygote_system_process;
#else
	return false;
#endif
}

/*
 * Safe to call from the syscall hook: it only decides, it never sleeps.
 */
bool susfs_should_try_umount_on_spawn(uid_t new_uid)
{
	if (!is_zygote(current_cred()))
		return false;
	if (new_uid < 10000 && !susfs_is_zygote_system_umount(new_uid))
		return false;
	return ksu_uid_should_umount(new_uid);
}

/*
 * Runs the SUSFS try_umount list for a zygote child ahead of KernelSU's own
 * umount, so SUSFS paths are gone first. path_umount() sleeps in
 * synchronize_rcu(), so this must run from task_work, not from the sys_enter
 * hook, which is atomic.
 */
void susfs_try_umount_on_spawn(uid_t new_uid)
{
	susfs_try_umount_all(new_uid);
}
#endif

static bool susfs_path_exists(const char *path)
{
	struct path p;

	if (kern_path(path, 0, &p))
		return false;
	path_put(&p);
	return true;
}

/*
 * The DATA_ADB_* marker files live on /data, so they can only be checked
 * once post-fs-data runs. Auto-add defaults stay on unless a marker opts out.
 */
void susfs_on_post_fs_data(void)
{
#ifdef CONFIG_KSU_SUSFS_SUS_MOUNT
	if (susfs_path_exists(DATA_ADB_UMOUNT_FOR_ZYGOTE_SYSTEM_PROCESS))
		susfs_umount_zygote_system_process = true;
#endif
#ifdef CONFIG_KSU_SUSFS_AUTO_ADD_SUS_BIND_MOUNT
	if (susfs_path_exists(DATA_ADB_NO_AUTO_ADD_SUS_BIND_MOUNT))
		susfs_is_auto_add_sus_bind_mount_enabled = false;
#endif
#ifdef CONFIG_KSU_SUSFS_AUTO_ADD_SUS_KSU_DEFAULT_MOUNT
	if (susfs_path_exists(DATA_ADB_NO_AUTO_ADD_SUS_KSU_DEFAULT_MOUNT))
		susfs_is_auto_add_sus_ksu_default_mount_enabled = false;
#endif
#ifdef CONFIG_KSU_SUSFS_AUTO_ADD_TRY_UMOUNT_FOR_BIND_MOUNT
	if (susfs_path_exists(DATA_ADB_NO_AUTO_ADD_TRY_UMOUNT_FOR_BIND_MOUNT))
		susfs_is_auto_add_try_umount_for_bind_mount_enabled = false;
#endif
}

static int susfs_show_text(void __user *arg, const char *text)
{
	size_t len = min_t(size_t, strlen(text) + 1, SUSFS_SHOW_BUF_LEN);

	return copy_to_user(arg, text, len) ? -EFAULT : 0;
}

static int susfs_show_features(void __user *arg)
{
	char buf[SUSFS_SHOW_BUF_LEN];
	int len = 0;

	len += scnprintf(buf + len, sizeof(buf) - len, "sus_path=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_SUS_PATH));
	len += scnprintf(buf + len, sizeof(buf) - len, "sus_mount=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_SUS_MOUNT));
	len += scnprintf(buf + len, sizeof(buf) - len, "sus_kstat=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_SUS_KSTAT));
	len += scnprintf(buf + len, sizeof(buf) - len, "try_umount=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_TRY_UMOUNT));
	len += scnprintf(buf + len, sizeof(buf) - len, "spoof_uname=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_SPOOF_UNAME));
	len += scnprintf(buf + len, sizeof(buf) - len, "open_redirect=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_OPEN_REDIRECT));
	len += scnprintf(buf + len, sizeof(buf) - len, "enable_log=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_ENABLE_LOG));
	len += scnprintf(buf + len, sizeof(buf) - len, "sus_su=%d\n", IS_ENABLED(CONFIG_KSU_SUSFS_SUS_SU));

	return susfs_show_text(arg, buf);
}

#ifdef CONFIG_KSU_SUSFS_SUS_SU
/* "/dev/" plus the random name sus_su generates (at most 248 chars) and the NUL */
#define SUS_SU_DRV_PATH_LEN 256

static int sus_su_maj_dev_num = -1;
static char sus_su_drv_path[SUS_SU_DRV_PATH_LEN];
static bool sus_su_device_registered;

bool susfs_is_allow_su(void)
{
	return __ksu_is_allow_uid_for_current(current_uid().val);
}

/*
 * Root for the sus_su device is the same as escape_to_root(): uid and
 * capabilities first, then the KernelSU SELinux domain.
 */
void ksu_escape_to_root(void)
{
	struct cred *cred = prepare_creds();

	if (!cred)
		return;
	cred->uid = cred->euid = cred->suid = cred->fsuid = GLOBAL_ROOT_UID;
	cred->gid = cred->egid = cred->sgid = cred->fsgid = GLOBAL_ROOT_GID;
	cred->cap_inheritable = CAP_FULL_SET;
	cred->cap_permitted = CAP_FULL_SET;
	cred->cap_effective = CAP_FULL_SET;
	cred->cap_bset = CAP_FULL_SET;
	cred->cap_ambient = CAP_FULL_SET;
	commit_creds(cred);
	escape_to_root_for_adb_root();
}

void ksu_susfs_enable_sus_su(void)
{
	if (sus_su_fifo_init(&sus_su_maj_dev_num, sus_su_drv_path))
		return;
	sus_su_device_registered = true;
}

void ksu_susfs_disable_sus_su(void)
{
	if (!sus_su_device_registered)
		return;
	sus_su_fifo_exit(&sus_su_maj_dev_num, sus_su_drv_path);
	sus_su_device_registered = false;
}

static int susfs_show_sus_su_working_mode(void __user *arg)
{
	char buf[16];

	scnprintf(buf, sizeof(buf), "%d\n", susfs_get_sus_su_working_mode());
	return susfs_show_text(arg, buf);
}

static int susfs_show_sus_su_ready(void __user *arg)
{
	char buf[SUSFS_SHOW_BUF_LEN];

	if (sus_su_device_registered)
		scnprintf(buf, sizeof(buf), "ready=1 path=%s major=%d\n", sus_su_drv_path, sus_su_maj_dev_num);
	else
		scnprintf(buf, sizeof(buf), "ready=0\n");
	return susfs_show_text(arg, buf);
}
#endif

/*
 * Called from the KernelSU reboot extension, which has already checked
 * that the caller is root. Errors are only reported through the kernel
 * log, except SHOW_* commands which copy their answer into the user buffer.
 */
int susfs_ksu_dispatch(unsigned int cmd, void __user *arg)
{
	switch (cmd) {
	case CMD_SUSFS_ADD_SUS_PATH:
		return susfs_add_sus_path(arg);
	case CMD_SUSFS_SHOW_VERSION:
		return susfs_show_text(arg, SUSFS_VERSION);
	case CMD_SUSFS_SHOW_VARIANT:
		return susfs_show_text(arg, SUSFS_VARIANT);
	case CMD_SUSFS_SHOW_ENABLED_FEATURES:
		return susfs_show_features(arg);
#ifdef CONFIG_KSU_SUSFS_SUS_MOUNT
	case CMD_SUSFS_ADD_SUS_MOUNT:
		return susfs_add_sus_mount(arg);
#endif
#ifdef CONFIG_KSU_SUSFS_SUS_KSTAT
	case CMD_SUSFS_ADD_SUS_KSTAT:
	case CMD_SUSFS_ADD_SUS_KSTAT_STATICALLY:
		return susfs_add_sus_kstat(arg);
	case CMD_SUSFS_UPDATE_SUS_KSTAT:
		return susfs_update_sus_kstat(arg);
#endif
#ifdef CONFIG_KSU_SUSFS_TRY_UMOUNT
	case CMD_SUSFS_ADD_TRY_UMOUNT:
		return susfs_add_try_umount(arg);
	case CMD_SUSFS_RUN_UMOUNT_FOR_CURRENT_MNT_NS:
		susfs_try_umount(current_uid().val);
		return 0;
#endif
#ifdef CONFIG_KSU_SUSFS_SPOOF_UNAME
	case CMD_SUSFS_SET_UNAME:
		return susfs_set_uname(arg);
#endif
#ifdef CONFIG_KSU_SUSFS_ENABLE_LOG
	case CMD_SUSFS_ENABLE_LOG: {
		int enabled;

		if (copy_from_user(&enabled, arg, sizeof(enabled)))
			return -EFAULT;
		susfs_set_log(enabled != 0);
		return 0;
	}
#endif
#ifdef CONFIG_KSU_SUSFS_SPOOF_CMDLINE_OR_BOOTCONFIG
	case CMD_SUSFS_SET_CMDLINE_OR_BOOTCONFIG:
		return susfs_set_cmdline_or_bootconfig(arg);
#endif
#ifdef CONFIG_KSU_SUSFS_OPEN_REDIRECT
	case CMD_SUSFS_ADD_OPEN_REDIRECT:
		return susfs_add_open_redirect(arg);
#endif
#ifdef CONFIG_KSU_SUSFS_SUS_SU
	case CMD_SUSFS_SUS_SU:
		return susfs_sus_su(arg);
	case CMD_SUSFS_SHOW_SUS_SU_WORKING_MODE:
		return susfs_show_sus_su_working_mode(arg);
	case CMD_SUSFS_IS_SUS_SU_READY:
		return susfs_show_sus_su_ready(arg);
#endif
	default:
		return -ENOTTY;
	}
}

static int __init susfs_ksu_late_init(void)
{
	susfs_init();
	return 0;
}
late_initcall(susfs_ksu_late_init);
