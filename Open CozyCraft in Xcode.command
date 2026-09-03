#!/bin/zsh

project_root="${0:A:h}"
xcode_settings="$project_root/ios/App/xcode-26.6-workaround.xcconfig"
xcode_project="$project_root/ios/App/App.xcodeproj"

# Xcode 26.6 can deadlock in pre-planning while probing its default compiler.
# Launch a fresh Xcode process so an older, unpatched Xcode session cannot keep
# its already-created build service. Normal compilation still uses Apple Clang;
# only the verbose metadata probe is filtered.
exec /usr/bin/open \
  --env "CCC_OVERRIDE_OPTIONS=x-v" \
  --env "COZYCRAFT_CLANG_WRAPPER=$project_root/ios/App/clang-wrapper.sh" \
  --env "XCODE_XCCONFIG_FILE=$xcode_settings" \
  -na Xcode \
  "$xcode_project"
