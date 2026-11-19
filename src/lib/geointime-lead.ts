import { GEO_CHALLENGES, GEO_COPY, GEO_WHATSAPP, type GeoChallenge, type GeoLocale } from '@/content/geointime';

/** Saudi and international mobile formats accepted by the landing form (same characters the lead store accepts). */
export function isValidGeoPhone(value: string): boolean {
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
