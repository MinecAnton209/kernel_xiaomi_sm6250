#ifndef __LINUX_SUSFS_KSU_H
#define __LINUX_SUSFS_KSU_H

#include <linux/errno.h>
#include <linux/types.h>

#ifdef CONFIG_KSU_SUSFS
int susfs_ksu_dispatch(unsigned int cmd, void __user *arg);
void susfs_on_post_fs_data(void);
#ifdef CONFIG_KSU_SUSFS_TRY_UMOUNT
void susfs_try_umount_on_spawn(uid_t new_uid);
#endif
#else
static inline int susfs_ksu_dispatch(unsigned int cmd, void __user *arg)
{
	return -ENOSYS;
}
static inline void susfs_on_post_fs_data(void)
{
}
#endif

#endif
