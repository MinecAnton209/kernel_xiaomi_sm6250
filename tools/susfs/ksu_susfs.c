#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/sysmacros.h>
#include <unistd.h>

#define KSU_INSTALL_MAGIC1 0xDEADBEEF
#define SUSFS_EXTENSION_MAGIC 10100

#define CMD_SUSFS_ADD_SUS_PATH 0x55550
#define CMD_SUSFS_ADD_SUS_MOUNT 0x55560
#define CMD_SUSFS_ADD_SUS_KSTAT 0x55570
#define CMD_SUSFS_UPDATE_SUS_KSTAT 0x55571
#define CMD_SUSFS_ADD_SUS_KSTAT_STATICALLY 0x55572
#define CMD_SUSFS_ADD_TRY_UMOUNT 0x55580
#define CMD_SUSFS_SET_UNAME 0x55590
#define CMD_SUSFS_SET_UNAME_SCOPE 0x55591
#define CMD_SUSFS_ENABLE_LOG 0x555a0
#define CMD_SUSFS_SET_CMDLINE_OR_BOOTCONFIG 0x555b0
#define CMD_SUSFS_ADD_OPEN_REDIRECT 0x555c0
#define CMD_SUSFS_RUN_UMOUNT_FOR_CURRENT_MNT_NS 0x555d0
#define CMD_SUSFS_SHOW_VERSION 0x555e1
#define CMD_SUSFS_SHOW_ENABLED_FEATURES 0x555e2
#define CMD_SUSFS_SHOW_VARIANT 0x555e3
#define CMD_SUSFS_SHOW_SUS_SU_WORKING_MODE 0x555e4
#define CMD_SUSFS_IS_SUS_SU_READY 0x555f0
#define CMD_SUSFS_SUS_SU 0x60000
#define SUSFS_SHOW_BUF_LEN 512

#define SUSFS_MAX_LEN_PATHNAME 256
#define SUSFS_UTS_LEN 65
#define SUSFS_CMDLINE_MAX 4096
#define SUSFS_SUS_SU_PATH_LEN 256
#define SUSFS_UNAME_MAX_APPIDS 64
#define SUSFS_UNAME_SCOPE_APPS 0
#define SUSFS_UNAME_SCOPE_SELECTED 1
#define TRY_UMOUNT_DEFAULT 0
#define TRY_UMOUNT_DETACH 1
#define SUS_SU_DISABLED 0
#define SUS_SU_WITH_HOOKS 2

struct st_susfs_sus_path {
	unsigned long target_ino;
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
};

struct st_susfs_sus_mount {
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	unsigned long target_dev;
};

struct st_susfs_sus_kstat {
	int is_statically;
	unsigned long target_ino;
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	unsigned long spoofed_ino;
	unsigned long spoofed_dev;
	unsigned int spoofed_nlink;
	long long spoofed_size;
	long spoofed_atime_tv_sec;
	long spoofed_mtime_tv_sec;
	long spoofed_ctime_tv_sec;
	long spoofed_atime_tv_nsec;
	long spoofed_mtime_tv_nsec;
	long spoofed_ctime_tv_nsec;
	unsigned long spoofed_blksize;
	unsigned long long spoofed_blocks;
};

struct st_susfs_try_umount {
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	int mnt_mode;
};

struct st_susfs_uname {
	char release[SUSFS_UTS_LEN];
	char version[SUSFS_UTS_LEN];
};

struct st_susfs_uname_scope {
	int scope;
	int count;
	unsigned int appids[SUSFS_UNAME_MAX_APPIDS];
};

struct st_susfs_open_redirect {
	unsigned long target_ino;
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	char redirected_pathname[SUSFS_MAX_LEN_PATHNAME];
};

struct st_sus_su {
	int mode;
};

/*
 * The kernel consumes these requests in the reboot hook and never sends a
 * reply, so EINVAL from the real reboot path is the expected result.
 */
static void susfs_request(unsigned int cmd, void *payload)
{
	syscall(SYS_reboot, KSU_INSTALL_MAGIC1, SUSFS_EXTENSION_MAGIC, cmd, payload);
}

static int copy_path(char *dst, size_t size, const char *src)
{
	if (strlen(src) >= size) {
		fprintf(stderr, "path too long (max %zu): %s\n", size - 1, src);
		return 1;
	}
	strcpy(dst, src);
	return 0;
}

static int stat_path(const char *path, struct stat *sb)
{
	if (stat(path, sb)) {
		perror(path);
		return 1;
	}
	return 0;
}

static int cmd_add_sus_path(int argc, char **argv)
{
	struct st_susfs_sus_path info;
	struct stat sb;

	if (argc != 1)
		return 1;
	if (stat_path(argv[0], &sb))
		return 1;
	memset(&info, 0, sizeof(info));
	info.target_ino = sb.st_ino;
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	susfs_request(CMD_SUSFS_ADD_SUS_PATH, &info);
	return 0;
}

static int cmd_add_sus_mount(int argc, char **argv)
{
	struct st_susfs_sus_mount info;
	struct stat sb;

	if (argc != 1)
		return 1;
	if (stat_path(argv[0], &sb))
		return 1;
	memset(&info, 0, sizeof(info));
	info.target_dev = sb.st_dev;
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	susfs_request(CMD_SUSFS_ADD_SUS_MOUNT, &info);
	return 0;
}

static int parse_ulong(const char *s, unsigned long *out)
{
	char *end;

	errno = 0;
	*out = strtoul(s, &end, 0);
	if (errno || *end != '\0') {
		fprintf(stderr, "not a number: %s\n", s);
		return 1;
	}
	return 0;
}

static int parse_llong(const char *s, long long *out)
{
	char *end;

	errno = 0;
	*out = strtoll(s, &end, 0);
	if (errno || *end != '\0') {
		fprintf(stderr, "not a number: %s\n", s);
		return 1;
	}
	return 0;
}

static int parse_ullong(const char *s, unsigned long long *out)
{
	char *end;

	errno = 0;
	*out = strtoull(s, &end, 0);
	if (errno || *end != '\0') {
		fprintf(stderr, "not a number: %s\n", s);
		return 1;
	}
	return 0;
}

static int send_kstat_dynamic(unsigned int cmd, int argc, char **argv)
{
	struct st_susfs_sus_kstat info;
	struct stat sb;

	if (argc != 1)
		return 1;
	if (stat_path(argv[0], &sb))
		return 1;
	memset(&info, 0, sizeof(info));
	info.is_statically = 0;
	info.target_ino = sb.st_ino;
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	susfs_request(cmd, &info);
	return 0;
}

static int cmd_add_sus_kstat(int argc, char **argv)
{
	return send_kstat_dynamic(CMD_SUSFS_ADD_SUS_KSTAT, argc, argv);
}

static int cmd_update_sus_kstat(int argc, char **argv)
{
	return send_kstat_dynamic(CMD_SUSFS_UPDATE_SUS_KSTAT, argc, argv);
}

/* Spoofed times are whole seconds; the nanosecond fields stay zero. */
static int cmd_add_sus_kstat_statically(int argc, char **argv)
{
	struct st_susfs_sus_kstat info;
	struct stat sb;
	unsigned long spoofed_ino, spoofed_dev, nlink, blksize;
	unsigned long long blocks;
	long long size, atime, mtime, ctime;

	if (argc != 10)
		return 1;
	if (stat_path(argv[0], &sb))
		return 1;
	if (parse_ulong(argv[1], &spoofed_ino) ||
	    parse_ulong(argv[2], &spoofed_dev) ||
	    parse_ulong(argv[3], &nlink) ||
	    parse_llong(argv[4], &size) ||
	    parse_llong(argv[5], &atime) ||
	    parse_llong(argv[6], &mtime) ||
	    parse_llong(argv[7], &ctime) ||
	    parse_ulong(argv[8], &blksize) ||
	    parse_ullong(argv[9], &blocks))
		return 1;

	memset(&info, 0, sizeof(info));
	info.is_statically = 1;
	info.target_ino = sb.st_ino;
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	info.spoofed_ino = spoofed_ino;
	info.spoofed_dev = spoofed_dev;
	info.spoofed_nlink = (unsigned int)nlink;
	info.spoofed_size = size;
	info.spoofed_atime_tv_sec = (long)atime;
	info.spoofed_mtime_tv_sec = (long)mtime;
	info.spoofed_ctime_tv_sec = (long)ctime;
	info.spoofed_blksize = blksize;
	info.spoofed_blocks = blocks;
	susfs_request(CMD_SUSFS_ADD_SUS_KSTAT_STATICALLY, &info);
	return 0;
}

static int cmd_add_try_umount(int argc, char **argv)
{
	struct st_susfs_try_umount info;

	if (argc < 1 || argc > 2)
		return 1;
	memset(&info, 0, sizeof(info));
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	if (argc == 2 && strcmp(argv[1], "detach") == 0)
		info.mnt_mode = TRY_UMOUNT_DETACH;
	else if (argc == 2)
		return 1;
	else
		info.mnt_mode = TRY_UMOUNT_DEFAULT;
	susfs_request(CMD_SUSFS_ADD_TRY_UMOUNT, &info);
	return 0;
}

static int cmd_run_umount(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	susfs_request(CMD_SUSFS_RUN_UMOUNT_FOR_CURRENT_MNT_NS, NULL);
	return 0;
}

static int cmd_set_uname(int argc, char **argv)
{
	struct st_susfs_uname info;

	if (argc != 2)
		return 1;
	memset(&info, 0, sizeof(info));
	if (copy_path(info.release, sizeof(info.release), argv[0]))
		return 1;
	if (copy_path(info.version, sizeof(info.version), argv[1]))
		return 1;
	susfs_request(CMD_SUSFS_SET_UNAME, &info);
	return 0;
}

/* An app id is the uid without the user part, 10000 to 19999 for an ordinary app. */
static int parse_appid(const char *text, unsigned int *appid)
{
	char *end;
	unsigned long value;

	if (*text < '0' || *text > '9')
		return 1;
	errno = 0;
	value = strtoul(text, &end, 10);
	if (errno || *end != '\0' || value < 10000 || value > 19999) {
		fprintf(stderr, "not an app id (10000-19999): %s\n", text);
		return 1;
	}
	*appid = (unsigned int)value;
	return 0;
}

static int cmd_set_uname_scope(int argc, char **argv)
{
	struct st_susfs_uname_scope info;
	int i;

	if (argc < 1)
		return 1;
	memset(&info, 0, sizeof(info));
	if (strcmp(argv[0], "apps") == 0) {
		if (argc != 1)
			return 1;
		info.scope = SUSFS_UNAME_SCOPE_APPS;
	} else if (strcmp(argv[0], "selected") == 0) {
		info.scope = SUSFS_UNAME_SCOPE_SELECTED;
		if (argc - 1 > SUSFS_UNAME_MAX_APPIDS) {
			fprintf(stderr, "at most %d apps\n", SUSFS_UNAME_MAX_APPIDS);
			return 1;
		}
		for (i = 1; i < argc; i++) {
			if (parse_appid(argv[i], &info.appids[i - 1]))
				return 1;
		}
		info.count = argc - 1;
	} else {
		return 1;
	}
	susfs_request(CMD_SUSFS_SET_UNAME_SCOPE, &info);
	return 0;
}

static int cmd_enable_log(int argc, char **argv)
{
	int enabled;

	if (argc != 1)
		return 1;
	if (strcmp(argv[0], "0") != 0 && strcmp(argv[0], "1") != 0)
		return 1;
	enabled = argv[0][0] == '1';
	susfs_request(CMD_SUSFS_ENABLE_LOG, &enabled);
	return 0;
}

static int cmd_set_cmdline(int argc, char **argv)
{
	static char buffer[SUSFS_CMDLINE_MAX];
	FILE *f;
	size_t len;

	if (argc != 1)
		return 1;
	f = fopen(argv[0], "r");
	if (!f) {
		perror(argv[0]);
		return 1;
	}
	len = fread(buffer, 1, sizeof(buffer) - 1, f);
	fclose(f);
	buffer[len] = '\0';
	susfs_request(CMD_SUSFS_SET_CMDLINE_OR_BOOTCONFIG, buffer);
	return 0;
}

static int cmd_add_open_redirect(int argc, char **argv)
{
	struct st_susfs_open_redirect info;
	struct stat sb;

	if (argc != 2)
		return 1;
	if (stat_path(argv[0], &sb))
		return 1;
	memset(&info, 0, sizeof(info));
	info.target_ino = sb.st_ino;
	if (copy_path(info.target_pathname, sizeof(info.target_pathname), argv[0]))
		return 1;
	if (copy_path(info.redirected_pathname, sizeof(info.redirected_pathname), argv[1]))
		return 1;
	susfs_request(CMD_SUSFS_ADD_OPEN_REDIRECT, &info);
	return 0;
}

static int cmd_show(unsigned int cmd)
{
	char buf[SUSFS_SHOW_BUF_LEN];

	memset(buf, 0, sizeof(buf));
	susfs_request(cmd, buf);
	if (buf[0] == '\0') {
		fprintf(stderr, "no answer from kernel: run as root and check that SUSFS is built in\n");
		return 1;
	}
	fputs(buf, stdout);
	return 0;
}

static int cmd_show_version(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	return cmd_show(CMD_SUSFS_SHOW_VERSION);
}

static int cmd_show_variant(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	return cmd_show(CMD_SUSFS_SHOW_VARIANT);
}

static int cmd_show_features(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	return cmd_show(CMD_SUSFS_SHOW_ENABLED_FEATURES);
}

static int cmd_show_sus_su_working_mode(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	return cmd_show(CMD_SUSFS_SHOW_SUS_SU_WORKING_MODE);
}

static int cmd_is_sus_su_ready(int argc, char **argv)
{
	(void)argv;
	if (argc != 0)
		return 1;
	return cmd_show(CMD_SUSFS_IS_SUS_SU_READY);
}

/*
 * Reads "ready=1 path=<dev> major=<n>" from the kernel. The kernel does not
 * create the device node, so sus_su needs the path and major to mknod it.
 */
static int read_sus_su_device(char *path, size_t size, int *major)
{
	char buf[SUSFS_SHOW_BUF_LEN];
	char fmt[32];

	memset(buf, 0, sizeof(buf));
	susfs_request(CMD_SUSFS_IS_SUS_SU_READY, buf);
	snprintf(fmt, sizeof(fmt), "ready=1 path=%%%zus major=%%d", size - 1);
	return sscanf(buf, fmt, path, major) == 2 ? 0 : 1;
}

static int cmd_sus_su(int argc, char **argv)
{
	struct st_sus_su info;
	char path[SUSFS_SUS_SU_PATH_LEN];
	int major;
	int was_ready;

	if (argc != 1)
		return 1;
	if (strcmp(argv[0], "0") == 0)
		info.mode = SUS_SU_DISABLED;
	else if (strcmp(argv[0], "2") == 0)
		info.mode = SUS_SU_WITH_HOOKS;
	else
		return 1;

	was_ready = read_sus_su_device(path, sizeof(path), &major) == 0;
	susfs_request(CMD_SUSFS_SUS_SU, &info);

	if (info.mode == SUS_SU_DISABLED) {
		if (was_ready && read_sus_su_device(path, sizeof(path), &major) != 0) {
			if (unlink(path) && errno != ENOENT) {
				perror(path);
				return 1;
			}
		}
		return 0;
	}
	if (read_sus_su_device(path, sizeof(path), &major)) {
		fprintf(stderr, "sus_su did not register a device\n");
		return 1;
	}
	if (mknod(path, S_IFCHR | 0666, makedev(major, 0)) && errno != EEXIST) {
		perror(path);
		return 1;
	}
	return 0;
}

struct susfs_command {
	const char *name;
	const char *args;
	int (*run)(int argc, char **argv);
	int shows_reply;
};

static const struct susfs_command commands[] = {
	{ .name = "add_sus_path", .args = "<path>", .run = cmd_add_sus_path, .shows_reply = 0 },
	{ .name = "add_sus_mount", .args = "<path>", .run = cmd_add_sus_mount, .shows_reply = 0 },
	{ .name = "add_sus_kstat", .args = "<path>", .run = cmd_add_sus_kstat, .shows_reply = 0 },
	{ .name = "update_sus_kstat", .args = "<path>", .run = cmd_update_sus_kstat, .shows_reply = 0 },
	{ .name = "add_sus_kstat_statically", .args = "<path> <ino> <dev> <nlink> <size> <atime> <mtime> <ctime> <blksize> <blocks>", .run = cmd_add_sus_kstat_statically, .shows_reply = 0 },
	{ .name = "add_try_umount", .args = "<path> [detach]", .run = cmd_add_try_umount, .shows_reply = 0 },
	{ .name = "run_umount", .args = "", .run = cmd_run_umount, .shows_reply = 0 },
	{ .name = "set_uname", .args = "<release> <version>", .run = cmd_set_uname, .shows_reply = 0 },
	{ .name = "set_uname_scope", .args = "<apps | selected [appid...]>", .run = cmd_set_uname_scope, .shows_reply = 0 },
	{ .name = "enable_log", .args = "<0|1>", .run = cmd_enable_log, .shows_reply = 0 },
	{ .name = "set_cmdline", .args = "<file>", .run = cmd_set_cmdline, .shows_reply = 0 },
	{ .name = "add_open_redirect", .args = "<target> <redirected>", .run = cmd_add_open_redirect, .shows_reply = 0 },
	{ .name = "show_version", .args = "", .run = cmd_show_version, .shows_reply = 1 },
	{ .name = "show_variant", .args = "", .run = cmd_show_variant, .shows_reply = 1 },
	{ .name = "show_features", .args = "", .run = cmd_show_features, .shows_reply = 1 },
	{ .name = "sus_su", .args = "<0|2>", .run = cmd_sus_su, .shows_reply = 0 },
	{ .name = "show_sus_su_working_mode", .args = "", .run = cmd_show_sus_su_working_mode, .shows_reply = 1 },
	{ .name = "is_sus_su_ready", .args = "", .run = cmd_is_sus_su_ready, .shows_reply = 1 },
};

int main(int argc, char **argv)
{
	size_t i;

	if (argc >= 2) {
		for (i = 0; i < sizeof(commands) / sizeof(commands[0]); i++) {
			if (strcmp(argv[1], commands[i].name) != 0)
				continue;
			if (commands[i].run(argc - 2, argv + 2) == 0) {
				if (!commands[i].shows_reply)
					printf("sent %s\n", commands[i].name);
				return 0;
			}
			break;
		}
	}

	fprintf(stderr, "usage: %s <command> [args]\n", argv[0]);
	for (i = 0; i < sizeof(commands) / sizeof(commands[0]); i++)
		fprintf(stderr, "  %s %s\n", commands[i].name, commands[i].args);
	return 1;
}
