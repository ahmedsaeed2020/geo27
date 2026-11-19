/**
 * F4-06 offline queue & recovery (N57): every step captured on a technician's device with its sync state — بانتظار
 * المزامنة / تمت المزامنة / تعارض / مستبعد — the reason of a conflict, and the dispatcher's decision (apply on the current
 * record, or discard with a note). Reads and writes only through domain/offline.ts, the same queue the journey fills.
 */
import type { Doc } from "@/lib/adapter";
import { SyncChip, type SyncState } from "@/components/enterprise/kit";
import { list } from "../domain/data";
import { s } from "../domain/rules";
import { arRule, enRule } from "../domain/services";
import { offlineCounts, payloadOf, queue, resolveOffline, syncOffline } from "../domain/offline";
import { nm } from "./dayBoard";
import { OfflineBand } from "./fieldJourney";
import { ActionButton, AppLink, DataTable, DocRef, INPUT, Kpi, PageHeader, Panel, ReasonAction, SignalGrid, dtTxt, numTxt, opt, useFx, useUrlState, type Col } from "./kit";

const LBL = { Pending: ["Waiting to sync", "بانتظار المزامنة"], Synced: ["Synced", "تمت المزامنة"], Conflict: ["Conflict", "تعارض"], Discarded: ["Discarded", "مستبعد"] } as const;
const STATE: Record<string, SyncState> = { Pending: "pending", Synced: "synced", Conflict: "conflict", Discarded: "discarded" };
export function FieldOfflinePage() {
  const { t, ar } = useFx(); const [q, set] = useUrlState();
  const tech = q["tech"] ?? ""; const want = q["state"] ?? "";
  const rowsAll = queue(tech || undefined); const c = offlineCounts(tech || undefined);
  const rows = (want ? rowsAll.filter((a) => s(a["sync_state"]) === want) : rowsAll).slice().reverse() as (Doc & Record<string, unknown>)[];
  const note = (a: Doc) => { const n = s(a["conflict_note"]); return n ? (ar ? arRule(n) : enRule(n)) : ""; };
  const what = (a: Doc) => { const p = payloadOf(a); if (!p) return opt(a["action"], ar);
    return p.kind === "Result" ? `${t("Result", "نتيجة")}${p.outcome ? ` · ${opt(p.outcome, ar)}` : ""}${p.measurement !== undefined && p.measurement !== "" ? ` · ${p.measurement}` : ""}` : p.kind === "Severity" ? `${t("Finding severity", "خطورة الملاحظة")} · ${opt(p.severity, ar)}`
      : p.kind === "Parts" ? `${p.mode === "return" ? t("Return", "إرجاع") : t("Used", "استهلاك")} · ${p.qty}` : p.kind === "Time" ? `${t("Time", "الوقت")} · ${p.hours} ${t("h", "س")}` : opt(p.kind, ar); };
  const cols: Col<Doc & Record<string, unknown>>[] = [
    { key: "captured_on", label: t("Captured", "وقت الالتقاط"), value: (r) => s(r["captured_on"]), render: (r) => <span data-no-i18n>{dtTxt(r["captured_on"])}</span> },
    { key: "technician", label: t("Technician", "الفني"), value: (r) => nm("FSM Technician", r["technician"], ar), render: (r) => <span data-no-i18n>{nm("FSM Technician", r["technician"], ar)}</span> },
    { key: "device_id", label: t("Device", "الجهاز"), render: (r) => <span data-no-i18n>{s(r["device_id"])}</span> },
    { key: "action", label: t("Step", "الخطوة"), value: (r) => s(r["action"]), render: (r) => what(r) },
    { key: "reference_name", label: t("Record", "السجل"), value: (r) => s(r["reference_name"]), render: (r) => s(r["reference_name"]) ? <DocRef doctype={s(r["reference_doctype"])} name={r["reference_name"]} /> : <span>—</span> },
    { key: "sync_state", label: t("Sync", "المزامنة"), value: (r) => s(r["sync_state"]), render: (r) => <SyncChip ar={ar} state={STATE[s(r["sync_state"])] ?? "pending"} /> },
    { key: "synced_on", label: t("Synced", "وقت المزامنة"), value: (r) => s(r["synced_on"]), render: (r) => <span data-no-i18n>{dtTxt(r["synced_on"])}</span> },
    { key: "conflict_note", label: t("Reason", "السبب"), render: (r) => <span className="text-xs">{note(r) || "—"}</span> },
  ];
  const techs = list("FSM Technician").filter((x) => s(x["status"]) !== "Inactive");
  return (
    <div className="w-full min-w-0 fsm-field" data-page="fsm-field-offline" data-tech={tech}>
      <PageHeader title={t("Offline queue & recovery", "طابور العمل دون اتصال والاسترداد")} crumbs={[{ label: t("Technician workspace", "مساحة الفني الميدانية"), to: "field" }]} band={{
        question: t("Which steps were captured on a device, which reached the office, and which need a decision?", "ما الخطوات الملتقطة على الأجهزة، وما الذي وصل للمكتب، وما الذي يحتاج قرارًا؟"),
        basis: t("Steps are replayed in the order they were captured. A step whose record changed meanwhile is kept as a conflict and never applied over the newer state.", "تُعاد الخطوات بترتيب التقاطها. الخطوة التي تغيّر سجلها في الأثناء تبقى تعارضًا ولا تُطبَّق فوق الحالة الأحدث."),
        controls: <div className="flex flex-wrap items-center gap-2">
          <select className={`${INPUT} min-h-10`} value={tech} onChange={(e) => set({ tech: e.target.value || undefined })} aria-label={t("Technician", "الفني")} data-offline-tech>
            <option value="">{t("All technicians", "كل الفنيين")}</option>{techs.map((x) => <option key={x.name} value={x.name}>{nm("FSM Technician", x.name, ar)}</option>)}
          </select>
        </div>,
        actions: <ActionButton band primary label={t("Sync all waiting steps", "مزامنة كل الخطوات المنتظرة")} disabled={c.pending === 0} run={() => syncOffline(tech || undefined)} />,
      }} />
      {tech && <OfflineBand tech={tech} />}
      <SignalGrid cols={4}>
        {(["Pending", "Synced", "Conflict", "Discarded"] as const).map((k) => <Kpi key={k} label={ar ? LBL[k][1] : LBL[k][0]}
          value={numTxt(k === "Pending" ? c.pending : k === "Synced" ? c.synced : k === "Conflict" ? c.conflict : c.discarded)} tone={k === "Conflict" && c.conflict ? "bad" : k === "Pending" && c.pending ? "warn" : k === "Synced" ? "good" : "neutral"}
          basis={want === k ? t("Filtered — tap to show all", "مُصفّى — اضغط لعرض الكل") : t("Tap to filter", "اضغط للتصفية")} to={`field/offline?${new URLSearchParams({ ...(tech ? { tech } : {}), ...(want === k ? {} : { state: k }) }).toString()}`} cta={t("Filter", "تصفية")} icon={k === "Conflict" ? "alert" : "count"} />)}
      </SignalGrid>
      <Panel title={t("Captured steps", "الخطوات الملتقطة")} subtitle={want ? opt(want, ar) : t("Newest first", "الأحدث أولاً")}>
        <div className="fsm-offq"><DataTable id="fsm-offline" register rows={rows} cols={cols} doctype="FSM Offline Action" empty={t("No steps captured on a device yet.", "لا خطوات ملتقطة على الأجهزة بعد.")}
          actions={(r) => s(r["sync_state"]) === "Conflict" ? <><ActionButton compact label={t("Apply on current record", "تطبيق على السجل الحالي")} run={() => resolveOffline(r.name, "retry")} /><ReasonAction compact label={t("Discard", "استبعاد")} placeholder={t("Why is it discarded?", "لماذا تُستبعد؟")} run={(x) => resolveOffline(r.name, "discard", x)} /></> : null} /></div>
      </Panel>
      <p className="mt-2 text-xs text-muted-foreground">{t("Open a technician's day to work offline:", "افتح يوم فني للعمل دون اتصال:")} <AppLink to="field/day">{t("My day", "يومي")}</AppLink></p>
    </div>
  );
}
