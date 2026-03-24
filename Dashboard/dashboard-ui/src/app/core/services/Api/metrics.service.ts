import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {   HealthResponse,
  ClusterOverview,
  NodesResponse,
  NamespacesResponse,
  PodsResponse,
  PodsQueryParams,
  PodHistoryResponse,
  PodHistoryQueryParams,
  TimeseriesResponse,
  TimeseriesQueryParams,
  TimeseriesField,
  TopPodsField,
  TopPodsResponse, } from 'src/app/models/metrics.model';


@Injectable({ providedIn: 'root' })
export class MetricsService {
  constructor(private http: HttpClient) {}

  // GET /health
  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>('/health');
  }

  // GET /overview
  getOverview(range_minutes = 60): Observable<ClusterOverview> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<ClusterOverview>('/overview', { params });
  }

  // GET /nodes
  getNodes(range_minutes = 60): Observable<NodesResponse> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<NodesResponse>('/nodes', { params });
  }

  // GET /namespaces
  getNamespaces(range_minutes = 60): Observable<NamespacesResponse> {
    const params = new HttpParams()
      .set('range_minutes', range_minutes.toString());
    return this.http.get<NamespacesResponse>('/namespaces', { params });
  }

  // GET /pods
  getPods(query: PodsQueryParams = {}): Observable<PodsResponse> {
    let params = new HttpParams()
      .set('range_minutes', (query.range_minutes ?? 60).toString());
    if (query.namespace) params = params.set('namespace', query.namespace);
    if (query.node)      params = params.set('node',      query.node);
    return this.http.get<PodsResponse>('/pods', { params });
  }

  // GET /pods/{pod_name}/history
  getPodHistory(
    podName: string,
    query:   PodHistoryQueryParams = {}
  ): Observable<PodHistoryResponse> {
    let params = new HttpParams()
      .set('range_minutes',  (query.range_minutes  ?? 60).toString())
      .set('window_minutes', (query.window_minutes ?? 5 ).toString());
    if (query.namespace) params = params.set('namespace', query.namespace);
    return this.http.get<PodHistoryResponse>(
      `/pods/${encodeURIComponent(podName)}/history`,
      { params }
    );
  }

  // GET /timeseries
  getTimeseries(query: TimeseriesQueryParams = {}): Observable<TimeseriesResponse> {
    let params = new HttpParams()
      .set('field',          query.field          ?? 'cpu_cores')
      .set('range_minutes',  (query.range_minutes  ?? 60).toString())
      .set('window_minutes', (query.window_minutes ?? 5 ).toString());
    if (query.namespace) params = params.set('namespace', query.namespace);
    if (query.node)      params = params.set('node',      query.node);
    return this.http.get<TimeseriesResponse>('/timeseries', { params });
  }

  // GET /top/pods
  getTopPods(
    field:         TopPodsField = 'cpu_cores',
    limit          = 10,
    range_minutes  = 60
  ): Observable<TopPodsResponse> {
    const params = new HttpParams()
      .set('field',         field)
      .set('limit',         limit.toString())
      .set('range_minutes', range_minutes.toString());
    return this.http.get<TopPodsResponse>('/top/pods', { params });
  }
}