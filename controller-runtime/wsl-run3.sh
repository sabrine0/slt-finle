#!/bin/bash
set -eu

WORKDIR=/tmp/stls-runtime
SRC='/mnt/c/Users/Public/STLS finel/controller-runtime'

mkdir -p "$WORKDIR/cache"
cp "$SRC/controller-linux" "$WORKDIR/controller"
chmod +x "$WORKDIR/controller"
cp "$SRC/.env" "$WORKDIR/.env"

sed -i 's|^STLS_BACKEND_URL=.*|STLS_BACKEND_URL=http://172.26.208.1:4010|' "$WORKDIR/.env"
sed -i 's|^STLS_LOG_LEVEL=.*|STLS_LOG_LEVEL=info|' "$WORKDIR/.env"

# Don't seed token cache — let the controller obtain a fresh token. The April
# token is almost certainly expired and would just produce noisy refresh logs.

cd "$WORKDIR"
exec ./controller
