#ifndef __LINUX_SUSFS_KSU_H
#define __LINUX_SUSFS_KSU_H

#include <linux/errno.h>
#include <linux/types.h>

#ifdef CONFIG_KSU_SUSFS
int susfs_ksu_dispatch(unsigned int cmd, void __user *arg);
#else
static inline int susfs_ksu_dispatch(unsigned int cmd, void __user *arg)
{
	return -ENOSYS;
}
#endif

#endif
