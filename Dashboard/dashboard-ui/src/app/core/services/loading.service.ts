import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  private loading$ = new BehaviorSubject<boolean>(false);

  show() {
    this.activeRequests++;
    this.loading$.next(true);
  }

  hide() {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      this.loading$.next(false);
    }
  }

  isLoading() {
    return this.loading$.asObservable();
  }

}