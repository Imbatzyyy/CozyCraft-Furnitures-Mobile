#!/bin/zsh
set -euo pipefail
variant_root="${0:A:h}"
exec node "$variant_root/scripts/xcode-toolchain.mjs" open
