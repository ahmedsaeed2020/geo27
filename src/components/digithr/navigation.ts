/** Presentation-only placement registry. Destination routes and source registries remain unchanged. */
import NAV from '@/plugins/digit_hr/nav';
import NATIVE from '@/plugins/digit_hr/nativeMap';
import { quickDocs } from '@/plugins/digit_hr/v6/nav';
import { REPORTS } from '@/plugins/digit_hr/v5/data';

export const HR_PAGES = [
  { to: '/digit-hr/organization', section: '01.1', ar: 'الهيكل التنظيمي', en: 'Organization' },
  { to: '/digit-hr/employees', section: '01.4', ar: 'دليل الموظفين وملف 360', en: 'Employee directory & 360' },
  { to: '/digit-hr/lifecycle', section: '01.5', ar: 'رحلة الموظف', en: 'Employee lifecycle' },
  { to: '/digit-hr/separation', section: '01.5', ar: 'إنهاء الخدمة', en: 'Separation' },
  { to: '/digit-hr/documents', section: '01.6', ar: 'الوثائق والتجديد', en: 'Documents & renewals' },
  { to: '/digit-hr/hiring', section: '02.1', ar: 'التوظيف', en: 'Hiring' },
  { to: '/digit-hr/talent', section: '02.3', ar: 'المواهب', en: 'Talent' },
  { to: '/digit-hr/leave', section: '03.1', ar: 'الإجازات', en: 'Leave' },
  { to: '/digit-hr/workforce', section: '03.2', ar: 'الورديات والحضور', en: 'Shifts & attendance' },
  { to: '/digit-hr/payroll', section: '04.1', ar: 'دورة الرواتب', en: 'Payroll cycle' },
  { to: '/digit-hr/compliance', section: '04.3', ar: 'الامتثال السعودي', en: 'Saudi compliance' },
  { to: '/digit-hr', section: '06.1', ar: 'مركز عمليات الموارد البشرية', en: 'HR Operations' },
  { to: '/digit-hr/insights', section: '06.3', ar: 'مؤشرات القوى العاملة', en: 'Workforce insights' },
  { to: '/digit-hr/reports', section: '06.3', ar: 'مركز التقارير', en: 'Report Center' },
] as const;

export const REPORT_PARENT: Record<string, string> = {
  'NR-01':'02.3', 'NR-02':'04.5', 'NR-03':'06.3', 'NR-04':'01.4', 'NR-05':'01.5',
  'NR-06':'06.2', 'NR-07':'01.4', 'NR-08':'03.1', 'NR-09':'03.1', 'NR-10':'03.2',
  'NR-11':'03.1', 'NR-12':'03.2', 'NR-13':'06.2', 'NR-14':'02.1', 'NR-15':'03.3',
  'NR-16':'05.1', 'NR-17':'06.3', 'NR-18':'04.4', 'NR-19':'04.2', 'NR-20':'04.4',
  'NR-21':'04.1', 'NR-22':'04.1', 'NR-23':'04.2', 'NR-24':'04.2', 'NR-25':'04.1',
};
export const HR_REPORT_LINKS = REPORTS.map(r => ({ ...r, section: REPORT_PARENT[r.id] ?? '06.3' }));
export const HR_MENU = NAV.map(module => ({
  ...module,
  sections: module.subs.map(section => {
    const docs = [...(NATIVE[section.id] ?? [])];
    // Preserve featured shortcuts even when their source mapping belongs to another module.
    for (const doc of quickDocs(module.id)) {
      const owner = module.subs.find(sub => (NATIVE[sub.id] ?? []).some(d => d.doctype === doc.doctype))?.id ?? module.subs[0]?.id;
      if (owner === section.id && !docs.some(d => d.doctype === doc.doctype)) docs.push(doc);
    }
    return { ...section, docs, pages: HR_PAGES.filter(p => p.section === section.id), reports: HR_REPORT_LINKS.filter(r => r.section === section.id) };
  }),
}));

export function menuSectionFor(path: string, remembered?: string | null): string | undefined {
  const section = path.match(/^\/digit-hr\/s\/([^/]+)/)?.[1];
  if (section) return decodeURIComponent(section);
  if (path.startsWith('/digit-hr/positions/')) return '01.3';
  if (path.startsWith('/digit-hr/applicants/')) return '02.1';
  if (path.startsWith('/digit-hr/contracts/')) return '01.6';
  if (path.startsWith('/digit-hr/cases/')) return '05.3';
  if (path.startsWith('/digit-hr/metrics/')) return '06.3';
  const page = HR_PAGES.find(p => path === p.to || (p.to !== '/digit-hr' && path.startsWith(p.to + '/')));
  if (page) return page.section;
  const report = path.match(/^\/report\/(.+)$/)?.[1];
  if (report) return HR_REPORT_LINKS.find(r => r.report === decodeURIComponent(report))?.section;
  const native = path.match(/^\/app\/([^/]+)\/([^/]+)/);
  if (!native) return undefined;
  const owns = (id: string) => HR_MENU.flatMap(m => m.sections).find(s => s.id === id)?.docs.some(d => d.app === native[1] && d.slug === native[2]);
  if (remembered && owns(remembered)) return remembered;
  return HR_MENU.flatMap(m => m.sections).find(s => owns(s.id))?.id;
}