#include <linux/cred.h>
#include <linux/fs.h>
#include <linux/mount.h>
#include <linux/namei.h>
#include <linux/sched.h>
#include <linux/susfs.h>
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
