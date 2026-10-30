/** Client-safe redirect normalisation shared by the admin editor, the server and the catch-all route. */
const RESERVED = /^\/(admin|auth|api|_serverfn|lovable|assets|_build)(\/|$)/;

export function normalizeRedirectSource(input: string): string | null {
  let p = input.trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  if (!p.startsWith('/')) p = '/' + p;
  if (/[?#]/.test(p)) p = p.split(/[?#]/)[0] ?? p;
  try {
    p = decodeURI(p);
  } catch {
    return null;
  }
  p = p.replace(/\/{2,}/g, '/').toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (p.length > 300 || /[\s<>"'`\\]/.test(p)) return null;
  if (p === '/' || p === '/en') return null;
  if (RESERVED.test(p)) return null;
  return p;
}

export type RedirectTarget = { kind: 'internal' | 'external'; value: string };

export function normalizeRedirectTarget(input: string): RedirectTarget | null {
  const v = input.trim();
  if (!v || v.length > 500 || /[\s<>"'`\\]/.test(v)) return null;
  if (v.startsWith('/') && !v.startsWith('//')) {
    const [path = '/', ...rest] = v.split(/(?=[?#])/);
    let clean = path.replace(/\/{2,}/g, '/');
    if (clean.length > 1) clean = clean.replace(/\/+$/, '');
    if (RESERVED.test(clean.toLowerCase())) return null;
    return { kind: 'internal', value: clean + rest.join('') };
  }
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:') return null;
    return { kind: 'external', value: url.toString() };
  } catch {
    return null;
  }
}

/** Path part of an internal target, normalised like a source, for loop/chain detection. */
export function targetPath(target: string): string | null {
  if (!target.startsWith('/')) return null;
  return normalizeRedirectSource(target.split(/[?#]/)[0] ?? target);
}

export type RedirectRow = { from_path: string; to_path: string; enabled: boolean };

/**
 * Follows existing enabled redirects from a new target so every rule points at a final destination.
 * Returns the final target, or null when the chain returns to the source (a loop).
 */
export function resolveFinalTarget(from: string, to: string, rules: RedirectRow[]): string | null {
  let current = to;
  const visited = new Set<string>([from]);
  for (let i = 0; i < 20; i++) {
    const path = targetPath(current);
    if (!path) return current;
    if (visited.has(path)) return null;
    visited.add(path);
    const next = rules.find(r => r.enabled && r.from_path === path && r.from_path !== from);
    if (!next) return current;
    current = next.to_path;
  }
  return null;
}
