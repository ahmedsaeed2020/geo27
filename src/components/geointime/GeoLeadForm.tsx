import { useId, useState, type FormEvent } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useHydrated } from '@tanstack/react-router';
import { MessageCircle, RotateCcw, Send } from 'lucide-react';
import { submitLead } from '@/lib/leads.functions';
import { leadSchema } from '@/lib/leads-schema';
import { captureAttribution } from '@/lib/campaign-attribution';
import { useSiteConfig } from '@/components/cms/CmsContext';
import { GEO_CHALLENGES, GEO_COPY, type GeoChallenge, type GeoLocale } from '@/content/geointime';
import { geoWhatsAppMessage, geoWhatsAppUrl, isGeoChallenge, isValidGeoPhone } from '@/lib/geointime-lead';

type State = { kind: 'idle' | 'sending' | 'error' } | { kind: 'success'; whatsapp: string };

/**
 * The landing's own request card (V5 fields: name, company, mobile, role, challenge). It saves through the shared
 * server-validated lead boundary, so every request reaches admin and CRM, then offers a prepared WhatsApp message the
 * visitor reviews and sends to the official number; nothing is sent to WhatsApp automatically.
 */
export default function GeoLeadForm({ locale, challenge, onChallenge }: { locale: GeoLocale; challenge: GeoChallenge | ''; onChallenge: (value: GeoChallenge | '') => void }) {
  const t = GEO_COPY[locale].form;
  const id = useId();
  const forms = useSiteConfig().forms;
  const roleRequired = forms.showJobRole && forms.requireJobRole;
  const saveLead = useServerFn(submitLead);
  const hydrated = useHydrated();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [invalid, setInvalid] = useState<{ field: string; message: string } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const read = (key: string) => String(form.get(key) ?? '').trim();
    const name = read('name'), company = read('company'), phone = read('phone'), role = read('role'), picked = read('challenge');
    const fail = (field: string, message: string) => {
      setInvalid({ field, message });
      element.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    };
    if (name.length < 2) return fail('name', t.missingIdentity);
    if (company.length < 2) return fail('company', t.missingIdentity);
    if (!isValidGeoPhone(phone)) return fail('phone', t.badPhone);
    if (roleRequired && !role) return fail('role', t.missingRole);
    if (!isGeoChallenge(picked)) return fail('challenge', t.missingChallenge);
    if (form.get('consent') !== 'on') return fail('consent', t.missingConsent);
    const label = t.challenges[picked];
    const parsed = leadSchema.safeParse({
      name, company, email: '', phone, interest: `GeoInTime · ${label}`, requestType: 'demo', jobRole: role,
      message: `GeoInTime — ${label}`, locale, pagePath: window.location.pathname, product: '', department: '', topic: '',
      ...captureAttribution(), consent: true, website: read('website'),
    });
    if (!parsed.success) return fail('phone', t.badPhone);
    setInvalid(null);
    setState({ kind: 'sending' });
    try {
      await saveLead({ data: parsed.data });
      setState({ kind: 'success', whatsapp: geoWhatsAppUrl(geoWhatsAppMessage(locale, { name, company, phone, role, challenge: picked })) });
    } catch {
      setState({ kind: 'error' });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="geo-form-done" role="status">
        <span className="geo-done-mark" aria-hidden="true"><Send /></span>
        <p className="geo-done-title">{t.success}</p>
        <p>{t.successNext}</p>
        <a className="geo-btn geo-btn-primary" href={state.whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />{t.openWhatsapp}</a>
        <button type="button" className="geo-btn geo-btn-quiet" onClick={() => { setState({ kind: 'idle' }); onChallenge(''); }}><RotateCcw aria-hidden="true" />{t.another}</button>
      </div>
    );
  }

  const err = (field: string) => invalid?.field === field ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {};
  return (
    <form className="geo-form" onSubmit={handleSubmit} method="post" noValidate aria-label={`${t.title} ${t.titleB}`}>
      <div className="geo-field"><label htmlFor={`${id}-name`}>{t.name} <span aria-hidden="true">*</span></label><input id={`${id}-name`} name="name" type="text" autoComplete="name" required minLength={2} maxLength={100} placeholder={t.namePh} {...err('name')} /></div>
      <div className="geo-field"><label htmlFor={`${id}-company`}>{t.company} <span aria-hidden="true">*</span></label><input id={`${id}-company`} name="company" type="text" autoComplete="organization" required minLength={2} maxLength={160} placeholder={t.companyPh} {...err('company')} /></div>
      <div className="geo-field"><label htmlFor={`${id}-phone`}>{t.phone} <span aria-hidden="true">*</span></label><input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required maxLength={22} placeholder={t.phonePh} {...err('phone')} /></div>
      <div className="geo-field"><label htmlFor={`${id}-role`}>{t.role}{roleRequired && <span aria-hidden="true"> *</span>}</label>
        <select id={`${id}-role`} name="role" defaultValue="" required={roleRequired} {...err('role')}><option value="">{t.rolePh}</option>{t.roles.map(r => <option key={r} value={r}>{r}</option>)}</select>
      </div>
      <div className="geo-field geo-field-full"><label htmlFor={`${id}-challenge`}>{t.challenge} <span aria-hidden="true">*</span></label>
        <select id={`${id}-challenge`} name="challenge" required value={challenge} onChange={e => onChallenge(isGeoChallenge(e.target.value) ? e.target.value : '')} {...err('challenge')}>
          <option value="" disabled>{t.challengePh}</option>
          {GEO_CHALLENGES.map(c => <option key={c} value={c}>{t.challenges[c]}</option>)}
        </select>
      </div>
      <div className="geo-honey" aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <label className="geo-consent"><input type="checkbox" name="consent" required {...err('consent')} /><span>{t.consent}</span></label>
      {invalid && <p id={`${id}-error`} role="alert" className="geo-form-error">{invalid.message}</p>}
      {state.kind === 'error' && <p role="alert" className="geo-form-error">{t.error} <a href={geoWhatsAppUrl()} target="_blank" rel="noopener noreferrer">WhatsApp</a></p>}
      <button type="submit" className="geo-btn geo-btn-primary geo-submit" disabled={!hydrated || state.kind === 'sending'}>
        {state.kind === 'sending' ? t.sending : t.submit}<MessageCircle aria-hidden="true" />
      </button>
      <p className="geo-form-note">{t.note}</p>
    </form>
  );
}
