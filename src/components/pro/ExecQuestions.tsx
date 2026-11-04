import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { Check, FileText, Hourglass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';
import { ProScreen, useSectionLightbox } from './ProScreens';
import { SectionShell, type SectionProps } from './ProSections';
import { ReportName } from './ProWorkspace';
import { useAskDemo } from './use-ask-demo';

/**
 * The twelve executive questions as a vertical question rail and an answer panel: where the answer is read, the
 * source records and native reports, the decision, and what answers it today (a verified screen or a native report).
 */
export function QuestionsSection({ s, title, lede, eyebrow }: SectionProps<'questions'>) {
  const locale = useLocale();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const box = useSectionLightbox(s.items.map(q => q.shot));
  const ask = useAskDemo();
  // `#pv-q-EXE-xx` (linked from the /pro hub) opens that question.
  const hash = useRouterState({ select: st => st.location.hash });
  useEffect(() => {
    const i = s.items.findIndex(item => hash.replace(/^#/, '') === `pv-q-${item.id}`);
    if (i < 0) return;
    setActive(i);
    document.getElementById(`pv-${s.id}`)?.scrollIntoView({ block: 'start' });
  }, [hash, s.items, s.id]);
  const q = s.items[active] ?? s.items[0];
  if (!q) return null;
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % s.items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + s.items.length) % s.items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = s.items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <SectionShell id={s.id} kind="questions" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <div className="pv-exec">
        <div role="tablist" aria-orientation="vertical" aria-label={title} className="pv-exec-rail">
          {s.items.map((item, i) => (
            <button
              key={item.id}
              ref={el => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`pv-q-${item.id}`}
              aria-selected={i === active}
              aria-controls="pv-q-panel"
              tabIndex={i === active ? 0 : -1}
              className="pv-exec-q"
              onClick={() => setActive(i)}
              onKeyDown={e => onKey(e, i)}
            >
              <span dir="ltr">{String(i + 1).padStart(2, '0')}</span>
              {item.question[locale]}
            </button>
          ))}
        </div>
        <div role="tabpanel" id="pv-q-panel" aria-labelledby={`pv-q-${q.id}`} className="pv-exec-panel">
          <p className="pv-eyebrow">
            {C.question[locale]} <span dir="ltr">{String(active + 1).padStart(2, '0')} / 12</span>
          </p>
          <h3>{q.question[locale]}</h3>
          <dl>
            <div>
              <dt>{C.view[locale]}</dt>
              <dd>{q.view[locale]}</dd>
            </div>
            <div>
              <dt>{C.sources[locale]}</dt>
              <dd>{q.sources[locale]}</dd>
            </div>
            <div>
              <dt>{C.decision[locale]}</dt>
              <dd>{q.decision[locale]}</dd>
            </div>
            <div>
              <dt>{C.answeredBy[locale]}</dt>
              <dd>
                <span className="pv-badge" data-tier="available">
                  {q.status === 'screen' ? <Check aria-hidden="true" /> : <FileText aria-hidden="true" />}
                  {q.status === 'screen' ? C.screenAnswer[locale] : C.reportAnswer[locale]}
                </span>
              </dd>
            </div>
          </dl>
          {q.reports.length > 0 && (
            <ul className="pv-report-list" role="list">
              {q.reports.map(k => (
                <li key={k}>
                  <ReportName k={k} />
                </li>
              ))}
            </ul>
          )}
          {q.shot && <ProScreen key={q.id} refId={q.shot} size="lead" open={box.open} />}
          <p className="pv-exec-status">
            <Hourglass aria-hidden="true" />
            {C.cardStatus[locale]}
          </p>
          <Button variant="outline" onClick={() => ask({ department: '', topic: q.id, interest: q.question[locale] })}>
            {C.askQuestion[locale]}
          </Button>
        </div>
      </div>
      {box.node}
    </SectionShell>
  );
}
