import { MessageCircle, MonitorPlay, UserRoundCheck, Route as RouteIcon } from 'lucide-react';
import ContactForm from './ContactForm';
import { useLocale } from '@/lib/i18n';
import SuccessStories from './stories/SuccessStories';
import { LEAD_SCENE, LEAD_SCENE_COPY as C } from '@/content/lead-scene';
import '@/lead-scene.css';

export type LeadContext = { product?: string; department?: string; topic?: string; interest?: string };

/**
 * Scrolls to the page's demo form and focuses it. An optional product/department context (for example a department
 * card on a product hub, or a DIGIT Pro workspace) is attached to the next request. Returns false when the page has no form.
 */
export function focusLeadForm(context?: LeadContext): boolean {
  const form = document.querySelector<HTMLFormElement>('[data-contextual-form]');
  if (!form) return false;
  if (context && typeof context.product === 'string') {
    form.dataset['leadProduct'] = context.product;
    form.dataset['leadDepartment'] = context.department ?? '';
    form.dataset['leadTopic'] = context.topic ?? '';
  }
  // A workspace or question names what the visitor asked about in the visible interest field, when it can.
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement>('[name=interest]');
  if (context?.interest && field) {
    if (field instanceof HTMLSelectElement) {
      if (![...field.options].some(o => o.value === context.interest)) field.add(new Option(context.interest, context.interest), 0);
      field.value = context.interest;
    } else field.value = context.interest;
  }
  form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  form.querySelector<HTMLInputElement>('input[name=name]')?.focus({ preventScroll: true });
  return true;
}

const POINT_ICONS = [UserRoundCheck, MonitorPlay, RouteIcon];

/**
 * The request section on a meeting-room scene: the form card sits on the reading side (right in Arabic, left in
 * English) and the Digit advisor presents a real DIGIT screen to a Saudi business owner on the other side. The scene
 * is mirrored per language, with the real screen composited the right way round in each. `kind` decides how the
 * request is recorded (demo by default; the quote page passes "quote").
 */
export function LeadScene({ interest = 'DIGIT', product, department, kind = 'demo', id = 'digit-lead', title, lede }: { interest?: string; kind?: 'demo' | 'quote'; id?: string; title?: string; lede?: string } & LeadContext) {
  const l = useLocale();
  const scene = LEAD_SCENE[l];
  const dir = l === 'ar' ? 'rtl' : 'ltr';
  return (
    <section id={id} className="ls-root" data-dir={dir} aria-labelledby={`${id}-title`}>
      <figure className="ls-media">
        <img
          src={scene.src}
          srcSet={scene.srcSet}
          sizes="(max-width: 1099px) 100vw, 1920px"
          width={1920}
          height={1080}
          alt={C.alt[l]}
          loading="lazy"
          decoding="async"
        />
        <figcaption className="ls-chip">
          <span className="ls-chip-dot" aria-hidden="true" />
          {C.chip[l]}
        </figcaption>
      </figure>
      <div className="ls-shade" aria-hidden="true" />
      <div className="ls-wrap">
        <div className="ls-card" data-motion-card>
          <p className="ls-eyebrow">
            <bdi>DIGIT</bdi> · <bdi>{interest && interest !== 'DIGIT' ? interest : kind === 'quote' ? C.quoteKind[l] : C.demoKind[l]}</bdi>
          </p>
          <h2 id={`${id}-title`} className="ls-title">
            {title ?? (kind === 'quote' ? C.quoteTitle[l] : C.title[l])}
          </h2>
          <p className="ls-lede">{lede ?? (kind === 'quote' ? C.quoteLede[l] : C.lede[l])}</p>
          <ul className="ls-points" role="list">
            {C.points.map((p, i) => {
              const Icon = POINT_ICONS[i] ?? UserRoundCheck;
              return (
                <li key={i}>
                  <Icon aria-hidden="true" />
                  {p[l]}
                </li>
              );
            })}
          </ul>
          <ContactForm
            kind={kind}
            interest={interest}
            stories={false}
            bare
            {...(product ? { product } : {})}
            {...(department ? { department } : {})}
            after={
              <a className="ls-whatsapp" href="https://wa.me/966595051150" target="_blank" rel="noopener noreferrer" aria-label={`${C.whatsapp[l]} +966 59 505 1150`}>
                <MessageCircle aria-hidden="true" />
                <span>{C.whatsappShort[l]}</span>
              </a>
            }
          />
        </div>
      </div>
    </section>
  );
}

/**
 * The demo request on every content page. By default the «قصص النجاح» customer-logo ticker sits right above it;
 * pages that place the ticker themselves (the home section list) pass `stories={false}`.
 */
export default function LeadCapturePanel({ interest = 'DIGIT', product, department, stories = true }: { interest?: string; stories?: boolean } & LeadContext) {
  return (
    <>
      {stories && <SuccessStories />}
      <LeadScene interest={interest} {...(product ? { product } : {})} {...(department ? { department } : {})} />
    </>
  );
}
