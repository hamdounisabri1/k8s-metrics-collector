import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CostOverview,
  NamespacesCostResponse,
  NodesCostResponse,
  PodsCostResponse,
  PodCostHistoryResponse,
  TopPodsCostResponse,
  SimulateQueryParams,
  SimulateResponse,
} from 'src/app/models/metrics.model';

@Injectable({ providedIn: 'root' })
export class CostService {
  constructor(private http: HttpClient) {}

  // GET /cost/overview
  getOverview(range_minutes = 60): Observable<CostOverview> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<CostOverview>('/cost/overview', { params });
  }

  // GET /cost/namespaces
  getNamespaces(range_minutes = 60): Observable<NamespacesCostResponse> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<NamespacesCostResponse>('/cost/namespaces', { params });
  }

  // GET /cost/nodes
  getNodes(range_minutes = 60): Observable<NodesCostResponse> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<NodesCostResponse>('/cost/nodes', { params });
  }

  // GET /cost/pods
  getPods(
    range_minutes = 60,
    namespace?:    string,
    node?:         string
  ): Observable<PodsCostResponse> {
    let params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    if (namespace) params = params.set('namespace', namespace);
    if (node)      params = params.set('node',      node);
    return this.http.get<PodsCostResponse>('/cost/pods', { params });
  }

  // GET /cost/pods/{pod_name}
  getPodHistory(
    podName:        string,
    range_minutes  = 60,
    window_minutes = 5,
    namespace?:     string
  ): Observable<PodCostHistoryResponse> {
    let params = new HttpParams()
      .set('range_minutes',  range_minutes.toString())
      .set('window_minutes', window_minutes.toString());
    if (namespace) params = params.set('namespace', namespace);
    return this.http.get<PodCostHistoryResponse>(
      `/cost/pods/${encodeURIComponent(podName)}`,
      { params }
    );
  }

  // GET /cost/top/pods
  getTopPods(
    limit         = 10,
    range_minutes = 60
  ): Observable<TopPodsCostResponse> {
    const params = new HttpParams()
      .set('limit',         limit.toString())
      .set('range_minutes', range_minutes.toString());
    return this.http.get<TopPodsCostResponse>('/cost/top/pods', { params });
  }

  // GET /cost/simulate
  simulate(p: SimulateQueryParams): Observable<SimulateResponse> {
    const params = new HttpParams()
      .set('cpu_cores',  p.cpu_cores.toString())
      .set('ram_gb',     p.ram_gb.toString())
      .set('storage_gb', p.storage_gb.toString())
      .set('hours',      p.hours.toString());
    return this.http.get<SimulateResponse>('/cost/simulate', { params });
  }
}