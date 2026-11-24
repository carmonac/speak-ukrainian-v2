/**
 * The two `Cache-Control` values the API answers when a route has not chosen
 * its own (ADR-033).
 *
 * A success keeps `private`, which names the reader as the only party that may
 * hold the answer, even though `no-store` already forbids every cache: it says
 * what the answer is to a reader of the header. An error says only `no-store`.
 * It carries nothing worth keeping, privately or otherwise, and it is the same
 * for public and authenticated routes alike.
 */

/** Every non-`@Public()` response, unless the route sets its own policy. */
export const PRIVATE_NO_STORE = 'private, no-store';

/** Every error response, whatever the route. */
export const NO_STORE = 'no-store';
