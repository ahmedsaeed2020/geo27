import { useId } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { NavLink } from "@/components/nav/nav-links";
import { useDemoRequest } from "@/components/nav/MegaMenu";
import { useCatalog } from "@/components/catalog/useCatalog";
import { Button } from "@/components/ui/button";
import { EXPLORE_BY_ROLE_SPECIALIST } from "@/content/catalog";
import {
  CORPORATE,
  CORPORATE_LAYERS,
  DELIVERY,
  DELIVERY_SCOPE,
  DELIVERY_STAGES,
  FRICTION,
  NEXT_STEPS,
  PORTFOLIO,
  PRODUCT_STORIES,
  TRILOGY,
} from "@/content/corporate";
import { screenById } from "@/content/screens";
import { photo as photoOf } from "@/content/specialist/photos";
import { useLocale, type Locale } from "@/lib/i18n";
import { Head, useTabs } from "./story-kit";
import "@/specialist.css";
import "@/hubs.css";

const ArrowFor = ({ locale }: { locale: Locale }) =>
  locale === "ar" ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />;

function Photo({ name, locale, className }: { name: string; locale: Locale; className: string }) {
  const p = photoOf(name);
  if (!p?.src) return null;
  return (
    <img
      className={className}
      src={p.src}
      width={p.width}
      height={p.height}
      alt={p.alt[locale]}
      loading="lazy"
      decoding="async"
    />
  );
}

/* ------------------------------ Platform → Applications → Delivery ------------------------------ */

/** The three DIGIT layers as an interactive stack: choose a layer to see what it covers and who is responsible. */
export function PlatformLayers({ variant = "about" }: { variant?: "about" | "home" }) {
  const locale = useLocale();
  const base = useId();
  const { active, tabProps } = useTabs(CORPORATE_LAYERS.length, locale, true);
  const layer = CORPORATE_LAYERS[active]!;
  return (
    <section className="hs hs-block cs-layers" aria-labelledby={`${base}-t`} data-variant={variant}>
      <div className="dp-wrap">
        <div className="cs-layers-head">
          <Head
            kicker={CORPORATE.kicker[locale]}
            title={CORPORATE.title[locale]}
            lede={CORPORATE.relation[locale]}
            id={`${base}-t`}
          />
          <blockquote className="cs-quote">
            <p>{CORPORATE.philosophy[locale]}</p>
          </blockquote>
        </div>
        <div className="cs-layers-grid">
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label={CORPORATE.layersLabel[locale]}
            className="cs-stack"
          >
            {[...CORPORATE_LAYERS].reverse().map((l) => {
              const i = CORPORATE_LAYERS.indexOf(l);
              return (
                <button
                  key={l.id}
                  {...tabProps(i, `${base}-p`, `${base}-tab-${i}`)}
                  className="cs-slab"
                  data-layer={l.id}
                >
                  <span className="cs-slab-no" dir="ltr">
                    LAYER {l.no}
                  </span>
                  <strong>{l.label[locale]}</strong>
                  {locale === "ar" && (
                    <span className="cs-slab-en" dir="ltr">
                      {l.en}
                    </span>
                  )}
                  {l.id === "apps" && (
                    <span className="cs-slab-apps" dir="ltr" aria-hidden="true">
                      {["Pro", "HR", "Construction", "CRM", "POS", "FSM + ITM"].map((a) => (
                        <span key={a}>{a}</span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div
            role="tabpanel"
            id={`${base}-p`}
            aria-labelledby={`${base}-tab-${active}`}
            className="hs-panel cs-layer-panel"
            key={layer.id}
          >
            <p className="hs-panel-step" dir="ltr">
              LAYER {layer.no} · {layer.en}
            </p>
            <h3>{layer.label[locale]}</h3>
            <p className="hs-panel-lead">{layer.body[locale]}</p>
            <h4 className="cs-mini">{CORPORATE.includes[locale]}</h4>
            <ul role="list" className="cs-checks">
              {layer.includes.map((x, i) => (
                <li key={i}>
                  <Check aria-hidden="true" />
                  {x[locale]}
                </li>
              ))}
            </ul>
            <p className="hs-panel-note">
              <strong>{CORPORATE.owner[locale]}: </strong>
              {layer.owner[locale]}
            </p>
            <ul role="list" className="cs-links">
              {layer.links.map((l) => (
                <li key={l.path}>
                  <NavLink path={l.path} className="cs-chiplink">
                    {l.label[locale]}
                    <ArrowFor locale={locale} />
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="cs-decision">
          <p>{CORPORATE.decision[locale]}</p>
          <span>{CORPORATE.decisionNote[locale]}</span>
        </div>
      </div>
    </section>
  );
}

/** Profile p. 3: friction sits between departments; three managers' questions. */
export function FrictionBand() {
  const locale = useLocale();
  const base = useId();
  return (
    <section className="hs hs-block" data-alt="" aria-labelledby={`${base}-t`}>
      <div className="dp-wrap cs-friction">
        <div>
          <Head kicker={FRICTION.kicker[locale]} title={FRICTION.title[locale]} id={`${base}-t`} />
          <h3 className="cs-mini">{FRICTION.where[locale]}</h3>
          <ol role="list" className="cs-friction-points">
            {FRICTION.points.map((p, i) => (
              <li key={i}>
                <span dir="ltr">{String(i + 1).padStart(2, "0")}</span>
                {p[locale]}
              </li>
            ))}
          </ol>
        </div>
        <div className="cs-friction-side">
          <Photo name="departments-cross-section" locale={locale} className="cs-photo" />
          <h3 className="cs-mini">{FRICTION.context[locale]}</h3>
          <ul role="list" className="cs-questions">
            {FRICTION.questions.map((q, i) => (
              <li key={i}>
                <strong>{q.who[locale]}</strong>
                <p>{q.q[locale]}</p>
              </li>
            ))}
          </ul>
          <p className="hs-panel-note">{FRICTION.close[locale]}</p>
        </div>
      </div>
    </section>
  );
}

/** Profile p. 34: DIGIT is Trilogy's business-applications track; Trilogy's wider IT services are scoped separately. */
export function TrilogyBand() {
  const locale = useLocale();
  const base = useId();
  return (
    <section className="hs hs-block" aria-labelledby={`${base}-t`}>
      <div className="dp-wrap">
        <Head
          kicker={TRILOGY.kicker[locale]}
          title={TRILOGY.title[locale]}
          lede={TRILOGY.body[locale]}
          id={`${base}-t`}
        />
        <div className="cs-trilogy">
          <div className="cs-trilogy-digit">
            <span className="cs-trilogy-mark" dir="ltr">
              DIGIT
            </span>
            <p>{TRILOGY.digitBody[locale]}</p>
            <NavLink path="/services-3/implementation" className="hs-link">
              {DELIVERY.more[locale]}
              <ArrowFor locale={locale} />
            </NavLink>
          </div>
          <div className="cs-trilogy-services">
            <Photo
              name="trilogy-infrastructure"
              locale={locale}
              className="cs-photo cs-photo-side"
            />
            <div className="cs-trilogy-body">
              <h3>{TRILOGY.trilogy[locale]}</h3>
              <div className="cs-trilogy-groups">
                {TRILOGY.groups.map((g, i) => (
                  <div key={i}>
                    <h4>
                      <span dir="ltr">{String(i + 1).padStart(2, "0")}</span> {g.label[locale]}
                    </h4>
                    <ul role="list" className="hs-codes" dir="ltr">
                      {g.items.map((x) => (
                        <li key={x}>
                          <code>{x}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="hs-panel-note">{TRILOGY.note[locale]}</p>
              <p className="cs-method" dir="ltr">
                {TRILOGY.method}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Delivery ------------------------------ */

/** Discovery → Scope → Data → Configuration → Training → Go-live, with package / scoped / Trilogy separation. */
export function DeliveryJourney({ variant = "service" }: { variant?: "service" | "home" }) {
  const locale = useLocale();
  const base = useId();
  const demo = useDemoRequest();
  const { active, tabProps } = useTabs(DELIVERY_STAGES.length, locale);
  const stage = DELIVERY_STAGES[active]!;
  const home = variant === "home";
  return (
    <section
      className="hs hs-block cs-delivery"
      data-alt={home ? "" : undefined}
      aria-labelledby={`${base}-t`}
      data-variant={variant}
    >
      <div className="dp-wrap">
        <Head
          kicker={DELIVERY.kicker[locale]}
          title={DELIVERY.title[locale]}
          lede={DELIVERY.lede[locale]}
          id={`${base}-t`}
        />
        <div role="tablist" aria-label={DELIVERY.stagesLabel[locale]} className="cs-track">
          {DELIVERY_STAGES.map((s, i) => (
            <button
              key={s.id}
              {...tabProps(i, `${base}-p`, `${base}-tab-${i}`)}
              className="cs-track-step"
              data-done={i < active ? "" : undefined}
            >
              <span className="cs-track-dot" dir="ltr">
                {String(i + 1).padStart(2, "0")}
              </span>
              <strong>{s.label[locale]}</strong>
              {locale === "ar" && (
                <span className="cs-slab-en" dir="ltr">
                  {s.en}
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${base}-p`}
          aria-labelledby={`${base}-tab-${active}`}
          className="hs-panel cs-stage"
          key={stage.id}
        >
          <div className="cs-stage-main">
            <p className="hs-panel-step">
              {DELIVERY.step[locale]} {active + 1} {DELIVERY.of[locale]} {DELIVERY_STAGES.length}
            </p>
            <h3>{stage.label[locale]}</h3>
            <h4 className="cs-mini">{DELIVERY.what[locale]}</h4>
            <ul role="list" className="cs-checks">
              {stage.what.map((w, i) => (
                <li key={i}>
                  <Check aria-hidden="true" />
                  {w[locale]}
                </li>
              ))}
            </ul>
          </div>
          <dl className="hs-facts cs-stage-facts">
            <div className="hs-wide">
              <dt>{DELIVERY.output[locale]}</dt>
              <dd className="hs-big">{stage.output[locale]}</dd>
            </div>
            <div className="hs-wide">
              <dt>{DELIVERY.who[locale]}</dt>
              <dd>{stage.who[locale]}</dd>
            </div>
          </dl>
        </div>

        <div className="cs-scope">
          <div className="cs-scope-head">
            <p className="sp-kicker" dir="ltr">
              {DELIVERY.scopeKicker[locale]}
            </p>
            <h3>{DELIVERY.scopeTitle[locale]}</h3>
            <p className="cs-scope-clear">{DELIVERY.scopeClear[locale]}</p>
          </div>
          <ul role="list" className="cs-scope-cols">
            {DELIVERY_SCOPE.map((c) => (
              <li key={c.id} data-scope={c.id}>
                <strong>{c.title[locale]}</strong>
                <p>{c.body[locale]}</p>
                {!home && (
                  <ul role="list" className="hs-bullets">
                    {c.items.map((x, i) => (
                      <li key={i}>{x[locale]}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="cs-scope-note">{DELIVERY.scopeNote[locale]}</p>
        </div>

        <div className="cs-next">
          <div>
            <p className="sp-kicker">{DELIVERY.nextKicker[locale]}</p>
            <h3>{DELIVERY.nextTitle[locale]}</h3>
            {!home && <p className="sp-lede">{DELIVERY.nextLede[locale]}</p>}
          </div>
          <ol role="list" className="cs-next-steps">
            {NEXT_STEPS.map((s) => (
              <li key={s.no}>
                <span dir="ltr">{s.no}</span>
                <strong>{s.label[locale]}</strong>
                <p>{s.body[locale]}</p>
              </li>
            ))}
          </ol>
          <div className="cs-next-actions">
            <Button size="lg" onClick={() => demo()}>
              {DELIVERY.book[locale]}
            </Button>
            {home && (
              <NavLink path="/services-3/implementation" className="hs-link">
                {DELIVERY.more[locale]}
                <ArrowFor locale={locale} />
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Home: six-family discovery ------------------------------ */

/** Six-family explorer with the connected story of each specialist product and the four new roles. */
export function SpecialistDiscovery() {
  const locale = useLocale();
  const base = useId();
  const families = useCatalog();
  const demo = useDemoRequest();
  // Opens on DIGIT Construction: Pro and HR already have their own sections further down the home page.
  const start = Math.max(0, families.findIndex((f) => f.key === "construction"));
  const { active: index, tabProps } = useTabs(families.length, locale, false, start);
  const family = families[index];
  if (!family) return null;
  const story = PRODUCT_STORIES[family.key];
  const pic = story ? photoOf(story.photo) : undefined;
  // Pro and HR show one of their real product screens (never a generated or withdrawn screen).
  const screen = story ? undefined : screenById(family.shot ?? family.departments.find((d) => d.shot)?.shot ?? "");
  return (
    <section className="hs hs-block cs-portfolio" aria-labelledby={`${base}-t`}>
      <div className="dp-wrap">
        <Head
          kicker={PORTFOLIO.kicker[locale]}
          title={PORTFOLIO.title[locale]}
          lede={PORTFOLIO.lede[locale]}
          id={`${base}-t`}
        />
        <div role="tablist" aria-label={PORTFOLIO.families[locale]} className="cs-families">
          {families.map((f, i) => (
            <button
              key={f.key}
              {...tabProps(i, `${base}-p`, `${base}-tab-${i}`)}
              className="cs-family"
              data-product={f.key}
            >
              <span className="cs-family-name" dir="ltr">
                {f.name.en}
              </span>
              <strong>{f.area[locale]}</strong>
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${base}-p`}
          aria-labelledby={`${base}-tab-${index}`}
          className="cs-family-panel"
          key={family.key}
          data-product={family.key}
        >
          <div className="cs-family-copy">
            <p className="hs-panel-step" dir="ltr">
              {family.name.en}
            </p>
            <h3>{family.name[locale]}</h3>
            <p className="hs-panel-lead">{family.summary[locale]}</p>
            {story ? (
              <>
                <h4 className="cs-mini">
                  {PORTFOLIO.story[locale]}: {story.tagline[locale]}
                </h4>
                <ol role="list" className="cs-chain">
                  {story.steps.map((s, i) => (
                    <li key={i}>
                      <span dir="ltr">{i + 1}</span>
                      {s[locale]}
                    </li>
                  ))}
                </ol>
                {family.key === "pos" && (
                  <p className="cs-mini-note">{PORTFOLIO.industries[locale]}</p>
                )}
              </>
            ) : (
              <>
                <h4 className="cs-mini">
                  {PORTFOLIO.areas[locale]} ({family.departments.length})
                </h4>
                <ul role="list" className="cs-dept-chips">
                  {family.departments.map((d) => (
                    <li key={d.id}>
                      <NavLink path={d.href} hash={d.hash} className="cs-chiplink">
                        {d.label[locale]}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="cs-family-actions">
              <Button asChild size="lg">
                <NavLink path={family.overview}>
                  {PORTFOLIO.open[locale]} {family.name[locale]}
                </NavLink>
              </Button>
              <Button size="lg" variant="outline" onClick={() => demo(family.key)}>
                {PORTFOLIO.demo[locale]}
              </Button>
            </div>
          </div>
          {pic?.src ? (
            <img
              className="cs-family-photo"
              src={pic.src}
              width={pic.width}
              height={pic.height}
              alt={pic.alt[locale]}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="cs-family-mark" aria-hidden="true">
              <span dir="ltr">{family.name.en}</span>
              <small>
                {family.departments.length} {PORTFOLIO.areas[locale]}
              </small>
            </div>
          )}
        </div>
        <div className="cs-roles">
          <h3 className="cs-mini">{PORTFOLIO.roles[locale]}</h3>
          <ul role="list">
            {EXPLORE_BY_ROLE_SPECIALIST.map((r) => (
              <li key={r.path}>
                <NavLink path={r.path} className="cs-role">
                  <strong>{r.label[locale]}</strong>
                  {r.summary && <span>{r.summary[locale]}</span>}
                  <ArrowFor locale={locale} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
