import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/** Signed-out visitors are sent to sign in, and brought back afterwards. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.ready())
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const signedOutGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return (await auth.ready())
    ? router.parseUrl(safeReturnUrl(route.queryParamMap.get('returnUrl')))
    : true;
};

/**
 * Where to go after signing in. Only a path inside this app is honoured, so a
 * crafted link cannot bounce a student to another site.
 */
export function safeReturnUrl(value: string | null | undefined, fallback = '/my-courses'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback;
  }
  return value;
}
