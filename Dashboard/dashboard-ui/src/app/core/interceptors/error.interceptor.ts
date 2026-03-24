import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notify = inject(NotificationService);

  return next(req).pipe(
    catchError((err) => {
      const msg = err.error?.detail || 'Erreur inconnue';
      notify.error(`${err.status} — ${msg}`);
      return throwError(() => err);
    })
  );
};