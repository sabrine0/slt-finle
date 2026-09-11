#!/bin/bash
set -eu

WORKDIR=/tmp/stls-runtime
SRC='/mnt/c/Users/Public/STLS finel/controller-runtime'

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR/cache"

cp "$SRC/controller-linux" "$WORKDIR/controller"
chmod +x "$WORKDIR/controller"
cp "$SRC/.env" "$WORKDIR/.env"
cp "$SRC/cache/package.json" "$WORKDIR/cache/"
cp "$SRC/cache/token.json"   "$WORKDIR/cache/"

sed -i 's|^STLS_BACKEND_URL=.*|STLS_BACKEND_URL=http://172.26.208.1:4010|' "$WORKDIR/.env"
sed -i 's|^STLS_LOG_LEVEL=.*|STLS_LOG_LEVEL=info|' "$WORKDIR/.env"

cd "$WORKDIR"
exec ./controller
