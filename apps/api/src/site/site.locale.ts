/**
 * The visitor's languages in order of preference, from `Accept-Language`.
 * `en-GB,es;q=0.8` → `['en-GB', 'es']`. A `?lang=` override comes first.
 */
export function preferredLocales(acceptLanguage: string | undefined, override?: string): string[] {
  const locales: Array<{ code: string; q: number; index: number }> = [];

  for (const [index, part] of (acceptLanguage ?? '').split(',').entries()) {
    const [rawCode, ...params] = part.trim().split(';');
    const code = (rawCode ?? '').trim();
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) {
      continue;
    }
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) {
      continue;
    }
    locales.push({ code, q, index });
  }

  locales.sort((a, b) => b.q - a.q || a.index - b.index);
  const ordered = locales.map((l) => l.code);

  if (override && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(override)) {
    ordered.unshift(override);
  }
  return [...new Set(ordered)];
}
