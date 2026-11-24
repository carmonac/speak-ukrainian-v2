/**
 * Values that are not declared in wrangler.jsonc, so `wrangler types` does not
 * know them: they come from `.dev.vars` locally or from Worker secrets.
 */
interface LocalModeEnv {
  /** Set only in local mode. See .dev.vars.example. */
  LOCAL_API_ORIGIN?: string;
  /** Guards the bridge in local mode. */
  BRIDGE_SECRET?: string;
}

// `wrangler types` declares both; they are merged here.
interface Env extends LocalModeEnv {}
declare namespace Cloudflare {
  interface Env extends LocalModeEnv {}
}
