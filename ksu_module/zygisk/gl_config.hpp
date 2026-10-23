#pragma once

#include <string>

// Keep this header free of Android and JNI includes: the host tests compile it directly.

namespace gl_config {

enum class Scope { None, Apps, Selected };

struct Config {
    bool enabled = false;
    Scope scope = Scope::None;
    std::string renderer;
    std::string apps;
};

// Only the apps and selected scopes reach the hook; "root" and "all" leave every app alone here.
inline Scope scope_of(const std::string &name) {
    if (name == "apps" || name == "all") return Scope::Apps;
    if (name == "selected") return Scope::Selected;
    return Scope::None;
}

// Parses the key=value lines that spoof.sh writes; unknown keys and lines without '=' are ignored.
inline Config parse(const std::string &text) {
    Config config;
    std::string scope;
    std::string::size_type start = 0;
    while (start < text.size()) {
        auto end = text.find('\n', start);
        if (end == std::string::npos) end = text.size();
        std::string line = text.substr(start, end - start);
        start = end + 1;
        auto equals = line.find('=');
        if (equals == std::string::npos) continue;
        std::string key = line.substr(0, equals);
        std::string value = line.substr(equals + 1);
        if (key == "enabled") config.enabled = value == "1";
        else if (key == "scope") scope = value;
        else if (key == "renderer") config.renderer = value;
        else if (key == "apps") config.apps = value;
    }
    config.scope = scope_of(scope);
    return config;
}

// The apps list is space separated package names; the match must be a whole name.
inline bool package_listed(const std::string &apps, const std::string &package) {
    if (package.empty()) return false;
    std::string::size_type start = 0;
    while (start < apps.size()) {
        auto end = apps.find(' ', start);
        if (end == std::string::npos) end = apps.size();
        if (end - start == package.size() && apps.compare(start, package.size(), package) == 0) return true;
        start = end + 1;
    }
    return false;
}

// Android app ids are 10000..19999 within each user; the uid's user part is ignored.
inline bool app_uid(int uid) {
    int appid = uid % 100000;
    return appid >= 10000 && appid <= 19999;
}

inline bool hook_applies(const Config &config, int uid, const std::string &package) {
    if (!config.enabled || config.renderer.empty()) return false;
    if (config.scope == Scope::Apps) return app_uid(uid);
    if (config.scope == Scope::Selected) return package_listed(config.apps, package);
    return false;
}

}  // namespace gl_config
