import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  id: number;
  type: 'error' | 'success' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {

  private toastsSubject = new BehaviorSubject<Toast[]>([]);
  toasts$ = this.toastsSubject.asObservable();

  private nextId = 0;

  error(message: string) {
    this.add('error', message);
  }

  success(message: string) {
    this.add('success', message);
  }

  info(message: string) {
    this.add('info', message);
  }

  dismiss(id: number) {
    const current = this.toastsSubject.value;
    this.toastsSubject.next(
      current.filter(t => t.id !== id)
    );
  }

  private add(type: Toast['type'], message: string) {
    const id = this.nextId++;

    const current = this.toastsSubject.value;
    this.toastsSubject.next([
      ...current,
      { id, type, message }
    ]);

    setTimeout(() => this.dismiss(id), 5000);
  }
}