import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/nav/nav-links';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { reportByKey } from '@/content/pro/reports';
import type { L, Workspace } from '@/content/pro/types';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';
import { ProScreen, useSectionLightbox } from './ProScreens';

type Props = {
  id: string;
  ws: Workspace;
  title: string;
  lede: string;
  eyebrow: string;
  shotId: string;
  index: number;
  total: number;
  rail?: L[] | undefined;
  department: string;
  flip: boolean;
};

const TABS = ['overview', 'work', 'reports'] as const;
type Tab = (typeof TABS)[number];

/** Native report as listed in the directory: Arabic name, with the interface name for reference. */
export function ReportName({ k }: { k: string }) {
  const locale = useLocale();
  const r = reportByKey(k);
  if (!r) return null;
  return (
    <span className="pv-report">
      <FileText aria-hidden="true" />
      <span>{locale === 'ar' ? r.ar : r.key}</span>
      {locale === 'ar' && <span className="pv-sys" dir="ltr">{r.key}</span>}
    </span>
  );
}

/** Journey rail with the stages a workspace covers highlighted. */
export function JourneyRail({ rail, stages, label }: { rail: L[]; stages?: number[] | undefined; label: string }) {
  const locale = useLocale();
  return (
    <ol className="pv-rail" aria-label={label}>
      {rail.map((stage, i) => {
        const on = !stages || stages.includes(i);
        return (
          <li key={i} data-on={on ? '' : undefined}>
            <span className="pv-rail-dot" aria-hidden="true" />
            <span>{stage[locale]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One of the twenty DIGIT Pro workspaces, in three tabs: Overview (what it does, on its real screen), Documents & work
 * (native documents, the path and its control) and Reports (native reports and the decision they serve).
 */
export default function ProWorkspace({ id, ws, title, lede, eyebrow, shotId, index, total, rail, department, flip }: Props) {
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('overview');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const lead = shotId ? { id: shotId } : ws.overview.lead;
  const box = useSectionLightbox([lead?.id, ...(ws.overview.extra ?? []).map(e => e.id), ...ws.overview.features.map(f => f.shot)]);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const labels: Record<Tab, string> = { overview: C.tabOverview[locale], work: C.tabWork[locale], reports: C.tabReports[locale] };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys = locale === 'ar' ? { next: 'ArrowLeft', prev: 'ArrowRight' } : { next: 'ArrowRight', prev: 'ArrowLeft' };
    let next = -1;
    if (e.key === keys.next) next = (i + 1) % TABS.length;
    else if (e.key === keys.prev) next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]!);
    tabs.current[next]?.focus();
  };
  const number = (n: number) => String(n).padStart(2, '0');
  const ask = () => focusLeadForm({ product: 'pro', department, topic: ws.code, interest: title });

  return (
    <section className="pv-sec pv-ws" id={`pv-${id}`} aria-labelledby={`pv-${id}-title`} data-flip={flip ? '' : undefined}>
      <div className="dp-wrap">
        <header className="pv-ws-head">
          <p className="pv-ws-index">
            <span dir="ltr">{number(index + 1)}</span>
            <span aria-hidden="true">/</span>
            <span dir="ltr">{number(total)}</span>
            <span className="pv-ws-kicker">{eyebrow || `${C.workspace[locale]} ${index + 1} ${C.of[locale]} ${total}`}</span>
          </p>
          <h2 id={`pv-${id}-title`}>{title}</h2>
          <p className="pv-ws-question">{ws.question[locale]}</p>
          <p className="pv-lede">{lede || ws.lede[locale]}</p>
          <div className="pv-ws-meta">
            <ol className="pv-ladder" aria-label={C.whoWorks[locale]}>
              {ws.roles.map((r, i) => (
                <li key={i}>{r[locale]}</li>
              ))}
            </ol>
            {rail && <JourneyRail rail={rail} stages={ws.stages} label={C.sequence[locale]} />}
          </div>
        </header>

        <div role="tablist" aria-label={`${C.tabsLabel[locale]}: ${title}`} className="pv-tabs">
          {TABS.map((t, i) => (
            <button
              key={t}
              ref={el => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`pv-${id}-tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`pv-${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              className="pv-tab"
              onClick={() => setTab(t)}
              onKeyDown={e => onKey(e, i)}
            >
              <span className="pv-tab-no" dir="ltr" aria-hidden="true">
                {number(i + 1)}
              </span>
              {labels[t]}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={`pv-${id}-panel`} aria-labelledby={`pv-${id}-tab-${tab}`} className="pv-panel" data-tab={tab}>
          {tab === 'overview' && (
            <div className="pv-overview" data-has-screen={lead ? '' : undefined}>
              <div className="pv-overview-copy">
                <p>{ws.overview.body[locale]}</p>
                {ws.overview.features.length > 0 && (
                  <>
                    <p className="pv-label">
                      <Check aria-hidden="true" />
                      {C.available[locale]}
                    </p>
                    <ul className="pv-feats" role="list">
                      {ws.overview.features.map(f => (
                        <li key={f.id}>
                          <strong>{f.title[locale]}</strong>
                          <span>{f.body[locale]}</span>
                          {f.shot && f.shot !== lead?.id && (
                            <button type="button" className="pv-feat-shot" onClick={() => box.open(f.shot!)}>
                              {C.realScreen[locale]}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              {lead ? (
                <div className="pv-overview-screens">
                  <ProScreen refId={lead} open={box.open} />
                  {(ws.overview.extra ?? []).length > 0 && (
                    <div className="pv-thumbs">
                      {ws.overview.extra!.map(e => (
                        <ProScreen key={e.id} refId={{ id: e.id }} size="thumb" open={box.open} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <figure className="pv-diagram">
                  <ol>
                    {ws.work.steps.map((s, i) => (
                      <li key={i}>
                        <span dir="ltr">{number(i + 1)}</span>
                        {s[locale]}
                      </li>
                    ))}
                  </ol>
                  <figcaption>{C.diagram[locale]}</figcaption>
                </figure>
              )}
            </div>
          )}

          {tab === 'work' && (
            <div className="pv-work">
              <div>
                <p className="pv-label">{C.nativeDocs[locale]}</p>
                <dl className="pv-docs">
                  {ws.work.docs.map(d => (
                    <div key={d.sys}>
                      <dt>
                        {d.name[locale]}
                        {locale === 'ar' && (
                          <span className="pv-sys" dir="ltr">
                            {d.sys}
                          </span>
                        )}
                      </dt>
                      <dd>{d.role[locale]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <p className="pv-label">{C.path[locale]}</p>
                <ol className="pv-path">
                  {ws.work.steps.map((s, i) => (
                    <li key={i}>
                      <span dir="ltr">{number(i + 1)}</span>
                      {s[locale]}
                    </li>
                  ))}
                </ol>
                <p className="pv-control">
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>{C.control[locale]}: </strong>
                    {ws.work.control[locale]}
                  </span>
                </p>
              </div>
            </div>
          )}

          {tab === 'reports' && (
            <div className="pv-reports-tab">
              <div>
                <p className="pv-label">{C.reports[locale]}</p>
                <ul className="pv-report-list" role="list">
                  {ws.reports.keys.map(k => (
                    <li key={k}>
                      <ReportName k={k} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pv-decision">
                <p className="pv-label">{C.decision[locale]}</p>
                <p>{ws.reports.decision[locale]}</p>
                <NavLink path="/modules/reports" className="pv-link">
                  {C.allReports[locale]}
                  <Arrow aria-hidden="true" />
                </NavLink>
              </div>
            </div>
          )}
        </div>

        <div className="pv-ws-foot">
          <Button variant="outline" onClick={ask}>
            {C.askWorkspace[locale]}
          </Button>
        </div>
      </div>
      {box.node}
    </section>
  );
}
