#!/bin/bash

set -euo pipefail

if [[ -z "${KEYSTORE_PASSWORD:-}" ]]; then
  echo "KEYSTORE_PASSWORD env var is required" >&2
  exit 1
fi

if [[ -z "${KEY_PASSWORD:-}" ]]; then
  echo "KEY_PASSWORD env var is required" >&2
  exit 1
fi

KEY_ALIAS=${KEY_ALIAS:-summit-staffing}

echo "Generating Android release keystore..."

keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore android/app/summit-staffing-release.keystore \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Summit Staffing Pty Ltd, OU=Mobile, O=Summit Staffing, L=Nambour, S=Queensland, C=AU" \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass "$KEY_PASSWORD"

echo "Keystore generated at: android/app/summit-staffing-release.keystore"
echo "IMPORTANT: Keep this file secure and never commit to git!"
