/** In its own file so that naming the token does not import the module that provides it. */
export const CLOCK = Symbol('CLOCK');

/**
 * Where a service reads the time from. Injected rather than `Date.now()` so a
 * memo's expiry or a "has this slot started" cutoff can be driven by a test
 * without sleeping, and without faking the process clock, which would also
 * shift the expiry of every session and signed URL token under test.
 *
 * One token for the whole API: `MenuService` and `ScheduleService` read it, and
 * a suite overriding it overrides it for both (#83's reviewer asked for exactly
 * this promotion once a second consumer appeared).
 */
export interface Clock {
  /** Milliseconds since the epoch, as `Date.now()` answers. */
  now(): number;
}
