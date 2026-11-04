import type { ReactNode } from 'react';
import { NavLink } from '@/components/nav/nav-links';
import { useCmsPage } from '@/components/cms/CmsContext';
import { useScrollEdges } from '@/hooks/use-scroll-edges';
import { PRO_PAGES, type ProPageConfig } from '@/content/pro/pro-pages';
import type { ProPageContent, ProSection } from '@/content/pro/types';
import type { CmsContent } from '@/lib/cms-schema';
import { useLocale } from '@/lib/i18n';
import { resolveProSections, type ResolvedProSection } from '@/lib/pro-sections';
import { PRO_COPY as C } from './pro-copy';
import ProWorkspace from './ProWorkspace';
import {
  AnatomySection,
  ChapterSection,
  ConnectionsSection,
  CtaSection,
  DecisionsSection,
  FeaturesSection,
  FlowSection,
  IntroSection,
  LayersSection,
  LifecycleSection,
  MatchSection,
  MosaicSection,
  ScopeSection,
  type SectionProps,
} from './ProSections';
import { ReportDirectorySection, ReportFeatureSection } from './ReportCenter';
import { ExplorerSection } from './CapabilityExplorer';
import { QuestionsSection } from './ExecQuestions';
import '@/pro-pages.css';

type AnyProps = SectionProps<ProSection['kind']>;
const RENDERERS: { [K in Exclude<ProSection['kind'], 'workspace'>]: (p: SectionProps<K>) => ReactNode } = {
  intro: IntroSection,
  flow: FlowSection,
  anatomy: AnatomySection,
  match: MatchSection,
  lifecycle: LifecycleSection,
  mosaic: MosaicSection,
  decisions: DecisionsSection,
  connections: ConnectionsSection,
  features: FeaturesSection,
  'report-feature': ReportFeatureSection,
  'report-directory': ReportDirectorySection,
  layers: LayersSection,
  questions: QuestionsSection,
  chapter: ChapterSection,
  explorer: ExplorerSection,
  scope: ScopeSection,
  cta: CtaSection,
};

/** DIGIT Pro pages switcher: the five departments, then the report center and the cross-department areas. */
export function ProPagesNav({ current }: { current: string }) {
  const locale = useLocale();
  const ref = useScrollEdges<HTMLDivElement>();
  return (
    <nav className="dp-siblings pv-siblings" aria-label={C.otherAreas[locale]}>
      <div className="dp-wrap" ref={ref}>
        <span className="dp-siblings-label">DIGIT Pro</span>
        <ul role="list">
          {PRO_PAGES.map(p => (
            <li key={p.key} data-group={p.kind === 'department' ? 'department' : 'area'}>
              <NavLink path={p.path} aria-current={p.key === current ? 'page' : undefined}>
                {p.label[locale]}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** Workspace index under the department intro: four anchors, each with the question its workspace answers. */
function WorkspaceIndex({ items }: { items: ResolvedProSection[] }) {
  const locale = useLocale();
  return (
    <nav className="pv-ws-index-nav" aria-label={C.workspaces[locale]}>
      <div className="dp-wrap">
        <p className="pv-label">{C.workspaces[locale]}</p>
        <ol>
          {items.map((r, i) => (
            <li key={r.section.id}>
              <a href={`#pv-${r.section.id}`}>
                <span dir="ltr">{String(i + 1).padStart(2, '0')}</span>
                <strong>{r.title}</strong>
                {r.section.kind === 'workspace' && <span>{r.section.ws.question[locale]}</span>}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

type Props = { config: ProPageConfig; content: ProPageContent; cms?: CmsContent | null | undefined; nav?: boolean };

/**
 * Source sections of a DIGIT Pro V4 page, in CMS order (hidden sections skipped, headings overridable). Used inside
 * the imported department routes, on the four /pro area pages and in the admin preview.
 */
export default function ProPageBody({ config, content, cms: given, nav = true }: Props) {
  const locale = useLocale();
  const fromContext = useCmsPage();
  const cms = given === undefined ? fromContext : given;
  const resolved = resolveProSections(config, content, cms, locale);
  const workspaces = resolved.filter(r => r.section.kind === 'workspace');
  const department = config.kind === 'department' ? config.key : '';
  const rail = content.sections.find((s): s is Extract<ProSection, { kind: 'intro' }> => s.kind === 'intro')?.rail;
  let wsIndex = 0;
  const out: ReactNode[] = [];
  resolved.forEach((r, i) => {
    const common = { title: r.title, lede: r.lede, eyebrow: r.eyebrow, shotId: r.shotId, department, pageKey: config.key };
    if (r.section.kind === 'workspace') {
      out.push(
        <ProWorkspace
          key={r.section.id}
          id={r.section.id}
          ws={r.section.ws}
          title={r.title}
          lede={r.lede}
          eyebrow={r.eyebrow}
          shotId={r.shotId}
          index={wsIndex}
          total={workspaces.length}
          rail={rail}
          department={department}
          flip={wsIndex % 2 === 1}
        />,
      );
      wsIndex += 1;
    } else {
      const Render = RENDERERS[r.section.kind] as (p: AnyProps) => ReactNode;
      out.push(<Render key={r.section.id} {...({ s: r.section, ...common } as AnyProps)} />);
    }
    // The workspace index follows the intro (or opens the page when the intro is hidden).
    const next = resolved[i + 1];
    if (workspaces.length > 1 && r.section.kind === 'intro' && next) out.push(<WorkspaceIndex key="pv-ws-index" items={workspaces} />);
  });
  if (workspaces.length > 1 && !resolved.some(r => r.section.kind === 'intro')) out.unshift(<WorkspaceIndex key="pv-ws-index" items={workspaces} />);
  // .pv-root scopes the V4 styles above the imported page's own element rules.
  return (
    <div className="pv-root">
      {nav && <ProPagesNav current={config.key} />}
      {/* The imported hero's "see it from inside" link targets #inside; the V4 chapters replace that section. */}
      <div className="pv-page" id={config.replaces?.includes('inside') ? 'inside' : undefined} data-signature={config.signature} data-pro-page={config.key}>
        {out}
      </div>
    </div>
  );
}
