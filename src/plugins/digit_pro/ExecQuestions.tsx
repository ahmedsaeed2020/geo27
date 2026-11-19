/**
 * The 12 DIGIT Pro executive questions (audit G06 / integration G17) — Run11.1 PART_C_EXECUTIVE_12.
 * Titles, formulas and sources are copied from digit_pro-main/digit_pro/insights.py spec("EXE-01".."EXE-12")
 * (inspected 2026-11-09). Each answer is computed in the preview by execAnswers.ts from the same defined workspace formulas
 * the department pages show (so the executive figure equals the department figure and drills to the same records); the
 * native source stays one click away. One container ([data-dp-exec-questions]), so a Frappe-host overlay can detect it
 * instead of stacking a second copy.
 */
import { Link } from "@tanstack/react-router";
import { useDevMode } from "@/lib/mode";
import type { Bi } from "./command";
import { bi } from "./CommandUi";
import { NavText, useNavResolver } from "./ProSidebar";
import { targetHref, type NavItem } from "./nav";
import { proServer } from "./run11";
import { execAnswer } from "./execAnswers";
import { sectionCtx } from "./sections";
import { todayIso } from "./finance";
import { currentUser } from "@/lib/session";
import { DrillLink } from "./CommandUi";

export const EXEC_METHOD = "digit_pro.insights.get_executive_questions";
type Src = { kind: "report" | "doctype"; name: string };
export interface ExecQuestion { id: string; title: Bi; formula: Bi; source: Src }
const Q = (id: string, en: string, ar: string, fen: string, far: string, kind: Src["kind"], name: string): ExecQuestion => ({ id, title: [en, ar], formula: [fen, far], source: { kind, name } });

/** Same order, wording and source as the Pro registry. */
export const EXEC_QUESTIONS: ExecQuestion[] = [
  Q("EXE-01", "Revenue trend and gross margin", "اتجاه الإيرادات وهامش الربح", "Net sales of submitted Sales Invoices (returns negative) per month, compared with the same months one year earlier; gross profit from the native Gross Profit report.", "صافي المبيعات المفوترة شهريًا ومقارنة بنفس الفترة من العام السابق؛ إجمالي الربح من تقرير إجمالي الربح الأصلي.", "report", "Sales Analytics"),
  Q("EXE-02", "Liquidity and due-date exposure", "السيولة والاستحقاقات", "Cash and bank balance as of the date (actual) with receivables and payables due in the next 30 days (projected, shown separately).", "رصيد النقد الفعلي مع المقبوضات والمدفوعات المجدولة خلال 30 يومًا (متوقعة ومنفصلة).", "report", "General Ledger"),
  Q("EXE-03", "Sales commitments still to deliver", "طلبات بيع بانتظار التسليم", "Submitted Sales Orders not fully delivered: undelivered value, split into not started, partial and late, and on time.", "طلبات البيع المفتوحة غير المسلّمة بالكامل وقيمتها غير المسلّمة.", "report", "Sales Order Analysis"),
  Q("EXE-04", "Delivered but not invoiced", "مُسلّم غير مفوتر", "Submitted Delivery Notes (not returns) that are not fully billed, by age.", "أذون التسليم غير المفوترة حسب العمر.", "report", "Delivered Items To Be Billed"),
  Q("EXE-05", "Purchase commitments and expediting", "التزامات الشراء والمتابعة", "Open purchase order value not yet billed or received, and lines past their scheduled date.", "قيمة أوامر الشراء المفتوحة غير المفوترة أو غير المستلمة والأسطر المتأخرة.", "report", "Purchase Order Analysis"),
  Q("EXE-06", "Received but not billed", "مستلم غير مفوتر", "Value of submitted Purchase Receipts not yet billed (native Received Items To Be Billed basis).", "قيمة الاستلامات غير المفوترة.", "report", "Received Items To Be Billed"),
  Q("EXE-07", "Available, reserved and projected inventory", "المخزون المتاح والمحجوز والمتوقع", "Warehouse balances of the company: actual, reserved, ordered and projected quantity; shortage = items with projected quantity below zero.", "كميات المخزون الفعلية والمحجوزة والمطلوبة والمتوقعة ونواقص الكمية المتوقعة.", "report", "Stock Projected Qty"),
  Q("EXE-08", "Aged inventory and expiry risk", "المخزون المتقادم ومخاطر الصلاحية", "Stock value by age range (0-30, 31-60, 61-90, 90+ days) from the native Stock Ageing report; expiry risk from batch expiry dates.", "قيمة المخزون حسب العمر من تقرير تقادم المخزون الأصلي ومخاطر انتهاء الصلاحية.", "report", "Stock Ageing"),
  Q("EXE-09", "Stock ledger versus GL", "دفتر المخزون مقابل الأستاذ", "Stock ledger value minus the balance of the stock accounts in the general ledger as of the date (warehouse balances shown as well).", "قيمة دفتر المخزون مقابل حسابات المخزون في الأستاذ.", "doctype", "Stock Ledger Entry"),
  Q("EXE-10", "Asset NBV and scheduled vs posted depreciation", "صافي القيمة الدفترية والإهلاك", "Net book value as of the date; per finance book the posted, due-but-unposted and future depreciation (books are never added together).", "صافي القيمة الدفترية والإهلاك المرحّل والمستحق لكل دفتر مالي.", "report", "Asset Depreciations and Balances"),
  Q("EXE-11", "Approval backlog", "تراكم الموافقات", "Open workflow approvals the reader may act on, by document type and age.", "الموافقات المفتوحة التي يحق للمستخدم تنفيذها حسب النوع والعمر.", "doctype", "Workflow Action"),
  Q("EXE-12", "Finance close readiness", "جاهزية الإقفال والاستثناءات", "Close checklist steps, trial balance check and stock-to-GL difference; nothing is closed automatically.", "خطوات الإقفال وفحص ميزان المراجعة وفرق المخزون والأستاذ؛ لا إقفال تلقائي.", "doctype", "Accounting Period"),
];

export function ExecQuestions({ company, currency, ar }: { company: string; currency?: string; ar: boolean }) {
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const dev = useDevMode();
  const r = useNavResolver();
  const server = proServer(EXEC_METHOD);
  const ctx = sectionCtx(company, currency || "SAR", todayIso()); const user = currentUser();
  return <section className="dp-cc-panel" data-dp-exec-questions={EXEC_QUESTIONS.length} data-server-state={server.state}>
    <div className="dp-cc-panel-h flex-wrap">
      <h2>{t("Executive questions", "الأسئلة التنفيذية")}</h2><span className="dp-cc-badge" data-no-i18n>{EXEC_QUESTIONS.length}</span>
      <span className="dp-cc-note w-full">{t("Each answer uses the same formula as its department page. Click a figure to open exactly the records behind it.", "كل إجابة تستخدم نفس معادلة صفحة القسم. اضغط على الرقم لفتح السجلات التي يقوم عليها بالضبط.")}</span>
      {dev && <code className="w-full text-[10px] text-muted-foreground" dir="ltr" data-no-i18n>{EXEC_METHOD}</code>}
    </div>
    <ol className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">{EXEC_QUESTIONS.map((q, i) => {
      const item: NavItem = q.source.kind === "report"
        ? { label: q.source.name, target: { kind: "report", report: q.source.name } }
        : { label: q.source.name, target: { kind: "doctype", doctype: q.source.name } };
      const st = r.state(item); const h = st === "ok" ? targetHref(item.target, r.appOf) : undefined;
      const search = q.source.kind === "report" ? { filters: JSON.stringify({ company }) } : undefined;
      return <li key={q.id} className="flex flex-col gap-1 rounded-md border border-border bg-card p-3" data-dp-exec-question={q.id}>
        <span className="text-sm font-medium"><span className="me-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 align-middle text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{i + 1}</span>{bi(ar, q.title)}{dev && <bdi className="ms-2 font-mono text-[10px] text-muted-foreground" data-no-i18n>{q.id}</bdi>}</span>
        <span className="text-xs text-muted-foreground">{bi(ar, q.formula)}</span>
        <span className="mt-1 flex flex-wrap gap-1.5" data-dp-exec-answer={q.id}>{execAnswer(q.id, ctx, user, ar).map((f) => f.status === "denied" || f.status === "unavailable"
          ? <span key={f.key} className="hidden" data-dp-exec-figure-state={f.status} />
          : f.drill ? <DrillLink key={f.key} drill={f.drill} className="dp-exec-fig rounded border border-border bg-background px-2 py-1 text-xs hover:border-primary" data-dp-exec-figure={f.key} data-status={f.status}>
              <span className="block text-[11px] text-muted-foreground">{bi(ar, f.label)}</span><bdi className="font-semibold tabular-nums" data-no-i18n>{f.text}</bdi></DrillLink>
            : <span key={f.key} className="rounded border border-border px-2 py-1 text-xs" data-dp-exec-figure={f.key}>{bi(ar, f.label)} <bdi data-no-i18n>{f.text}</bdi></span>)}</span>
        <span className="mt-auto pt-1 text-xs">
          {h ? <Link to={h.to as never} params={h.params as never} search={(search ?? h.search ?? {}) as never} className="text-primary hover:underline" data-dp-exec-question-source={q.source.name}>
            {t("Open the source", "فتح المصدر")}: <NavText label={q.source.name} /> {ar ? "←" : "→"}</Link>
            : <span className="text-muted-foreground" data-dp-exec-question-source-state={st}><NavText label={q.source.name} /> · <NavText label={st === "denied" ? "Not Permitted" : "Unavailable"} /></span>}
        </span>
      </li>;
    })}</ol>
  </section>;
}
