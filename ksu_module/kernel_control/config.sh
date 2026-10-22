# Names and paths shared by service.sh, customize.sh and bin/tune.sh. The WebUI keeps the
# same values in webui/src/core/config.ts; tests/shell/config_test.sh fails if the two drift apart.
MODULE_ID=kernel_control
MODULES_DIR=/data/adb/modules
CONF_DIR=/data/adb/kernel_control

# Names from before the module was renamed from SUSFS Control to Kernel Control.
OLD_MODULE_ID=ksu_susfs_ui
OLD_CONF_DIR=/data/adb/susfs_ui
