import { useEffect, useId, useMemo, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NavLink } from '@/components/nav/nav-links';
import { REPORT_CATEGORIES, REPORTS, reportByKey, type ReportCategory } from '@/content/pro/reports';
import { useLocale } from '@/lib/i18n';
import { PRO_COPY as C } from './pro-copy';
import { ProScreen, useSectionLightbox } from './ProScreens';
import { SectionShell, type SectionProps } from './ProSections';

/** Featured reports: each explains its question, audience, source records, filters and the decision it serves. */
export function ReportFeatureSection({ s, title, lede, eyebrow }: SectionProps<'report-feature'>) {
  const locale = useLocale();
  const box = useSectionLightbox(s.items.map(i => i.shot));
  return (
    <SectionShell id={s.id} kind="report-feature" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]}>
      <ol className="pv-rfeat">
        {s.items.map((item, i) => {
          const r = reportByKey(item.key);
          return (
            <li key={item.key} data-motion-card="">
              <div className="pv-rfeat-head">
                <span className="pv-rfeat-no" dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{locale === 'ar' ? r?.ar : item.key}</h3>
                  {locale === 'ar' && <span className="pv-sys" dir="ltr">{item.key}</span>}
                </div>
              </div>
              <p className="pv-rfeat-q">{item.question[locale]}</p>
              <dl>
                <div>
                  <dt>{C.role[locale]}</dt>
                  <dd>{item.role[locale]}</dd>
                </div>
                <div>
                  <dt>{C.records[locale]}</dt>
                  <dd>{item.records[locale]}</dd>
                </div>
                <div>
                  <dt>{C.filters[locale]}</dt>
                  <dd>{item.filters[locale]}</dd>
                </div>
                <div>
                  <dt>{C.decision[locale]}</dt>
                  <dd>{item.decision[locale]}</dd>
                </div>
              </dl>
              <ProScreen refId={item.shot} size="card" caption={false} open={box.open} />
              <p className="pv-note">{item.shotNote[locale]}</p>
            </li>
          );
        })}
      </ol>
      {box.node}
    </SectionShell>
  );
}

/** The full report directory: search by Arabic or interface name, filter by department. */
export function ReportDirectorySection({ s, title, lede, eyebrow }: SectionProps<'report-directory'>) {
  const locale = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ReportCategory | 'all'>('all');
  const searchId = useId();
  // `#reports-<category>` (linked from the /pro hub) opens the directory filtered to that department.
  const hash = useRouterState({ select: st => st.location.hash });
  useEffect(() => {
    const id = hash.replace(/^#?reports-/, '');
    if (!hash.includes('reports-') || !REPORT_CATEGORIES.some(c => c.id === id)) return;
    setCategory(id as ReportCategory);
    document.getElementById(`pv-${s.id}`)?.scrollIntoView({ block: 'start' });
  }, [hash, s.id]);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(
    () => REPORTS.filter(r => (category === 'all' || r.category === category) && (!normalized || r.key.toLowerCase().includes(normalized) || r.ar.includes(query.trim()))),
    [category, normalized, query],
  );
  const groups = REPORT_CATEGORIES.map(c => ({ ...c, items: visible.filter(r => r.category === c.id) })).filter(g => g.items.length);
  return (
    <SectionShell id={s.id} kind="report-directory" title={title} eyebrow={eyebrow} lede={lede || s.lede[locale]} tone="soft">
      <div className="pv-dir-tools">
        <label className="pv-dir-search" htmlFor={searchId}>
          <Search aria-hidden="true" />
          <span className="sr-only">{C.searchReports[locale]}</span>
          <Input id={searchId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={C.searchReports[locale]} autoComplete="off" />
        </label>
        <div className="pv-chips" role="radiogroup" aria-label={C.allCategories[locale]}>
          {(['all', ...REPORT_CATEGORIES.map(c => c.id)] as const).map(id => (
            <button key={id} type="button" role="radio" aria-checked={category === id} className="pv-chip" onClick={() => setCategory(id)}>
              {id === 'all' ? C.allCategories[locale] : REPORT_CATEGORIES.find(c => c.id === id)?.label[locale]}
            </button>
          ))}
        </div>
        <p className="pv-dir-count" aria-live="polite">
          <span dir="ltr">{visible.length}</span> {C.reportsShown[locale]}
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="pv-empty">{C.noReports[locale]}</p>
      ) : (
        <div className="pv-dir">
          {groups.map(g => (
            <div key={g.id} className="pv-dir-group">
              <div className="pv-dir-group-head">
                <h3>{g.label[locale]}</h3>
                <span dir="ltr">{g.items.length}</span>
                {g.dept && (
                  <NavLink path={g.dept} className="pv-link">
                    {C.departmentPage[locale]}
                    <Arrow aria-hidden="true" />
                  </NavLink>
                )}
              </div>
              <ul role="list">
                {g.items.map(r => (
                  <li key={r.key}>
                    <span>{locale === 'ar' ? r.ar : r.key}</span>
                    {locale === 'ar' && <span className="pv-sys" dir="ltr">{r.key}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
