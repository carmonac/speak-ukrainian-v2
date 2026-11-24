import {
  HttpClient,
  HttpErrorResponse,
  type HttpInterceptorFn,
  type HttpParams,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError, type Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { runtimeConfig } from './runtime-config';

/** Adds the session token to every call made to our own API. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(runtimeConfig().apiUrl)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();

  return next(
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request,
  ).pipe(
    catchError((error: unknown) => {
      // Only a rejected token ends the session; a 401 on a request that sent
      // none (a signed-out visitor) is just an error for the caller to show.
      if (error instanceof HttpErrorResponse && error.status === 401 && token !== null) {
        // The session is already gone on the server: forget it here too.
        auth.clear();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};

/** The message the API sent with an error, or a generic one. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Try again.',
): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'The server could not be reached.';
    }
    const body = error.error as { message?: unknown; errors?: unknown } | null;
    const details = Array.isArray(body?.errors)
      ? (body.errors as Array<{ path?: string; message?: string }>)
          .map((e) => (e.path ? `${e.path}: ${e.message ?? ''}` : (e.message ?? '')))
          .filter(Boolean)
          .join(' · ')
      : '';
    if (typeof body?.message === 'string' && body.message !== '') {
      return details ? `${body.message} — ${details}` : body.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = runtimeConfig().apiUrl;

  get<T>(path: string, params?: HttpParams | Record<string, string | number>): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, { params });
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.base}${path}`, body);
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.base}${path}`, body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.base}${path}`);
  }
}
