// ─────────────────────────────────────────────────────────────────────────────
// api.models.ts
// K8s Metrics Backend — TypeScript models
// Derived directly from main.py + pricing.py source code.
// Every field name and type matches the actual JSON the backend returns.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Shared primitives ────────────────────────────────────────────────────────

/** ISO-8601 string returned by InfluxDB / Python datetime.utcnow().isoformat() */
export type IsoTimestamp = string;

/** The three resource fields present on every metrics record */
export interface ResourceUsage {
  cpu_cores:   number;
  ram_gb:      number;
  storage_gb:  number;
}

/**
 * Cost breakdown added by _enrich_with_cost() / compute_cost().
 * Field names have NO _eur suffix — they are exactly as returned.
 */
export interface CostBreakdown {
  cpu_cost:     number;   // €
  ram_cost:     number;   // €
  storage_cost: number;   // €
  total_cost:   number;   // €
  hours:        number;   // billing window used for the calculation
}

// ─── GET /health ──────────────────────────────────────────────────────────────
// return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

export interface HealthResponse {
  status:    'ok';
  timestamp: IsoTimestamp;
}

// ─── GET /overview ────────────────────────────────────────────────────────────
// Flat dict: {cpu_cores, ram_gb, storage_gb, nodes, namespaces, pods}
// Entity counts can be null if the schema.tagValues query fails.

export interface ClusterOverview extends ResourceUsage {
  nodes:      number | null;
  namespaces: number | null;
  pods:       number | null;
}

// ─── GET /nodes ───────────────────────────────────────────────────────────────
// [{node, cpu_cores, ram_gb, storage_gb}]
// No pod_count, no range_minutes.

export interface NodeMetrics extends ResourceUsage {
  node: string;
}

export type NodesResponse = NodeMetrics[];

// ─── GET /namespaces ─────────────────────────────────────────────────────────
// [{namespace, cpu_cores, ram_gb, storage_gb}]

export interface NamespaceMetrics extends ResourceUsage {
  namespace: string;
}

export type NamespacesResponse = NamespaceMetrics[];

// ─── GET /pods ────────────────────────────────────────────────────────────────
// [{namespace, node, pod, cpu_cores, ram_gb, storage_gb}]
// No timestamp — these are the latest values with no time field.

export interface PodMetrics extends ResourceUsage {
  pod:       string;
  namespace: string;
  node:      string;
}

export type PodsResponse = PodMetrics[];

/** Query params accepted by GET /pods */
export interface PodsQueryParams {
  range_minutes?: number;   // default 60, max 10080
  namespace?:     string;
  node?:          string;
}

// ─── GET /pods/{pod_name}/history ────────────────────────────────────────────
// Flat array — NOT a wrapped object.
// time can be null (InfluxDB may drop _time after pivot).

export interface PodHistoryPoint extends ResourceUsage {
  time:      IsoTimestamp | null;
  namespace: string | null;
  node:      string | null;
}

export type PodHistoryResponse = PodHistoryPoint[];

/** Query params for GET /pods/{name}/history */
export interface PodHistoryQueryParams {
  namespace?:      string;
  range_minutes?:  number;   // default 60
  window_minutes?: number;   // default 5
}

// ─── GET /timeseries ─────────────────────────────────────────────────────────
// [{time, value}]  — single numeric value per point, NOT ResourceUsage.
// time can be null.

export type TimeseriesField = 'cpu_cores' | 'ram_gb' | 'storage_gb';

export interface TimeseriesPoint {
  time:  IsoTimestamp | null;
  value: number;
}

export type TimeseriesResponse = TimeseriesPoint[];

/** Query params for GET /timeseries */
export interface TimeseriesQueryParams {
  field?:          TimeseriesField;   // default 'cpu_cores'
  namespace?:      string;
  node?:           string;
  range_minutes?:  number;            // default 60
  window_minutes?: number;            // default 5
}

// ─── GET /top/pods ────────────────────────────────────────────────────────────
// Same shape as PodMetrics — reuses the pods() result, just sorted + sliced.

export type TopPodsField = 'cpu_cores' | 'ram_gb' | 'storage_gb';

export type TopPodsResponse = PodMetrics[];

// ─── GET /pricing/prices ─────────────────────────────────────────────────────
// Simple flat dict: {key: number}
// e.g. {"cpu_core_price_per_hour": 0.048, "ram_gb_price_per_hour": 0.006, ...}

export type PriceKey =
  | 'cpu_core_price_per_hour'
  | 'ram_gb_price_per_hour'
  | 'storage_gb_price_per_hour';

export type PricesResponse = Record<PriceKey, number>;

// ─── PUT /pricing/prices/{key} ───────────────────────────────────────────────
// Request body

export interface UpdatePriceRequest {
  value:      number;          // >= 0
  updated_by: string;          // default "api"
  reason?:    string | null;
}

// Response: {key, value, updated_at, updated_by}
// NOTE: no "reason" in the response — reason is only stored in history.

export interface UpdatePriceResponse {
  key:        PriceKey;
  value:      number;
  updated_at: IsoTimestamp;
  updated_by: string;
}

// ─── PUT /pricing/prices (bulk) ──────────────────────────────────────────────
// Request: any subset of the three price fields + updated_by + reason

export interface BulkUpdatePricesRequest {
  cpu_core_price_per_hour?:   number;
  ram_gb_price_per_hour?:     number;
  storage_gb_price_per_hour?: number;
  updated_by?:                string;
  reason?:                    string | null;
}

// Response: {updated: {key: UpdatePriceResponse}, current: PricesResponse}

export interface BulkUpdatePricesResponse {
  updated: Partial<Record<PriceKey, UpdatePriceResponse>>;
  current: PricesResponse;
}

// ─── POST /pricing/prices/reset ──────────────────────────────────────────────
// Returns the full prices dict after resetting to defaults.
// Same shape as PricesResponse.

export type ResetPricesResponse = PricesResponse;

// ─── GET /pricing/history ────────────────────────────────────────────────────
// Fields come directly from the prices_history SQLite table.
// Note: changed_at / changed_by — NOT updated_at / updated_by.

export interface PriceHistoryEntry {
  id:         number;
  key:        string;              // PriceKey, but kept as string for safety
  old_value:  number | null;       // null on the very first write
  new_value:  number;
  changed_at: IsoTimestamp;        // ← changed_at, not updated_at
  changed_by: string;              // ← changed_by, not updated_by
  reason:     string | null;
}

export type PricingHistoryResponse = PriceHistoryEntry[];

// ─── GET /cost/overview ──────────────────────────────────────────────────────
// Merges overview() + compute_cost() + prices_used + range_minutes
// = ClusterOverview + CostBreakdown + prices_used + range_minutes

export interface CostOverview extends ClusterOverview, CostBreakdown {
  prices_used:    PricesResponse;
  range_minutes:  number;
}

// ─── GET /cost/namespaces ────────────────────────────────────────────────────
// Each entry = NamespaceMetrics + CostBreakdown (merged flat by _enrich_with_cost)

export interface NamespaceCost extends NamespaceMetrics, CostBreakdown {}

export type NamespacesCostResponse = NamespaceCost[];

// ─── GET /cost/nodes ─────────────────────────────────────────────────────────

export interface NodeCost extends NodeMetrics, CostBreakdown {}

export type NodesCostResponse = NodeCost[];

// ─── GET /cost/pods ──────────────────────────────────────────────────────────

export interface PodCost extends PodMetrics, CostBreakdown {}

export type PodsCostResponse = PodCost[];

// ─── GET /cost/pods/{pod_name} ───────────────────────────────────────────────
// Flat array — each point = PodHistoryPoint + CostBreakdown merged flat.

export interface PodCostHistoryPoint extends PodHistoryPoint, CostBreakdown {}

export type PodCostHistoryResponse = PodCostHistoryPoint[];

// ─── GET /cost/top/pods ──────────────────────────────────────────────────────
// Same as PodsCostResponse — just sorted by total_cost desc + sliced.

export type TopPodsCostResponse = PodCost[];

// ─── GET /cost/simulate ──────────────────────────────────────────────────────
// compute_cost() result + inputs + prices_used

export interface SimulateQueryParams {
  cpu_cores:  number;
  ram_gb:     number;
  storage_gb: number;
  hours:      number;
}

export interface SimulateResponse extends CostBreakdown {
  inputs:      SimulateQueryParams;
  prices_used: PricesResponse;
}

// ─── Generic API error ────────────────────────────────────────────────────────
// FastAPI's default HTTPException shape.

export interface ApiError {
  detail: string;
}