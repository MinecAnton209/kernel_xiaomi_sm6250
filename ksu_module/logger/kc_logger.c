#include <ctype.h>
#include <dirent.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "sqlite3.h"

#define DEVICE_ROOT_ENV "KC_ROOT"
#define PRUNE_EVERY_S 3600
#define SCHEMA \
	"PRAGMA auto_vacuum=INCREMENTAL;" \
	"CREATE TABLE IF NOT EXISTS samples(" \
	"ts INTEGER NOT NULL," \
	"cpu_temp REAL," \
	"gpu_temp REAL," \
	"ram_temp REAL," \
	"other_temp REAL," \
	"battery_temp REAL," \
	"cpu_mhz INTEGER," \
	"gpu_mhz INTEGER," \
	"mem_avail_mb INTEGER);" \
	"CREATE INDEX IF NOT EXISTS samples_ts ON samples(ts);"

struct sample {
	long long ts;
	double cpu_temp;
	double gpu_temp;
	double ram_temp;
	double other_temp;
	double battery_temp;
	long cpu_mhz;
	long gpu_mhz;
	long mem_avail_mb;
};

static const char *root = "";

static void die(const char *what, const char *detail)
{
	fprintf(stderr, "kc_logger: %s%s%s\n", what, detail ? ": " : "", detail ? detail : "");
	exit(1);
}

static void die_sql(sqlite3 *db, const char *what)
{
	fprintf(stderr, "kc_logger: %s: %s\n", what, sqlite3_errmsg(db));
	exit(1);
}

static void path_in_root(char *out, size_t size, const char *path)
{
	snprintf(out, size, "%s%s", root, path);
}

/* Reads the first line of a sysfs or procfs file; returns 0 when the file cannot be read. */
static int read_line(const char *path, char *buf, size_t size)
{
	char full[512];
	FILE *f;

	path_in_root(full, sizeof(full), path);
	f = fopen(full, "r");
	if (!f)
		return 0;
	if (!fgets(buf, (int)size, f)) {
		fclose(f);
		return 0;
	}
	fclose(f);
	buf[strcspn(buf, "\n")] = '\0';
	return buf[0] != '\0';
}

static int read_long(const char *path, long *out)
{
	char buf[64];
	char *end;
	long value;

	if (!read_line(path, buf, sizeof(buf)))
		return 0;
	value = strtol(buf, &end, 10);
	if (end == buf)
		return 0;
	*out = value;
	return 1;
}

static int contains_ci(const char *haystack, const char *needle)
{
	size_t n = strlen(needle);

	for (; *haystack; haystack++) {
		size_t i;

		for (i = 0; i < n; i++) {
			if (tolower((unsigned char)haystack[i]) != needle[i])
				break;
		}
		if (i == n)
			return 1;
	}
	return 0;
}

enum group { GROUP_CPU, GROUP_GPU, GROUP_RAM, GROUP_OTHER };

/* Sensor names come from the vendor tree, so the group is a guess from the name. */
static enum group group_of(const char *name)
{
	if (contains_ci(name, "cpu") || contains_ci(name, "silver") || contains_ci(name, "gold") ||
	    contains_ci(name, "apc"))
		return GROUP_CPU;
	if (contains_ci(name, "gpu") || contains_ci(name, "kgsl"))
		return GROUP_GPU;
	if (contains_ci(name, "ddr") || contains_ci(name, "ram"))
		return GROUP_RAM;
	return GROUP_OTHER;
}

static void raise_to(double *slot, double value)
{
	if (isnan(*slot) || value > *slot)
		*slot = value;
}

static void read_thermal(struct sample *s)
{
	char dir_path[512];
	DIR *dir;
	struct dirent *entry;

	s->cpu_temp = s->gpu_temp = s->ram_temp = s->other_temp = NAN;
	path_in_root(dir_path, sizeof(dir_path), "/sys/class/thermal");
	dir = opendir(dir_path);
	if (!dir)
		return;
	while ((entry = readdir(dir)) != NULL) {
		char zone[512];
		char type[128];
		long milli;

		if (strncmp(entry->d_name, "thermal_zone", 12) != 0)
			continue;
		snprintf(zone, sizeof(zone), "/sys/class/thermal/%s", entry->d_name);
		{
			char path[640];

			snprintf(path, sizeof(path), "%s/type", zone);
			if (!read_line(path, type, sizeof(type)))
				continue;
			snprintf(path, sizeof(path), "%s/temp", zone);
			if (!read_long(path, &milli))
				continue;
		}
		switch (group_of(type)) {
		case GROUP_CPU:
			raise_to(&s->cpu_temp, milli / 1000.0);
			break;
		case GROUP_GPU:
			raise_to(&s->gpu_temp, milli / 1000.0);
			break;
		case GROUP_RAM:
			raise_to(&s->ram_temp, milli / 1000.0);
			break;
		case GROUP_OTHER:
			raise_to(&s->other_temp, milli / 1000.0);
			break;
		}
	}
	closedir(dir);
}

static void read_cpu_clock(struct sample *s)
{
	char dir_path[512];
	DIR *dir;
	struct dirent *entry;

	s->cpu_mhz = -1;
	path_in_root(dir_path, sizeof(dir_path), "/sys/devices/system/cpu");
	dir = opendir(dir_path);
	if (!dir)
		return;
	while ((entry = readdir(dir)) != NULL) {
		char path[512];
		long khz;

		if (strncmp(entry->d_name, "cpu", 3) != 0 || !isdigit((unsigned char)entry->d_name[3]))
			continue;
		snprintf(path, sizeof(path), "/sys/devices/system/cpu/%s/cpufreq/scaling_cur_freq", entry->d_name);
		if (!read_long(path, &khz))
			continue;
		if (khz / 1000 > s->cpu_mhz)
			s->cpu_mhz = khz / 1000;
	}
	closedir(dir);
}

static void read_sample(struct sample *s)
{
	long value;

	s->ts = (long long)time(NULL);
	read_thermal(s);
	read_cpu_clock(s);

	if (read_long("/sys/class/kgsl/kgsl-3d0/gpuclk", &value))
		s->gpu_mhz = value / 1000000;
	else
		s->gpu_mhz = -1;

	s->battery_temp = NAN;
	if (read_long("/sys/class/power_supply/battery/temp", &value))
		s->battery_temp = value / 10.0;

	s->mem_avail_mb = -1;
	{
		char line[128];
		char full[512];
		FILE *f;

		path_in_root(full, sizeof(full), "/proc/meminfo");
		f = fopen(full, "r");
		if (f) {
			while (fgets(line, sizeof(line), f)) {
				long kb;

				if (sscanf(line, "MemAvailable: %ld kB", &kb) == 1) {
					s->mem_avail_mb = kb / 1024;
					break;
				}
			}
			fclose(f);
		}
	}
}

static void bind_real(sqlite3_stmt *stmt, int index, double value)
{
	if (isnan(value))
		sqlite3_bind_null(stmt, index);
	else
		sqlite3_bind_double(stmt, index, value);
}

static void bind_int(sqlite3_stmt *stmt, int index, long value)
{
	if (value < 0)
		sqlite3_bind_null(stmt, index);
	else
		sqlite3_bind_int64(stmt, index, value);
}

static sqlite3 *open_db(const char *path)
{
	sqlite3 *db;

	if (sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, NULL) != SQLITE_OK)
		die_sql(db, "open");
	sqlite3_busy_timeout(db, 5000);
	if (sqlite3_exec(db, "PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;", NULL, NULL, NULL) != SQLITE_OK)
		die_sql(db, "pragma");
	if (sqlite3_exec(db, SCHEMA, NULL, NULL, NULL) != SQLITE_OK)
		die_sql(db, "schema");
	return db;
}

static void record(sqlite3 *db, const struct sample *s)
{
	static sqlite3_stmt *stmt;

	if (!stmt &&
	    sqlite3_prepare_v2(db,
			       "INSERT INTO samples(ts,cpu_temp,gpu_temp,ram_temp,other_temp,battery_temp,"
			       "cpu_mhz,gpu_mhz,mem_avail_mb) VALUES(?,?,?,?,?,?,?,?,?)",
			       -1, &stmt, NULL) != SQLITE_OK)
		die_sql(db, "prepare insert");
	sqlite3_bind_int64(stmt, 1, s->ts);
	bind_real(stmt, 2, s->cpu_temp);
	bind_real(stmt, 3, s->gpu_temp);
	bind_real(stmt, 4, s->ram_temp);
	bind_real(stmt, 5, s->other_temp);
	bind_real(stmt, 6, s->battery_temp);
	bind_int(stmt, 7, s->cpu_mhz);
	bind_int(stmt, 8, s->gpu_mhz);
	bind_int(stmt, 9, s->mem_avail_mb);
	if (sqlite3_step(stmt) != SQLITE_DONE)
		die_sql(db, "insert");
	sqlite3_reset(stmt);
}

static void prune(sqlite3 *db, long days)
{
	char sql[160];
	long long cutoff = (long long)time(NULL) - days * 86400LL;

	snprintf(sql, sizeof(sql), "DELETE FROM samples WHERE ts < %lld", cutoff);
	if (sqlite3_exec(db, sql, NULL, NULL, NULL) != SQLITE_OK)
		die_sql(db, "prune");
	if (sqlite3_exec(db, "PRAGMA incremental_vacuum", NULL, NULL, NULL) != SQLITE_OK)
		die_sql(db, "vacuum");
}

static void stats(sqlite3 *db)
{
	sqlite3_stmt *stmt;
	long long rows = 0, oldest = 0, newest = 0, pages = 0, page_size = 0;

	if (sqlite3_prepare_v2(db, "SELECT COUNT(*), COALESCE(MIN(ts),0), COALESCE(MAX(ts),0) FROM samples", -1, &stmt, NULL) != SQLITE_OK)
		die_sql(db, "stats");
	if (sqlite3_step(stmt) == SQLITE_ROW) {
		rows = sqlite3_column_int64(stmt, 0);
		oldest = sqlite3_column_int64(stmt, 1);
		newest = sqlite3_column_int64(stmt, 2);
	}
	sqlite3_finalize(stmt);

	if (sqlite3_prepare_v2(db, "PRAGMA page_count", -1, &stmt, NULL) == SQLITE_OK && sqlite3_step(stmt) == SQLITE_ROW)
		pages = sqlite3_column_int64(stmt, 0);
	sqlite3_finalize(stmt);
	if (sqlite3_prepare_v2(db, "PRAGMA page_size", -1, &stmt, NULL) == SQLITE_OK && sqlite3_step(stmt) == SQLITE_ROW)
		page_size = sqlite3_column_int64(stmt, 0);
	sqlite3_finalize(stmt);

	printf("rows=%lld oldest=%lld newest=%lld bytes=%lld\n", rows, oldest, newest, pages * page_size);
}

static void dump(sqlite3 *db)
{
	sqlite3_stmt *stmt;
	int i;

	if (sqlite3_prepare_v2(db,
			       "SELECT ts,cpu_temp,gpu_temp,ram_temp,other_temp,battery_temp,"
			       "cpu_mhz,gpu_mhz,mem_avail_mb FROM samples ORDER BY ts",
			       -1, &stmt, NULL) != SQLITE_OK)
		die_sql(db, "prepare dump");
	while (sqlite3_step(stmt) == SQLITE_ROW) {
		for (i = 0; i < 9; i++) {
			if (i)
				putchar('|');
			if (sqlite3_column_type(stmt, i) == SQLITE_NULL)
				continue;
			if (i == 0 || i >= 6)
				printf("%lld", sqlite3_column_int64(stmt, i));
			else
				printf("%.1f", sqlite3_column_double(stmt, i));
		}
		putchar('\n');
	}
	sqlite3_finalize(stmt);
}

/*
 * Averages the samples of the last SINCE_SECONDS into POINTS buckets, so a chart gets a fixed number of
 * points whatever the interval. A bucket with no samples is not printed, which leaves a gap in the chart.
 */
static void series(sqlite3 *db, long since_seconds, long points)
{
	sqlite3_stmt *stmt;
	long long now = (long long)time(NULL);
	long long start = now - since_seconds;
	long long width = (since_seconds + points - 1) / points;
	int i;

	if (sqlite3_prepare_v2(db,
			       "SELECT (ts - ?1) / ?2, AVG(cpu_temp), AVG(gpu_temp), AVG(battery_temp),"
			       " AVG(cpu_mhz), AVG(gpu_mhz), AVG(mem_avail_mb)"
			       " FROM samples WHERE ts >= ?1 GROUP BY 1 ORDER BY 1",
			       -1, &stmt, NULL) != SQLITE_OK)
		die_sql(db, "prepare series");
	sqlite3_bind_int64(stmt, 1, start);
	sqlite3_bind_int64(stmt, 2, width);
	while (sqlite3_step(stmt) == SQLITE_ROW) {
		printf("%lld", start + sqlite3_column_int64(stmt, 0) * width);
		for (i = 1; i < 7; i++) {
			putchar('|');
			if (sqlite3_column_type(stmt, i) == SQLITE_NULL)
				continue;
			printf("%.1f", sqlite3_column_double(stmt, i));
		}
		putchar('\n');
	}
	sqlite3_finalize(stmt);
}

static void usage(void)
{
	fprintf(stderr,
		"usage:\n"
		"  kc_logger sample DB\n"
		"  kc_logger run DB INTERVAL_SECONDS RETENTION_DAYS\n"
		"  kc_logger prune DB RETENTION_DAYS\n"
		"  kc_logger clear DB\n"
		"  kc_logger stats DB\n"
		"  kc_logger dump DB\n"
		"  kc_logger series DB SINCE_SECONDS POINTS\n"
		"The sysfs and procfs root is taken from KC_ROOT (empty on the phone).\n");
	exit(1);
}

static long parse_positive(const char *text, long max)
{
	char *end;
	long value = strtol(text, &end, 10);

	if (end == text || *end != '\0' || value < 1 || value > max)
		die("invalid number", text);
	return value;
}

int main(int argc, char **argv)
{
	sqlite3 *db;
	struct sample s;
	long interval;
	long days;
	time_t last_prune = 0;

	if (getenv(DEVICE_ROOT_ENV))
		root = getenv(DEVICE_ROOT_ENV);
	if (argc < 3)
		usage();

	if (strcmp(argv[1], "sample") == 0 && argc == 3) {
		db = open_db(argv[2]);
		read_sample(&s);
		record(db, &s);
		sqlite3_close(db);
		return 0;
	}
	if (strcmp(argv[1], "run") == 0 && argc == 5) {
		interval = parse_positive(argv[3], 3600);
		days = parse_positive(argv[4], 365);
		db = open_db(argv[2]);
		for (;;) {
			read_sample(&s);
			record(db, &s);
			if (time(NULL) - last_prune >= PRUNE_EVERY_S) {
				prune(db, days);
				last_prune = time(NULL);
			}
			sleep((unsigned int)interval);
		}
	}
	if (strcmp(argv[1], "prune") == 0 && argc == 4) {
		days = parse_positive(argv[3], 365);
		db = open_db(argv[2]);
		prune(db, days);
		sqlite3_close(db);
		return 0;
	}
	if (strcmp(argv[1], "clear") == 0 && argc == 3) {
		db = open_db(argv[2]);
		if (sqlite3_exec(db, "DELETE FROM samples; PRAGMA incremental_vacuum", NULL, NULL, NULL) != SQLITE_OK)
			die_sql(db, "clear");
		sqlite3_close(db);
		return 0;
	}
	if (strcmp(argv[1], "stats") == 0 && argc == 3) {
		db = open_db(argv[2]);
		stats(db);
		sqlite3_close(db);
		return 0;
	}
	if (strcmp(argv[1], "series") == 0 && argc == 5) {
		long since = parse_positive(argv[3], 365L * 86400L);
		long points = parse_positive(argv[4], 1000);
		db = open_db(argv[2]);
		series(db, since, points);
		sqlite3_close(db);
		return 0;
	}
	if (strcmp(argv[1], "dump") == 0 && argc == 3) {
		db = open_db(argv[2]);
		dump(db);
		sqlite3_close(db);
		return 0;
	}
	usage();
	return 0;
}
