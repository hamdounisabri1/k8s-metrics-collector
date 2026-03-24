# k8s-metrics-collector

> A complete Kubernetes observability and cost analysis platform. Collects real-time CPU, RAM, and storage metrics from every pod in your cluster, stores them in **InfluxDB**, and exposes them via a **FastAPI** backend and a configurable **cost engine** backed by **SQLite** — all deployable inside the cluster.

---

## Table of Contents

- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Architecture](#architecture)
- [Components](#components)
  - [1. Collector](#1-collector)
  - [2. Backend API](#2-backend-api)
  - [3. kubectl Plugin (cost2.py)](#3-kubectl-plugin-cost2py)
  - [4. Dashboard (Frontend)](#4-dashboard-frontend)
    - [Metrics View](#metrics-view)
    - [Cost View](#cost-view)
    - [Pricing View](#pricing-view)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration Reference](#configuration-reference)
- [RBAC & Permissions](#rbac--permissions)
- [API Reference](#api-reference)
- [Pricing Engine](#pricing-engine)
- [kubectl Plugin Usage](#kubectl-plugin-usage)
- [Docker Images](#docker-images)
- [Troubleshooting](#troubleshooting)

---

## Overview

`k8s-metrics-collector` is a self-hosted Kubernetes cost visibility tool. It answers questions like:

- How much CPU, RAM, and storage is each pod/namespace/node consuming right now?
- What does that consumption cost in €?
- How has usage evolved over the past hour, day, or week?

All components run **inside** the cluster. No external SaaS required.

---

## Repository Structure

```
k8s-metrics-collector/
│
├── collector.py                  # Metrics scraper — runs every 60s, writes to InfluxDB
├── Dockerfile                    # Image for the collector pod
├── collector-deployment.yaml     # Kubernetes Deployment for the collector
├── metrics-rbac.yaml             # ServiceAccount + ClusterRole + ClusterRoleBinding
├── influx-auth.sh                # Helper script to retrieve the InfluxDB admin token
│
├── k8s-plugin/
│   └── cost2.py                  # kubectl-style CLI: historical cost analysis from InfluxDB
│
└── Dashboard/
    ├── BackEnd/
    │   ├── main.py               # FastAPI application — all REST routes
    │   ├── pricing.py            # Pricing engine — SQLite store + cost calculator
    │   ├── requirements.txt      # Python dependencies
    │   ├── Dockerfile            # Image for the backend pod
    │   ├── deployment.yaml       # Kubernetes PVC + Deployment + Service
    │   └── script-test-endpoints.sh  # Shell script to smoke-test all 19 endpoints
    └── FrontEnd/
        └── src/app/
            ├── metrics/          # Cluster metrics dashboard (metrics.component.ts)
            ├── cost/             # Cost analysis dashboard (cost.component.ts)
            └── pricing/          # Pricing management (pricing.component.ts)
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                        │
│                                                                  │
│  ┌─────────────────┐   writes every    ┌──────────────────────┐ │
│  │  k8s-collector  │ ──── 60 s ──────▶ │      InfluxDB        │ │
│  │  (collector.py) │                   │  bucket: cluster_    │ │
│  │  ServiceAccount │                   │        metrics       │ │
│  │  collector-sa   │                   └──────────┬───────────┘ │
│  └─────────────────┘                              │ reads        │
│                                                   ▼             │
│                                    ┌──────────────────────────┐ │
│                                    │   k8s-metrics-backend    │ │
│  ┌────────────────────────────┐    │   (FastAPI / main.py)    │ │
│  │  kubectl plugin / cost2.py │    │                          │ │
│  │  (runs on local machine)   │    │   pricing.db (SQLite)    │ │
│  └────────────────────────────┘    │   mounted via PVC        │ │
│                                    └──────────────┬───────────┘ │
│                                                   │ REST API     │
│                                                   ▼  :30800     │
│                                          Angular Dashboard UI   │
│                                    ┌──────────────────────────┐ │
│                                    │  Metrics View            │ │
│                                    │  Cost View               │ │
│                                    │  Pricing View            │ │
│                                    └──────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

The **collector** uses the Kubernetes metrics API and PVC information to build per-pod data points (CPU cores, RAM GB, storage GB) and writes them to InfluxDB every 60 seconds. The **backend** reads from InfluxDB, applies configurable unit prices, and serves a REST API consumed by the frontend dashboard. The **kubectl plugin** runs locally and queries InfluxDB directly to print cost tables in the terminal.

---

## Components

### 1. Collector

**File:** `collector.py` | **Deployed by:** `collector-deployment.yaml`

Runs as a single pod inside the cluster. Every 60 seconds it:

1. Lists all pod metrics via the `metrics.k8s.io` API.
2. Resolves the node each pod is running on.
3. Sums CPU (converted to cores) and RAM (converted to GB) across all containers in the pod.
4. Walks the pod's volumes to find any PVCs and sums their requested storage.
5. Writes a single `k8s_metrics` point to InfluxDB with tags `node`, `namespace`, and `pod`, and fields `cpu_cores`, `ram_gb`, and `storage_gb`.

**CPU unit conversion:**

| Suffix | Meaning | Conversion |
|--------|---------|------------|
| `n` | nanocores | ÷ 1,000,000,000 |
| `u` | microcores | ÷ 1,000,000 |
| `m` | millicores | ÷ 1,000 |
| _(none)_ | cores | as-is |

**Memory unit conversion:**

| Suffix | Meaning | Result |
|--------|---------|--------|
| `Ki` | kibibytes | ÷ 1,048,576 → GB |
| `Mi` | mebibytes | ÷ 1,024 → GB |
| `Gi` | gibibytes | value in GB |
| `Ti` | tebibytes | × 1,024 → GB |

---

### 2. Backend API

**Directory:** `Dashboard/BackEnd/`

A FastAPI application exposing 19 REST endpoints across four groups:

| Group | Description |
|-------|-------------|
| **Health** | Liveness probe |
| **Metrics** | Raw resource usage per pod / namespace / node / cluster |
| **Cost** | € cost breakdown using configurable unit prices |
| **Pricing** | CRUD for unit prices + full audit history |

See [API Reference](#api-reference) for details.

---

### 3. kubectl Plugin (`cost2.py`)

**File:** `k8s-plugin/cost2.py`

A standalone Python CLI that connects directly to InfluxDB and prints a formatted cost table to the terminal. Useful for quick ad-hoc queries without opening a browser.

See [kubectl Plugin Usage](#kubectl-plugin-usage) for examples.

---

### 4. Dashboard (Frontend)

**Directory:** `Dashboard/FrontEnd/`

An Angular single-page application served alongside the backend on NodePort `30800`. It provides three dedicated views, each consuming the backend REST API.

---

#### Metrics View

**Component:** `metrics.component.ts` | **Route:** `/metrics`

Displays real-time Kubernetes resource usage across the entire cluster.

**Features:**

- **Cluster health indicator** — shows a live status badge (`ok` / error) from the `/health` endpoint.
- **Cluster overview** — summary cards showing total CPU cores, RAM GB, and storage GB in use across all pods.
- **Timeseries charts** — interactive Chart.js line charts for CPU, RAM, and storage usage over time. The time range and aggregation window are configurable (default: last 60 minutes, 5-minute windows).
- **Top pods** — ranked lists of the top 10 pods by CPU, RAM, and storage consumption.
- **Nodes table** — per-node resource usage, sortable by any column.
- **Namespaces table** — per-namespace aggregated resource usage, sortable by any column.
- **Pods table** — full pod-level metrics with namespace filter, column sorting, and pagination (8 pods per page).

| Control | Behaviour |
|---------|-----------|
| Time range selector | Updates all charts and tables to the selected window (e.g. 30m, 1h, 6h, 24h) |
| Namespace filter | Filters the pods table to a single namespace |
| Column headers | Click to sort ascending/descending |
| Pagination | Navigate across pages of pods |
| Refresh button | Re-fetches all data immediately |

---

#### Cost View

**Component:** `cost.component.ts` | **Route:** `/cost`

Breaks down resource consumption into € costs using the unit prices configured in the Pricing view.

**Features:**

- **Cost overview** — summary cards showing total cluster cost (€) for the selected time range, split by CPU, RAM, and storage.
- **Top 10 most expensive pods** — ranked list by total cost.
- **Nodes cost table** — per-node cost breakdown, sortable by any column.
- **Namespaces cost table** — per-namespace cost breakdown, sortable by any column.
- **Pods cost table** — per-pod cost with namespace filter, column sorting, and pagination (8 pods per page). Clicking a pod opens a **cost history modal** showing how that pod's cost evolved over time.
- **Cost simulator** — an interactive form where you enter hypothetical CPU cores, RAM GB, storage GB, and duration (hours) and instantly receive an estimated cost breakdown (CPU cost, RAM cost, storage cost, and total) without touching InfluxDB.

| Control | Behaviour |
|---------|-----------|
| Time range selector | Refreshes all cost data for the chosen window |
| Namespace filter | Filters the pods cost table |
| Pod row click | Opens cost history modal for that pod |
| Simulator form | Enter resource values and hours → click **Run** to simulate |
| Reset button (simulator) | Clears inputs back to defaults (1 CPU / 2 GB RAM / 10 GB storage / 24 h) |
| Refresh button | Re-fetches all cost data |

---

#### Pricing View

**Component:** `pricing.component.ts` | **Route:** `/pricing`

Manages the three unit prices that drive all cost calculations across the platform.

**Features:**

- **Current prices display** — cards showing the active price for each resource (CPU core/hour, RAM GB/hour, storage GB/hour) in euros (€) with 4-decimal precision.
- **Individual price update** — click any price card to open a modal where you can enter a new value and an optional reason for the change.
- **Bulk price update** — update all three prices in a single operation via a dedicated modal, pre-populated with the current values.
- **Reset to defaults** — restores all prices to their factory defaults with a confirmation step before executing.
- **Price change history** — a paginated, sortable audit table showing every past price change: old value, new value, who changed it, when, and the reason provided.

| Default price | Value |
|---------------|-------|
| `cpu_core_price_per_hour` | `€0.0480` |
| `ram_gb_price_per_hour` | `€0.0060` |
| `storage_gb_price_per_hour` | `€0.0001` |

| Control | Behaviour |
|---------|-----------|
| Price card → Edit button | Opens individual update modal |
| Bulk Update button | Opens bulk update modal with all three prices |
| Reset Prices button | Prompts confirmation, then resets to defaults |
| History filter | Filter audit log by price key |
| History column headers | Click to sort ascending/descending |
| History pagination | Navigate across pages (10 entries per page) |

All price changes trigger a toast notification (success or error) and automatically refresh the history table.

---

## Prerequisites

| Tool | Minimum version | Check |
|------|----------------|-------|
| Docker | 20+ | `docker --version` |
| kubectl | 1.24+ | `kubectl version` |
| Python | 3.9+ | `python3 --version` |
| Helm (optional) | 3+ | `helm version` |

The following must already be running in the cluster:

- **InfluxDB** (Helm chart `influxdb2`) in namespace `k8s-metrics`, service name `influxdb-influxdb2`
- **metrics-server** enabled so that `kubectl top pods` and the `metrics.k8s.io` API work

---

## Quick Start

### Step 1 — Create the namespace

```bash
kubectl create namespace k8s-metrics
```

### Step 2 — Deploy InfluxDB

Add the Helm repo and install InfluxDB with persistence, a fixed NodePort, and an initial admin user:

```bash
helm repo add influxdata https://helm.influxdata.com/
helm repo update

helm install influxdb influxdata/influxdb2 \
  --namespace k8s-metrics \
  --set persistence.enabled=true \
  --set persistence.size=5Gi \
  --set service.type=NodePort \
  --set service.nodePort=30086 \
  --set influxdb2.setup.enabled=true \
  --set influxdb2.setup.username=admin
```

Wait for the pod to be ready before continuing:

```bash
kubectl rollout status statefulset/influxdb-influxdb2 -n k8s-metrics
```

### Step 3 — Apply RBAC

```bash
kubectl apply -f metrics-rbac.yaml
```

### Step 4 — Retrieve the InfluxDB credentials

`influx-auth.sh` prints two things: the **admin password** and the **operator token**. The token is what you need for the next steps.

```bash
chmod +x influx-auth.sh
./influx-auth.sh
```

Example output:

```
Mot de passe admin InfluxDB :
<admin-password>
-----------------------------------
Token InfluxDB :
ID   Description   Token                            Status   ...
1    ...           <YOUR_INFLUX_TOKEN_HERE>         active   ...
```

Copy the token value, then set it as `INFLUX_TOKEN` in **both** of the following files before applying them:

- `collector-deployment.yaml`
- `Dashboard/BackEnd/deployment.yaml`

### Step 5 — Deploy the collector

```bash
kubectl apply -f collector-deployment.yaml
```

The collector will immediately begin scraping pod metrics every 60 seconds and writing them to InfluxDB.

### Step 6 — Deploy the backend

```bash
kubectl apply -f Dashboard/BackEnd/deployment.yaml
```

### Step 7 — Verify everything is running

```bash
kubectl get pods -n k8s-metrics
# NAME                                    READY   STATUS    RESTARTS   AGE
# influxdb-influxdb2-0                    1/1     Running   0          ...
# k8s-collector-xxxxxxxxxx-xxxxx          1/1     Running   0          ...
# k8s-metrics-backend-xxxxxxxxxx-xxxxx    1/1     Running   0          ...

kubectl get svc -n k8s-metrics
# k8s-metrics-backend   NodePort   ...   8000:30800/TCP

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[0].address}')
curl http://$NODE_IP:30800/health
# {"status":"ok"}
```

Swagger UI is available at `http://<NODE_IP>:30800/docs`.

The Angular dashboard is available at `http://<NODE_IP>:30800`.

---

## Configuration Reference

### Collector environment variables (`collector-deployment.yaml`)

| Variable | Description | Example |
|----------|-------------|---------|
| `INFLUX_URL` | InfluxDB in-cluster service URL | `http://influxdb-influxdb2.k8s-metrics.svc.cluster.local:80` |
| `INFLUX_TOKEN` | InfluxDB admin token | `9CqCMAr8...` |
| `INFLUX_ORG` | InfluxDB organisation | `influxdata` |
| `INFLUX_BUCKET` | InfluxDB bucket | `cluster_metrics` |

### Backend environment variables (`Dashboard/BackEnd/deployment.yaml`)

| Variable | Description | Example |
|----------|-------------|---------|
| `INFLUX_URL` | Same InfluxDB service URL | `http://influxdb-influxdb2.k8s-metrics.svc.cluster.local:80` |
| `INFLUX_TOKEN` | InfluxDB admin token | `9CqCMAr8...` |
| `INFLUX_ORG` | InfluxDB organisation | `influxdata` |
| `INFLUX_BUCKET` | InfluxDB bucket | `cluster_metrics` |
| `PRICING_DB` | Path to SQLite pricing database | `/data/pricing.db` |

### Plugin configuration (`k8s-plugin/cost2.py`)

The plugin reads pricing from `prices.json` at a hardcoded path. The keys are:

| Key | Default | Description |
|-----|---------|-------------|
| `CPU_PRICE` | `0.02` | $ per CPU core per data point |
| `RAM_PRICE` | `0.02` | $ per GB RAM per data point |
| `STORAGE_PRICE` | `0.01` | $ per GB storage per data point |

The InfluxDB URL and token are also set as constants near the top of `cost2.py` — update them to match your cluster.

---

## RBAC & Permissions

`metrics-rbac.yaml` creates three resources:

**ServiceAccount** `collector-sa` in namespace `k8s-metrics` — used by the collector pod.

**ClusterRole** `collector-role` — grants read access to:
- `pods` and `persistentvolumeclaims` in the core API group
- `pods` in the `metrics.k8s.io` API group

**ClusterRoleBinding** `collector-binding` — binds `collector-role` to `collector-sa`.

No other component requires special RBAC; the backend and plugin connect to InfluxDB over HTTP only.

---

## API Reference

All endpoints accept a `range_minutes` query parameter (default `60`, max `10080` = 7 days).

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Returns `{"status": "ok"}` |

### Metrics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/overview` | Cluster totals: CPU cores, RAM GB, Storage GB + entity counts |
| `GET` | `/nodes` | Per-node aggregated resource usage |
| `GET` | `/namespaces` | Per-namespace aggregated resource usage |
| `GET` | `/pods` | Per-pod latest metrics (filter by `namespace` or `node`) |
| `GET` | `/pods/{name}/history` | Time-series history for a single pod |
| `GET` | `/timeseries` | Cluster-wide time-series for `cpu_cores`, `ram_gb`, or `storage_gb` |
| `GET` | `/top/pods` | Top N pods by a given resource field |

```bash
# Top 5 pods by CPU
curl "http://<NODE_IP>:30800/top/pods?field=cpu_cores&limit=5" | jq

# Pod history — last 2 hours, 10-minute aggregation window
curl "http://<NODE_IP>:30800/pods/my-pod/history?range_minutes=120&window_minutes=10" | jq
```

### Pricing

Unit prices are stored in SQLite and persist across pod restarts via a PVC. Default values on first boot:

| Key | Default | Unit |
|-----|---------|------|
| `cpu_core_price_per_hour` | `0.048` | € per vCPU core per hour |
| `ram_gb_price_per_hour` | `0.006` | € per GB RAM per hour |
| `storage_gb_price_per_hour` | `0.0001` | € per GB storage per hour |

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/pricing/prices` | Read all current unit prices |
| `PUT` | `/pricing/prices/{key}` | Update a single price |
| `PUT` | `/pricing/prices` | Bulk update multiple prices |
| `POST` | `/pricing/prices/reset` | Reset all prices to defaults |
| `GET` | `/pricing/history` | Audit log of all price changes |

```bash
# Update CPU price
curl -X PUT "http://<NODE_IP>:30800/pricing/prices/cpu_core_price_per_hour" \
  -H "Content-Type: application/json" \
  -d '{"value": 0.055, "updated_by": "admin", "reason": "Q2 revision"}' | jq

# Bulk update
curl -X PUT "http://<NODE_IP>:30800/pricing/prices" \
  -H "Content-Type: application/json" \
  -d '{"cpu_core_price_per_hour": 0.055, "ram_gb_price_per_hour": 0.007, "updated_by": "admin"}' | jq
```

### Cost

Cost is calculated as:

```
cost (€) = resource_amount × unit_price × hours
```

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/cost/overview` | Cluster-wide cost breakdown in € |
| `GET` | `/cost/namespaces` | Cost per namespace |
| `GET` | `/cost/nodes` | Cost per node |
| `GET` | `/cost/pods` | Cost per pod (filter by `namespace` or `node`) |
| `GET` | `/cost/pods/{name}` | Time-series cost history for a single pod |
| `GET` | `/cost/top/pods` | Top N most expensive pods |
| `GET` | `/cost/simulate` | Ad-hoc cost calculator (no InfluxDB read) |

```bash
# Cost overview for last 24 hours
curl "http://<NODE_IP>:30800/cost/overview?range_minutes=1440" | jq

# Simulate: 4 cores / 8 GB RAM / 50 GB storage for 30 days
curl "http://<NODE_IP>:30800/cost/simulate?cpu_cores=4&ram_gb=8&storage_gb=50&hours=720" | jq
```

Example simulate response:

```json
{
  "cpu_cost": 138.24,
  "ram_cost": 34.56,
  "storage_cost": 3.6,
  "total_cost": 176.4,
  "hours": 720,
  "inputs": { "cpu_cores": 4, "ram_gb": 8, "storage_gb": 50, "hours": 720 },
  "prices_used": {
    "cpu_core_price_per_hour": 0.048,
    "ram_gb_price_per_hour": 0.006,
    "storage_gb_price_per_hour": 0.0001
  }
}
```

---

## Pricing Engine

`pricing.py` is a standalone module with no external dependencies beyond Python's standard library and `sqlite3`. It uses a SQLite database at `/data/pricing.db`, mounted from a PVC so prices survive pod restarts.

On first boot it automatically creates the database file, the `prices` table, the `prices_history` table, and seeds the three default prices.

Every update records the old value, new value, who changed it, when, and an optional reason. This gives a full audit trail queryable via `GET /pricing/history`.

---

## kubectl Plugin Usage

The plugin (`k8s-plugin/cost2.py`) connects to InfluxDB and prints a formatted cost table. Run it with Python 3 and the `influxdb-client` package installed.

**Flags:**

| Flag | Description |
|------|-------------|
| `-n <namespace>` | Filter by namespace |
| `-p <pod>` | Filter by pod name (requires `-n`) |
| `-N <node>` | Filter by node |
| `-t <duration>` | Time range: `30m`, `1h`, `7d` (default: `1h`) |

**Examples:**

```bash
# All pods, last hour
python3 cost2.py

# All pods in a namespace, last 24 hours
python3 cost2.py -n production -t 24h

# Single pod, last 30 minutes
python3 cost2.py -n production -p my-app-7d9f4-xxxxx -t 30m

# All pods on a specific node
python3 cost2.py -N worker-node-01 -t 7d
```

**Example output:**

```
TIME                POD                            CPU($)    RAM($) STORAGE($)  TOTAL($)
-------------------------------------------------------------------------------------------
2025-06-01 08:00:00 my-app-7d9f4-xxxxx             0.0012    0.0008     0.0000    0.0020
2025-06-01 08:01:00 my-app-7d9f4-xxxxx             0.0013    0.0009     0.0000    0.0022
```

---

## Docker Images

| Component | Image | Dockerfile |
|-----------|-------|------------|
| Collector | `hamdounisabri/k8s-collector:latest` | `./Dockerfile` |
| Backend | `hamdounisabri/k8s-metrics-backend:latest` | `Dashboard/BackEnd/Dockerfile` |

**Rebuild and redeploy after code changes:**

```bash
# Collector
docker build -t hamdounisabri/k8s-collector:latest .
docker push hamdounisabri/k8s-collector:latest
kubectl rollout restart deployment/k8s-collector -n k8s-metrics

# Backend
cd Dashboard/BackEnd
docker build -t hamdounisabri/k8s-metrics-backend:latest .
docker push hamdounisabri/k8s-metrics-backend:latest
kubectl rollout restart deployment/k8s-metrics-backend -n k8s-metrics
```

---

## Troubleshooting

**Retrieve InfluxDB credentials at any time:**

`influx-auth.sh` prints both the admin password and the operator token. The token is used as `INFLUX_TOKEN` in `collector-deployment.yaml` and `Dashboard/BackEnd/deployment.yaml`.

```bash
./influx-auth.sh
# or directly:
kubectl exec -it influxdb-influxdb2-0 -n k8s-metrics -- influx auth list
```

**View live logs:**

```bash
kubectl logs -f deployment/k8s-collector -n k8s-metrics
kubectl logs -f deployment/k8s-metrics-backend -n k8s-metrics
```

**Inspect the pricing database:**

```bash
kubectl exec -it deployment/k8s-metrics-backend -n k8s-metrics -- \
  sqlite3 /data/pricing.db "SELECT * FROM prices;"

kubectl exec -it deployment/k8s-metrics-backend -n k8s-metrics -- \
  sqlite3 /data/pricing.db "SELECT * FROM prices_history ORDER BY id DESC LIMIT 10;"
```

**Check InfluxDB connectivity from inside the backend pod:**

```bash
kubectl exec -it deployment/k8s-metrics-backend -n k8s-metrics -- \
  curl http://influxdb-influxdb2.k8s-metrics.svc.cluster.local:80/health
```

**Run the backend endpoint smoke tests:**

```bash
cd Dashboard/BackEnd
chmod +x script-test-endpoints.sh
./script-test-endpoints.sh
# Expected: ✔ PASSED: 19  ✘ FAILED: 0
```

**Common errors:**

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `401 Unauthorized` from InfluxDB | Wrong token | Run `influx-auth.sh` and update `INFLUX_TOKEN` in both deployments |
| `CrashLoopBackOff` on backend | `/data` directory not writable | Check PVC is bound: `kubectl get pvc -n k8s-metrics` |
| `Connection refused` to InfluxDB | Service DNS not resolving | Verify the service name: `kubectl get svc -n k8s-metrics` |
| `No metrics found` in plugin | InfluxDB URL / token in `cost2.py` not updated | Edit the constants at the top of `k8s-plugin/cost2.py` |
| Collector pod stuck in `Error` | metrics-server not running | Enable metrics-server: `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml` |
| Dashboard shows no data | Backend not reachable on port 30800 | Verify service: `kubectl get svc k8s-metrics-backend -n k8s-metrics` |