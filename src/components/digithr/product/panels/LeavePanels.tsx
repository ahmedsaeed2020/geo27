/**
 * 03.1 leave blocks (owner round H2): balance cards per leave type for one employee with «عرض طريقة الحساب» (the leave
 * ledger rows behind the balance), the year calendar with team overlap, and the «سيفقد الرصيد» card. Figures come from
 * product/leaveView.ts; every bar and name opens its record in the shared side panel.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useStoreVersion } from "@/lib/adapter";
import { useSessionUser } from "@/lib/session";
import { t } from "@/i18n";
import { fmtMonth } from "@/i18n/dates";
import { EntDrawer } from "@/components/enterprise/Surfaces";
import { openQuickView } from "@/components/enterprise/QuickView";
import { BalanceCard, NoticeCard, YearBars } from "@/components/enterprise/kit/PeopleKit";
import { arLabel } from "@/components/digithr/workspaces/shared";
import { scopedList } from "@/plugins/digit_hr/compat/scope";
import { allocatedEmployees, dayIndex, leaveCards, loseBalance, yearCalendar, type LeaveCard } from "@/plugins/digit_hr/product/leaveView";
import { unitLabel } from "@/plugins/digit_hr/product/overview/kit";

type Bi = [string, string];
const pick = (ar: boolean, b: Bi) => (ar ? b[1] : b[0]);
const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const dmy = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const daysAr = (k: number) => (k === 1 ? "يوم" : k === 2 ? "يومان" : k >= 3 && k <= 10 ? "أيام" : "يومًا");
export const LEAVE_HUE: Record<string, string> = { "Annual Leave": "emerald", "Sick Leave": "rose", "Casual Leave": "blue", "Hajj Leave": "gold", "Leave Without Pay": "violet", "Maternity Leave": "coral", "Paternity Leave": "coral", "Compensatory Off": "teal" };
export const leaveHue = (type: string) => LEAVE_HUE[type] ?? "teal";
const nameOf = (ar: boolean, v: string) => (ar ? arLabel(v) : v);
const deptOf = (e: Record<string, unknown>) => unitLabel(String(e["department"] ?? "")) || "—";
const peek = (doctype: string, name: string) => (n: ReactNode) => <button type="button" className="contents" onClick={(ev) => openQuickView({ kind: "doc", doctype, name }, ev.currentTarget)}>{n}</button>;

/* ------------------------------------------------------------------ H2-01 / H2-02 balance cards ------------------------------------------------------------------ */
export function LeaveBalancePanel({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion(); const user = useSessionUser();
  const people = useMemo(() => allocatedEmployees(on, company), [on, company, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => { try { return scopedList("Employee").find((e) => e["user_id"] === user)?.name; } catch { return undefined; } }, [user]);
  const [pickEmp, setEmp] = useState<string>("");
  const emp = people.some((p) => p.id === pickEmp) ? pickEmp : people.find((p) => p.id === mine)?.id ?? people[0]?.id ?? "";
  const cards = emp ? leaveCards(emp, on) : [];
  const [calc, setCalc] = useState<LeaveCard | null>(null);
  if (cards === null) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read leave allocations or applications.", "لا تملك صلاحية قراءة أرصدة الإجازات."])}</p>;
  return <div className="grid gap-3" data-leave-balances={emp}>
    <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{pick(ar, ["Employee", "الموظف"])}</span>
      <select className="dhr-input h-9 min-w-[14rem]" value={emp} onChange={(e) => setEmp(e.target.value)} data-leave-employee>{people.map((p) => <option key={p.id} value={p.id}>{nameOf(ar, p.name)}</option>)}</select>
      {emp && <Link to="/digit-hr/employees/$name" params={{ name: emp }} search={{ tab: "time" }} className="text-xs text-primary hover:underline">{pick(ar, ["Open Employee 360", "فتح ملف الموظف"])}</Link>}</label>
    {!cards.length ? <p className="text-sm text-muted-foreground">{pick(ar, ["No leave allocation in effect today.", "لا يوجد تخصيص إجازة ساري اليوم."])}</p>
      : <div className="ek-bal-grid">{cards.map((c) => <BalanceCard key={c.leaveType} hue={leaveHue(c.leaveType)} title={t(c.leaveType)} big={num(c.available)} unit={ar ? `${daysAr(c.available)} متاح` : "days available"}
        attrs={{ "data-bal-card": c.leaveType, "data-available": c.available, "data-balance": c.balance, "data-ledger": c.ledgerBalance ?? "" }}
        lines={[{ key: "taken", label: pick(ar, ["Approved", "معتمد"]), value: num(c.taken), tone: "info" }, { key: "pending", label: pick(ar, ["Pending", "بانتظار القرار"]), value: num(c.pending), tone: c.pending ? "warn" : undefined }, { key: "remaining", label: pick(ar, ["Remaining", "المتبقي"]), value: num(c.balance) }]}
        foot={<button type="button" className="text-primary hover:underline" onClick={() => setCalc(c)} data-bal-calc={c.leaveType}>{pick(ar, ["Show the calculation", "عرض طريقة الحساب"])}</button>} />)}</div>}
    <EntDrawer open={!!calc} onOpenChange={(o) => { if (!o) setCalc(null); }} title={calc ? `${t(calc.leaveType)} — ${pick(ar, ["how the balance is calculated", "طريقة حساب الرصيد"])}` : ""} kicker={nameOf(ar, people.find((p) => p.id === emp)?.name ?? emp)} id="leave-calc" size="md">
      {calc && <LeaveCalc c={calc} ar={ar} on={on} />}
    </EntDrawer>
  </div>;
}
function LeaveCalc({ c, ar, on }: { c: LeaveCard; ar: boolean; on: string }) {
  const kind = (k: string) => (k === "allocation" ? pick(ar, ["Allocation", "تخصيص"]) : k === "leave" ? pick(ar, ["Approved leave", "إجازة معتمدة"]) : pick(ar, ["Adjustment", "تسوية"]));
  const matches = c.ledgerBalance !== null && Math.abs(c.ledgerBalance - c.balance) < 0.001;
  return <div className="grid gap-3 text-sm" data-leave-calc={c.leaveType}>
    <p className="text-muted-foreground">{pick(ar, [`Balance on ${dmy(on)} = allocations covering the day − approved leave starting inside them. Requests still waiting are not deducted; they reduce what can be requested.`, `الرصيد في ${dmy(on)} = التخصيصات السارية − الإجازات المعتمدة التي تبدأ داخلها. الطلبات المنتظرة لا تُخصم من الرصيد، لكنها تُنقص ما يمكن طلبه.`])}</p>
    {c.ledger === null ? <p className="text-muted-foreground" data-source-state="DENIED">{pick(ar, ["The leave ledger is not readable for your role; the figures below come from the allocations and applications.", "دفتر الإجازات غير متاح لدورك؛ الأرقام التالية من التخصيصات والطلبات."])}</p>
      : <table className="w-full text-[13px]" data-leave-ledger={c.ledger.length}><thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{pick(ar, ["Ledger row", "سطر الدفتر"])}</th><th className="text-start">{pick(ar, ["Period", "الفترة"])}</th><th className="text-end">{pick(ar, ["Days", "الأيام"])}</th></tr></thead>
        <tbody>{c.ledger.map((l) => <tr key={l.name} className="border-t" data-ledger-row={l.kind}><td className="py-1.5">{kind(l.kind)} {l.ref && peek(l.kind === "allocation" ? "Leave Allocation" : "Leave Application", l.ref)(<span className="r1-mono-link" data-no-i18n>{l.ref}</span>)}</td><td data-no-i18n>{dmy(l.from)} → {dmy(l.to)}</td><td className="text-end font-semibold tabular-nums" data-no-i18n>{l.days > 0 ? "+" : ""}{num(l.days)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t-2"><td colSpan={2} className="py-1.5 font-semibold">{pick(ar, ["Balance from the ledger", "الرصيد من الدفتر"])}</td><td className="text-end font-bold tabular-nums" data-no-i18n data-ledger-total={c.ledgerBalance ?? ""}>{c.ledgerBalance === null ? "—" : num(c.ledgerBalance)}</td></tr></tfoot></table>}
    <dl className="grid grid-cols-2 gap-2">
      {([["allocated", ["Allocated", "المخصص"], c.allocated], ["taken", ["Approved leave", "الإجازات المعتمدة"], -c.taken], ["balance", ["Remaining", "المتبقي"], c.balance], ["pending", ["Waiting for a decision", "بانتظار القرار"], -c.pending], ["available", ["Available to request", "المتاح للطلب"], c.available]] as [string, Bi, number][]).map(([k, l, v]) => <div key={k} className="rounded-md border p-2" data-calc={k}><dt className="text-xs text-muted-foreground">{pick(ar, l)}</dt><dd className="font-bold tabular-nums" data-no-i18n>{num(v)}</dd></div>)}
    </dl>
    {c.ledger !== null && <p className={matches ? "text-[var(--success-text)]" : "text-[var(--error)]"} data-ledger-match={matches ? "yes" : "no"}>{matches ? pick(ar, ["The card equals the leave ledger ✓", "البطاقة تطابق دفتر الإجازات ✓"]) : pick(ar, ["The card differs from the leave ledger — open the ledger rows to check.", "البطاقة تختلف عن دفتر الإجازات — افتح أسطر الدفتر للتحقق."])}</p>}
  </div>;
}

/* ------------------------------------------------------------------ H2-03 year calendar ------------------------------------------------------------------ */
export function LeaveYearPanel({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion();
  const year = on.slice(0, 4);
  const all = yearCalendar(year, { company, deptOf });
  const [dept, setDept] = useState(""); const [more, setMore] = useState(false);
  if (!all) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read leave applications.", "لا تملك صلاحية قراءة طلبات الإجازة."])}</p>;
  const d = all.depts.some((x) => x.key === dept) ? dept : all.depts[0]?.key ?? "";
  const cal = yearCalendar(year, { company, dept: d, deptOf })!;
  const days = dayIndex(year, `${year}-12-31`) + 1; const today = on.startsWith(year) ? dayIndex(year, on) : -1;
  const rows = more ? cal.rows : cal.rows.slice(0, 14);
  const types = [...new Set(cal.rows.flatMap((r) => r.spans.map((s) => s.type)))];
  return <div className="grid gap-2" data-leave-year={year} data-leave-year-dept={d}>
    <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{pick(ar, ["Team", "الفريق"])}</span>
      <select className="dhr-input h-9" value={d} onChange={(e) => { setDept(e.target.value); setMore(false); }} data-leave-year-pick>{all.depts.map((x) => <option key={x.key} value={x.key}>{nameOf(ar, x.key)} ({x.people})</option>)}</select>
      <span className="text-xs text-muted-foreground">{pick(ar, ["Dark strip = two or more of the team away on the same day.", "الشريط الداكن = اثنان أو أكثر من الفريق غائبون في اليوم نفسه."])}</span></div>
    <YearBars months={Array.from({ length: 12 }, (_, i) => fmtMonth(`${year}-${String(i + 1).padStart(2, "0")}`, ar).split(" ")[0]!)} days={days} today={today} overlap={cal.overlap}
      labels={{ people: pick(ar, ["Employee", "الموظف"]), overlap: pick(ar, ["Team overlap", "تداخل الفريق"]), total: pick(ar, ["Days", "الأيام"]) }}
      rows={rows.map((r) => ({ key: r.employee, head: nameOf(ar, r.name), sub: nameOf(ar, r.dept), total: <bdi data-no-i18n>{num(r.days)}</bdi>,
        spans: r.spans.map((s) => ({ key: s.name, from: dayIndex(year, s.from), to: dayIndex(year, s.to), hue: leaveHue(s.type), open: s.status === "open", title: `${t(s.type)} · ${dmy(s.from)} → ${dmy(s.to)} · ${s.status === "open" ? pick(ar, ["requested", "مطلوبة"]) : pick(ar, ["approved", "معتمدة"])}`, link: peek("Leave Application", s.name) })) }))}
      empty={pick(ar, ["No leave this year for this team.", "لا توجد إجازات هذا العام لهذا الفريق."])}
      legend={<span className="flex flex-wrap items-center gap-3 text-xs">{types.map((ty) => <span key={ty} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded" style={{ background: `var(--${leaveHue(ty)})` }} />{nameOf(ar, ty)}</span>)}<span className="inline-flex items-center gap-1"><i className="ek-yb-bar relative inline-block h-2.5 w-4" data-open style={{ ["--yb" as string]: "var(--grey)", position: "relative" }} />{pick(ar, ["Requested (not yet decided)", "مطلوبة (لم تُحسم)"])}</span></span>} />
    {cal.rows.length > 14 && <button type="button" className="ek-oc-hidden justify-self-start" onClick={() => setMore((v) => !v)} data-leave-year-more>{more ? pick(ar, ["Show fewer", "عرض أقل"]) : pick(ar, [`${cal.rows.length - 14} not shown — show all`, `${cal.rows.length - 14} غير معروض — عرض الكل`])}</button>}
  </div>;
}

/* ------------------------------------------------------------------ H2-04 balance to be lost ------------------------------------------------------------------ */
export function LeaveLosePanel({ ar, on, company }: { ar: boolean; on: string; company?: string | undefined }) {
  useStoreVersion();
  const r = loseBalance(on, company);
  if (!r) return <p className="text-sm text-muted-foreground" data-source-state="DENIED">{pick(ar, ["You cannot read leave allocations or applications.", "لا تملك صلاحية قراءة أرصدة الإجازات."])}</p>;
  const total = r.rows.reduce((a, x) => a + x.lose, 0); const end = r.rows.map((x) => x.periodEnd).sort()[0] ?? "";
  const people = new Set(r.rows.map((x) => x.employee)).size;
  if (!r.rows.length) return <NoticeCard tone="info" title={pick(ar, ["Balance to be lost", "سيفقد الرصيد"])} big={pick(ar, ["No balance will be lost", "لن يُفقد أي رصيد"])} sub={pick(ar, [`No carried-forward balance above the cap ends within ${r.within} days.`, `لا يوجد رصيد فوق حد الترحيل تنتهي فترته خلال ${r.within} يومًا.`])} items={[]} attrs={{ "data-leave-lose": 0 }} />;
  return <NoticeCard tone="warn" title={pick(ar, ["Balance to be lost", "سيفقد الرصيد"])} attrs={{ "data-leave-lose": r.rows.length, "data-leave-lose-days": Math.round(total * 10) / 10 }}
    big={ar ? <><bdi data-no-i18n>{people}</bdi> {people <= 10 && people > 2 ? "موظفين" : "موظفًا"} — <bdi data-no-i18n>{num(Math.round(total * 10) / 10)}</bdi> {daysAr(Math.round(total))}</> : <><bdi data-no-i18n>{people}</bdi> employees — <bdi data-no-i18n>{num(Math.round(total * 10) / 10)}</bdi> days</>}
    sub={pick(ar, [`Days above the carry-forward cap (${r.rows[0]!.cap} days) when the period ends on ${dmy(end)}, pending requests counted as taken.`, `أيام فوق حد الترحيل (${r.rows[0]!.cap} أيام) عند نهاية الفترة في ${dmy(end)}، مع احتساب الطلبات المنتظرة كمأخوذة.`])}
    items={r.rows.slice(0, 6).map((x) => ({ key: `${x.employee}|${x.leaveType}`, label: <>{nameOf(ar, x.name)} <span className="text-xs text-muted-foreground">· {t(x.leaveType)}</span></>, value: `${num(x.lose)} ${ar ? daysAr(Math.round(x.lose)) : "d"}`, link: (n: ReactNode) => <Link to="/digit-hr/employees/$name" params={{ name: x.employee }} search={{ tab: "time" }} className="hover:underline">{n}</Link> }))}
    action={<Link to="/digit-hr/s/$section" params={{ section: "03.1" }} search={{ tab: "documents" } as never} className="btn-secondary inline-flex h-8 items-center px-3 text-xs" data-leave-lose-plan>{pick(ar, ["Plan their leave", "خطط إجازاتهم"])}{r.rows.length > 6 ? pick(ar, [` · ${r.rows.length - 6} more`, ` · ${r.rows.length - 6} آخرون`]) : ""}</Link>} />;
}
