#!/usr/bin/env python3
"""
K8s Metrics Backend
Exposes cluster metrics stored in InfluxDB via a REST API.
"""

import os
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from influxdb_client import InfluxDBClient

import pricing

# ── InfluxDB config ────────────────────────────────────────────────────────────
INFLUX_URL    = os.getenv("INFLUX_URL",    "http://localhost:8086")
INFLUX_TOKEN  = os.getenv("INFLUX_TOKEN",  "")
INFLUX_ORG    = os.getenv("INFLUX_ORG",    "influxdata")
INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "cluster_metrics")

influx = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
query_api = influx.query_api()

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="K8s Metrics API",
    description="REST API that exposes Kubernetes cluster metrics from InfluxDB",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe_time(record) -> Optional[str]:
    """
    Return an ISO timestamp string from a FluxRecord without raising KeyError.

    After aggregations like `sum()` or `group()`, InfluxDB may drop `_time`
    from the result row entirely — calling `record.get_time()` internally does
    `record.values["_time"]` which raises KeyError in that case.
    We use .get() on the underlying dict to avoid that.
    """
    ts = record.values.get("_time")
    if ts is None:
        return None
    # ts is already a datetime when coming from the influxdb-client
    return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)


def _flux(query: str):
    """Run a Flux query and return a list of dicts."""
    try:
        tables = query_api.query(query, org=INFLUX_ORG)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"InfluxDB error: {exc}")

    rows = []
    for table in tables:
        for record in table.records:
            rows.append({
                "time":  _safe_time(record),
                "field": record.values.get("_field"),
                "value": record.values.get("_value"),
                **{k: v for k, v in record.values.items()
                   if k not in ("_time", "_field", "_value",
                                "_start", "_stop", "_measurement",
                                "result", "table")},
            })
    return rows


def _range(minutes: int = 60) -> str:
    return f"-{minutes}m"


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ── /overview ──────────────────────────────────────────────────────────────────

@app.get("/overview")
def overview(range_minutes: int = Query(60, ge=1, le=10080)):
    """
    Returns the latest aggregated totals for the whole cluster:
    total CPU cores, total RAM GB, total Storage GB,
    plus the count of unique nodes, namespaces, and pods.
    """
    range_str = _range(range_minutes)
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => r._measurement == "k8s_metrics")
  |> last()
  |> group(columns: ["_field"])
  |> sum(column: "_value")
"""
    raw = _flux(flux_query)
    totals = {r["field"]: round(r["value"], 4) for r in raw}

    # Count of unique entities
    for entity, col in [("nodes", "node"), ("namespaces", "namespace"), ("pods", "pod")]:
        count_query = f"""
import "influxdata/influxdb/schema"
schema.tagValues(bucket: "{INFLUX_BUCKET}", tag: "{col}")
"""
        try:
            tables = query_api.query(count_query, org=INFLUX_ORG)
            values = [r.get_value() for t in tables for r in t.records if r.get_value() not in ("", None)]
            totals[entity] = len(values)
        except Exception:
            totals[entity] = None

    return totals


# ── /nodes ─────────────────────────────────────────────────────────────────────

@app.get("/nodes")
def nodes(range_minutes: int = Query(60, ge=1, le=10080)):
    """Per-node aggregated CPU, RAM, Storage (last values summed across pods)."""
    range_str = _range(range_minutes)
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => r._measurement == "k8s_metrics")
  |> last()
  |> group(columns: ["node", "_field"])
  |> sum(column: "_value")
"""
    raw = _flux(flux_query)
    result: dict = {}
    for r in raw:
        node = r.get("node", "unknown")
        if node not in result:
            result[node] = {"node": node}
        result[node][r["field"]] = round(r["value"], 4)

    return list(result.values())


# ── /namespaces ────────────────────────────────────────────────────────────────

@app.get("/namespaces")
def namespaces(range_minutes: int = Query(60, ge=1, le=10080)):
    """Per-namespace aggregated CPU, RAM, Storage."""
    range_str = _range(range_minutes)
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => r._measurement == "k8s_metrics")
  |> last()
  |> group(columns: ["namespace", "_field"])
  |> sum(column: "_value")
"""
    raw = _flux(flux_query)
    result: dict = {}
    for r in raw:
        ns = r.get("namespace", "unknown")
        if ns not in result:
            result[ns] = {"namespace": ns}
        result[ns][r["field"]] = round(r["value"], 4)

    return list(result.values())


# ── /pods ──────────────────────────────────────────────────────────────────────

@app.get("/pods")
def pods(
    namespace: Optional[str] = None,
    node: Optional[str] = None,
    range_minutes: int = Query(60, ge=1, le=10080),
):
    """
    Latest CPU / RAM / Storage per pod.
    Optionally filter by namespace or node.
    """
    range_str = _range(range_minutes)
    filters = ['r._measurement == "k8s_metrics"']
    if namespace:
        filters.append(f'r.namespace == "{namespace}"')
    if node:
        filters.append(f'r.node == "{node}"')

    filter_str = " and ".join(filters)
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => {filter_str})
  |> last()
  |> group(columns: ["namespace", "node", "pod", "_field"])
"""
    raw = _flux(flux_query)
    result: dict = {}
    for r in raw:
        key = (r.get("namespace"), r.get("node"), r.get("pod"))
        if key not in result:
            result[key] = {
                "namespace": r.get("namespace"),
                "node":      r.get("node"),
                "pod":       r.get("pod"),
            }
        result[key][r["field"]] = round(r["value"], 4)

    return list(result.values())


# ── /pods/{pod_name}/history ───────────────────────────────────────────────────

@app.get("/pods/{pod_name}/history")
def pod_history(
    pod_name: str,
    namespace: Optional[str] = None,
    range_minutes: int = Query(60, ge=1, le=10080),
    window_minutes: int = Query(5,  ge=1, le=60),
):
    """
    Time-series history for a single pod (mean aggregated per window).
    Returns a list of {time, cpu_cores, ram_gb, storage_gb}.
    """
    range_str = _range(range_minutes)
    ns_filter = f'r.namespace == "{namespace}" and ' if namespace else ""
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => r._measurement == "k8s_metrics"
      and {ns_filter}r.pod == "{pod_name}")
  |> aggregateWindow(every: {window_minutes}m, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
"""
    try:
        tables = query_api.query(flux_query, org=INFLUX_ORG)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    rows = []
    for table in tables:
        for record in table.records:
            rows.append({
                "time":        _safe_time(record),
                "cpu_cores":   round(record.values.get("cpu_cores",  0) or 0, 6),
                "ram_gb":      round(record.values.get("ram_gb",     0) or 0, 4),
                "storage_gb":  round(record.values.get("storage_gb", 0) or 0, 4),
                "namespace":   record.values.get("namespace"),
                "node":        record.values.get("node"),
            })
    return rows


# ── /timeseries ────────────────────────────────────────────────────────────────

@app.get("/timeseries")
def timeseries(
    field: str = Query("cpu_cores", description="cpu_cores | ram_gb | storage_gb"),
    namespace: Optional[str] = None,
    node: Optional[str] = None,
    range_minutes: int = Query(60, ge=1, le=10080),
    window_minutes: int = Query(5, ge=1, le=60),
):
    """
    Cluster-wide time-series for a given field, aggregated per window.
    Returns [{time, value}].
    """
    if field not in ("cpu_cores", "ram_gb", "storage_gb"):
        raise HTTPException(status_code=400, detail="Invalid field.")

    range_str = _range(range_minutes)
    filters = [f'r._measurement == "k8s_metrics"', f'r._field == "{field}"']
    if namespace:
        filters.append(f'r.namespace == "{namespace}"')
    if node:
        filters.append(f'r.node == "{node}"')

    filter_str = " and ".join(filters)
    flux_query = f"""
from(bucket: "{INFLUX_BUCKET}")
  |> range(start: {range_str})
  |> filter(fn: (r) => {filter_str})
  |> aggregateWindow(every: {window_minutes}m, fn: sum, createEmpty: false)
"""
    raw = _flux(flux_query)
    return [{"time": r["time"], "value": round(r["value"] or 0, 6)} for r in raw]


# ── /top/pods ──────────────────────────────────────────────────────────────────

@app.get("/top/pods")
def top_pods(
    field: str = Query("cpu_cores", description="cpu_cores | ram_gb | storage_gb"),
    limit: int = Query(10, ge=1, le=100),
    range_minutes: int = Query(60, ge=1, le=10080),
):
    """Top N pods by a given resource field."""
    if field not in ("cpu_cores", "ram_gb", "storage_gb"):
        raise HTTPException(status_code=400, detail="Invalid field.")

    all_pods = pods(range_minutes=range_minutes)
    sorted_pods = sorted(all_pods, key=lambda p: p.get(field, 0), reverse=True)
    return sorted_pods[:limit]


# ══════════════════════════════════════════════════════════════════════════════
# PRICING & COST MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

# ── Pydantic models ────────────────────────────────────────────────────────────

class PriceUpdate(BaseModel):
    value:      float        = Field(..., ge=0, description="New price in € per unit per hour")
    updated_by: str          = Field("api", description="Who is making the change")
    reason:     Optional[str]= Field(None,  description="Optional reason / comment")


class BulkPriceUpdate(BaseModel):
    cpu_core_price_per_hour:   Optional[float] = Field(None, ge=0)
    ram_gb_price_per_hour:     Optional[float] = Field(None, ge=0)
    storage_gb_price_per_hour: Optional[float] = Field(None, ge=0)
    updated_by: str           = Field("api")
    reason:     Optional[str] = None


# ── /pricing/prices ────────────────────────────────────────────────────────────

@app.get(
    "/pricing/prices",
    summary="Get all current unit prices",
    tags=["Pricing"],
)
def get_prices():
    """
    Returns the three unit prices currently in use (€ / unit / hour):
    - `cpu_core_price_per_hour`
    - `ram_gb_price_per_hour`
    - `storage_gb_price_per_hour`
    """
    return pricing.get_prices()


@app.put(
    "/pricing/prices/{key}",
    summary="Update a single unit price",
    tags=["Pricing"],
)
def update_price(key: str, body: PriceUpdate):
    """
    Update one price by key. Valid keys:
    `cpu_core_price_per_hour` | `ram_gb_price_per_hour` | `storage_gb_price_per_hour`
    """
    try:
        return pricing.set_price(
            key,
            body.value,
            updated_by=body.updated_by,
            reason=body.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put(
    "/pricing/prices",
    summary="Bulk-update all prices in one call",
    tags=["Pricing"],
)
def bulk_update_prices(body: BulkPriceUpdate):
    """
    Update one or more prices at once.
    Only the fields you provide will be changed.
    """
    updates = {
        "cpu_core_price_per_hour":   body.cpu_core_price_per_hour,
        "ram_gb_price_per_hour":     body.ram_gb_price_per_hour,
        "storage_gb_price_per_hour": body.storage_gb_price_per_hour,
    }
    changed = {}
    for key, value in updates.items():
        if value is not None:
            try:
                changed[key] = pricing.set_price(
                    key, value,
                    updated_by=body.updated_by,
                    reason=body.reason,
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

    return {"updated": changed, "current": pricing.get_prices()}


@app.post(
    "/pricing/prices/reset",
    summary="Reset all prices to factory defaults",
    tags=["Pricing"],
)
def reset_prices(updated_by: str = Query("api")):
    """Reset cpu, ram and storage prices back to their built-in defaults."""
    return pricing.reset_to_defaults(updated_by=updated_by)


@app.get(
    "/pricing/history",
    summary="Audit log of all price changes",
    tags=["Pricing"],
)
def price_history(
    key:   Optional[str] = Query(None, description="Filter by price key"),
    limit: int           = Query(50,   ge=1, le=500),
):
    """Returns the most recent price change events, newest first."""
    return pricing.get_history(key=key, limit=limit)


# ── /cost/* ────────────────────────────────────────────────────────────────────

def _hours_from_minutes(minutes: int) -> float:
    return minutes / 60.0


def _enrich_with_cost(resource: dict, hours: float) -> dict:
    """Add cost fields to a resource dict that has cpu_cores, ram_gb, storage_gb."""
    cost = pricing.compute_cost(
        cpu_cores  = resource.get("cpu_cores",  0) or 0,
        ram_gb     = resource.get("ram_gb",     0) or 0,
        storage_gb = resource.get("storage_gb", 0) or 0,
        hours      = hours,
    )
    return {**resource, **cost}


@app.get(
    "/cost/overview",
    summary="Cluster-wide cost summary",
    tags=["Cost"],
)
def cost_overview(range_minutes: int = Query(60, ge=1, le=10080)):
    """
    Cluster totals enriched with cost breakdown (€).
    The `range_minutes` window is used both to read resources
    AND as the billing duration for the cost calculation.
    """
    raw = overview(range_minutes=range_minutes)
    hours = _hours_from_minutes(range_minutes)
    cost = pricing.compute_cost(
        cpu_cores  = raw.get("cpu_cores",  0) or 0,
        ram_gb     = raw.get("ram_gb",     0) or 0,
        storage_gb = raw.get("storage_gb", 0) or 0,
        hours      = hours,
    )
    return {
        **raw,
        **cost,
        "prices_used": pricing.get_prices(),
        "range_minutes": range_minutes,
    }


@app.get(
    "/cost/namespaces",
    summary="Cost breakdown per namespace",
    tags=["Cost"],
)
def cost_namespaces(range_minutes: int = Query(60, ge=1, le=10080)):
    """Cost breakdown (€) for every namespace over the given time window."""
    hours = _hours_from_minutes(range_minutes)
    return [_enrich_with_cost(ns, hours) for ns in namespaces(range_minutes=range_minutes)]


@app.get(
    "/cost/nodes",
    summary="Cost breakdown per node",
    tags=["Cost"],
)
def cost_nodes(range_minutes: int = Query(60, ge=1, le=10080)):
    """Cost breakdown (€) for every node over the given time window."""
    hours = _hours_from_minutes(range_minutes)
    return [_enrich_with_cost(n, hours) for n in nodes(range_minutes=range_minutes)]


@app.get(
    "/cost/pods",
    summary="Cost breakdown per pod",
    tags=["Cost"],
)
def cost_pods(
    namespace:     Optional[str] = None,
    node:          Optional[str] = None,
    range_minutes: int           = Query(60, ge=1, le=10080),
):
    """Cost breakdown (€) for every pod, with optional namespace / node filter."""
    hours = _hours_from_minutes(range_minutes)
    return [
        _enrich_with_cost(p, hours)
        for p in pods(namespace=namespace, node=node, range_minutes=range_minutes)
    ]


@app.get(
    "/cost/pods/{pod_name}",
    summary="Detailed cost history for a single pod",
    tags=["Cost"],
)
def cost_pod_history(
    pod_name:       str,
    namespace:      Optional[str] = None,
    range_minutes:  int           = Query(60, ge=1, le=10080),
    window_minutes: int           = Query(5,  ge=1, le=60),
):
    """
    Time-series cost for a single pod.
    Each data point is one aggregation window → cost for that window duration.
    """
    window_hours = _hours_from_minutes(window_minutes)
    history = pod_history(
        pod_name=pod_name,
        namespace=namespace,
        range_minutes=range_minutes,
        window_minutes=window_minutes,
    )
    return [_enrich_with_cost(row, window_hours) for row in history]


@app.get(
    "/cost/top/pods",
    summary="Top N most expensive pods",
    tags=["Cost"],
)
def cost_top_pods(
    limit:         int = Query(10, ge=1, le=100),
    range_minutes: int = Query(60, ge=1, le=10080),
):
    """Returns the top N pods sorted by total cost (€), descending."""
    hours = _hours_from_minutes(range_minutes)
    enriched = [
        _enrich_with_cost(p, hours)
        for p in pods(range_minutes=range_minutes)
    ]
    return sorted(enriched, key=lambda x: x.get("total_cost", 0), reverse=True)[:limit]


@app.get(
    "/cost/simulate",
    summary="Simulate cost for given resource amounts",
    tags=["Cost"],
)
def simulate_cost(
    cpu_cores:  float = Query(..., ge=0, description="Number of CPU cores"),
    ram_gb:     float = Query(..., ge=0, description="RAM in GB"),
    storage_gb: float = Query(0,  ge=0, description="Storage in GB"),
    hours:      float = Query(1,  gt=0, description="Duration in hours"),
):
    """
    Ad-hoc cost simulator — useful for the Angular dashboard price calculator.
    Does NOT read from InfluxDB; purely uses current prices × provided values.
    """
    return {
        **pricing.compute_cost(cpu_cores, ram_gb, storage_gb, hours),
        "inputs": {
            "cpu_cores":  cpu_cores,
            "ram_gb":     ram_gb,
            "storage_gb": storage_gb,
            "hours":      hours,
        },
        "prices_used": pricing.get_prices(),
    }