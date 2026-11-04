/**
 * Which links are "request" calls to action. Every demo, quote, subscribe or trial call to action on the site opens
 * the site's own request form (the one on the current page, else /demo); nothing sends visitors to an outside
 * hosted subscription page. Ordinary navigation (product pages, in-page sections, WhatsApp, email) is left alone.
 */

/** Pages whose only job is the request form. */
const FORM_PAGES = new Set(['/demo', '/demo-3']);

/** Wording that asks for a demo, a quote, a subscription or a conversation with sales (Arabic and English). */
const REQUEST_WORDING = /احجز|اطلب|تحدث مع|تحدّث مع|اشترك|ابدأ باقة|ابدأ بالباقة|سجّل كشريك|سجل كشريك|جرّب|ديمو|\bdemo\b|book|request|subscribe|talk to|register as/i;

/** Strips the /en prefix and any trailing slash so Arabic and English links compare alike. */
export function barePath(pathname: string): string {
  const path = pathname.replace(/^\/en(?=\/|$)/, '').replace(/\/+$/, '');
  return path || '/';
}

export function isFormPage(pathname: string): boolean {
  return FORM_PAGES.has(barePath(pathname));
}

export function isRequestWording(text: string): boolean {
  return REQUEST_WORDING.test(text.replace(/\s+/g, ' ').trim());
}

/**
 * Decides whether a clicked link should open the request form instead of navigating.
 * `href` is the raw attribute, `current` the page's pathname, `targetHasForm` whether an in-page hash target already
 * holds a form (then the browser's own jump is right).
 */
export function opensRequestForm({ href, text, current, targetHasForm = false }: { href: string; text: string; current: string; targetHasForm?: boolean }): boolean {
  const raw = href.trim();
  if (!raw || raw === '#') return isRequestWording(text);
  if (/^(mailto:|tel:|https?:\/\/(?!(www\.)?digit-erp\.com))/i.test(raw) || /wa\.me|whatsapp/i.test(raw)) return false;
  let url: URL;
  try { url = new URL(raw, 'https://digit-erp.com' + current); } catch { return false; }
  if (url.hostname !== 'digit-erp.com' && url.hostname !== 'www.digit-erp.com') return false;
  if (isFormPage(url.pathname)) return true;
  const samePage = barePath(url.pathname) === barePath(current);
  if (samePage && url.hash) return !targetHasForm && isRequestWording(text);
  return false;
}
