import { ArrowLeft, ArrowRight, Check, FileBarChart2, Hourglass } from 'lucide-react';
import { NavLink } from '@/components/nav/nav-links';
import { SectionHeading } from '@/components/cms/SectionText';
import { EXPLORE_BY_ROLE, type L } from '@/content/catalog';
import cfo from '@/content/pro/pages/cfo';
import { REPORTS, REPORT_CATEGORIES } from '@/content/pro/reports';
import type { ExecQuestion } from '@/content/pro/types';
import { useLocale } from '@/lib/i18n';

/**
 * /pro hub band: start from an executive question, a role or the report center. Questions come from the CFO page
 * content (verified screens first), roles from the shared explore-by-role menu, and the report count from the
 * runnable report directory, so the hub never states more than the pages behind it.
 */
const COPY = {
  eyebrow: { ar: 'مسارات DIGIT Pro', en: 'DIGIT Pro paths' },
  title: { ar: 'ابدأ من سؤالك، أو من دورك، أو من التقرير', en: 'Start from your question, your role or the report' },
  lede: {
    ar: 'كل مسار يفتح الصفحة التي تجيب عنه بشاشات حقيقية: أسئلة المدير المالي، ومساحات العمل حسب الدور، ومركز التقارير.',
    en: 'Each path opens the page that answers it with real screens: CFO questions, workspaces by role, and the report center.',
  },
  questions: { ar: 'أسئلة المدير المالي', en: 'CFO questions' },
  allQuestions: { ar: 'كل الأسئلة الاثني عشر', en: 'All twelve questions' },
  screen: { ar: 'شاشة متاحة', en: 'Screen available' },
  report: { ar: 'عبر التقارير', en: 'Through reports' },
  roles: { ar: 'حسب الدور', en: 'By role' },
  reports: { ar: 'مركز التقارير', en: 'Report center' },
  reportsCount: { ar: 'تقريرًا أصليًا يعمل اليوم، بأسمائه العربية والإنجليزية', en: 'native reports running today, with Arabic and English names' },
  openReports: { ar: 'افتح فهرس التقارير', en: 'Open the report directory' },
} satisfies Record<string, L>;

const questions: ExecQuestion[] = (() => {
  const section = cfo.sections.find(s => s.kind === 'questions');
  const items = section && section.kind === 'questions' ? section.items : [];
  return [...items.filter(q => q.status === 'screen'), ...items.filter(q => q.status !== 'screen')].slice(0, 4);
})();

const roles = EXPLORE_BY_ROLE.filter(r => r.path.startsWith('/modules/') || r.path.startsWith('/pro/'));

export default function ProHubPaths() {
  const locale = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const perCategory = REPORT_CATEGORIES.map(c => ({ ...c, n: REPORTS.filter(r => r.category === c.id).length })).filter(c => c.n > 0);
  return (
    <section className="ph ph-paths" aria-labelledby="ph-paths-title" lang={locale}>
      <div className="ph-wrap">
        <header className="ph-head">
          <p className="ph-eyebrow">{COPY.eyebrow[locale]}</p>
          <SectionHeading k="paths" id="ph-paths-title" className="ph-title">
            {COPY.title[locale]}
          </SectionHeading>
          <p className="ph-summary">{COPY.lede[locale]}</p>
        </header>
        <div className="ph-paths-grid">
          <div className="ph-paths-col" data-motion-card="">
            <p className="ph-label">{COPY.questions[locale]}</p>
            <ol role="list" className="ph-q">
              {questions.map(q => (
                <li key={q.id}>
                  <strong>{q.question[locale]}</strong>
                  <span className="ph-q-status" data-status={q.status}>
                    {q.status === 'screen' ? <Check aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
                    {(q.status === 'screen' ? COPY.screen : COPY.report)[locale]}
                  </span>
                </li>
              ))}
            </ol>
            <NavLink path="/pro/cfo-decisions" className="ph-link">
              {COPY.allQuestions[locale]}
              <Arrow aria-hidden="true" />
            </NavLink>
          </div>
          <div className="ph-paths-col" data-motion-card="">
            <p className="ph-label">{COPY.roles[locale]}</p>
            <ul role="list" className="ph-roles">
              {roles.map(r => (
                <li key={r.path}>
                  <NavLink path={r.path} className="ph-role">
                    <span>
                      <strong>{r.label[locale]}</strong>
                      {r.summary && <small>{r.summary[locale]}</small>}
                    </span>
                    <Arrow aria-hidden="true" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="ph-paths-col ph-paths-reports" data-motion-card="">
            <p className="ph-label">{COPY.reports[locale]}</p>
            <p className="ph-count-big">
              <FileBarChart2 aria-hidden="true" />
              <span dir="ltr">{REPORTS.length}</span>
            </p>
            <p className="ph-count-copy">{COPY.reportsCount[locale]}</p>
            <ul role="list" className="ph-cats">
              {perCategory.map(c => (
                <li key={c.id}>
                  <NavLink path="/modules/reports" hash={`reports-${c.id}`} className="ph-cat">
                    <span>{c.label[locale]}</span>
                    <span dir="ltr">{c.n}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
            <NavLink path="/modules/reports" className="ph-link">
              {COPY.openReports[locale]}
              <Arrow aria-hidden="true" />
            </NavLink>
          </div>
        </div>
      </div>
    </section>
  );
}
