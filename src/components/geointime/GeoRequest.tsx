import { ClipboardCheck, Clock3, MapPin } from 'lucide-react';
import { GEO_COPY, type GeoChallenge, type GeoLocale } from '@/content/geointime';
import GeoLeadForm from './GeoLeadForm';
import { MEDIA, SCREENS } from './geo-media';

const NODE_ICONS: Record<string, typeof Clock3> = { presence: Clock3, sites: MapPin, tasks: ClipboardCheck };

/** Dark «try it on your problem» band: story, an orbit whose nodes choose the challenge, and the request card. */
export default function GeoRequest({ locale, challenge, onChallenge, onPick }: { locale: GeoLocale; challenge: GeoChallenge | ''; onChallenge: (value: GeoChallenge | '') => void; onPick: (value: GeoChallenge) => void }) {
  const t = GEO_COPY[locale].request;
  const f = GEO_COPY[locale].form;
  return (
    <section id="request" className="geo-request" aria-labelledby="geo-request-title">
      <div className="geo-wrap geo-request-grid">
        <div className="geo-request-copy">
          <p className="geo-overline geo-overline-dark"><span className="geo-dot" />{t.overline}</p>
          <h2 id="geo-request-title">{t.title}<span>{t.titleAccent}</span></h2>
          <p>{t.intro}</p>
        </div>

        <div className="geo-orbit">
          <svg className="geo-orbit-lines" viewBox="0 0 400 400" aria-hidden="true">
            <path className="geo-orbit-path" d="M40 250 A170 170 0 0 1 300 70" />
            <circle className="geo-orbit-ring" cx="215" cy="250" r="150" />
            <circle className="geo-orbit-arc" cx="215" cy="250" r="150" />
          </svg>
          <figure className="geo-orbit-photo">
            <img src={MEDIA.warehouseTeam.src} width={MEDIA.warehouseTeam.width} height={MEDIA.warehouseTeam.height} alt={t.photoAlt} loading="lazy" decoding="async" />
            <figcaption>{t.photoTitle[0]}<span>{t.photoTitle[1]}</span></figcaption>
          </figure>
          <figure className="geo-orbit-screen">
            <img src={SCREENS['ui-map']} width={757} height={610} alt={t.screenAlt} loading="lazy" decoding="async" />
            <figcaption><span className="geo-live" />{t.screenCaption}</figcaption>
          </figure>
          <div className="geo-orbit-nodes" role="group" aria-label={t.nodesLabel}>
            {t.nodes.map(([key, label], i) => {
              const Icon = NODE_ICONS[key] ?? MapPin;
              return (
                <button key={key} type="button" className="geo-node" data-node={i} aria-pressed={challenge === key} onClick={() => onPick(key)} title={f.challenges[key]}>
                  <span className="geo-node-icon"><Icon aria-hidden="true" /></span><span className="geo-node-label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="geo-form-card" id="geo-form">
          <p className="geo-kicker">{f.kicker}</p>
          <h3>{f.title} <span>{f.titleB}</span></h3>
          <p className="geo-form-intro">{f.intro}</p>
          <GeoLeadForm locale={locale} challenge={challenge} onChallenge={onChallenge} />
        </div>
      </div>
    </section>
  );
}
