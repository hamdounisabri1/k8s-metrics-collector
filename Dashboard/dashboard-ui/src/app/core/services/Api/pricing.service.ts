import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  PricesResponse,
  PriceKey,
  UpdatePriceRequest,
  UpdatePriceResponse,
  BulkUpdatePricesRequest,
  BulkUpdatePricesResponse,
  ResetPricesResponse,
  PricingHistoryResponse,
} from 'src/app/models/metrics.model';

@Injectable({ providedIn: 'root' })
export class PricingService {
  constructor(private http: HttpClient) {}

  // GET /pricing/prices
  getPrices(): Observable<PricesResponse> {
    return this.http.get<PricesResponse>('/pricing/prices');
  }

  // PUT /pricing/prices/{key}
  updatePrice(
    key:  PriceKey,
    body: UpdatePriceRequest
  ): Observable<UpdatePriceResponse> {
    return this.http.put<UpdatePriceResponse>(
      `/pricing/prices/${key}`,
      body
    );
  }

  // PUT /pricing/prices  (bulk)
  bulkUpdatePrices(
    body: BulkUpdatePricesRequest
  ): Observable<BulkUpdatePricesResponse> {
    return this.http.put<BulkUpdatePricesResponse>('/pricing/prices', body);
  }

  // POST /pricing/prices/reset
  // updated_by is a query param — backend reads it via Query(), not from body
  resetPrices(updated_by = 'api'): Observable<ResetPricesResponse> {
    const params = new HttpParams()
      .set('updated_by', updated_by);
    return this.http.post<ResetPricesResponse>(
      '/pricing/prices/reset',
      null,      // no request body
      { params }
    );
  }

  // GET /pricing/history
  getHistory(
    key?:  PriceKey,
    limit  = 50
  ): Observable<PricingHistoryResponse> {
    let params = new HttpParams()
      .set('limit', limit.toString());
    if (key) params = params.set('key', key);
    return this.http.get<PricingHistoryResponse>('/pricing/history', { params });
  }
}