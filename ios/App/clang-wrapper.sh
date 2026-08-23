#!/bin/zsh

# Xcode 26.6 can deadlock while collecting the default compiler's verbose
# capability output during build pre-planning. For that metadata-only probe,
# omit `-v` so its output remains below the build service's pipe limit. Every
# real compile and link invocation is forwarded unchanged.
if [[ " $* " == *" -E "* && " $* " == *" -dM "* ]]; then
  probe_args=()
  for arg in "$@"; do
    [[ "$arg" == "-v" ]] || probe_args+=("$arg")
  done
  exec /usr/bin/xcrun --toolchain default clang "${probe_args[@]}"
fi

exec /usr/bin/xcrun --toolchain default clang "$@"
