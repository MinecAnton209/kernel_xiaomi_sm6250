#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>

#define KSU_INSTALL_MAGIC1 0xDEADBEEF
#define SUSFS_EXTENSION_MAGIC 10100

#define CMD_SUSFS_ADD_SUS_PATH 0x55550
#define CMD_SUSFS_ADD_SUS_MOUNT 0x55560
#define CMD_SUSFS_ADD_TRY_UMOUNT 0x55580
#define CMD_SUSFS_SET_UNAME 0x55590
#define CMD_SUSFS_ENABLE_LOG 0x555a0
#define CMD_SUSFS_SET_CMDLINE_OR_BOOTCONFIG 0x555b0
#define CMD_SUSFS_ADD_OPEN_REDIRECT 0x555c0
#define CMD_SUSFS_RUN_UMOUNT_FOR_CURRENT_MNT_NS 0x555d0

#define SUSFS_MAX_LEN_PATHNAME 256
#define SUSFS_UTS_LEN 65
#define SUSFS_CMDLINE_MAX 4096
#define TRY_UMOUNT_DEFAULT 0
#define TRY_UMOUNT_DETACH 1

struct st_susfs_sus_path {
	unsigned long target_ino;
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
};

struct st_susfs_sus_mount {
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	unsigned long target_dev;
};

struct st_susfs_try_umount {
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	int mnt_mode;
};

struct st_susfs_uname {
	char release[SUSFS_UTS_LEN];
	char version[SUSFS_UTS_LEN];
};

struct st_susfs_open_redirect {
	unsigned long target_ino;
	char target_pathname[SUSFS_MAX_LEN_PATHNAME];
	char redirected_pathname[SUSFS_MAX_LEN_PATHNAME];
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

struct susfs_command {
	const char *name;
	const char *args;
	int (*run)(int argc, char **argv);
};

static const struct susfs_command commands[] = {
	{ "add_sus_path", "<path>", cmd_add_sus_path },
	{ "add_sus_mount", "<path>", cmd_add_sus_mount },
	{ "add_try_umount", "<path> [detach]", cmd_add_try_umount },
	{ "run_umount", "", cmd_run_umount },
	{ "set_uname", "<release> <version>", cmd_set_uname },
	{ "enable_log", "<0|1>", cmd_enable_log },
	{ "set_cmdline", "<file>", cmd_set_cmdline },
	{ "add_open_redirect", "<target> <redirected>", cmd_add_open_redirect },
};

int main(int argc, char **argv)
{
	size_t i;

	if (argc >= 2) {
		for (i = 0; i < sizeof(commands) / sizeof(commands[0]); i++) {
			if (strcmp(argv[1], commands[i].name) != 0)
				continue;
			if (commands[i].run(argc - 2, argv + 2) == 0) {
				printf("sent %s; check dmesg for the result\n", commands[i].name);
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
