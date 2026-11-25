import { DurableObject } from 'cloudflare:workers';
import { BRIDGE_HOST } from './bridge';

/** The port the API listens on inside the container (apps/api/Dockerfile). */
const API_PORT = 8080;

/** Polled until it answers 2xx; `start()` returns before the server is up. */
const HEALTH_PATH = '/api/health';
const READY_ATTEMPTS = 150;
const READY_INTERVAL_MS = 200;

/**
 * How long the container outlives its last request. The public site is served
 * from it, so a short value means visitors keep paying the cold start; a long
 * one means paying for an idle instance. Maximum allowed is six hours.
 */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * The size of the container: 1/4 vCPU, 1 GiB of memory, 4 GB of disk. Enough
 * for the API, which streams uploads and downloads rather than holding them;
 * the next size up (`standard-1`: 1/2 vCPU, 4 GiB) is the one to try if
 * importing large H5P packages turns out slow.
 */
const INSTANCE_TYPE = 'basic';

/**
 * Owns the single API container.
 *
 * The Worker always addresses the same named instance, and a Durable Object
 * has at most one container, so there is exactly one API process. That matters
 * beyond cost: the API keeps in-process state (H5P caches, upload scratch
 * files) that assumes a single instance.
 */
export class ApiContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private bridgeAttached = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The timeout does not survive a restart of this object (e.g. a deploy),
    // while the container may: re-arm it or the container stops early.
    if (ctx.container?.running) {
      ctx.waitUntil(ctx.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS));
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const container = this.ctx.container;
    if (!container) {
      return new Response('The API container is not available in this environment.', {
        status: 503,
      });
    }

    try {
      // Concurrent first requests share one start.
      this.starting ??= this.ensureRunning(container).finally(() => {
        this.starting = undefined;
      });
      await this.starting;
    } catch (error) {
      console.error('API container failed to start', error);
      return new Response('The service is starting. Please retry in a moment.', {
        status: 503,
        headers: { 'retry-after': '5' },
      });
    }

    const url = new URL(request.url);
    url.protocol = 'http:';
    url.host = 'container';
    // Passing the original request keeps its body a stream: large uploads go
    // through without being buffered in this isolate (128 MB of memory).
    // Returning the response as-is keeps downloads streamed too.
    try {
      return await container.getTcpPort(API_PORT).fetch(new Request(url, request));
    } catch (error) {
      // The connection to the port failed before any response: the process
      // is restarting or has crashed. The next request starts it again.
      console.error('API container did not answer', error);
      return new Response('The service is temporarily unavailable. Please retry.', {
        status: 503,
        headers: { 'retry-after': '5' },
      });
    }
  }

  private async ensureRunning(container: Container): Promise<void> {
    // The bridge host does not exist in DNS; only requests from inside this
    // container ever reach the handler.
    //
    // The intercept has to be registered by *this* instance of the object,
    // not just once per container: an intercept ends when the container
    // stops, and one registered by a previous instance (before a deploy or a
    // dev reload restarted this object while the container kept running) no
    // longer answers — the API's SQL calls fail with "fetch failed".
    if (!container.running) this.bridgeAttached = false;
    if (!this.bridgeAttached) {
      await container.interceptOutboundHttp(BRIDGE_HOST, this.ctx.exports.Bridge);
      this.bridgeAttached = true;
    }
    if (container.running) return;

    container.start({
      image: container.images.base,
      instance: INSTANCE_TYPE,
      // The API calls Stripe and R2 directly.
      enableInternet: true,
      env: this.containerEnv(),
    });
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    await this.waitUntilReady(container);
  }

  /**
   * Every plain-text var and secret of the Worker becomes an environment
   * variable of the API. Bindings (D1, this namespace...) are objects and are
   * skipped. Nothing is baked into the image: change a secret, and the next
   * container start sees it.
   */
  private containerEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.env)) {
      if (typeof value === 'string') env[name] = value;
    }
    env.BRIDGE_URL = `http://${BRIDGE_HOST}`;
    return env;
  }

  private async waitUntilReady(container: Container): Promise<void> {
    const port = container.getTcpPort(API_PORT);
    let lastError: unknown;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
      try {
        const response = await port.fetch(`http://container${HEALTH_PATH}`, {
          signal: AbortSignal.timeout(1000),
        });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Health check answered ${response.status}`);
      } catch (error) {
        // Not listening yet.
        lastError = error;
      }
      await scheduler.wait(READY_INTERVAL_MS);
    }
    throw new Error('The API did not become ready in time', { cause: lastError });
  }
}
