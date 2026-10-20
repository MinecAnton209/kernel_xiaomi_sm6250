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
extern void susfs_try_umount(uid_t target_uid);

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

void susfs_try_umount_all(uid_t uid)
{
	susfs_try_umount(uid);
}

/*
 * Called from the KernelSU reboot extension, which has already checked
 * that the caller is root. Errors are only reported through the kernel
 * log: the extension has no channel back to userspace for struct payloads.
 */
int susfs_ksu_dispatch(unsigned int cmd, void __user *arg)
{
	switch (cmd) {
	case CMD_SUSFS_ADD_SUS_PATH:
		return susfs_add_sus_path(arg);
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
