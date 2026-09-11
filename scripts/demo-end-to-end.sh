#!/usr/bin/env bash
# STLS — A-to-Z demo script for end-to-end testing.
# Run this in a terminal while screen-recording. Each step prints a
# clear header and a one-line PASS/FAIL with a short result snippet.
#
# Prerequisites (already running):
#   - PGlite bridge on tcp://127.0.0.1:5433
#   - Backend (NestJS) on http://127.0.0.1:4010
#   - Frontend (Next.js) on http://localhost:3000

set -u

API="http://127.0.0.1:4010"
WEB="http://localhost:3000"
PASS=0
FAIL=0
RESULTS=()

c_reset=$'\033[0m'
c_bold=$'\033[1m'
c_green=$'\033[32m'
c_red=$'\033[31m'
c_yellow=$'\033[33m'
c_cyan=$'\033[36m'
c_dim=$'\033[2m'

step() {
  echo
  echo "${c_bold}${c_cyan}=== $1 ===${c_reset}"
}

run() {
  local name="$1"; shift
  local cmd="$1"; shift
  local match="$1"; shift   # text or regex that must appear in the body
  local out http
  http=$(eval "$cmd" 2>/dev/null)
  if echo "$http" | grep -qE "$match"; then
    PASS=$((PASS + 1))
    printf "  ${c_green}✓${c_reset} %s\n" "$name"
    printf "    ${c_dim}%s${c_reset}\n" "$(echo "$http" | head -c 240 | tr '\n' ' ')"
    RESULTS+=("PASS|$name")
  else
    FAIL=$((FAIL + 1))
    printf "  ${c_red}✗${c_reset} %s\n" "$name"
    printf "    ${c_dim}%s${c_reset}\n" "$(echo "$http" | head -c 240 | tr '\n' ' ')"
    RESULTS+=("FAIL|$name")
  fi
}

http_status() {
  local name="$1"; shift
  local url="$1"; shift
  local expected="$1"; shift
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    printf "  ${c_green}✓${c_reset} %s ${c_dim}HTTP %s${c_reset}\n" "$name" "$actual"
    RESULTS+=("PASS|$name")
  else
    FAIL=$((FAIL + 1))
    printf "  ${c_red}✗${c_reset} %s ${c_dim}got HTTP %s, expected %s${c_reset}\n" "$name" "$actual" "$expected"
    RESULTS+=("FAIL|$name")
  fi
}

clear
echo "${c_bold}════════════════════════════════════════════════════════════════${c_reset}"
echo "${c_bold}  STLS — End-to-End Demo${c_reset}"
echo "${c_bold}  Smart Traffic Light System — Royaume du Maroc${c_reset}"
echo "${c_bold}════════════════════════════════════════════════════════════════${c_reset}"
echo
echo "Demo flow:"
echo "  1. Backend health & topology"
echo "  2. Engineering metrics (flow / density / saturation / queue)"
echo "  3. Prediction snapshots (intersection / zone / city)"
echo "  4. Traffic Prediction Agent (decision support)"
echo "  5. Signal Optimization Agent (active control)"
echo "  6. Frontend dashboard"

# 1. Backend & topology
step "1. Backend health & topology"
run "Backend /meta"        "curl -s ${API}/meta"        "service|environment"
run "Cities (backend)"     "curl -s ${API}/cities"      '"id":"city-'
run "Zones (backend)"      "curl -s ${API}/zones"       '"id":"dist-'
run "Road links (backend)" "curl -s ${API}/road-links" '"fromIntersectionId"'
run "Bootstrap snapshot"   "curl -s ${API}/command-platform/bootstrap" '"intersections":\['

# 2. Engineering metrics
step "2. Engineering metrics"
# Pick a real intersection code from the live topology so the demo
# survives re-seeds (UUIDs are random per seed; codes come from source
# data). Falls back to a known Casablanca code if the fetch fails.
INT_ID=$(curl -s "${API}/traffic-graph/intersections" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const a=JSON.parse(d);process.stdout.write((a[0]&&a[0].code)||'');}catch(e){}})" 2>/dev/null)
if [ -z "$INT_ID" ]; then INT_ID="CAR-0179"; fi
printf "  ${c_dim}Using intersection: %s${c_reset}\n" "$INT_ID"
run "Traffic graph intersections" \
    "curl -s ${API}/traffic-graph/intersections" \
    '"engineeringIntersectionCode"'
run "Per-intersection metrics (flow / density / saturation / queue)" \
    "curl -s '${API}/prediction-snapshots/intersections/${INT_ID}?horizon=H%2B15'" \
    '"saturation":[0-9]'

# 3. Prediction snapshots
step "3. Prediction snapshots (city / zone / intersection)"
run "City snapshot — Casablanca" \
    "curl -s '${API}/prediction-snapshots/cities/city-casablanca?horizon=H%2B15'" \
    '"aggregatedMetrics"'
run "Zone snapshot — Maarif" \
    "curl -s '${API}/prediction-snapshots/zones/dist-cas-maarif?horizon=H%2B15'" \
    '"aggregatedMetrics"|"hotspots"'
run "Intersection snapshot — ${INT_ID}" \
    "curl -s '${API}/prediction-snapshots/intersections/${INT_ID}?horizon=H%2B15'" \
    '"metrics"'

# 4. Prediction Agent (decision support)
step "4. Traffic Prediction Agent — decision support"
run "Agent prediction — ${INT_ID}" \
    "curl -s '${API}/traffic-intelligence/intersection/${INT_ID}?horizon=H%2B15'" \
    '"predictedCongestionLevel"'
http_status "Agent rejects unknown intersection" \
    "${API}/traffic-intelligence/intersection/NOPE-1" 404

# 5. Signal Optimization Agent (active control)
step "5. Signal Optimization Agent — active control"
run "Optimize timing — ${INT_ID}" \
    "curl -s -X POST '${API}/traffic-control/intersection/${INT_ID}/optimize?horizon=H%2B15'" \
    '"phases"'
http_status "Optimizer rejects unknown intersection" \
    "${API}/traffic-control/intersection/NOPE-1/optimize" 404

# 6. Frontend
step "6. Frontend dashboard"
http_status "Web /"                           "${WEB}/"                       200
http_status "Web /studio/network"             "${WEB}/studio/network"         200
http_status "Web /studio/zones"               "${WEB}/studio/zones"           200

# Summary
echo
echo "${c_bold}════════════════════════════════════════════════════════════════${c_reset}"
echo "${c_bold}  Demo summary${c_reset}"
echo "${c_bold}════════════════════════════════════════════════════════════════${c_reset}"
TOTAL=$((PASS + FAIL))
printf "  ${c_green}PASS: %d${c_reset}    ${c_red}FAIL: %d${c_reset}    ${c_bold}TOTAL: %d${c_reset}\n" "$PASS" "$FAIL" "$TOTAL"
echo
if [ "$FAIL" -eq 0 ]; then
  echo "${c_green}${c_bold}  ✓ All checks passed — system is fully operational.${c_reset}"
else
  echo "${c_yellow}${c_bold}  ✗ Some checks failed — review the entries above.${c_reset}"
  for entry in "${RESULTS[@]}"; do
    case "$entry" in
      FAIL\|*) echo "    - ${entry#FAIL|}" ;;
    esac
  done
fi
echo
