/**
 * NB-2/NB-3 03.3 depth: shift request queue (stage filter, waiting-on-me, guarded approve/reject with readback,
 * assignment/overlap/leave facts) and overtime slips (recorded hours only, no pay). Rules live in
 * plugins/digit_hr/shiftRequests.ts and operations.ts. URL state: ?sr (stage), ?srme=1 (waiting on me).
 */
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HrEmptyOrBlockedState, HrInsightPanel, HrOperationalKpi, Pill, useSearchPatch, type Tone } from "@/components/digithr/home/kit";
import { scopedGet } from "@/plugins/digit_hr/compat/scope";
import { currentUser } from "@/plugins/digit_hr/compat/session";
import { decideShiftRequest, mayDecideShiftRequest } from "@/plugins/digit_hr/operations";
import { overtimeRows, overtimeTotals, shiftRequestRows, stageCounts, type ShiftReqRow, type ShiftReqStage } from "@/plugins/digit_hr/shiftRequests";
import { DateRange, Native, arLabel, type Sources } from "./shared";

type Tx = (ar: string, en: string) => string;
type Row = Record<string, unknown>;
const STAGES: { id: ShiftReqStage; ar: string; en: string; tone: Tone }[] = [
  { id: "pending", ar: "بانتظار القرار", en: "Awaiting decision", tone: "warn" },
  { id: "decided", ar: "قرار غير معتمد", en: "Decided, not submitted", tone: "info" },
  { id: "approved", ar: "معتمد", en: "Approved", tone: "success" },
  { id: "rejected", ar: "مرفوض", en: "Rejected", tone: "neutral" },
];
const useSearch = () => useRouterState({ select: (r) => r.location.search as Record<string, unknown> });

export function ShiftRequestsPanel({ tx, src, filter }: { tx: Tx; src: Sources; filter: <T,>(rows: T[]) => T[] }) {
  const search = useSearch(); const patch = useSearchPatch();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const DTS = ["Shift Request", "Shift Assignment", "Leave Application"];
  const all = src.ready(...DTS) ? shiftRequestRows(filter(src.rows("Shift Request")), filter(src.rows("Shift Assignment")), filter(src.rows("Leave Application"))) : [];
  const me = currentUser();
  const mineOnly = search["srme"] === "1";
  const counts = stageCounts(all);
  const asked = typeof search["sr"] === "string" ? (search["sr"] as string) : "";
  const stage = (["pending", "decided", "approved", "rejected", "all"].includes(asked) ? asked : counts.pending ? "pending" : "all") as ShiftReqStage | "all";
  const waitingOnMe = all.filter((r) => r.stage === "pending" && r.approver === me).length;
  const rows = all.filter((r) => (stage === "all" || r.stage === stage) && (!mineOnly || (r.stage === "pending" && r.approver === me)));
  const decide = (r: ShiftReqRow, status: "Approved" | "Rejected") => {
    setMsg(null);
    try { decideShiftRequest(r.name, status); setMsg({ tone: "ok", text: status === "Approved" ? tx(`اعتُمد طلب الوردية ${r.name}. في DIGIT يُنشئ الخادم إسناد الوردية عند الاعتماد.`, `Shift request ${r.name} approved. In DIGIT the server creates the shift assignment on approval.`) : tx(`رُفض طلب الوردية ${r.name}.`, `Shift request ${r.name} rejected.`) }); }
    catch (e) { setMsg({ tone: "err", text: (e as Error).message }); }
  };
  return (
    <HrInsightPanel data-shift-requests={rows.length} flush title={tx("طلبات الورديات", "Shift requests")}
      meta={tx("الطلب ← القرار (اعتماد/رفض) ← الإسناد. يظهر التعارض مع إسناد وردية أخرى أو إجازة معتمدة.", "Request → decision (approve/reject) → assignment. Overlaps with another shift assignment or approved leave are flagged.")}
      info={tx("حسب DIGIT HR: يُعتمد الطلب أو يُرفض ثم يُرسل؛ عند إرسال طلب معتمد يُنشئ الخادم «إسناد وردية». المعاينة لا تُنشئ الإسناد، وتعرض «لا إسناد بعد» عندما لا يوجد إسناد مطابق.", "Per DIGIT HR a request is approved or rejected and then submitted; submitting an approved request makes the server create a Shift Assignment. The preview does not create it and shows \"No assignment yet\" when none matches.")}
      toolbar={<div className="flex flex-wrap items-center gap-1.5 px-4 py-2" role="group" aria-label={tx("مرحلة الطلب", "Request stage")}>
        <button type="button" className="dhr-act dhr-act-sm" aria-pressed={stage === "all"} onClick={() => patch({ sr: "all" })} data-sr-filter="all">{tx("الكل", "All")} <span data-no-i18n>{all.length}</span></button>
        {STAGES.map((x) => <button key={x.id} type="button" className="dhr-act dhr-act-sm" aria-pressed={stage === x.id} onClick={() => patch({ sr: x.id })} data-sr-filter={x.id}>{tx(x.ar, x.en)} <span data-no-i18n>{counts[x.id]}</span></button>)}
        <label className="ms-auto inline-flex items-center gap-1.5 text-[12.5px]"><input type="checkbox" checked={mineOnly} onChange={(e) => patch({ srme: e.target.checked ? "1" : undefined })} data-sr-mine />{tx("بانتظاري", "Waiting on me")} <span className="dhr-tnum" data-no-i18n data-sr-mine-count={waitingOnMe}>{waitingOnMe}</span></label>
      </div>}>
      {msg && <p role={msg.tone === "err" ? "alert" : "status"} className={`mx-4 mt-3 ${msg.tone === "err" ? "dhr-alert text-sm" : "text-[12.5px] text-[var(--dhr-emerald)]"}`} data-sr-msg={msg.tone}>{msg.text}</p>}
      {!src.ready(...DTS) ? <div className="p-4"><HrEmptyOrBlockedState read={src.worst(...DTS)} tx={tx} rows={3} /></div> : rows.length ? (
        <ul className="divide-y divide-[var(--dhr-sep)]">{rows.map((r) => { const st = STAGES.find((x) => x.id === r.stage)!; const doc = r.stage === "pending" ? scopedGet("Shift Request", r.name) : undefined; const can = !!doc && mayDecideShiftRequest(doc); return (
          <li key={r.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5" data-sr-row={r.name} data-sr-stage={r.stage}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Native dt="Shift Request" name={r.name} module="03" className="dhr-link font-medium"><span data-no-i18n>{tx(arLabel(r.employeeName), r.employeeName)}</span></Native>
                <span className="text-[12.5px]" data-no-i18n>{tx(arLabel(r.shiftType), r.shiftType)}</span>
                <Pill tone={st.tone}><span data-sr-status>{tx(st.ar, st.en)}</span></Pill>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--dhr-muted)]">
                <DateRange from={r.from} to={r.to} />
                {r.approver && <span>{tx("المعتمد:", "Approver:")} <bdi dir="ltr" data-no-i18n>{r.approver === me ? tx("أنت", "you") : r.approver}</bdi></span>}
                {r.stage === "approved" && (r.assignment ? <Native dt="Shift Assignment" name={r.assignment} module="03" className="dhr-link">{tx("الإسناد", "Assignment")} <span data-no-i18n>{r.assignment}</span></Native> : <span data-sr-noassign>{tx("لا إسناد بعد (يُنشئه الخادم)", "No assignment yet (server creates it)")}</span>)}
                {r.conflicts.length > 0 && <span className="text-[var(--dhr-warn-text)]" data-sr-conflict={r.conflicts.length}>{tx("يتداخل مع إسناد وردية أخرى", "Overlaps another shift assignment")}</span>}
                {r.leave.length > 0 && <span className="text-[var(--dhr-warn-text)]" data-sr-leave={r.leave.length}>{tx("يتداخل مع إجازة معتمدة", "Overlaps approved leave")}</span>}
              </div>
            </div>
            {can && <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => decide(r, "Approved")} data-sr-approve={r.name}>{tx("اعتماد", "Approve")}</Button>
              <Button variant="ghost" size="sm" onClick={() => decide(r, "Rejected")} data-sr-reject={r.name}>{tx("رفض", "Reject")}</Button>
            </div>}
          </li>); })}</ul>
      ) : <div className="p-4"><HrEmptyOrBlockedState tx={tx} title={mineOnly ? tx("لا طلبات بانتظارك.", "No requests waiting on you.") : tx("لا طلبات في هذه المرحلة.", "No requests in this stage.")} /></div>}
    </HrInsightPanel>
  );
}

export function OvertimePanel({ tx, src, filter }: { tx: Tx; src: Sources; filter: <T,>(rows: T[]) => T[] }) {
  const ready = src.ready("Overtime Slip");
  const rows = ready ? overtimeRows(filter(src.rows("Overtime Slip"))) : [];
  const t = overtimeTotals(rows);
  return (
    <HrInsightPanel data-overtime={rows.length} title={tx("العمل الإضافي", "Overtime")}
      meta={tx("قسائم العمل الإضافي: الساعات المسجلة فقط، بلا أجر.", "Overtime slips: recorded hours only, no pay.")}
      info={tx("الساعات من «إجمالي مدة العمل الإضافي» أو مجموع تفاصيل القسيمة. احتساب أجر العمل الإضافي يتم في الرواتب على الخادم ولا يُعرض هنا.", "Hours come from the slip's total overtime duration or the sum of its detail rows. Overtime pay is calculated by payroll on the server and is not shown here.")}>
      {!ready ? <HrEmptyOrBlockedState read={src.read("Overtime Slip")} tx={tx} rows={2} /> : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" data-overtime-kpis>
            <HrOperationalKpi label={tx("مسودات بانتظار الاعتماد", "Drafts awaiting approval")} value={<span data-ot-draft>{t.draft}</span>} sub={<span data-no-i18n>{t.draftHours} {tx("ساعة", "h")}</span>} tone={t.draft ? "warn" : undefined} source="Overtime Slip docstatus=0" />
            <HrOperationalKpi label={tx("قسائم معتمدة", "Submitted slips")} value={<span data-ot-submitted>{t.submitted}</span>} sub={<span data-no-i18n>{t.submittedHours} {tx("ساعة", "h")}</span>} source="Overtime Slip docstatus=1" />
          </div>
          {rows.length ? <ul className="divide-y divide-[var(--dhr-sep)] rounded-[var(--dhr-r-sm)] border border-[var(--dhr-sep)]">{rows.slice(0, 10).map((r) => (
            <li key={r.name} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-ot-row={r.name}>
              <Native dt="Overtime Slip" name={r.name} module="03" className="dhr-link font-medium"><span data-no-i18n>{tx(arLabel(r.employeeName), r.employeeName)}</span></Native>
              <span className="text-[12px] text-[var(--dhr-muted)]"><DateRange from={r.from} to={r.to} /></span>
              <span className="dhr-tnum" data-no-i18n>{r.hours} {tx("ساعة", "h")}</span>
              <Pill tone={r.state === "draft" ? "warn" : "success"}>{r.state === "draft" ? tx("مسودة", "Draft") : tx("معتمد", "Submitted")}</Pill>
            </li>))}</ul>
            : <HrEmptyOrBlockedState tx={tx} title={tx("لا قسائم عمل إضافي مسجلة.", "No overtime slips recorded.")} body={tx("تُنشأ القسائم من الحضور وأنواع العمل الإضافي في نظام الموارد البشرية الأصلي.", "Slips are created from attendance and overtime types in DIGIT HR.")} action={<Native dt="Overtime Slip" module="03" className="dhr-act">{tx("قسائم العمل الإضافي", "Overtime slips")}</Native>} />}
        </div>
      )}
    </HrInsightPanel>
  );
}
