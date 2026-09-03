#!/bin/bash
set -euo pipefail

PLATFORM="${1:-all}"
MOBILE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_ROOT="${COZYCRAFT_FRONTEND_ROOT:-$MOBILE_ROOT/storefront}"
BUNDLED_FRONTEND="$MOBILE_ROOT/src/assets/original-frontend"
STATE_DIR="$MOBILE_ROOT/.native-build"

mkdir -p "$STATE_DIR"

hash_sources() {
  local root="$1"
  find "$root" -type f \
    ! -path '*/node_modules/*' \
    ! -path '*/dist/*' \
    ! -path '*/www/*' \
    ! -path '*/.angular/*' \
    ! -path '*/.cache/*' \
    ! -path '*/.codex-backups/*' \
    ! -path '*/.figma/*' \
    ! -path '*/ios/*' \
    ! -path '*/android/*' \
    ! -path '*/.git/*' \
    ! -path '*/.native-build/*' \
    ! -name '.DS_Store' \
    ! -name '*.apk' \
    ! -name '*.aab' \
    ! -name '*.apks' \
    ! -name '*.o' \
    ! -name '*.tar.gz' \
    -print0 | LC_ALL=C sort -z | xargs -0 shasum | shasum | awk '{print $1}'
}

if [[ -f "$FRONTEND_ROOT/package.json" ]]; then
  if [[ ! -d "$FRONTEND_ROOT/node_modules" ]]; then
    echo "Installing mobile storefront dependencies..."
    (cd "$FRONTEND_ROOT" && npm ci --no-audit --no-fund)
  fi
  FRONTEND_HASH="$(hash_sources "$FRONTEND_ROOT")"
  FRONTEND_STATE="$STATE_DIR/frontend.sha"
  if [[ ! -f "$FRONTEND_ROOT/dist/index.html" ]] || [[ "$(cat "$FRONTEND_STATE" 2>/dev/null || true)" != "$FRONTEND_HASH" ]]; then
    echo "Preparing latest CozyCraft storefront..."
    (cd "$FRONTEND_ROOT" && npm run build)
    printf '%s' "$FRONTEND_HASH" > "$FRONTEND_STATE"
  fi

  mkdir -p "$BUNDLED_FRONTEND"
  rsync -a --delete "$FRONTEND_ROOT/dist/" "$BUNDLED_FRONTEND/"
elif [[ -f "$BUNDLED_FRONTEND/index.html" ]]; then
  echo "Using the committed CozyCraft storefront bundle."
else
  echo "No CozyCraft storefront source or committed bundle was found." >&2
  echo "Set COZYCRAFT_FRONTEND_ROOT to the storefront source directory." >&2
  exit 1
fi

WRAPPER_HASH="$(hash_sources "$MOBILE_ROOT")"
WRAPPER_STATE="$STATE_DIR/mobile.sha"
if [[ ! -f "$MOBILE_ROOT/www/index.html" ]] || [[ "$(cat "$WRAPPER_STATE" 2>/dev/null || true)" != "$WRAPPER_HASH" ]]; then
  echo "Preparing latest CozyCraft mobile shell..."
  (cd "$MOBILE_ROOT" && npm run build)
  printf '%s' "$WRAPPER_HASH" > "$WRAPPER_STATE"
fi

copy_bundle() {
  local destination="$1"
  mkdir -p "$destination"
  rsync -a --delete "$MOBILE_ROOT/www/" "$destination/"
}

case "$PLATFORM" in
  ios)
    copy_bundle "$MOBILE_ROOT/ios/App/App/public"
    ;;
  android)
    copy_bundle "$MOBILE_ROOT/android/app/src/main/assets/public"
    ;;
  all)
    copy_bundle "$MOBILE_ROOT/ios/App/App/public"
    copy_bundle "$MOBILE_ROOT/android/app/src/main/assets/public"
    ;;
  *)
    echo "Usage: $0 [ios|android|all]" >&2
    exit 2
    ;;
esac

echo "CozyCraft web bundle is ready for $PLATFORM."
