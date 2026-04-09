#!/bin/bash

set -euo pipefail

# Generates app icons + splash sizes from a single source image.
# Requirements:
# - macOS built-in `sips`
#
# Usage:
# 1) Put a 1024x1024 PNG at assets/app-icon/source.png
# 2) Put a 2048x2048 PNG at assets/splash-screen/source.png
# 3) Run: bash scripts/generate-assets.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

ICON_SRC="$ROOT_DIR/assets/app-icon/source.png"
SPLASH_SRC="$ROOT_DIR/assets/splash-screen/source.png"

if [[ ! -f "$ICON_SRC" ]]; then
  echo "Missing $ICON_SRC" >&2
  exit 1
fi

if [[ ! -f "$SPLASH_SRC" ]]; then
  echo "Missing $SPLASH_SRC" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/assets/app-icon/ios" "$ROOT_DIR/assets/app-icon/android" "$ROOT_DIR/assets/splash-screen"

# iOS icon exports (PNG)
declare -a IOS_SIZES=(1024 180 167 152 120 87 80 76 60 58 40 29 20)
for size in "${IOS_SIZES[@]}"; do
  out="$ROOT_DIR/assets/app-icon/ios/icon-${size}.png"
  sips -z "$size" "$size" "$ICON_SRC" --out "$out" >/dev/null
  echo "Wrote $out"
done

# Android launcher exports
# Google Play store listing icon (512)
ANDROID_STORE_OUT="$ROOT_DIR/assets/app-icon/android/ic_launcher.png"
sips -z 512 512 "$ICON_SRC" --out "$ANDROID_STORE_OUT" >/dev/null

echo "Wrote $ANDROID_STORE_OUT"

# Android mipmaps
mkdir -p \
  "$ROOT_DIR/assets/app-icon/android/mipmap-mdpi" \
  "$ROOT_DIR/assets/app-icon/android/mipmap-hdpi" \
  "$ROOT_DIR/assets/app-icon/android/mipmap-xhdpi" \
  "$ROOT_DIR/assets/app-icon/android/mipmap-xxhdpi" \
  "$ROOT_DIR/assets/app-icon/android/mipmap-xxxhdpi"

sips -z 48 48 "$ICON_SRC" --out "$ROOT_DIR/assets/app-icon/android/mipmap-mdpi/ic_launcher.png" >/dev/null
sips -z 72 72 "$ICON_SRC" --out "$ROOT_DIR/assets/app-icon/android/mipmap-hdpi/ic_launcher.png" >/dev/null
sips -z 96 96 "$ICON_SRC" --out "$ROOT_DIR/assets/app-icon/android/mipmap-xhdpi/ic_launcher.png" >/dev/null
sips -z 144 144 "$ICON_SRC" --out "$ROOT_DIR/assets/app-icon/android/mipmap-xxhdpi/ic_launcher.png" >/dev/null
sips -z 192 192 "$ICON_SRC" --out "$ROOT_DIR/assets/app-icon/android/mipmap-xxxhdpi/ic_launcher.png" >/dev/null

# Splash
SPLASH_OUT="$ROOT_DIR/assets/splash-screen/splash.png"
sips -z 2048 2048 "$SPLASH_SRC" --out "$SPLASH_OUT" >/dev/null

echo "Wrote $SPLASH_OUT"

echo "Done. Next: copy icons into iOS Assets.xcassets and Android res/mipmap-* folders, or wire up your splash library." 
