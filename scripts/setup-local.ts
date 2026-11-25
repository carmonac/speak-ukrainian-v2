/**
 * Prepares a checkout for local development. Run by `pnpm dev`; safe to run
 * any number of times.
 *
 * It creates the two untracked settings files when they are missing — `.env`
 * for the API and `apps/gateway/.dev.vars` for the gateway — from their
 * committed examples, generating the secrets the examples leave empty. An
 * existing file is never rewritten: it may hold values someone chose.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);

/** Settings the example leaves empty because every checkout needs its own value. */
const GENERATED = ['AUTH_SECRET', 'H5P_URL_TOKEN_SECRET'];

function create(target: string, example: string): void {
  const targetUrl = new URL(target, root);
  if (existsSync(targetUrl)) {
    return;
  }
  let content = readFileSync(new URL(example, root), 'utf8');
  for (const name of GENERATED) {
    content = content.replace(
      new RegExp(`^${name}=$`, 'm'),
      `${name}=${randomBytes(36).toString('base64url')}`,
    );
  }
  writeFileSync(targetUrl, content, { mode: 0o600 });
  console.log(`Created ${target} from ${example}`);
}

create('.env', '.env.example');
create('apps/gateway/.dev.vars', 'apps/gateway/.dev.vars.example');
