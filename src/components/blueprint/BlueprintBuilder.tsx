import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Copy, Printer, RotateCcw, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LeadCapturePanel, { focusLeadForm } from "@/components/LeadCapturePanel";
import ShotFrame from "@/components/product/ShotFrame";
import ShotLightbox from "@/components/product/ShotLightbox";
import { NavLink } from "@/components/nav/nav-links";
import { Button } from "@/components/ui/button";
import {
  BRANCHES,
  CURRENT,
  EMPLOYEES,
  FRICTIONS,
  GROUPS,
  NEEDS,
  SECTORS,
  blueprintSearch,
  blueprintTopic,
  flowsFor,
  needById,
  orderedNeeds,
  parseBlueprint,
  productsFor,
  startPoint,
  type Blueprint,
  type NeedId,
  type SectorId,
} from "@/content/blueprint";
import { DELIVERY_STAGES } from "@/content/corporate";
import { productByKey } from "@/content/catalog";
import { screenById } from "@/content/screens";
import type { Shot } from "@/content/product-shots";
import { useLocale, type Locale } from "@/lib/i18n";
import { BP } from "./copy";
import SystemMap, { flowKey } from "./SystemMap";
import "@/product-proof.css";
import "@/blueprint.css";

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(x => b.includes(x));

function Choice({ name, checked, onChange, children, type = "radio", badge }: { name: string; checked: boolean; onChange: () => void; children: ReactNode; type?: "radio" | "checkbox"; badge?: string | undefined }) {
  return (
    <label className="bp-choice" data-checked={checked ? "" : undefined}>
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span className="bp-choice-mark" aria-hidden="true">{checked && <Check />}</span>
      <span className="bp-choice-text">{children}</span>
      {badge && <span className="bp-choice-badge">{badge}</span>}
    </label>
  );
}

function Fieldset({ legend, children, hint }: { legend: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="bp-fieldset">
      <legend>{legend}</legend>
      {hint && <p className="bp-hint">{hint}</p>}
      <div className="bp-choices">{children}</div>
    </fieldset>
  );
}

/** Builds the visible demo-request interest line; the form accepts at most 180 characters. */
function interestLine(bp: Blueprint, locale: Locale): string {
  const sector = SECTORS.find(s => s.id === bp.sector)?.label[locale];
  const areas = orderedNeeds(bp.needs).map(n => n.short[locale]).join(locale === "ar" ? "، " : ", ");
  const line = [BP.interest[locale], sector, areas].filter(Boolean).join(" · ");
  return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}

export default function BlueprintBuilder() {
  const locale = useLocale();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const bp = useMemo(() => parseBlueprint(search), [search]);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const Prev = locale === "ar" ? ArrowRight : ArrowLeft;
  const Next = locale === "ar" ? ArrowLeft : ArrowRight;

  const update = (next: Blueprint) => {
    void navigate({ to: ".", search: blueprintSearch(next) as never, replace: true, resetScroll: false });
  };

  const chooseSector = (id: SectorId) => {
    const previous = SECTORS.find(s => s.id === bp.sector)?.suggests ?? [];
    const suggests = SECTORS.find(s => s.id === id)?.suggests ?? [];
    // Sector suggestions replace the chosen areas only while the visitor hasn't customized them.
    const untouched = bp.needs.length === 0 || sameSet(bp.needs, previous);
    update({ ...bp, sector: id, needs: untouched ? [...suggests] : bp.needs });
  };
  const toggleNeed = (id: NeedId) => update({ ...bp, needs: bp.needs.includes(id) ? bp.needs.filter(n => n !== id) : [...bp.needs, id] });

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(""), 3200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const goStep = (next: number) => {
    setStep(next);
    panelRef.current?.querySelector<HTMLElement>(`#bp-step-${next}`)?.focus({ preventScroll: true });
  };

  const needs = orderedNeeds(bp.needs);
  const flows = flowsFor(bp.needs);
  const suggested = SECTORS.find(s => s.id === bp.sector)?.suggests ?? [];
  const start = startPoint(bp);
  const edition = BP.editions[start.id];
  const sector = SECTORS.find(s => s.id === bp.sector);
  const products = productsFor(bp.needs);
  const frictions = FRICTIONS.filter(f => f.needs.some(n => bp.needs.includes(n)));
  const readingShots = needs.map(n => (n.shot ? screenById(n.shot) : undefined));
  const lightboxShots = readingShots.filter((s): s is Shot => Boolean(s));
  const summary = [sector?.label[locale] ?? BP.summaryNone[locale], EMPLOYEES.find(e => e.id === bp.employees)?.label[locale], BRANCHES.find(b => b.id === bp.branches)?.label[locale]].filter(Boolean).join(" · ");
  const mapLabel = needs.length ? `${BP.mapLabel[locale]}: ${needs.length} ${BP.mapAreas[locale]} — ${needs.map(n => n.short[locale]).join(locale === "ar" ? "، " : ", ")}` : `${BP.mapLabel[locale]} — ${BP.empty[locale]}`;

  const book = () => {
    const primary = products.includes("pro") ? "pro" : products[0] ?? "";
    focusLeadForm({ product: primary, department: "", topic: blueprintTopic(bp), interest: interestLine(bp, locale) });
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div className="min-h-screen bg-paper font-plex">
      <Header />
      <main className="bp-root" aria-labelledby="bp-title">
        <section className="bp-stage">
          <div className="bp-grid-bg" aria-hidden="true" />
          <div className="bp-wrap">
            <header className="bp-intro">
              <p className="bp-kicker"><Sparkles aria-hidden="true" /> {BP.kicker[locale]}</p>
              <h1 id="bp-title">{BP.title[locale]}</h1>
              <p className="bp-lede">{BP.lede[locale]}</p>
            </header>

            <div className="bp-workbench">
              <div className="bp-panel" ref={panelRef}>
                <div className="bp-steps" role="tablist" aria-label={BP.kicker[locale]}>
                  {BP.steps.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      id={`bp-tab-${i}`}
                      aria-selected={step === i}
                      aria-controls={`bp-step-${i}`}
                      tabIndex={step === i ? 0 : -1}
                      className="bp-step-tab"
                      data-done={(i === 0 && bp.sector) || (i === 1 && bp.employees && bp.branches) || (i === 2 && bp.needs.length) ? "" : undefined}
                      onClick={() => setStep(i)}
                      onKeyDown={event => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const forward = event.key === (locale === "ar" ? "ArrowLeft" : "ArrowRight");
                        const next = (step + (forward ? 1 : -1) + 3) % 3;
                        setStep(next);
                        document.getElementById(`bp-tab-${next}`)?.focus();
                      }}
                    >
                      <span className="bp-step-no" dir="ltr">0{i + 1}</span>
                      <span>{label[locale]}</span>
                    </button>
                  ))}
                </div>

                <div role="tabpanel" id="bp-step-0" aria-labelledby="bp-tab-0" tabIndex={-1} hidden={step !== 0} className="bp-step">
                  <Fieldset legend={BP.steps[0][locale]} hint={BP.sectorHint[locale]}>
                    {SECTORS.map(s => (
                      <Choice key={s.id} name="bp-sector" checked={bp.sector === s.id} onChange={() => chooseSector(s.id)}>{s.label[locale]}</Choice>
                    ))}
                  </Fieldset>
                </div>

                <div role="tabpanel" id="bp-step-1" aria-labelledby="bp-tab-1" tabIndex={-1} hidden={step !== 1} className="bp-step">
                  <Fieldset legend={BP.employees[locale]}>
                    {EMPLOYEES.map(e => <Choice key={e.id} name="bp-employees" checked={bp.employees === e.id} onChange={() => update({ ...bp, employees: e.id })}>{e.label[locale]}</Choice>)}
                  </Fieldset>
                  <Fieldset legend={BP.branches[locale]}>
                    {BRANCHES.map(b => <Choice key={b.id} name="bp-branches" checked={bp.branches === b.id} onChange={() => update({ ...bp, branches: b.id })}>{b.label[locale]}</Choice>)}
                  </Fieldset>
                  <Fieldset legend={BP.current[locale]}>
                    {CURRENT.map(c => <Choice key={c.id} name="bp-current" checked={bp.current === c.id} onChange={() => update({ ...bp, current: c.id })}>{c.label[locale]}</Choice>)}
                  </Fieldset>
                </div>

                <div role="tabpanel" id="bp-step-2" aria-labelledby="bp-tab-2" tabIndex={-1} hidden={step !== 2} className="bp-step">
                  <p className="bp-hint">{BP.needsHint[locale]}</p>
                  {GROUPS.map(g => (
                    <Fieldset key={g.id} legend={g.label[locale]}>
                      {NEEDS.filter(n => n.group === g.id).map(n => (
                        <Choice key={n.id} type="checkbox" name="bp-needs" checked={bp.needs.includes(n.id)} onChange={() => toggleNeed(n.id)} badge={suggested.includes(n.id) ? BP.suggested[locale] : undefined}>
                          {n.label[locale]}
                        </Choice>
                      ))}
                    </Fieldset>
                  ))}
                </div>

                <div className="bp-panel-nav">
                  <Button type="button" variant="ghost" size="sm" onClick={() => goStep(step - 1)} disabled={step === 0}><Prev aria-hidden="true" /> {BP.back[locale]}</Button>
                  <span className="bp-count" aria-live="polite">{bp.needs.length} {BP.chosen[locale]}</span>
                  {step < 2
                    ? <Button type="button" size="sm" onClick={() => goStep(step + 1)}>{BP.next[locale]} <Next aria-hidden="true" /></Button>
                    : <Button type="button" size="sm" onClick={() => mapRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}>{BP.seeBlueprint[locale]} <Next aria-hidden="true" /></Button>}
                </div>
              </div>

              <div className="bp-canvas" ref={mapRef}>
                <div className="bp-canvas-head">
                  <p className="bp-summary">{summary}</p>
                  {bp.needs.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="bp-reset" onClick={() => { update({ needs: [] }); setStep(0); }}>
                      <RotateCcw aria-hidden="true" /> {BP.reset[locale]}
                    </Button>
                  )}
                </div>
                <SystemMap needs={bp.needs} locale={locale} label={mapLabel} emptyHint={BP.empty[locale]} focus={focus} onFocus={setFocus} />
                <p className="bp-legend">{BP.legend[locale]}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bp-results" aria-label={BP.flowsTitle[locale]}>
          <div className="bp-wrap bp-results-grid">
            <div className="bp-card bp-flows-card">
              <h2>{BP.flowsTitle[locale]}</h2>
              {flows.length ? (
                <ul className="bp-flow-list">
                  {flows.map(f => {
                    const key = flowKey(f);
                    return (
                      <li key={key}>
                        <button type="button" aria-pressed={focus === key} onClick={() => setFocus(focus === key ? null : key)} onMouseEnter={() => setFocus(key)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(key)} onBlur={() => setFocus(null)}>
                          <span className="bp-flow-ends">
                            <span data-product={needById(f.from).product}>{needById(f.from).short[locale]}</span>
                            <Next aria-hidden="true" className="bp-flow-arrow" />
                            <span data-product={needById(f.to).product}>{needById(f.to).short[locale]}</span>
                          </span>
                          <span className="bp-flow-label">{f.label[locale]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="bp-muted">{BP.flowsNone[locale]}</p>}
            </div>

            <div className="bp-card bp-start" data-edition={start.id}>
              <h2>{BP.startTitle[locale]}</h2>
              <p className="bp-edition">{edition.name[locale]}</p>
              <p>{edition.body[locale]}</p>
              {bp.needs.length > 0 && (
                <div className="bp-why">
                  <span>{BP.why[locale]}</span>
                  <ul>{start.reasons.map((r, i) => <li key={i}>{r[locale]}</li>)}</ul>
                </div>
              )}
              {products.length > 0 && (
                <ul className="bp-families" aria-label={BP.startTitle[locale]}>
                  {products.map(p => <li key={p} data-product={p}>{productByKey(p)?.name[locale]}</li>)}
                </ul>
              )}
              <p className="bp-note">{BP.startNote[locale]}</p>
              <div className="bp-start-links">
                <NavLink path={edition.path} className="bp-link">{edition.name[locale]} <Next aria-hidden="true" /></NavLink>
                <NavLink path="/pricing" className="bp-link">{BP.compare[locale]} <Next aria-hidden="true" /></NavLink>
              </div>
            </div>
          </div>

          {needs.length > 0 && (
            <div className="bp-wrap">
              <div className="bp-section-head">
                <h2>{BP.readingTitle[locale]}</h2>
                <p>{BP.readingLede[locale]}</p>
              </div>
              <ol className="bp-reading">
                {needs.map((n, i) => {
                  const shot = readingShots[i];
                  return (
                    <li key={n.id} className="bp-read" data-product={n.product}>
                      <div className="bp-read-copy">
                        <span className="bp-read-no" dir="ltr">{String(i + 1).padStart(2, "0")}</span>
                        <p className="bp-read-family">{productByKey(n.product)?.name[locale]}</p>
                        <h3>{n.label[locale]}</h3>
                        <p>{n.summary[locale]}</p>
                        <NavLink path={n.path} hash={n.hash} className="bp-link">{BP.read[locale]} <Next aria-hidden="true" /></NavLink>
                      </div>
                      <div className="bp-read-proof">
                        {shot
                          ? <ShotFrame shot={shot} size="thumb" caption={false} onOpen={() => setLightbox(lightboxShots.indexOf(shot))} />
                          : <p className="bp-no-shot">{BP.noShot[locale]}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {frictions.length > 0 && (
            <div className="bp-wrap">
              <div className="bp-section-head">
                <h2>{BP.frictionTitle[locale]}</h2>
                <p>{BP.frictionLede[locale]}</p>
              </div>
              <ul className="bp-frictions">
                {frictions.map((f, i) => (
                  <li key={i}>
                    <strong>{f.label[locale]}</strong>
                    <span>{f.role[locale]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bp-wrap">
            <div className="bp-section-head">
              <h2>{BP.deliveryTitle[locale]}</h2>
              <p>{BP.deliveryLede[locale]}</p>
            </div>
            <ol className="bp-delivery">
              {DELIVERY_STAGES.map((s, i) => {
                const note = s.id === "data" && bp.current && bp.current !== "new" ? BP.migration[locale] : s.id === "scope" && bp.branches && bp.branches !== "1" ? BP.branchesNote[locale] : "";
                return (
                  <li key={s.id} data-noted={note ? "" : undefined}>
                    <span className="bp-del-no" dir="ltr">{String(i + 1).padStart(2, "0")}</span>
                    <h3>{s.label[locale]}</h3>
                    <p><span className="bp-del-out">{BP.output[locale]}:</span> {s.output[locale]}</p>
                    {note && <p className="bp-del-note">{note}</p>}
                  </li>
                );
              })}
            </ol>
            <NavLink path="/services-3/implementation" className="bp-link">{BP.delivery[locale]} <Next aria-hidden="true" /></NavLink>
          </div>

          <div className="bp-wrap">
            <div className="bp-actions">
              <Button type="button" size="lg" onClick={book}>{BP.book[locale]}</Button>
              <Button type="button" size="lg" variant="outline" onClick={() => void copyLink()} disabled={!bp.needs.length && !bp.sector}><Copy aria-hidden="true" /> {BP.copy[locale]}</Button>
              <Button type="button" size="lg" variant="outline" onClick={() => window.print()} disabled={!bp.needs.length}><Printer aria-hidden="true" /> {BP.print[locale]}</Button>
              <span className="bp-copied" role="status">{copied === "ok" ? BP.copied[locale] : copied === "fail" ? BP.copyFailed[locale] : ""}</span>
            </div>
            {sector && (
              <p className="bp-sector-link">{BP.sectorPage[locale]}: <NavLink path={sector.page} className="bp-link">{sector.label[locale]}</NavLink></p>
            )}
          </div>
        </section>

        <LeadCapturePanel interest={BP.leadInterest[locale]} />
      </main>
      <Footer />
      <ShotLightbox shots={lightboxShots} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
