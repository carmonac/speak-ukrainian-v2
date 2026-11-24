/**
 * The gateway Worker.
 *
 * Container mode (production): every request for speakukrainian.org is handed
 * to the one ApiContainer instance, which runs the NestJS API — the REST API
 * under /api and the public site. The API reaches D1 and R2 through the bridge, which
 * exists only as an intercepted outbound host of that container.
 *
 * Local mode (`wrangler dev` with LOCAL_API_ORIGIN in .dev.vars): no container.
 * Requests are proxied to the API running as a Node process, and the same
 * bridge is served under /__bridge, guarded by a shared secret, so that
 * process can use the local D1 database and R2 bucket.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleBridge, type BridgeBindings } from './bridge';

export { ApiContainer } from './api-container';

/** Local mode only. Never routed in container mode. */
const LOCAL_BRIDGE_PREFIX = '/__bridge';

/** One name, one Durable Object, one container. */
const API_INSTANCE = 'api';

/**
 * The bridge as seen from inside the container: registered as the handler for
 * outbound HTTP to the bridge host (see ApiContainer). It is not bound to any
 * route, so nothing outside the container can call it.
 */
export class Bridge extends WorkerEntrypoint<Env> {
  override fetch(request: Request): Promise<Response> {
    return handleBridge(request, new URL(request.url).pathname, bindings(this.env));
  }
}

function bindings(env: Env): BridgeBindings {
  return { db: env.DB, files: env.FILES };
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) return false;
  return crypto.subtle.timingSafeEqual(left, right);
}

function localBridge(request: Request, url: URL, env: Env): Promise<Response> | Response {
  const secret = env.BRIDGE_SECRET;
  const presented = request.headers.get('x-bridge-secret') ?? '';
  if (!secret || !timingSafeEqual(presented, secret)) {
    return new Response('Forbidden', { status: 403 });
  }
  return handleBridge(request, url.pathname.slice(LOCAL_BRIDGE_PREFIX.length), bindings(env));
}

/**
 * The API sits behind this Worker and must not trust what the client sent in
 * these headers; they are always overwritten with what Cloudflare observed.
 */
function withForwardedHeaders(request: Request, url: URL): Request {
  const forwarded = new Request(request);
  forwarded.headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  forwarded.headers.set('x-forwarded-host', url.host);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) forwarded.headers.set('x-forwarded-for', clientIp);
  else forwarded.headers.delete('x-forwarded-for');
  // `Expect: 100-continue` is settled between the client and the front end.
  // Forwarded to the container port it makes the request fail outright (seen
  // with curl, which sends it for any body over 1 MB).
  forwarded.headers.delete('expect');
  return forwarded;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (env.LOCAL_API_ORIGIN) {
      if (url.pathname.startsWith(`${LOCAL_BRIDGE_PREFIX}/`)) {
        return localBridge(request, url, env);
      }
      const target = new URL(url.pathname + url.search, env.LOCAL_API_ORIGIN);
      try {
        return await fetch(new Request(target, withForwardedHeaders(request, url)), {
          redirect: 'manual',
        });
      } catch {
        return new Response(`The API is not running at ${env.LOCAL_API_ORIGIN}.`, { status: 502 });
      }
    }

    return env.API.getByName(API_INSTANCE).fetch(withForwardedHeaders(request, url));
  },
} satisfies ExportedHandler<Env>;
