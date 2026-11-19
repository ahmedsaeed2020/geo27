/**
 * How the preview can run an HR source report, derived from the Core report route (src/routes/report.$name.tsx):
 * Employee Information/Analytics use EmployeeReports; names in RUNNERS use a local port of the source execute();
 * every other Script/Query Report needs the Frappe server (the preview lists source records only, no totals).
 * Derived at render time so the badge cannot drift from what the report page actually does.
 */
import { RUNNERS } from '@/lib/reportRunner';

/** Mirrors the report route's EmployeeReports branch. */
export const EMPLOYEE_REPORT_VIEWS = ['Employee Information', 'Employee Analytics'] as const;

export type HrReportMode = 'computed' | 'server';

export function hrReportMode(report: string): HrReportMode {
  return (EMPLOYEE_REPORT_VIEWS as readonly string[]).includes(report) || !!RUNNERS[report] ? 'computed' : 'server';
}
