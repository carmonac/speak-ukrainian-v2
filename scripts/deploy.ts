/**
 * Deploys SpeakUkrainian to Cloudflare from this machine.
 *
 *   pnpm deploy:prod                      everything
 *   pnpm deploy:prod gateway              one target (db, gateway, admin, student)
 *   pnpm deploy:prod admin student        several
 *   pnpm deploy:prod --dry-run            checks and dry-run deploys; changes nothing
 *   pnpm deploy:prod --skip-checks        without lint, typecheck, test and build
 *   pnpm deploy:prod --admin-email=a@b.c  first deploy only: the administrator's address
 *
 * It refuses to start unless it could finish: wrangler has to be logged in,
 * Docker has to be running when the gateway (which carries the API image) is
 * deployed, and the gateway's secrets have to exist or be creatable.
 *
 * No secret lives in this file or is ever printed. The random ones are
 * generated the first time; see `ensureSecrets`.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GATEWAY = join(ROOT, 'apps/gateway');

const SITE_URL = 'https://speakukrainian.org';
const URLS = {
  gateway: `${SITE_URL}  (public site and /api)`,
  admin: 'https://admin.speakukrainian.org',
  student: 'https://student.speakukrainian.org',
} as const;

const TARGETS = ['db', 'gateway', 'admin', 'student'] as const;
type Target = (typeof TARGETS)[number];

/** Secrets the API cannot start without, and how each one comes to exist. */
const GENERATED_SECRETS = ['AUTH_SECRET', 'H5P_URL_TOKEN_SECRET', 'CRON_SECRET'] as const;
const ADMIN_EMAIL = 'ADMIN_EMAIL';

class StepFailed extends Error {}

interface Options {
  targets: Target[];
  dryRun: boolean;
  skipChecks: boolean;
  adminEmail: string | undefined;
}

function parseArgs(argv: string[]): Options {
  const targets: Target[] = [];
  let dryRun = false;
  let skipChecks = false;
  let adminEmail: string | undefined;

  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--skip-checks') skipChecks = true;
    else if (arg.startsWith('--admin-email=')) adminEmail = arg.slice('--admin-email='.length);
    else if (arg === '--help' || arg === '-h') usage(0);
    else if ((TARGETS as readonly string[]).includes(arg)) targets.push(arg as Target);
    else {
      console.error(`Unknown argument: ${arg}\n`);
      usage(1);
    }
  }
  // Always in the same order, whatever order they were typed in: the database
  // first, then the API that needs it, then the apps that need the API.
  const chosen = targets.length === 0 ? [...TARGETS] : TARGETS.filter((t) => targets.includes(t));
  return { targets: chosen, dryRun, skipChecks, adminEmail };
}

function usage(code: number): never {
  console.log(
    [
      'Usage: pnpm deploy:prod [db] [gateway] [admin] [student] [--dry-run] [--skip-checks]',
      '                        [--admin-email=<address>]',
      '',
      'With no target, everything is deployed, in that order.',
    ].join('\n'),
  );
  process.exit(code);
}

// --- running things ----------------------------------------------------------

interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/** Runs a command with its output on screen. Throws `StepFailed` if it fails. */
function run(command: string, args: string[], options: RunOptions = {}): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new StepFailed(
      `\`${command} ${args.join(' ')}\` exited with ${result.status ?? result.signal}`,
    );
  }
}

/** Runs a command quietly and returns what it printed, or null if it failed. */
function capture(command: string, args: string[], options: RunOptions = {}): string | null {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout : null;
}

function wrangler(args: string[], cwd: string, env?: NodeJS.ProcessEnv): void {
  run('pnpm', ['exec', 'wrangler', ...args], { cwd, env });
}

async function step(name: string, work: () => void | Promise<void>): Promise<void> {
  console.log(`\n━━ ${name}`);
  try {
    await work();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`\n✖ Failed at: ${name}\n  ${reason}\n  Nothing after this step was run.`);
    process.exit(1);
  }
}

// --- preflight ---------------------------------------------------------------

function refuse(message: string): never {
  console.error(`\n✖ Cannot deploy: ${message}`);
  process.exit(1);
}

function checkWrangler(): void {
  const output = capture('pnpm', ['exec', 'wrangler', 'whoami', '--json'], { cwd: GATEWAY });
  if (output === null) {
    refuse('wrangler is not logged in to Cloudflare.\n  Run: pnpm exec wrangler login');
  }
  try {
    const who = JSON.parse(output) as { email?: string; accounts?: { name: string }[] };
    console.log(
      `Cloudflare: ${who.email ?? 'authenticated'}${who.accounts?.[0] ? ` — ${who.accounts[0].name}` : ''}`,
    );
  } catch {
    console.log('Cloudflare: authenticated');
  }
}

function checkDocker(): void {
  if (capture('docker', ['info', '--format', '{{.ServerVersion}}']) === null) {
    refuse(
      'Docker is not running, and the gateway deploy builds the API image with it.\n' +
        '  Start Docker and run this again, or deploy only the other targets.',
    );
  }
  console.log('Docker: running');
}

/** Names of the secrets the deployed gateway already has; empty if it does not exist yet. */
function existingSecrets(): Set<string> {
  const output = capture('pnpm', ['exec', 'wrangler', 'secret', 'list'], { cwd: GATEWAY });
  const names = new Set<string>();
  for (const match of (output ?? '').matchAll(/"name":\s*"([A-Za-z0-9_]+)"/g)) {
    names.add(match[1]!);
  }
  return names;
}

/**
 * Makes sure the gateway will have its secrets, and returns the path of a
 * file to hand to `wrangler deploy --secrets-file`, or null when nothing is
 * missing.
 *
 * Random secrets are generated here, once: a later deploy finds them already
 * set and leaves them alone (replacing `AUTH_SECRET` would sign everyone out).
 * The administrator's address cannot be invented, so it has to be given the
 * first time. The file is private to this user and is deleted by the caller.
 */
function ensureSecrets(options: Options): { file: string | null; cleanup: () => void } {
  const present = existingSecrets();
  const missing: Record<string, string> = {};

  for (const name of GENERATED_SECRETS) {
    if (!present.has(name)) {
      missing[name] = randomBytes(36).toString('base64url');
    }
  }
  if (!present.has(ADMIN_EMAIL)) {
    const email = options.adminEmail ?? process.env['ADMIN_EMAIL'];
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      refuse(
        'the gateway has no ADMIN_EMAIL yet. This is the first deploy: say who the administrator is.\n' +
          '  Run: pnpm deploy:prod --admin-email=<address>',
      );
    }
    missing[ADMIN_EMAIL] = email;
  } else if (options.adminEmail) {
    console.log(
      'ADMIN_EMAIL is already set; --admin-email is ignored. Change it with `wrangler secret put`.',
    );
  }

  const names = Object.keys(missing);
  if (names.length === 0) {
    console.log('Secrets: all present');
    return { file: null, cleanup: () => undefined };
  }
  console.log(`Secrets: will create ${names.join(', ')}`);
  if (options.dryRun) {
    return { file: null, cleanup: () => undefined };
  }

  const directory = mkdtempSync(join(tmpdir(), 'speakukrainian-deploy-'));
  const file = join(directory, 'secrets.json');
  writeFileSync(file, JSON.stringify(missing), { mode: 0o600 });
  return { file, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

// --- after -------------------------------------------------------------------

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  let last = 'no answer yet';
  process.stdout.write('Waiting for the API to answer');
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${SITE_URL}/api/health`, {
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.text();
      if (response.ok && body.includes('"status":"ok"')) {
        console.log(`\n${SITE_URL}/api/health → ${body}`);
        return;
      }
      last = `${response.status} ${body.slice(0, 120)}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new StepFailed(
    `${SITE_URL}/api/health did not answer ok within ten minutes (last: ${last}).\n` +
      '  Look at the logs: pnpm --filter @speakukrainian/gateway exec wrangler tail',
  );
}

// --- main --------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const has = (target: Target): boolean => options.targets.includes(target);
  const dry = options.dryRun ? ['--dry-run'] : [];

  console.log(
    `${options.dryRun ? 'Dry run' : 'Deploying'}: ${options.targets.join(', ')}` +
      (options.skipChecks ? ' (checks skipped)' : ''),
  );

  // Everything that could make the run stop half-way is checked first.
  let secrets = { file: null as string | null, cleanup: (): void => undefined };
  await step('Preflight', () => {
    checkWrangler();
    if (has('gateway')) {
      if (!options.dryRun) checkDocker();
      secrets = ensureSecrets(options);
    }
  });

  try {
    if (!options.skipChecks) {
      await step('Lint', () => run('pnpm', ['lint']));
      await step('Typecheck', () => run('pnpm', ['typecheck']));
      await step('Tests', () => run('pnpm', ['test']));
      await step('Build', () => run('pnpm', ['build']));
    }

    if (has('db')) {
      await step('Database migrations', () => {
        if (options.dryRun) {
          wrangler(['d1', 'migrations', 'list', 'speakukrainian', '--remote'], GATEWAY);
        } else {
          // CI=1: apply without asking, as there is nobody to answer in a script.
          wrangler(['d1', 'migrations', 'apply', 'speakukrainian', '--remote'], GATEWAY, {
            CI: '1',
          });
        }
      });
    }

    if (has('gateway')) {
      await step('Gateway and API container', () => {
        wrangler(
          options.dryRun
            ? // Without building the image: a dry run must not need Docker.
              ['deploy', '--dry-run', '--containers-rollout=none']
            : ['deploy', ...(secrets.file ? ['--secrets-file', secrets.file] : [])],
          GATEWAY,
        );
      });
    }

    for (const app of ['admin', 'student'] as const) {
      if (!has(app)) continue;
      await step(`${app === 'admin' ? 'Control panel' : 'Classroom'} (${app})`, () => {
        const directory = join(ROOT, 'apps', app);
        // Always a fresh production build: it is what carries the production
        // config.json, and it is quick.
        run('pnpm', ['exec', 'ng', 'build'], { cwd: directory });
        wrangler(['deploy', ...dry], directory);
      });
    }
  } finally {
    secrets.cleanup();
  }

  if (options.dryRun) {
    console.log('\n✔ Dry run finished: nothing was deployed.');
    return;
  }

  if (has('gateway')) {
    await step('Health check', waitForApi);
  }

  console.log('\n✔ Deployed:');
  if (has('db')) console.log('  database migrations applied');
  if (has('gateway')) console.log(`  ${URLS.gateway}`);
  if (has('admin')) console.log(`  ${URLS.admin}`);
  if (has('student')) console.log(`  ${URLS.student}`);
}

await main();
