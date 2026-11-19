import { GEO_CHALLENGES, GEO_COPY, GEO_WHATSAPP, type GeoChallenge, type GeoLocale } from '@/content/geointime';

/** Saudi and international mobile formats accepted by the landing form (same characters the lead store accepts). */
export type GeoMarket = 'sa' | 'eg';

/** Market from the landing path: /e targets Egypt (+20), /s and the default landing target Saudi Arabia (+966). */
export function geoMarketFromPath(path: string): GeoMarket | null {
  if (/^\/e(\/|$)/.test(path)) return 'eg';
  if (/^\/s(\/|$)/.test(path)) return 'sa';
  return null;
}

/** Normalises a local or international mobile to the market's international form, or null when it does not match. */
export function normalizeMarketPhone(value: string, market: GeoMarket): string | null {
  let d = value.replace(/[\s()-]/g, '').replace(/^\+/, '').replace(/^00/, '');
  if (market === 'sa') { d = d.replace(/^966/, '').replace(/^0/, ''); return /^5\d{8}$/.test(d) ? `+966${d}` : null; }
  d = d.replace(/^20/, '').replace(/^0/, ''); return /^1[0125]\d{8}$/.test(d) ? `+20${d}` : null;
}

export function isValidGeoPhone(value: string, market?: GeoMarket | null): boolean {
  if (market) return normalizeMarketPhone(value, market) !== null;
  const trimmed = value.trim();
  return /^\+?[\d ()-]{8,22}$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 8;
}

export function isGeoChallenge(value: string): value is GeoChallenge {
  return (GEO_CHALLENGES as readonly string[]).includes(value);
}

export interface GeoLeadDetails { name: string; company: string; phone: string; role: string; challenge: GeoChallenge }

/** The WhatsApp message a visitor reviews and sends to the official GeoInTime number; it is never sent automatically. */
export function geoWhatsAppMessage(locale: GeoLocale, lead: GeoLeadDetails): string {
  const m = GEO_COPY[locale].form.message;
  return [
    m.title,
    `${m.name}: ${lead.name.trim()}`,
    `${m.company}: ${lead.company.trim()}`,
    `${m.phone}: ${lead.phone.trim()}`,
    `${m.role}: ${lead.role.trim() || m.roleNone}`,
    `${m.challenge}: ${GEO_COPY[locale].form.challenges[lead.challenge]}`,
  ].join('\n');
}

export function geoWhatsAppUrl(message?: string): string {
  return `https://wa.me/${GEO_WHATSAPP}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}
