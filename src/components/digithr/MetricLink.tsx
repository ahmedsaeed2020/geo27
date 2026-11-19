import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { metricId } from '@/plugins/digit_hr/hrMetrics';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Return destinations a metric drill may carry: a module home (01–07) or one of its sections (e.g. 03.2). */
const BACK = /^0[1-7](\.\d{1,2})?$/;
/** Validated HR KPI scope (company + ISO date range). Shared by the command center, the metric drill and the return link,
 * so the originating KPI, the drilled population and Back all use one context. Malformed dates are dropped, never guessed. */
export function commandScope(s: Record<string, unknown>): { company?: string; from?: string; to?: string } {
  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string).trim() : '');
  const company = str('company'), from = str('from'), to = str('to');
  return { ...(company ? { company } : {}), ...(DATE.test(from) ? { from } : {}), ...(DATE.test(to) ? { to } : {}) };
}
/** Carries the caller's validated company/date context (and an optional validated return destination) into the metric drill
 * instead of resetting it. `period: false` drops from/to for point-in-time counts so the drill matches the KPI exactly. */
export function metricSearch(current: Record<string, unknown>, opts: { back?: string; period?: boolean } = {}) {
  const v = commandScope(current);
  const rawBack = opts.back ?? (typeof current['back'] === 'string' ? (current['back'] as string) : '');
  const keepPeriod = opts.period ?? true;
  const ret = typeof current['ret'] === 'string' && RET.test(current['ret'] as string) ? (current['ret'] as string) : '';
  return { company: v.company ?? '', from: keepPeriod ? v.from ?? '' : '', to: keepPeriod ? v.to ?? '' : '', back: BACK.test(rawBack) ? rawBack : '', ...(ret ? { ret } : {}) };
}
/** Optional return period for sub-period drills (for example one month of a yearly trend): "from~to", either side may be
 * empty (empty = no period). Back then restores the originating period instead of the drilled month. */
const RET = /^(\d{4}-\d{2}-\d{2})?~(\d{4}-\d{2}-\d{2})?$/;
export const returnPeriod = (from: string, to: string) => `${DATE.test(from) ? from : ''}~${DATE.test(to) ? to : ''}`;
/** Search for the Back link: the drill's company with the originating period when `ret` is present. */
export function returnScope(s: Record<string, unknown>) {
  const ret = typeof s['ret'] === 'string' && RET.test(s['ret'] as string) ? (s['ret'] as string) : '';
  if (!ret) return commandScope(s);
  const [from = '', to = ''] = ret.split('~');
  return commandScope({ company: s['company'], from, to });
}
/** Where "Back" from a metric drill returns: the originating module/section with the same company/period, else the command center. */
export function metricReturn(back: string): { to: '/digit-hr/m/$module'; params: { module: string } } | { to: '/digit-hr/s/$section'; params: { section: string } } | { to: '/digit-hr' } {
  if (!BACK.test(back)) return { to: '/digit-hr' };
  return back.includes('.') ? { to: '/digit-hr/s/$section', params: { section: back } } : { to: '/digit-hr/m/$module', params: { module: back } };
}
export function MetricLink({ label, children, className, back, period }: { label: string; children: ReactNode; className?: string; back?: string; period?: boolean }) {
  const current = useRouterState({ select: s => s.location.search }) as Record<string, unknown>;
  return <Link to='/digit-hr/metrics/$metric' params={{ metric: metricId(label) }} search={metricSearch(current, { ...(back ? { back } : {}), ...(period === false ? { period: false } : {}) })} className={className} data-metric-link={metricId(label)}>{children}</Link>;
}
