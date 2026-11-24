export interface RuntimeConfig {
  /** Base URL of the NestJS API, including `/api`. */
  apiUrl: string;
  supabaseUrl: string;
  /** Publishable (anon) key. Safe in the browser: row level security denies it everything. */
  supabaseAnonKey: string;
  /** Where the public site is served, for "view page" links. */
  siteUrl: string;
  studentUrl: string;
}

let current: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<void> {
  const response = await fetch('config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`config.json answered ${response.status}`);
  }
  const raw = (await response.json()) as RuntimeConfig;
  current = {
    ...raw,
    apiUrl: raw.apiUrl.replace(/\/$/, ''),
    siteUrl: raw.siteUrl.replace(/\/$/, ''),
    studentUrl: raw.studentUrl.replace(/\/$/, ''),
  };
}

export function runtimeConfig(): RuntimeConfig {
  if (!current) {
    throw new Error('Runtime configuration was read before it was loaded.');
  }
  return current;
}
