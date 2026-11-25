/**
 * How many proxies in front of the API are believed about the visitor.
 *
 * Exactly one: the gateway Worker (apps/gateway). Nothing else can reach the
 * API — in production it runs in a container only the gateway can call — and
 * the gateway overwrites `X-Forwarded-For`, `X-Forwarded-Proto` and
 * `X-Forwarded-Host` with what Cloudflare observed, discarding whatever the
 * client sent. With this, `req.ip` is the visitor's address (used, hashed, to
 * count visitors) and `req.protocol` is `https`.
 *
 * A number rather than `true`: `true` would take the left-most address of the
 * header, which is the one a client could forge if a second proxy were ever
 * put in front.
 */
export const TRUSTED_PROXY_HOPS = 1;
