#include <android/log.h>
#include <sys/stat.h>
#include <unistd.h>

#include <cstdio>
#include <cstring>
#include <string>

#include "gl_config.hpp"
#include "zygisk.hpp"

namespace {

constexpr const char *kLogTag = "KernelControlGL";
constexpr const char *kConfigPath = "/data/adb/kernel_control/spoof/gl.conf";
constexpr const char *kRuntimeLibrary = "/libandroid_runtime.so";
constexpr unsigned int kGlRenderer = 0x1F01;

using GetString = const unsigned char *(*)(unsigned int);

GetString original = nullptr;
std::string renderer;

const unsigned char *spoofed_glGetString(unsigned int name) {
    if (name == kGlRenderer && !renderer.empty())
        return reinterpret_cast<const unsigned char *>(renderer.c_str());
    return original(name);
}

// Runs as root in the companion process, which can read the module's settings; the app process cannot.
void companion_handler(int fd) {
    FILE *file = fopen(kConfigPath, "r");
    if (file == nullptr) return;
    char buffer[4096];
    size_t length = fread(buffer, 1, sizeof(buffer), file);
    fclose(file);
    write(fd, buffer, length);
}

class GlSpoofModule : public zygisk::ModuleBase {
public:
    void onLoad(zygisk::Api *api_, JNIEnv *env_) override {
        api = api_;
        env = env_;
    }

    void preAppSpecialize(zygisk::AppSpecializeArgs *args) override {
        uid = args->uid;
        package = process_name(args);

        int fd = api->connectCompanion();
        if (fd < 0) {
            api->setOption(zygisk::Option::DLCLOSE_MODULE_LIBRARY);
            return;
        }
        std::string text;
        char buffer[512];
        ssize_t count;
        while ((count = read(fd, buffer, sizeof(buffer))) > 0) text.append(buffer, count);
        close(fd);

        config = gl_config::parse(text);
        wanted = gl_config::hook_applies(config, uid, package);
        if (!wanted) api->setOption(zygisk::Option::DLCLOSE_MODULE_LIBRARY);
    }

    void postAppSpecialize(const zygisk::AppSpecializeArgs *) override {
        if (!wanted) return;
        renderer = config.renderer;
        if (!hook_runtime()) {
            api->setOption(zygisk::Option::DLCLOSE_MODULE_LIBRARY);
            return;
        }
        __android_log_print(ANDROID_LOG_INFO, kLogTag, "GL_RENDERER spoofed for %s", package.c_str());
    }

private:
    zygisk::Api *api = nullptr;
    JNIEnv *env = nullptr;
    int uid = -1;
    std::string package;
    gl_config::Config config;
    bool wanted = false;

    std::string process_name(zygisk::AppSpecializeArgs *args) {
        if (args->nice_name == nullptr) return "";
        const char *name = env->GetStringUTFChars(args->nice_name, nullptr);
        if (name == nullptr) return "";
        std::string result = name;
        env->ReleaseStringUTFChars(args->nice_name, name);
        return result;
    }

    // Finds the runtime library in this process's memory map so pltHookRegister can match its dev and inode.
    bool hook_runtime() {
        FILE *maps = fopen("/proc/self/maps", "r");
        if (maps == nullptr) return false;
        char line[1024];
        std::string path;
        while (fgets(line, sizeof(line), maps) != nullptr) {
            if (strstr(line, kRuntimeLibrary) == nullptr) continue;
            char *start = strchr(line, '/');
            if (start == nullptr) continue;
            path = start;
            while (!path.empty() && (path.back() == '\n' || path.back() == ' ')) path.pop_back();
            break;
        }
        fclose(maps);
        if (path.empty()) return false;

        struct stat info;
        if (stat(path.c_str(), &info) != 0) return false;
        api->pltHookRegister(info.st_dev, info.st_ino, "glGetString",
                             reinterpret_cast<void *>(spoofed_glGetString),
                             reinterpret_cast<void **>(&original));
        return api->pltHookCommit();
    }
};

}  // namespace

REGISTER_ZYGISK_MODULE(GlSpoofModule)
REGISTER_ZYGISK_COMPANION(companion_handler)
