/** Owner round H1–H3: section-specific HR blocks hosted by the same Core Dashboard Designer as every other overview.
 *  Enterprise owns the visual pieces; these widgets only bind the HR read models to the section and company filter. */
import type { ReactNode } from "react";
import type { WidgetDef } from "@/lib/dashboards/registry";
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import type { HrOvCtx } from "./OverviewFrame";
import { EmployeeOrg } from "./EmployeeOrg";
import { LeaveBalancePanel, LeaveLosePanel, LeaveYearPanel } from "./panels/LeavePanels";
import { DayHoursHr, ShiftRosterHr } from "./panels/TimePanels";
import { RunReviewList, RunStripPanel, RunSummaryPanel } from "./panels/PayPanels";

type Bi = [string, string];
type PanelProps = { ar: boolean; on: string; company?: string | undefined };
const canRead = (sources: string[]) => () => sources.some((dt) => { try { scopedList(dt); return true; } catch { return false; } });
function panel(id: string, title: Bi, meaning: Bi, sources: string[], render: (p: PanelProps) => ReactNode): WidgetDef<HrOvCtx> {
  return { id: `p:${id}`, version: 1, title, meaning, sources, shape: "panel", defaultView: "panel", size: { w: 12 }, group: ["People and work", "الأشخاص والعمل"], readable: canRead(sources),
    render: (c, o) => render({ ar: c.ar, on: c.on, company: o["company"] || undefined }) };
}

export const SECTION_PANELS: Record<string, WidgetDef<HrOvCtx>[]> = {
  "01.1": [panel("org-chart", ["Organisation chart", "الهيكل التنظيمي"], ["Active employees in the selected company, their managers, department colour and nationality; zoom, fold and export.", "الموظفون النشطون في الشركة المحددة ومديروهم ولون القسم والجنسية؛ مع التكبير والطي والتصدير."], ["Employee"], (p) => <EmployeeOrg company={p.company} />)],
  "03.1": [
    panel("leave-balances", ["Leave balances", "أرصدة الإجازات"], ["One card per leave type for the selected employee; the annual calculation opens its native leave-ledger rows.", "بطاقة لكل نوع إجازة للموظف المحدد؛ وطريقة حساب الرصيد السنوي تفتح أسطر دفتر الإجازات الأصلية."], ["Leave Allocation", "Leave Application", "Leave Ledger Entry"], (p) => <LeaveBalancePanel {...p} />),
    panel("leave-year", ["Year leave calendar", "تقويم إجازات السنة"], ["Approved and requested leave across twelve months with team overlap by day.", "الإجازات المعتمدة والمطلوبة خلال اثني عشر شهرًا مع تداخل الفريق يومًا بيوم."], ["Leave Application", "Employee"], (p) => <LeaveYearPanel {...p} />),
    panel("leave-lose", ["Balance to be lost", "سيفقد الرصيد"], ["Carried-forward balances above the cap whose allocation period ends inside the warning window.", "أرصدة الترحيل فوق الحد التي تنتهي فترة تخصيصها خلال نافذة التنبيه."], ["Leave Allocation", "Leave Application", "Leave Type"], (p) => <LeaveLosePanel {...p} />),
  ],
  "03.2": [panel("day-hours", ["Day by the hour", "اليوم ساعة بساعة"], ["Scheduled shift against first check-in and last check-out per employee, with late and early marks beyond grace.", "الوردية المجدولة مقابل أول دخول وآخر خروج لكل موظف، مع علامات التأخر والخروج المبكر بعد مهلة السماح."], ["Employee Checkin", "Employee", "Shift Type"], (p) => <DayHoursHr {...p} />)],
  "03.3": [panel("shift-roster", ["Weekly shift roster", "جدول الورديات الأسبوعي"], ["Seven days per employee with leave and rest days, daily cost for salary readers, and overtime in red.", "سبعة أيام لكل موظف مع الإجازات والراحة، والتكلفة اليومية لمن يملك صلاحية الرواتب، والعمل الإضافي بالأحمر."], ["Shift Assignment", "Employee", "Overtime Slip", "Leave Application"], (p) => <ShiftRosterHr {...p} />)],
  "04.1": [
    panel("run-strip", ["Twelve-month payroll runs", "مسيرات اثني عشر شهرًا"], ["Posted runs are green only when the submitted run has its accrual journal; drafts and missing months stay distinct.", "المسير المرحّل أخضر فقط عندما يكون للمسير المعتمد قيد استحقاق؛ والمسودات والشهور بلا مسير منفصلة."], ["Payroll Entry", "Salary Slip", "Journal Entry"], (p) => <RunStripPanel {...p} />),
    panel("run-summary", ["Pay-run summary", "ملخص مسير الرواتب"], ["Five totals from the run's salary slips, every employee row, edited values and the review drawer.", "خمسة إجماليات من قسائم المسير، وكل صف موظف والقيم المعدلة ولوحة المراجعة."], ["Payroll Entry", "Salary Slip"], (p) => <RunSummaryPanel {...p} />),
  ],
  "04.2": [panel("run-reviews", ["Payroll runs to review", "مسيرات تحتاج المراجعة"], ["Employer cost, net pay, liabilities, files, issue reporting and native payroll approval for each run.", "تكلفة صاحب العمل وصافي الرواتب والالتزامات والملفات والإبلاغ عن مشكلة واعتماد المسير الأصلي لكل مسير."], ["Payroll Entry", "Salary Slip", "Journal Entry"], (p) => <RunReviewList {...p} />)],
};
