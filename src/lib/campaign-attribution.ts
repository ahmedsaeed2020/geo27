import { attributionParams } from './marketing';

const KEY = 'geo-campaign-attribution';
type Attribution = { utm: Record<string, string>; referrer: string };

/** Keep the latest tagged campaign within this tab, including navigation to a form without query parameters. */
export function captureAttribution(): Attribution {
  const current = attributionParams(window.location.search);
  let previous: Attribution | null = null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (value && typeof value === 'object' && 'utm' in value && 'referrer' in value && typeof value.referrer === 'string') {
      previous = { utm: attributionParams(new URLSearchParams(value.utm as Record<string, string>).toString()), referrer: value.referrer.slice(0, 1000) };
    }
  } catch { /* Storage may be disabled; current URL still works. */ }
  const attribution = Object.keys(current).length
    ? { utm: current, referrer: document.referrer.slice(0, 1000) }
    : previous ?? { utm: {}, referrer: document.referrer.slice(0, 1000) };
  try { sessionStorage.setItem(KEY, JSON.stringify(attribution)); } catch { /* Best effort only. */ }
  return attribution;
}