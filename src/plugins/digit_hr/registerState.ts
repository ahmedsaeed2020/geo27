import { savedLayouts, saveLayouts, type ListLayout } from '@/lib/listLayouts';
export type RegisterState = { q: string; group: string; sort: string; dir: 1 | -1; page: number; selected: string };
export const EMPTY_REGISTER: RegisterState = { q: '', group: '', sort: '', dir: 1, page: 0, selected: '' };
export function readRegister(value: unknown, label: string): RegisterState {
  try {
    const all = typeof value === 'string' ? JSON.parse(value) : {};
    const v = all?.[label] ?? {};
    return { q: typeof v.q === 'string' ? v.q : '', group: typeof v.group === 'string' ? v.group : '', sort: typeof v.sort === 'string' ? v.sort : '', dir: v.dir === -1 ? -1 : 1, page: Number.isInteger(v.page) && v.page >= 0 ? v.page : 0, selected: typeof v.selected === 'string' ? v.selected : '' };
  } catch { return { ...EMPTY_REGISTER }; }
}
export function writeRegister(value: unknown, label: string, state: RegisterState): string {
  let all: Record<string, unknown> = {};
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : {}; if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) all = parsed; } catch { /* malformed URL is reset */ }
  return JSON.stringify({ ...all, [label]: state });
}
export const registerNamespace = (label: string, user: string) => `digit_hr:register:${encodeURIComponent(user)}:${label}`;
export const readViews = (label: string, user: string) => savedLayouts(registerNamespace(label, user));
export const writeViews = (label: string, user: string, views: ListLayout[]) => saveLayouts(registerNamespace(label, user), views);
export function visibleColumns(keys: string[], preferred: string[] | null): string[] {
  const first = keys[0]; if (!first) return [];
  return [first, ...new Set((preferred ?? keys).filter(k => k !== first && keys.includes(k)))];
}