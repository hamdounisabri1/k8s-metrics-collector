#!/bin/bash
# ─────────────────────────────────────────────
# K8s Metrics Backend — API Test Script
# Usage: ./test_api.sh
# ─────────────────────────────────────────────

BASE="http://51.210.11.109:30800"
PASS=0
FAIL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

hit() {
  local label="$1"
  local url="$2"
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}▶ $label${NC}"
  echo -e "  ${url}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  HTTP_CODE=$(curl -s -o /tmp/api_resp.json -w "%{http_code}" "$url")

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo -e "${GREEN}✔ HTTP $HTTP_CODE${NC}"
    cat /tmp/api_resp.json | jq .
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✘ HTTP $HTTP_CODE${NC}"
    cat /tmp/api_resp.json | jq .
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        K8s Metrics Backend — API Tests           ║${NC}"
echo -e "${CYAN}║        Target: $BASE   ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"

# ── Health ─────────────────────────────────────────────
hit "Health check" \
  "$BASE/health"

# ── Metrics ────────────────────────────────────────────
hit "Cluster overview (resources)" \
  "$BASE/overview"

hit "Per-node resources" \
  "$BASE/nodes"

hit "Per-namespace resources" \
  "$BASE/namespaces"

hit "All pods (latest metrics)" \
  "$BASE/pods"

hit "Pods filtered by namespace: kube-system" \
  "$BASE/pods?namespace=kube-system"

hit "Top 5 pods by CPU" \
  "$BASE/top/pods?field=cpu_cores&limit=5"

hit "Top 5 pods by RAM" \
  "$BASE/top/pods?field=ram_gb&limit=5"

hit "Timeseries — CPU last 60 min (5 min window)" \
  "$BASE/timeseries?field=cpu_cores&range_minutes=60&window_minutes=5"

hit "Timeseries — RAM last 60 min (5 min window)" \
  "$BASE/timeseries?field=ram_gb&range_minutes=60&window_minutes=5"

# ── Pricing ────────────────────────────────────────────
hit "Get current prices" \
  "$BASE/pricing/prices"

hit "Price change history (last 20)" \
  "$BASE/pricing/history?limit=20"

# ── Cost ───────────────────────────────────────────────
hit "Cost overview — cluster total (€)" \
  "$BASE/cost/overview"

hit "Cost per namespace (€)" \
  "$BASE/cost/namespaces"

hit "Cost per node (€)" \
  "$BASE/cost/nodes"

hit "Cost per pod (€)" \
  "$BASE/cost/pods"

hit "Top 5 most expensive pods (€)" \
  "$BASE/cost/top/pods?limit=5"

hit "Cost simulate: 2 cores, 4GB RAM, 10GB storage, 24h" \
  "$BASE/cost/simulate?cpu_cores=2&ram_gb=4&storage_gb=10&hours=24"

hit "Cost simulate: 0.5 core, 1GB RAM, 1h" \
  "$BASE/cost/simulate?cpu_cores=0.5&ram_gb=1&storage_gb=0&hours=1"

# ── Summary ────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}✔ PASSED: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}✘ FAILED: $FAIL${NC}"
else
  echo -e "  ${RED}✘ FAILED: $FAIL${NC}"
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""