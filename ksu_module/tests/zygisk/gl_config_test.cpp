#include <cstdio>
#include <string>

#include "../../zygisk/gl_config.hpp"

namespace {

int passed = 0;
int failed = 0;

void check(const char *name, bool condition) {
    if (condition) {
        ++passed;
    } else {
        ++failed;
        std::printf("FAIL: %s\n", name);
    }
}

}  // namespace

int main() {
    using gl_config::Config;
    using gl_config::Scope;

    const Config parsed = gl_config::parse(
        "enabled=1\nscope=selected\nrenderer=Adreno (TM) 640\napps=com.bank.app com.game.big\n");
    check("enabled is read", parsed.enabled);
    check("selected scope is read", parsed.scope == Scope::Selected);
    check("renderer keeps its spaces", parsed.renderer == "Adreno (TM) 640");
    check("apps are kept as one list", parsed.apps == "com.bank.app com.game.big");

    check("enabled=0 is off", !gl_config::parse("enabled=0\n").enabled);
    check("a value other than 1 is off", !gl_config::parse("enabled=yes\n").enabled);
    check("an empty file is off", !gl_config::parse("").enabled);
    check("a line without '=' is ignored", gl_config::parse("enabled\nenabled=1\n").enabled);
    check("unknown keys are ignored", gl_config::parse("enabled=1\nother=x\n").renderer.empty());
    check("the renderer may contain '='", gl_config::parse("renderer=a=b\n").renderer == "a=b");
    check("a missing final newline still parses", gl_config::parse("renderer=Mali").renderer == "Mali");

    check("scope apps", gl_config::scope_of("apps") == Scope::Apps);
    check("scope all reaches the same apps", gl_config::scope_of("all") == Scope::Apps);
    check("scope selected", gl_config::scope_of("selected") == Scope::Selected);
    check("scope root does not hook apps", gl_config::scope_of("root") == Scope::None);
    check("an unknown scope does not hook apps", gl_config::scope_of("everyone") == Scope::None);

    check("app uid of user 0", gl_config::app_uid(10150));
    check("app uid of the second user", gl_config::app_uid(1010151));
    check("first app id", gl_config::app_uid(10000));
    check("last app id", gl_config::app_uid(19999));
    check("system uid is not an app", !gl_config::app_uid(1000));
    check("shell uid is not an app", !gl_config::app_uid(2000));
    check("the uid after the app range is not an app", !gl_config::app_uid(20000));
    check("isolated processes are not hooked by the apps scope", !gl_config::app_uid(90000));

    check("a listed package is found", gl_config::package_listed("com.bank.app com.game.big", "com.game.big"));
    check("the first listed package is found", gl_config::package_listed("com.bank.app com.game.big", "com.bank.app"));
    check("a prefix of a listed package is not a match", !gl_config::package_listed("com.bank.app", "com.bank"));
    check("a longer name is not a match", !gl_config::package_listed("com.bank", "com.bank.app"));
    check("an empty package matches nothing", !gl_config::package_listed("com.bank.app", ""));
    check("an empty list matches nothing", !gl_config::package_listed("", "com.bank.app"));

    Config on;
    on.enabled = true;
    on.renderer = "Adreno (TM) 640";
    on.scope = Scope::Apps;
    check("apps scope hooks an app uid", gl_config::hook_applies(on, 10150, "com.bank.app"));
    check("apps scope skips a system uid", !gl_config::hook_applies(on, 1000, "com.android.settings"));

    Config selected = on;
    selected.scope = Scope::Selected;
    selected.apps = "com.bank.app";
    check("selected scope hooks a listed app", gl_config::hook_applies(selected, 10150, "com.bank.app"));
    check("selected scope skips an unlisted app", !gl_config::hook_applies(selected, 10151, "com.game.big"));

    Config off = on;
    off.enabled = false;
    check("a disabled config hooks nothing", !gl_config::hook_applies(off, 10150, "com.bank.app"));
    Config empty = on;
    empty.renderer.clear();
    check("an empty renderer hooks nothing", !gl_config::hook_applies(empty, 10150, "com.bank.app"));
    Config root = on;
    root.scope = Scope::None;
    check("the root scope hooks nothing", !gl_config::hook_applies(root, 0, "com.android.shell"));

    std::printf("%d passed, %d failed\n", passed, failed);
    return failed == 0 ? 0 : 1;
}
