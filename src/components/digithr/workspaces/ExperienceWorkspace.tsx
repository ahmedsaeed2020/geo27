/**
 * Module 05 — Personal Experience (Premium V2). The session identity decides the lens: Me (my day, start a request,
 * my requests), Team (approvals with leave context, availability) and HR desk (service operations) — URL `lens`.
 * Side (4/12): service catalogue (availability from employee link + source DocPerm), requests waiting on me, profile.
 * Lower: recent activity. Nothing here grants roles or substitutes another employee's data.
 */
import { decisionErrorText } from "@/plugins/digit_hr/product/approvals";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm, useSessionUser, currentUser } from "@/plugins/digit_hr/compat/session";
import { createSelfDraft, selfBalances, selfDraftDeskUrl } from "@/plugins/digit_hr/selfService";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { enterHrNative } from "@/components/digithr/HrNav";
import { useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { useStoreVersion } from "@/lib/adapter";
import { resolveEmployee, isHrAdmin, teamOf, currentEmployeeId } from "@/plugins/digit_hr/compat/employeeIdentity";
import { decideLeave } from "@/plugins/digit_hr/operations";
import { leaveContext } from "@/plugins/digit_hr/compat/leaveContext";
import { t as tr } from "@/i18n";
import { Native, Chip, arLabel, useSources, SourceNotice, s, n, live, DateRange, type R, type Sources } from "./shared";
import { pickLens, saveLens, savedLens, type Lens } from "@/plugins/digit_hr/lensDefault";
import { SELF_CATALOG, catalogState, isOpenRequest, openOwn, teamQueues, type CatalogState } from "@/plugins/digit_hr/selfCatalog";
import { Facts, HrCommandHeader, HrContextToolbar, HrEmptyOrBlockedState, HrInsightPanel, HrPriorityQueue, HrWorkspaceGrid, ModuleLinks, Pill, Seg, SourcesPill, daysFrom, initials, relDay, useSearchPatch, useToday, type QueueGroup, type Tone } from "../home/kit";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

type Tx = (ar: string, en: string) => string;
const DSC = "DIGIT HR Service Case";
const REQ_STATUS = (dt: string, d: R): string => dt === "Leave Application" ? s(d.status || "Open") : dt === "Expense Claim" ? s(d.approval_status || "Draft") : dt === "Shift Request" ? s(d.status || "Draft") : dt === DSC ? s(d.case_status || "Open") : ["Draft", "Submitted", "Cancelled"][n(d.docstatus)] ?? "Draft";
/** Date ranges are isolated left-to-right so Arabic lines read start → end, not reversed. */
const LTR = (x: string) => `\u2066${x}\u2069`;
/** Stored leave/shift/category values get a display-only Arabic label (the stored value is unchanged). */
const REQ_SUMMARY = (dt: string, d: R, tx: Tx): string => { const L = (v: unknown) => { const k = s(v); return k ? tx(arLabel(k), k) : ""; };
  return dt === "Leave Application" ? `${L(d.leave_type)} · ${LTR(`${s(d.from_date)} → ${s(d.to_date)}`)}`
  : dt === "Attendance Request" ? LTR(`${s(d.from_date)} → ${s(d.to_date)}`) : dt === "Shift Request" ? `${L(d.shift_type)} · ${LTR(s(d.from_date))}`
  : dt === "Compensatory Leave Request" ? LTR(`${s(d.work_from_date)} → ${s(d.work_end_date)}`) : dt === DSC ? `${L(d.category)} · ${s(d.subject)}` : s(d.name); };
const CASE_OPEN = (d: R) => live(d) && !["Resolved", "Closed"].includes(s(d.case_status));

export function ExperienceWorkspace({ home = false }: { home?: boolean }) {
  const { tx } = useTx();
  const navigate = useNavigate();
  useStoreVersion(); useSessionUser();
  useScopeMetas(["Employee", "Leave Application", "Leave Allocation", "Leave Ledger Entry", "Attendance", "Attendance Request", "DIGIT Document Renewal", DSC, "Expense Claim", "Salary Slip", ...SELF_CATALOG.map((c) => c.dt)]);
  const user = currentUser();
  const me = resolveEmployee(user);
  const myId = currentEmployeeId(user);
  const admin = isHrAdmin(user);
  const team = myId ? [...teamOf(myId)] : [];
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const src = useSources(tx);
  const today = useToday();
  const patch = useSearchPatch();
  const search = useRouterState({ select: (st) => st.location.search }) as Record<string, unknown>;

  const queues = teamQueues((dt) => (src.ready(dt) ? src.rows(dt) : []), user, new Set(team), admin);
  const hasTeam = admin || team.length > 0 || queues.some((q) => q.rows.length > 0);
  const lenses: Lens[] = ["me", ...(hasTeam ? ["team" as const] : []), ...(admin ? ["hr" as const] : [])];
  // NB1-03: URL → saved preference → a manager with requests that name them opens on Team → Me / HR desk (presentation only).
  const actionableTeam = teamQueues((dt) => (src.ready(dt) ? src.rows(dt) : []), user, new Set(team), false).reduce((a, q) => a + q.rows.length, 0);
  const saved = savedLens(user);
  const { lens, reason } = pickLens({ url: search["lens"], saved, lenses, linked: !!myId, admin, actionableTeam });
  const [, bump] = useState(0);
  const chooseLens = (v: Lens) => { saveLens(user, v); patch({ lens: v }, true); };
  const resetLens = () => { saveLens(user, null); bump((x) => x + 1); patch({ lens: undefined }, true); };

  const mine = (dt: string) => (myId ? src.rows(dt).filter((d) => s(d.employee) === myId && live(d)) : []);
  const start = (dt: string) => {
    try {
      const p = placeDoc(dt, "05"); if (!p) throw new Error("Document route unavailable");
      const desk = selfDraftDeskUrl(dt); if (desk) { enterHrNative(p.sub); window.location.assign(desk); return; }
      const d = createSelfDraft(dt); enterHrNative(p.sub);
      void navigate({ to: "/app/$app/$doctype/$name", params: { app: p.app, doctype: p.slug, name: d.name }, search: HR_DOC_SEARCH as never });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const canStart = (dt: string) => { const meta = cachedMeta(dt); return !!meta && !!myId && !!placeDoc(dt, "05") && hasPerm(meta, "create", { name: "", doctype: dt, employee: myId, owner: user, company: me.state === "linked" ? me.company : "" }); };
  const decide = (name: string, status: "Approved" | "Rejected") => {
    try { decideLeave(name, status); setMsg({ ok: true, text: `${name}: ${status === "Approved" ? tx("تم الاعتماد والتحقق", "approved and read back") : tx("تم الرفض والتحقق", "rejected and read back")}` }); }
    catch (e) { setMsg({ ok: false, text: `${name}: ${decisionErrorText((e as Error).message, tx("ar", "en") === "ar")}` }); }
  };

  const lensText: Record<Lens, [string, string]> = { me: ["أنا", "Me"], team: ["فريقي", "My team"], hr: ["مكتب الموارد البشرية", "HR desk"] };
  const purpose: Record<Lens, [string, string]> = {
    me: ["طلباتك وأرصدتك ووثائقك من سجل الموظف المرتبط بحسابك.", "Your requests, balances and documents from the employee record linked to your account."],
    team: ["الطلبات التي تسمّيك معتمدًا وتوفر فريقك اليوم.", "Requests that name you as approver and your team's availability today."],
    hr: ["عمليات خدمات الموارد البشرية في نطاق صلاحياتك.", "HR service operations within your permitted scope."],
  };

  return (
    <div className="space-y-4" data-module-home="05" data-lens={lens}>
      <HrCommandHeader embedded={!home} id="05" code="05" suite={tx("الخدمة الذاتية وتجربة الموظف", "Employee & Manager Experience")} title={tx("مساحتي للموارد البشرية", "My HR workspace")}
        purpose={tx(...purpose[lens])}
        actions={<>{myId && <Link to="/digit-hr/employees/$name" params={{ name: myId }} className="dhr-act">{tx("ملفي 360", "My 360 profile")}</Link>}<ModuleLinks module="05" tx={tx} /></>}>
        <HrContextToolbar end={<><SourcesPill src={src} /><Pill title={user}>{me.state === "linked" ? <span data-no-i18n>{tx(arLabel(me.name), me.name)}</span> : tx("غير مرتبط بموظف", "Not linked to an employee")}</Pill>{admin && <Pill tone="info">{tx("دور موارد بشرية", "HR role")}</Pill>}</>}>
          {lenses.length > 1 && <Seg<Lens> label={tx("عرض المساحة", "Workspace view")} value={lens} onChange={chooseLens} options={lenses.map((l) => ({ id: l, label: tx(...lensText[l]) }))} />}
          {lenses.length > 1 && <span className="text-[11.5px] text-[var(--dhr-muted)]" data-lens-reason={reason}>
            {reason === "team-approvals" ? tx("فُتح على فريقي لأن لديك طلبات بانتظار قرارك.", "Opened on My team because requests are waiting on you.")
              : reason === "saved" ? <>{tx("العرض الافتراضي المحفوظ لك.", "Your saved default view.")} <button type="button" className="dhr-link" onClick={resetLens} data-lens-reset>{tx("إعادة التعيين", "Reset")}</button></> : null}
          </span>}
        </HrContextToolbar>
      </HrCommandHeader>
      <SourceNotice src={src} quietLoading />
      {msg && <p role="status" className={msg.ok ? "dhr-ok text-sm" : "dhr-alert text-sm"} data-no-i18n>{msg.text}</p>}

      <HrWorkspaceGrid split="8/4"
        main={lens === "me" ? <MeLens myId={myId} me={me} admin={admin} src={src} mine={mine} today={today} canStart={canStart} start={start} tx={tx} />
          : lens === "team" ? <TeamLens admin={admin} team={team} user={user} src={src} queues={queues} today={today} decide={decide} tx={tx} />
          : <HrDesk src={src} queues={queues} today={today} tx={tx} />}
        side={<>
          <ServiceCatalog myId={myId} company={me.state === "linked" ? me.company : ""} user={user} src={src} start={start} tx={tx} />
          {/* HR desk already lists these queues in its main column (NB1-06/UX-09: no duplicate panel). */}
          <WaitingOnMe admin={admin} show={hasTeam && lens !== "hr"} queues={queues} src={src} tx={tx} />
          <Profile me={me} myId={myId} admin={admin} tx={tx} />
        </>}
      />

      <RecentActivity lens={lens} myId={myId} admin={admin} team={team} src={src} today={today} tx={tx} />
    </div>
  );
}

/* ------------------------------------------------------------------ Me */

function MeLens({ myId, me, admin, src, mine, today, canStart, start, tx }: { myId: string; me: ReturnType<typeof resolveEmployee>; admin: boolean; src: Sources; mine: (dt: string) => R[]; today: string; canStart: (dt: string) => boolean; start: (dt: string) => void; tx: Tx }) {
  if (!myId) return (
    <HrInsightPanel title={tx("يومي", "My day")} data-me-unlinked>
      <HrEmptyOrBlockedState tx={tx} title={tx("حسابك غير مرتبط بسجل موظف نشط.", "Your account is not linked to an active employee record.")}
        body={tx("لا توجد طلبات أو أرصدة أو قسائم شخصية لعرضها، ولا نعرض بيانات موظف آخر بدلًا منها. اطلب من مسؤول الموارد ربط المستخدم بالموظف.", "There are no personal requests, balances or payslips to show, and we never substitute another employee's data. Ask HR to link your user to an employee.")}
        action={admin ? <Native dt="Employee" module="05" className="dhr-act">{tx("ربط مستخدم بموظف", "Link a user to an employee")}</Native> : undefined} />
    </HrInsightPanel>
  );
  const balances = today ? selfBalances(today) : [];
  const att = mine("Attendance").find((d) => s(d.attendance_date).slice(0, 10) === today);
  const leaves = mine("Leave Application");
  const leaveToday = leaves.find((l) => s(l.status) === "Approved" && s(l.from_date).slice(0, 10) <= today && s(l.to_date).slice(0, 10) >= today);
  const nextLeave = leaves.filter((l) => s(l.status) === "Approved" && s(l.from_date).slice(0, 10) > today).sort((a, b) => s(a.from_date).localeCompare(s(b.from_date)))[0];
  const docs = mine("DIGIT Document Renewal").filter((d) => { const k = daysFrom(today, s(d.expiry_date)); return k !== null && k <= 60; });
  const quick = ["Leave Application", "Attendance Request", "Expense Claim", DSC].filter(canStart);
  const reqDts = SELF_CATALOG.map((c) => c.dt);
  const reqs = reqDts.flatMap((dt) => mine(dt).map((d) => ({ dt, d, open: isOpenRequest(dt, d) }))).sort((a, b) => Number(b.open) - Number(a.open) || s(b.d.modified).localeCompare(s(a.d.modified)));
  const label = (dt: string) => { const c = SELF_CATALOG.find((x) => x.dt === dt); return c ? tx(c.ar, c.en) : dt; };
  const slips = mine("Salary Slip").sort((a, b) => s(b.start_date).localeCompare(s(a.start_date)));
  type Req = (typeof reqs)[number];
  const G: QueueGroup[] = [{ id: "open", ar: "بانتظار قرار", en: "Awaiting a decision", tone: "warn" }, { id: "done", ar: "منتهية مؤخرًا", en: "Recently completed" }];
  return (<>
    <HrInsightPanel title={tx("يومي", "My day")} meta={<span data-no-i18n>{tx(arLabel(me.state === "linked" ? me.name : ""), me.state === "linked" ? me.name : "")} · {today}</span>} data-my-day>
      {quick.length > 0 && <div className="mb-3 flex flex-wrap gap-2" data-quick-actions>{quick.map((dt, i) => <button key={dt} type="button" className={`dhr-act ${i === 0 ? "dhr-act-primary" : ""}`} onClick={() => start(dt)} data-quick-start={dt}>+ {label(dt)}</button>)}</div>}
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DayFact k={tx("حضور اليوم", "Attendance today")} v={!src.ready("Attendance") ? src.v(null, "Attendance") : att ? <Native dt="Attendance" name={s(att.name)} module="05" className="dhr-link">{tr(s(att.status))}</Native> : <span className="text-[var(--dhr-muted)]">{tx("لا سجل اليوم", "No record today")}</span>} note={tx("غياب السجل لا يعني الغياب.", "No record does not mean absent.")} />
        <DayFact k={tx("إجازة اليوم", "Leave today")} v={!src.ready("Leave Application") ? src.v(null, "Leave Application") : leaveToday ? <Native dt="Leave Application" name={s(leaveToday.name)} module="05" className="dhr-link">{tr(s(leaveToday.leave_type))}</Native> : tx("لا", "None")} />
        <DayFact k={tx("الإجازة المعتمدة القادمة", "Next approved leave")} v={!src.ready("Leave Application") ? src.v(null, "Leave Application") : nextLeave ? <Native dt="Leave Application" name={s(nextLeave.name)} module="05" className="dhr-link"><span data-no-i18n>{s(nextLeave.from_date).slice(0, 10)}</span></Native> : tx("لا يوجد", "None")} note={nextLeave ? relDay(today, s(nextLeave.from_date), tx) : undefined} />
        <DayFact k={tx("وثائق تنتهي خلال 60 يومًا", "Documents expiring ≤ 60 days")} v={src.v(docs.length ? <Native dt="DIGIT Document Renewal" module="05" filters={[["name", "in", docs.map((d) => s(d.name))]]} className="dhr-link">{docs.length}</Native> : 0, "DIGIT Document Renewal")} tone={docs.length ? "warn" : undefined} />
      </dl>
      <div className="mt-3 border-t border-[var(--dhr-sep)] pt-3">
        <h3 className="mb-2 text-[12px] font-semibold text-[var(--dhr-muted)]">{tx("أرصدة إجازاتي (من دفتر الإجازات)", "My leave balances (from the leave ledger)")}</h3>
        {balances.length ? <ul className="flex flex-wrap gap-2" data-self-balances>{balances.map((b) => <li key={b.leave_type} className="dhr-pill"><span>{tr(b.leave_type)}</span><b className="dhr-tnum" data-no-i18n>{b.balance}</b></li>)}</ul>
          : <p className="text-[12px] text-[var(--dhr-muted)]">{tx("لا يوجد رصيد دفتر إجازات متاح ضمن صلاحياتك.", "No leave-ledger balance available within your permissions.")}</p>}
      </div>
    </HrInsightPanel>
    <HrInsightPanel title={tx("طلباتي", "My requests")} flush data-my-requests={reqs.length} meta={tx("المفتوحة أولًا، ثم آخر ما انتهى.", "Open first, then the most recently completed.")}>
      {!src.ready(...reqDts) && !reqs.length ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst(...reqDts) ?? { state: "LOADING" }} tx={tx} rows={3} /></div>
        : <HrPriorityQueue<Req> label={tx("طلباتي", "My requests")} tx={tx} items={reqs.slice(0, 14)} groups={G} groupOf={(r) => (r.open ? "open" : "done")} keyOf={(r) => r.dt + s(r.d.name)} maxHeight="440px"
            empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا طلبات بعد.", "No requests yet.")} body={tx("ابدأ طلبًا من كتالوج الخدمات.", "Start one from the service catalogue.")} /></div>}
            render={(r) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0"><span className="block text-[11.5px] text-[var(--dhr-muted)]">{label(r.dt)}</span><Native dt={r.dt} name={s(r.d.name)} module="05" className="dhr-link block truncate text-[13px] font-medium"><span data-no-i18n>{REQ_SUMMARY(r.dt, r.d, tx)}</span></Native></span>
                <span className="flex items-center gap-2"><span className="text-[11px] text-[var(--dhr-muted)]" data-no-i18n>{relDay(today, s(r.d.modified), tx)}</span><Chip tone={r.open ? "warn" : undefined}>{tr(REQ_STATUS(r.dt, r.d))}</Chip></span>
              </div>
            )} />}
    </HrInsightPanel>
    <div className="grid gap-4 lg:grid-cols-2">
      <HrInsightPanel title={tx("قسائم رواتبي", "My payslips")} flush meta={tx("المبالغ داخل القسيمة الأصلية.", "Amounts stay inside the native slip.")}>
        {slips.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{slips.slice(0, 5).map((d) => <li key={s(d.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5"><Native dt="Salary Slip" name={s(d.name)} module="05" className="dhr-link text-[13px]"><DateRange from={d.start_date} to={d.end_date} /></Native><Chip tone={n(d.docstatus) === 1 ? undefined : "warn"}>{n(d.docstatus) === 1 ? tx("معتمدة", "Submitted") : tx("مسودة", "Draft")}</Chip></li>)}</ul>
          : <div className="p-4"><HrEmptyOrBlockedState read={src.read("Salary Slip")} tx={tx} title={tx("لا قسائم متاحة لك.", "No payslips available to you.")} /></div>}
      </HrInsightPanel>
      <HrInsightPanel title={tx("وثائقي", "My documents")} flush>
        {mine("DIGIT Document Renewal").length ? <ul className="divide-y divide-[var(--dhr-sep)]">{mine("DIGIT Document Renewal").slice(0, 5).map((d) => { const k = daysFrom(today, s(d.expiry_date)); return <li key={s(d.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5"><Native dt="DIGIT Document Renewal" name={s(d.name)} module="05" className="dhr-link text-[13px]">{tr(s(d.document_type))}</Native><span className="flex items-center gap-2 text-[11.5px]"><span data-no-i18n className="text-[var(--dhr-muted)]">{s(d.expiry_date)}</span><Chip tone={k !== null && k < 0 ? "danger" : k !== null && k <= 60 ? "warn" : undefined}>{tr(s(d.status))}</Chip></span></li>; })}</ul>
          : <div className="p-4"><HrEmptyOrBlockedState read={src.read("DIGIT Document Renewal")} tx={tx} title={tx("لا وثائق مسجلة لك.", "No documents recorded for you.")} /></div>}
      </HrInsightPanel>
    </div>
  </>);
}

function DayFact({ k, v, note, tone }: { k: string; v: ReactNode; note?: string | undefined; tone?: Tone | undefined }) {
  return <div className="ek-kpi-tile" data-tone={tone}><dt className="ek-tile-label">{k}</dt><dd className="ek-tile-value !text-[15px]" data-no-i18n>{v}</dd>{note && <div className="ek-tile-meta">{note}</div>}</div>;
}

/* ------------------------------------------------------------------ Team */

type Queues = ReturnType<typeof teamQueues>;
function TeamLens({ admin, team, user, src, queues, today, decide, tx }: { admin: boolean; team: string[]; user: string; src: Sources; queues: Queues; today: string; decide: (name: string, st: "Approved" | "Rejected") => void; tx: Tx }) {
  const emps = src.rows("Employee");
  const deptOf = (emp: string) => s(emps.find((e) => s(e.name) === emp)?.department);
  const leaveQ = (queues.find((q) => q.dt === "Leave Application")?.rows ?? []) as R[];
  const teamLeaves = admin ? leaveQ : leaveQ.filter((d) => team.includes(s(d.employee)) && s(d.leave_approver) === user);
  const onLeave = src.rows("Leave Application").filter((l) => live(l) && s(l.status) === "Approved" && s(l.from_date).slice(0, 10) <= today && s(l.to_date).slice(0, 10) >= today && (admin || team.includes(s(l.employee))));
  const teamEmps = emps.filter((e) => team.includes(s(e.name)));
  return (<>
    <HrInsightPanel title={tx("اعتمادات الإجازات", "Leave approvals")} flush data-team-approvals={src.ready("Leave Application") ? teamLeaves.length : ""}
      meta={admin ? tx("دور موارد بشرية: كل الطلبات المفتوحة في نطاقك. الرصيد بعد الاعتماد من التخصيصات.", "HR role: every open request in your scope. Balance after approval comes from allocations.") : tx("الطلبات التي تسمّيك معتمدًا من فريقك. الرصيد بعد الاعتماد من التخصيصات.", "Your team's requests naming you as approver. Balance after approval comes from allocations.")}>
      {!src.ready("Leave Application") ? <div className="p-4"><HrEmptyOrBlockedState read={src.read("Leave Application")} tx={tx} rows={3} /></div>
        : teamLeaves.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{teamLeaves.slice(0, 10).map((d) => { const c = leaveContext(d, deptOf); return (
          <li key={s(d.name)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" data-approval={s(d.name)}>
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="dhr-avatar" aria-hidden data-no-i18n>{initials(s(d.employee_name) || s(d.employee))}</span>
              <span className="min-w-0"><Native dt="Leave Application" name={s(d.name)} module="05" className="dhr-link block truncate text-[13px] font-semibold"><span data-no-i18n>{tx(arLabel(s(d.employee_name) || s(d.employee)), s(d.employee_name) || s(d.employee))}</span></Native>
                <span className="block text-[12px] text-[var(--dhr-muted)]">{tr(s(d.leave_type))} · <span data-no-i18n><DateRange from={d.from_date} to={d.to_date} /> · {n(d.total_leave_days)}</span> {tx("يوم", "day(s)")} · {c.available ? <span data-no-i18n>{tx(`الرصيد ${c.balance} ← ${c.after}`, `balance ${c.balance} → ${c.after}`)}</span> : <span data-source-state="DENIED">{tx("الرصيد غير متاح لصلاحيتك", "balance unavailable to you")}</span>}{c.short && <Chip tone="danger">{tx("رصيد غير كافٍ", "Insufficient")}</Chip>}</span></span>
            </span>
            <span className="flex gap-1.5">
              <button type="button" className="dhr-act dhr-act-primary" onClick={() => decide(s(d.name), "Approved")}>{tx("اعتماد", "Approve")}</button>
              <button type="button" className="dhr-act" onClick={() => decide(s(d.name), "Rejected")}>{tx("رفض", "Reject")}</button>
            </span>
          </li>); })}</ul>
        : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا طلبات إجازة بانتظارك.", "No leave requests waiting on you.")} /></div>}
    </HrInsightPanel>
    <HrInsightPanel title={tx("توفر الفريق اليوم", "Team availability today")} flush meta={<span data-no-i18n>{today}</span>} data-team-availability>
      {!src.ready("Leave Application", "Employee") ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst("Leave Application", "Employee") ?? { state: "LOADING" }} tx={tx} rows={3} /></div>
        : admin ? (onLeave.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{onLeave.slice(0, 10).map((l) => <li key={s(l.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5"><Native dt="Leave Application" name={s(l.name)} module="05" className="dhr-link text-[13px]"><span data-no-i18n>{tx(arLabel(s(l.employee_name) || s(l.employee)), s(l.employee_name) || s(l.employee))}</span></Native><span className="flex items-center gap-2 text-[11.5px] text-[var(--dhr-muted)]"><span data-no-i18n>{tx("حتى", "until")} <bdi dir="ltr">{s(l.to_date)}</bdi></span><Chip>{tr(s(l.leave_type))}</Chip></span></li>)}</ul> : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا أحد في إجازة معتمدة اليوم.", "No one is on approved leave today.")} /></div>)
        : teamEmps.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{teamEmps.slice(0, 12).map((e) => { const l = onLeave.find((x) => s(x.employee) === s(e.name)); return (
            <li key={s(e.name)} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5"><span className="flex min-w-0 items-center gap-2"><span className="dhr-avatar" aria-hidden data-no-i18n>{initials(s(e.employee_name) || s(e.name))}</span><Link to="/digit-hr/employees/$name" params={{ name: s(e.name) }} className="dhr-link truncate text-[13px]"><span data-no-i18n>{tx(arLabel(s(e.employee_name) || s(e.name)), s(e.employee_name) || s(e.name))}</span></Link></span>{l ? <Chip tone="warn">{tx("في إجازة", "On leave")} · {tr(s(l.leave_type))}</Chip> : <span className="text-[11.5px] text-[var(--dhr-muted)]" data-no-i18n>{tx(arLabel(s(e.designation)), s(e.designation))}</span>}</li>); })}</ul>
        : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا يوجد فريق مرتبط بحسابك.", "No team is linked to your account.")} /></div>}
    </HrInsightPanel>
  </>);
}

/* ------------------------------------------------------------------ HR desk */

function HrDesk({ src, queues, today, tx }: { src: Sources; queues: Queues; today: string; tx: Tx }) {
  const cases = src.rows(DSC).filter(CASE_OPEN);
  type C = R;
  const G: QueueGroup[] = [{ id: "Open", ar: "جديدة", en: "New", tone: "warn" }, { id: "Assigned", ar: "مُسندة", en: "Assigned", tone: "info" }, { id: "In Progress", ar: "قيد المعالجة", en: "In progress", tone: "info" }];
  const overdue = cases.filter((c) => { const k = daysFrom(today, s(c.due_at)); return k !== null && k < 0; }).length;
  const sevTone = (v: string): Tone | undefined => v === "Critical" || v === "High" ? "danger" : v === "Medium" ? "warn" : undefined;
  return (<>
    <HrInsightPanel title={tx("عمليات خدمات الموارد البشرية", "HR service operations")} flush data-hr-desk={src.ready(DSC) ? cases.length : ""}
      meta={src.ready(DSC) ? <><b className="dhr-tnum" data-no-i18n>{cases.length}</b> {tx("حالة مفتوحة", "open cases")}{overdue > 0 && <> · <b className="dhr-tnum text-[var(--dhr-danger)]" data-no-i18n>{overdue}</b> {tx("تجاوزت موعدها", "past due")}</>}</> : undefined}
      actions={<Native dt={DSC} module="05" className="dhr-act">{tx("سجل الحالات", "Case register")}</Native>}>
      {!src.ready(DSC) ? <div className="p-4"><HrEmptyOrBlockedState read={src.read(DSC)} tx={tx} rows={4} /></div>
        : <HrPriorityQueue<C> label={tx("حالات الخدمة المفتوحة", "Open service cases")} tx={tx} items={cases} groups={G} groupOf={(c) => s(c.case_status) || "Open"} keyOf={(c) => s(c.name)} toneOf={(c) => sevTone(s(c.severity))} maxHeight="520px"
            empty={<div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا حالات خدمة مفتوحة.", "No open service cases.")} body={tx("تظهر هنا الحالات الجديدة والمسندة وقيد المعالجة.", "New, assigned and in-progress cases appear here.")} /></div>}
            render={(c) => { const k = daysFrom(today, s(c.due_at)); return (
              <div className="grid gap-1">
                <div className="flex items-start justify-between gap-2"><Native dt={DSC} name={s(c.name)} module="05" className="dhr-link min-w-0 truncate text-[13px] font-semibold"><span data-no-i18n>{s(c.subject) || s(c.name)}</span></Native>{s(c.severity) && <Chip tone={sevTone(s(c.severity)) === "danger" ? "danger" : sevTone(s(c.severity)) === "warn" ? "warn" : undefined}>{tr(s(c.severity))}</Chip>}</div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[var(--dhr-muted)]"><span data-no-i18n>{tx(arLabel(s(c.employee_name) || s(c.employee)), s(c.employee_name) || s(c.employee))} · {tr(s(c.category))}{s(c.assigned_to) ? ` · ${s(c.assigned_to)}` : ""}</span><span className={k !== null && k < 0 ? "font-semibold text-[var(--dhr-danger)]" : ""} data-no-i18n>{s(c.due_at) ? `${tx("الاستحقاق", "Due")} ${relDay(today, s(c.due_at), tx)}` : tx("بلا موعد", "No due date")}</span></div>
              </div>); }} />}
    </HrInsightPanel>
    <DocumentsDue src={src} today={today} tx={tx} />
    <HrInsightPanel title={tx("طلبات الموظفين في نطاقك", "Employee requests in scope")} flush meta={tx("طلبات مفتوحة بانتظار قرار، حسب النوع.", "Open requests awaiting a decision, by type.")}>
      <ul className="grid divide-y divide-[var(--dhr-sep)] sm:grid-cols-2 sm:divide-y-0">{queues.map((q) => (
        <li key={q.dt} className="flex min-h-12 items-center justify-between gap-2 px-4 py-2 sm:border-b sm:border-[var(--dhr-sep)]"><span className="text-[13px] font-medium">{tx(q.ar, q.en)}</span>{!src.ready(q.dt) ? src.v(null, q.dt) : q.rows.length ? <Native dt={q.dt} module="05" filters={[["name", "in", q.rows.map((r) => s(r["name"]))]]} className="dhr-act"><b className="dhr-tnum" data-no-i18n>{q.rows.length}</b></Native> : <span className="dhr-tnum text-[var(--dhr-muted)]" data-no-i18n>0</span>}</li>))}</ul>
    </HrInsightPanel>
  </>);
}

/** Renewal work for the HR desk: documents expired or expiring within 60 days (expiry date from the renewal record). */
function DocumentsDue({ src, today, tx }: { src: Sources; today: string; tx: Tx }) {
  const rows = src.rows("DIGIT Document Renewal").filter((d) => live(d) && !["Renewed", "Closed", "Cancelled"].includes(s(d.status))).map((d) => ({ d, k: daysFrom(today, s(d.expiry_date)) })).filter((x) => x.k !== null && x.k <= 60).sort((a, b) => (a.k ?? 0) - (b.k ?? 0));
  return (
    <HrInsightPanel title={tx("وثائق تحتاج تجديدًا", "Documents due for renewal")} flush data-docs-due={src.ready("DIGIT Document Renewal") ? rows.length : ""} meta={tx("منتهية أو تنتهي خلال 60 يومًا، من سجل التجديد.", "Expired or expiring within 60 days, from the renewal record.")} actions={<Native dt="DIGIT Document Renewal" module="05" className="dhr-act">{tx("سجل التجديد", "Renewal register")}</Native>}>
      {!src.ready("DIGIT Document Renewal") ? <div className="p-4"><HrEmptyOrBlockedState read={src.read("DIGIT Document Renewal")} tx={tx} rows={3} /></div>
        : rows.length ? <ul className="divide-y divide-[var(--dhr-sep)]">{rows.slice(0, 8).map(({ d, k }) => (
          <li key={s(d.name)} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
            <span className="min-w-0"><Native dt="DIGIT Document Renewal" name={s(d.name)} module="05" className="dhr-link block truncate text-[13px] font-medium"><span data-no-i18n>{tx(arLabel(s(d.employee_name) || s(d.employee)), s(d.employee_name) || s(d.employee))}</span></Native><span className="block text-[11.5px] text-[var(--dhr-muted)]">{tr(s(d.document_type))}</span></span>
            <span className="flex items-center gap-2 text-[11.5px]"><span data-no-i18n className="text-[var(--dhr-muted)]">{s(d.expiry_date)}</span><Chip tone={(k ?? 0) < 0 ? "danger" : "warn"}>{(k ?? 0) < 0 ? tx("منتهية", "Expired") : relDay(today, s(d.expiry_date), tx)}</Chip></span>
          </li>))}</ul>
        : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={tx("لا وثائق تحتاج تجديدًا خلال 60 يومًا.", "No documents due within 60 days.")} /></div>}
    </HrInsightPanel>
  );
}

/* ------------------------------------------------------------------ side */

const STATE_TEXT: Record<CatalogState, [string, string, "neutral" | "warn" | "danger"]> = {
  available: ["متاح", "Available", "neutral"],
  "not-permitted": ["غير مسموح لدورك", "Not permitted for your role", "warn"],
  unavailable: ["غير متاح في هذا الإعداد", "Unavailable in this setup", "danger"],
  unlinked: ["يتطلب ربط حسابك بموظف", "Requires your account linked to an employee", "warn"],
};
const ROUTE_TEXT: Record<string, [string, string]> = { leave_approver: ["معتمد الإجازة", "Leave approver"], expense_approver: ["معتمد المصروفات", "Expense approver"], approver: ["معتمد الوردية", "Shift approver"], team: ["فريقك", "Your team"] };

/** Own request catalog: availability from the employee link + source DocPerm; starting opens a native draft linked to the session employee. */
function ServiceCatalog({ myId, company, user, src, start, tx }: { myId: string; company: string; user: string; src: Sources; start: (dt: string) => void; tx: Tx }) {
  const items = SELF_CATALOG.map((c) => {
    const meta = cachedMeta(c.dt);
    const canCreate = !!meta && !!myId && hasPerm(meta, "create", { name: "", doctype: c.dt, employee: myId, owner: user, company });
    const state = catalogState({ metaLoaded: !!meta && !!placeDoc(c.dt, "05"), linked: !!myId, canCreate });
    return { ...c, state, own: src.ready(c.dt) ? openOwn(c.dt, src.rows(c.dt), myId) : null };
  });
  const total = items.reduce((k, c) => k + (c.own?.length ?? 0), 0);
  const allReady = items.every((c) => c.own !== null);
  return (
    <HrInsightPanel title={tx("كتالوج خدماتي", "My service catalogue")} flush data-service-catalog
      meta={myId ? <><span>{tx("مفتوح لي:", "Open for me:")}</span> {allReady ? <b className="dhr-tnum" data-my-open>{total}</b> : src.v(null, ...SELF_CATALOG.map((c) => c.dt))}</> : tx("لا يمنح هذا الكتالوج أي دور.", "This catalogue grants no role.")}>
      {items.length > 0 && items.every((c) => c.state === "unlinked") ? (
        /* Account not linked: one explanation and a compact list, instead of the same "not linked" badge on every row. */
        <div data-catalog-unlinked>
          <p className="border-b border-[var(--dhr-sep)] px-4 py-2.5 text-[12.5px]"><span className="dhr-dot me-2 align-middle" data-tone="warn" aria-hidden />{tx("حسابك غير مرتبط بسجل موظف، لذلك لا تتوفر الخدمات الشخصية. يربط مسؤول الموارد البشرية الحساب من حقل «المستخدم» في سجل الموظف.", "Your account is not linked to an Employee record, so personal services are unavailable. HR links it from the User field on the Employee record.")}</p>
          <ul className="grid grid-cols-2 gap-px bg-[var(--dhr-sep)]">
            {items.map((c) => <li key={c.dt} className="min-h-10 bg-[var(--dhr-surface)] px-4 py-2.5 odd:last:col-span-2 text-[12.5px] text-[var(--dhr-muted)]" data-catalog-item={c.dt} data-catalog-state={c.state} data-catalog-open="">{tx(c.ar, c.en)}</li>)}
          </ul>
        </div>
      ) : (
      <ul className="divide-y divide-[var(--dhr-sep)]">
        {items.map((c) => (
          <li key={c.dt} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2" data-catalog-item={c.dt} data-catalog-state={c.state} data-catalog-open={c.own === null ? "" : c.own.length}>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">{tx(c.ar, c.en)}</span>
              {c.state === "available" ? <span className="block text-[11.5px] text-[var(--dhr-muted)]">{tx("مفتوح لي", "Open for me")}: {c.own === null ? src.v(null, c.dt) : c.own.length ? <Native dt={c.dt} module="05" filters={[["name", "in", c.own.map((r) => s(r["name"]))]]} className="dhr-link font-semibold"><span data-no-i18n>{c.own.length}</span></Native> : <span data-no-i18n>0</span>}</span> : c.state !== "unlinked" ? <span className="block text-[11.5px] text-[var(--dhr-muted)]">{tx(STATE_TEXT[c.state][0], STATE_TEXT[c.state][1])}</span> : null}
            </span>
            {c.state === "available" ? <button type="button" className="dhr-act" data-catalog-start={c.dt} onClick={() => start(c.dt)}>{tx("+ بدء", "+ Start")}</button> : <Chip tone={STATE_TEXT[c.state][2]}>{tx(c.state === "unlinked" ? "غير مرتبط" : c.state === "not-permitted" ? "غير مسموح" : "غير متاح", c.state === "unlinked" ? "Not linked" : c.state === "not-permitted" ? "Not permitted" : "Unavailable")}</Chip>}
          </li>
        ))}
      </ul>
      )}
    </HrInsightPanel>
  );
}

function WaitingOnMe({ admin, show, queues, src, tx }: { admin: boolean; show: boolean; queues: Queues; src: Sources; tx: Tx }) {
  return (
    <HrInsightPanel title={tx("بانتظار اعتمادي", "Waiting on me")} flush data-team-catalog meta={admin ? tx("دور موارد بشرية: كل الطلبات المفتوحة في نطاقك.", "HR role: every open request in your scope.") : tx("الطلبات التي تسمّيك معتمدًا، أو طلبات حضور فريقك.", "Requests that name you as approver, or your team's attendance requests.")}>
      {show ? <ul className="divide-y divide-[var(--dhr-sep)]">{queues.map((q) => (
        <li key={q.dt} className="flex min-h-11 items-center justify-between gap-2 px-4 py-1.5" data-team-queue={q.dt} data-team-count={src.ready(q.dt) ? q.rows.length : ""}>
          <span><span className="block text-[13px] font-medium">{tx(q.ar, q.en)}</span><span className="block text-[11px] text-[var(--dhr-muted)]">{tx(...(ROUTE_TEXT[q.route] ?? ["", ""]))}</span></span>
          {!src.ready(q.dt) ? src.v(null, q.dt) : q.rows.length ? <Native dt={q.dt} module="05" filters={[["name", "in", q.rows.map((r) => s(r["name"]))]]} className="dhr-act"><b className="dhr-tnum" data-no-i18n>{q.rows.length}</b></Native> : <span data-no-i18n className="dhr-tnum text-[var(--dhr-muted)]">0</span>}
        </li>))}</ul>
        : <p className="px-4 py-3 text-[13px] text-[var(--dhr-muted)]">{tx("لا يوجد فريق أو طلبات تسمّيك معتمدًا.", "No team, and no requests name you as approver.")}</p>}
    </HrInsightPanel>
  );
}

function Profile({ me, myId, admin, tx }: { me: ReturnType<typeof resolveEmployee>; myId: string; admin: boolean; tx: Tx }) {
  if (me.state !== "linked" || !myId) return null;
  return (
    <HrInsightPanel title={tx("ملفي", "My profile")} data-my-profile actions={<Link to="/digit-hr/employees/$name" params={{ name: myId }} className="dhr-act dhr-act-ghost">{tx("ملف 360", "360 view")}</Link>}>
      <div className="mb-3 flex items-center gap-3"><span className="dhr-avatar !h-10 !w-10 !text-[13px]" aria-hidden data-no-i18n>{initials(me.name)}</span><span className="min-w-0"><span className="block truncate text-[14px] font-semibold" data-no-i18n>{tx(arLabel(me.name), me.name)}</span><span className="block text-[12px] text-[var(--dhr-muted)]" data-no-i18n>{myId}</span></span></div>
      <Facts items={[[tx("الشركة", "Company"), tx(arLabel(me.company), me.company)], [tx("الدور", "Role"), admin ? tx("موارد بشرية", "HR") : tx("موظف", "Employee")]]} />
    </HrInsightPanel>
  );
}

/* ------------------------------------------------------------------ lower */

function RecentActivity({ lens, myId, admin, team, src, today, tx }: { lens: Lens; myId: string; admin: boolean; team: string[]; src: Sources; today: string; tx: Tx }) {
  const dts = [...SELF_CATALOG.map((c) => c.dt), "Attendance"];
  const inScope = (d: R) => lens === "me" ? !!myId && s(d.employee) === myId : admin || team.includes(s(d.employee));
  const rows = dts.flatMap((dt) => src.rows(dt).filter((d) => live(d) && inScope(d)).map((d) => ({ dt, d }))).sort((a, b) => s(b.d.modified).localeCompare(s(a.d.modified))).slice(0, 10);
  const label = (dt: string) => { const c = SELF_CATALOG.find((x) => x.dt === dt); return c ? tx(c.ar, c.en) : dt === "Attendance" ? tx("حضور", "Attendance") : dt; };
  if (lens === "me" && !myId) return null;
  return (
    <HrInsightPanel title={tx("النشاط الأخير", "Recent activity")} flush meta={lens === "me" ? tx("آخر التغييرات على سجلاتك.", "Latest changes to your records.") : tx("آخر التغييرات على طلبات من في نطاقك.", "Latest changes to requests from people in your scope.")} data-recent-activity={rows.length}>
      {rows.length ? <ol className="divide-y divide-[var(--dhr-sep)]">{rows.map(({ dt, d }) => (
        <li key={dt + s(d.name)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
          <span className="text-[11.5px] text-[var(--dhr-muted)] max-sm:hidden" data-no-i18n>{relDay(today, s(d.modified), tx)}</span>
          <span className="min-w-0"><span className="block text-[11.5px] text-[var(--dhr-muted)]">{label(dt)}{lens !== "me" && <span data-no-i18n> · {tx(arLabel(s(d.employee_name) || s(d.employee)), s(d.employee_name) || s(d.employee))}</span>}</span><Native dt={dt} name={s(d.name)} module="05" className="dhr-link block truncate text-[13px]"><span data-no-i18n>{dt === "Attendance" ? s(d.attendance_date) : REQ_SUMMARY(dt, d, tx)}</span></Native></span>
          <Chip>{tr(dt === "Attendance" ? s(d.status) : REQ_STATUS(dt, d))}</Chip>
        </li>))}</ol>
        : <div className="p-4"><HrEmptyOrBlockedState read={src.worst(...dts)} tx={tx} title={tx("لا نشاط حديث.", "No recent activity.")} /></div>}
    </HrInsightPanel>
  );
}
