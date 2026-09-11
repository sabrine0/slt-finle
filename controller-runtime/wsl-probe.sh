#!/bin/bash
set -u
{
  echo "--- WSL identity ---"
  uname -a
  echo
  echo "--- Default route (host = Windows gateway) ---"
  ip route show default
  echo
  echo "--- Probing backend ---"
  GW=$(ip route show default | awk '/default/ {print $3}')
  for host in host.docker.internal "$GW" 127.0.0.1; do
    code=$(curl -sS --max-time 3 -o /dev/null -w "%{http_code}" "http://$host:4010/" 2>/dev/null || echo "FAIL")
    printf "  %-32s -> HTTP %s\n" "$host:4010" "$code"
  done
} > /tmp/wsl-probe.out 2>&1
echo "done"
