#!/bin/bash
set -u

WORKDIR=/tmp/stls-runtime
mkdir -p "$WORKDIR/cache"
cd "$WORKDIR"

SRC='/mnt/c/Users/Public/STLS finel/controller-runtime'
cp "$SRC/controller-linux" ./controller
chmod +x ./controller
cp "$SRC/.env" ./.env

# Override the backend URL to point at the Windows host (WSL gateway).
# Keep all other settings as-is.
sed -i 's|^STLS_BACKEND_URL=.*|STLS_BACKEND_URL=http://172.26.208.1:4010|' ./.env

# Seed the cache so we don't lose the previously-issued token + package.
if [ -f "$SRC/cache/token.json" ];   then cp "$SRC/cache/token.json"   ./cache/; fi
if [ -f "$SRC/cache/package.json" ]; then cp "$SRC/cache/package.json" ./cache/; fi

# Force log level to info so we see progress without drowning in debug noise.
sed -i 's|^STLS_LOG_LEVEL=.*|STLS_LOG_LEVEL=info|' ./.env

echo "--- .env (backend URL line) ---"
grep -E '^(STLS_BACKEND_URL|STLS_OPERATING_ENVIRONMENT|STLS_LOG_LEVEL)=' ./.env
echo "--- starting controller in background ---"
nohup ./controller > run.log 2> run.err &
PID=$!
echo "controller PID = $PID"
echo $PID > run.pid
