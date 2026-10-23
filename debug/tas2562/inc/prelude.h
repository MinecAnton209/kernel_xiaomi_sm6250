#include <stddef.h>
#include <asm-generic/ioctl.h>
#ifndef _IOC_TYPECHECK
#define _IOC_TYPECHECK(t) (sizeof(t))
#endif
struct timespec { long tv_sec; long tv_nsec; };
