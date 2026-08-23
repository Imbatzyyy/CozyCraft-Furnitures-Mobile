#!/bin/zsh

project_root="${0:A:h}"
xcode_settings="$project_root/ios/App/xcode-26.6-workaround.xcconfig"
xcode_project="$project_root/ios/App/App.xcodeproj"

# Xcode 26.6 can deadlock in pre-planning while probing its default compiler.
# Launching with this explicit compiler keeps all Capacitor package targets on
# the filtered probe path while normal compilation still uses Apple Clang.
exec /usr/bin/env \
  "CCC_OVERRIDE_OPTIONS=x-v" \
  "COZYCRAFT_CLANG_WRAPPER=$project_root/ios/App/clang-wrapper.sh" \
  "XCODE_XCCONFIG_FILE=$xcode_settings" \
  /Applications/Xcode.app/Contents/MacOS/Xcode \
  "$xcode_project"
