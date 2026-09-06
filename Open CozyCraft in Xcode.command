#!/bin/zsh
set -euo pipefail

project_root="${0:A:h}"
xcode_settings="$project_root/ios/App/xcode-26.6-workaround.xcconfig"
xcode_project="$project_root/ios/App/App.xcodeproj"

# CapApp-SPM links these local Capacitor packages by path. If dependencies
# were pruned, Xcode reports the misleading “Missing package product
# CapApp-SPM” error even though the Swift package itself is present.
required_packages=(
  "$project_root/node_modules/@capacitor/app"
  "$project_root/node_modules/@capacitor/browser"
  "$project_root/node_modules/@capacitor/local-notifications"
  "$project_root/node_modules/@capacitor/push-notifications"
)
for package_path in "${required_packages[@]}"; do
  if [[ ! -d "$package_path" ]]; then
    echo "Restoring mobile dependencies for CapApp-SPM..."
    (cd "$project_root" && npm ci --no-audit --no-fund)
    break
  fi
done

# Refresh Xcode's package graph before the project is opened. This is safe to
# repeat and avoids leaving a stale red package-product entry in the UI.
xcodebuild -quiet \
  -project "$xcode_project" \
  -scheme App \
  -resolvePackageDependencies

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
