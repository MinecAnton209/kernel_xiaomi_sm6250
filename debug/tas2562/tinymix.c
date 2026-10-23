#include <linux/types.h>
#include <sound/asound.h>

#define AT_FDCWD (-100L)
#define O_RDONLY 00
#define O_CLOEXEC 02000000
#define NR_WRITE 64
#define NR_OPENAT 56
#define NR_IOCTL 29
#define NR_EXIT_GROUP 94
#define ELEM_PAGE 256
#define DEVICE "/dev/snd/controlC0"

static long sys4(long nr, long a, long b, long c, long d)
{
	register long x8 __asm__("x8") = nr;
	register long x0 __asm__("x0") = a;
	register long x1 __asm__("x1") = b;
	register long x2 __asm__("x2") = c;
	register long x3 __asm__("x3") = d;
	__asm__ volatile("svc 0" : "+r"(x0) : "r"(x1), "r"(x2), "r"(x3), "r"(x8) : "memory");
	return x0;
}

void *memset(void *dst, int c, unsigned long n)
{
	unsigned char *p = dst;

	while (n--)
		*p++ = (unsigned char)c;
	return dst;
}

void *memcpy(void *dst, const void *src, unsigned long n)
{
	unsigned char *d = dst;
	const unsigned char *s = src;

	while (n--)
		*d++ = *s++;
	return dst;
}

static unsigned long slen(const char *s)
{
	unsigned long n = 0;

	while (s[n])
		n++;
	return n;
}

static void out(const char *s)
{
	sys4(NR_WRITE, 1, (long)s, (long)slen(s), 0);
}

static void outl(long v)
{
	char buf[24];
	unsigned long u = v < 0 ? -(unsigned long)v : (unsigned long)v;
	int i = sizeof(buf) - 1;

	buf[i] = '\0';
	do {
		buf[--i] = '0' + (u % 10);
		u /= 10;
	} while (u);
	if (v < 0)
		buf[--i] = '-';
	out(&buf[i]);
}

static void outu(unsigned long v)
{
	outl((long)v);
}

static void die(const char *msg, long code)
{
	out(msg);
	outl(code);
	out("\n");
	sys4(NR_EXIT_GROUP, 1, 0, 0, 0);
	for (;;)
		;
}

static long ctl(long fd, unsigned long req, void *arg)
{
	return sys4(NR_IOCTL, fd, (long)req, (long)arg, 0);
}

static struct snd_ctl_elem_id ids[ELEM_PAGE];

static void print_enum_name(long fd, struct snd_ctl_elem_info *info, unsigned int item)
{
	struct snd_ctl_elem_info one;

	memset(&one, 0, sizeof(one));
	one.id = info->id;
	one.value.enumerated.item = item;
	if (ctl(fd, SNDRV_CTL_IOCTL_ELEM_INFO, &one) < 0) {
		outu(item);
		return;
	}
	out(one.value.enumerated.name);
}

static void print_control(long fd, const struct snd_ctl_elem_id *id)
{
	struct snd_ctl_elem_info info;
	struct snd_ctl_elem_value val;
	unsigned int i;

	memset(&info, 0, sizeof(info));
	info.id = *id;
	if (ctl(fd, SNDRV_CTL_IOCTL_ELEM_INFO, &info) < 0)
		return;

	memset(&val, 0, sizeof(val));
	val.id = *id;
	if (ctl(fd, SNDRV_CTL_IOCTL_ELEM_READ, &val) < 0)
		return;

	outu(id->numid);
	out("\t");
	out((const char *)id->name);
	out("\t");

	for (i = 0; i < info.count; i++) {
		if (i)
			out(", ");
		switch (info.type) {
		case SNDRV_CTL_ELEM_TYPE_BOOLEAN:
		case SNDRV_CTL_ELEM_TYPE_INTEGER:
			outl(val.value.integer.value[i]);
			break;
		case SNDRV_CTL_ELEM_TYPE_INTEGER64:
			outl((long)val.value.integer64.value[i]);
			break;
		case SNDRV_CTL_ELEM_TYPE_ENUMERATED:
			print_enum_name(fd, &info, val.value.enumerated.item[i]);
			break;
		default:
			out("?");
			break;
		}
	}
	out("\n");
}

void _start(void)
{
	struct snd_ctl_elem_list list;
	unsigned int off = 0;
	long fd;
	unsigned int i;

	fd = sys4(NR_OPENAT, AT_FDCWD, (long)DEVICE, O_RDONLY | O_CLOEXEC, 0);
	if (fd < 0)
		die("cannot open " DEVICE ", errno ", -fd);

	for (;;) {
		memset(&list, 0, sizeof(list));
		list.offset = off;
		list.space = ELEM_PAGE;
		list.pids = ids;
		if (ctl(fd, SNDRV_CTL_IOCTL_ELEM_LIST, &list) < 0)
			die("ELEM_LIST failed, errno ", 0);
		if (!list.used)
			break;
		for (i = 0; i < list.used; i++)
			print_control(fd, &ids[i]);
		off += list.used;
		if (off >= list.count)
			break;
	}

	sys4(NR_EXIT_GROUP, 0, 0, 0, 0);
	for (;;)
		;
}
