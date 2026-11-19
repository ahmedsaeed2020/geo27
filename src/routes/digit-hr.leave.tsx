import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { useSources, SourceNotice, DateRange } from "@/components/digithr/workspaces/shared";
import { t as tr } from "@/i18n";
import { DateInput } from "@/components/form/DateInput";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/leave")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Leave & Self-Service Board" },
    { name: "description", content: "Leave balances, approval inbox and upcoming absences from native leave records." },
    { property: "og:title", content: "DIGIT HR — Leave & Self-Service Board" },
    { property: "og:description", content: "Leave balances, approvals and upcoming absences." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: LeaveBoard,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v || 0);

function NativeLink({ dt, name, children }: { dt: string; name?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, "03");
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

function LeaveBoard() {
  const { tx } = useTx();
  const src = useSources(tx);
  useStoreVersion(); useSessionUser();
  const [day, setDay] = useState("");
  useEffect(() => { setDay(new Date().toISOString().slice(0, 10)); }, []);
  const plus30 = day ? new Date(new Date(day).getTime() + 30 * 864e5).toISOString().slice(0, 10) : "";

  const apps = src.rows("Leave Application").filter((a) => num(a.docstatus) !== 2);
  const allocs = src.rows("Leave Allocation").filter((a) => num(a.docstatus) === 1 && s(a.from_date) <= day && s(a.to_date) >= day);
  const pending = apps.filter((a) => s(a.status || "Open") === "Open" && num(a.docstatus) === 0);
  const approved = apps.filter((a) => s(a.status) === "Approved");
  const onLeave = approved.filter((a) => s(a.from_date) <= day && s(a.to_date) >= day);
  const upcoming = approved.filter((a) => s(a.from_date) > day && s(a.from_date) <= plus30).sort((a, b) => s(a.from_date).localeCompare(s(b.from_date)));
  const used = (emp: string, lt: string, from: string, to: string) => approved.filter((a) => num(a.docstatus) === 1 && s(a.employee) === emp && s(a.leave_type) === lt && s(a.from_date) >= from && s(a.to_date) <= to).reduce((x, a) => x + num(a.total_leave_days), 0);
  const balances = allocs.map((a) => { const total = num(a.total_leaves_allocated || a.new_leaves_allocated); const u = used(s(a.employee), s(a.leave_type), s(a.from_date), s(a.to_date)); return { a, total, u, left: total - u }; });
  const totalAlloc = balances.reduce((x, b) => x + b.total, 0);
  const totalLeft = balances.reduce((x, b) => x + b.left, 0);

  const kpi = (ar: string, en: string, v: React.ReactNode, dt?: string) => (
    <div className="dhr-card rounded-[18px] p-4">
      <div className="text-xs opacity-70">{tx(ar, en)}</div>
      <div className="mt-1 text-2xl font-semibold" data-no-i18n>{dt ? src.v(<NativeLink dt={dt}>{v}</NativeLink>, dt) : v}</div>
    </div>
  );
  const card = (ar: string, en: string, body: React.ReactNode) => <section className="dhr-card rounded-[18px] p-4"><h2 className="mb-2 font-semibold">{tx(ar, en)}</h2>{body}</section>;
  const empty = (...dts: string[]) => src.empty(...dts);
  const row = (a: R, right: React.ReactNode) => (
    <li key={s(a.name)} className="flex min-h-11 items-center justify-between gap-2">
      <span data-no-i18n><NativeLink dt="Leave Application" name={s(a.name)}>{s(a.employee_name) || s(a.employee)}</NativeLink> <span className="opacity-60">· {tr(s(a.leave_type))}</span></span>
      {right}
    </li>
  );

  return (
    <DigitHrLayout title={tx("لوحة الإجازات والخدمة الذاتية", "Leave & self-service board")} subtitle={tx("أرصدة الإجازات وصندوق الموافقات والغيابات القادمة من السجلات الأصلية. الأعداد هي السجلات المتاحة لك فقط.", "Leave balances, approval inbox and upcoming absences from native records. Counts are records visible to you only.")} crumbs={[{ label: tx("الإجازات", "Leave") }]}>
      <SourceNotice src={src} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">{tx("اليوم", "Day")}{" "}
          <DateInput value={day} onChange={(e) => setDay(e.target.value)} className="ms-2 min-h-11 rounded-md border bg-background px-2" data-no-i18n />
        </label>
        <NativeLink dt="Leave Application"><span className="dhr-chip">{tx("+ طلب إجازة من الشاشة الأصلية", "+ Apply from native screen")}</span></NativeLink>
        <span className="text-xs opacity-70">{tx("الرصيد محسوب من التخصيصات المعتمدة ناقص الإجازات المعتمدة المرحّلة؛ الترحيل والاستحقاق الدوري يتمان على الخادم.", "Balance = submitted allocations minus submitted approved leave; accrual and carry-forward run on the server.")}</span>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpi("بانتظار الموافقة", "Awaiting approval", pending.length, "Leave Application")}
        {kpi("في إجازة اليوم", "On leave today", src.v(onLeave.length, "Leave Application"))}
        {kpi("قادمة خلال 30 يومًا", "Next 30 days", src.v(upcoming.length, "Leave Application"))}
        {kpi("أيام مخصصة", "Days allocated", totalAlloc, "Leave Allocation")}
        {kpi("أيام متبقية", "Days remaining", src.v(totalLeft, "Leave Allocation", "Leave Application"))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {card("صندوق الموافقات", "Approval inbox", pending.length ? <ul className="divide-y text-sm">{pending.map((a) => row(a, <span className="dhr-chip text-xs" data-no-i18n><DateRange from={a.from_date} to={a.to_date} /> · {num(a.total_leave_days)}</span>))}</ul> : empty("Leave Application"))}
        {card("في إجازة اليوم", "On leave today", onLeave.length ? <ul className="divide-y text-sm">{onLeave.map((a) => row(a, <span className="dhr-chip text-xs" data-no-i18n>{tx("حتى", "until")} {s(a.to_date)}</span>))}</ul> : empty("Leave Application"))}
        {card("الغيابات القادمة", "Upcoming absences", upcoming.length ? <ul className="divide-y text-sm">{upcoming.map((a) => row(a, <span className="dhr-chip text-xs" data-no-i18n><DateRange from={a.from_date} to={a.to_date} /></span>))}</ul> : empty("Leave Application"))}
        {card("أرصدة الإجازات", "Leave balances", balances.length ? (
          <ul className="divide-y text-sm">{balances.map(({ a, total, u, left }) => (
            <li key={s(a.name)} className="flex min-h-11 items-center justify-between gap-2">
              <span data-no-i18n><NativeLink dt="Leave Allocation" name={s(a.name)}>{s(a.employee_name) || s(a.employee)}</NativeLink> <span className="opacity-60">· {tr(s(a.leave_type))}</span></span>
              <span className="dhr-chip text-xs">{tx("متبقٍ", "Left")} <b data-no-i18n>{left}</b> / <span data-no-i18n>{total}</span> <span className="opacity-60">({tx("مستخدم", "used")} <span data-no-i18n>{u}</span>)</span></span>
            </li>))}</ul>) : empty("Leave Allocation", "Leave Application"))}
      </div>
    </DigitHrLayout>
  );
}
