#!/bin/zsh
set -euo pipefail

project_root="${0:A:h}"
# Select the newest installed supported Xcode, or honor an explicit override.
# Package resolution and the GUI must use the same toolchain. No global
# xcode-select change is made, and the old workaround is limited to 26.6.
exec node "$project_root/scripts/xcode-toolchain.mjs" open
