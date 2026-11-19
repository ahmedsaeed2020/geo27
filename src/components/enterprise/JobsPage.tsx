/** DIGIT Enterprise background jobs (src/lib/coreShared/jobs.ts): every bulk action and background import the user started, with progress and the per-row log. */
import { useEffect, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { useScopeMetas } from "@/lib/scope";
import { hasPerm, useSessionUser } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import * as J from "@/lib/coreShared/jobs";
import { EntFrame } from "./Surfaces";
import { Bar, DocLink, Kpi, NewDocLink, Table, tr, useT } from "./FinanceDesk";

const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const ST_AR: Record<string, string> = { Queued: "في الانتظار", Running: "قيد التشغيل", Completed: "اكتملت", "Completed with errors": "اكتملت مع أخطاء", Failed: "فشلت", Done: "تم", Skipped: "تُخطّي" };
const tone = (st: string) => (st === "Completed" || st === "Done" ? "ok" : st === "Failed" || st === "Completed with errors" || st === "Skipped" ? "bad" : "draft");

export function JobsPage() {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  useScopeMetas([CORE_DT.job, "Data Import"]);
  useEffect(() => { J.resumeJobs(user); }, [user]);
  const jobs = J.jobsFor(user); const [sel, setSel] = useState(""); const [onlyFailed, setOnlyFailed] = useState(false);
  const cur: Doc | undefined = jobs.find((j) => j.name === sel) ?? jobs[0];
  const Chip = ({ st }: { st: string }) => <span className={`ent-qv-status ent-qv-tone-${tone(st)}`} data-job-status={st}>{ar ? ST_AR[st] ?? st : st}</span>;
  const rows = ((cur?.["rows"] as { idx: number; row_ref: string; status: string; message: string }[] | undefined) ?? []).filter((r) => !onlyFailed || r.status === "Failed" || r.status === "Skipped");
  const active = jobs.filter((j) => ["Queued", "Running"].includes(s(j["status"]))).length; const withErr = jobs.filter((j) => ["Failed", "Completed with errors"].includes(s(j["status"]))).length;
  const diMeta = cachedMeta("Data Import");
  return <div className="space-y-3" data-jobs-page={jobs.length}>
    {diMeta && hasPerm(diMeta, "create", undefined, user) && <Bar><NewDocLink dt="Data Import" data-jobs-import-new>{t("New data import", "استيراد بيانات جديد")}</NewDocLink></Bar>}
    <div className="flex flex-wrap gap-2">
      <Kpi id="jobs-active" label={t("Running now", "قيد التشغيل الآن")} value={String(active)} />
      <Kpi id="jobs-total" label={t("Jobs", "المهام")} value={String(jobs.length)} />
      <Kpi id="jobs-errors" label={t("Jobs with errors", "مهام بها أخطاء")} value={String(withErr)} {...(withErr ? { tone: "bad" } : {})} />
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      <EntFrame id="jobs-list" title={t("Background jobs", "المهام الخلفية")} note={t("Large bulk actions and background imports run here while you keep working; each row is logged.", "تعمل الإجراءات الجماعية الكبيرة وعمليات الاستيراد الخلفية هنا أثناء عملك؛ ويُسجَّل كل سطر.")}>
        {jobs.length ? <div className="max-h-[30rem] overflow-auto"><Table id="job-rows" head={[t("Job", "المهمة"), t("Status", "الحالة"), t("Progress", "التقدم"), t("Started", "البدء")]}>
          {jobs.map((j) => { const total = n(j["total"]); const pct = total ? Math.round(((n(j["done"]) + n(j["failed"])) / total) * 100) : 100;
            return <tr key={j.name} className={`${tr} cursor-pointer ${cur?.name === j.name ? "bg-muted/60" : ""}`} data-job={j.name} onClick={() => setSel(j.name)}>
              <td className="p-2"><span className="block text-sm font-medium" data-no-i18n>{s(j["title"])}</span><span className="text-xs text-muted-foreground">{s(j["kind"]) === "Data import" ? t("Data import", "استيراد بيانات") : t("Bulk action", "إجراء جماعي")} · <bdi data-no-i18n>{j.name}</bdi></span></td>
              <td className="p-2"><Chip st={s(j["status"])} /></td>
              <td className="p-2"><div className="h-1.5 w-28 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div><span className="text-[11px] tabular-nums text-muted-foreground" data-no-i18n>{n(j["done"])}/{total}{n(j["failed"]) ? ` · ✗ ${n(j["failed"])}` : ""}</span></td>
              <td className="p-2 text-xs tabular-nums" data-no-i18n>{s(j["started_on"])}</td>
            </tr>; })}
        </Table></div> : <p className="text-sm text-muted-foreground" data-jobs-empty>{t("No background jobs yet. Bulk actions on 20 or more documents and background imports appear here.", "لا توجد مهام خلفية بعد. تظهر هنا الإجراءات الجماعية على 20 مستندًا أو أكثر وعمليات الاستيراد الخلفية.")}</p>}
      </EntFrame>
      <EntFrame id="job-log" title={cur ? <span data-no-i18n>{s(cur["title"])}</span> : t("Per-row log", "سجل الأسطر")}
        actions={cur ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} data-job-only-failed />{t("Only failed rows", "الأسطر الفاشلة فقط")}</label> : undefined}>
        {cur ? <>
          <p className="mb-2 text-xs text-muted-foreground">{t("Started by", "بدأها")} <bdi data-no-i18n>{s(cur["started_by"])}</bdi>{cur["finished_on"] ? <> · {t("finished", "انتهت")} <bdi data-no-i18n>{s(cur["finished_on"])}</bdi></> : null}
            {cur["__data_import"] ? <> · <DocLink dt="Data Import" name={s(cur["__data_import"])} /></> : null}</p>
          <div className="max-h-[26rem] overflow-auto"><Table id="job-log-rows" head={[t("Row", "السطر"), t("Status", "الحالة"), t("Message", "الرسالة")]}>
            {rows.map((r) => <tr key={r.idx} className={tr} data-job-row={r.row_ref} data-status={r.status}>
              <td className="p-2 text-xs">{s(cur["kind"]) === "Bulk action" && adapter.get(s(cur["reference_doctype"]), r.row_ref) ? <DocLink dt={s(cur["reference_doctype"])} name={r.row_ref} /> : <bdi data-no-i18n>{/^Row \d+$/.test(r.row_ref) ? `${t("Row", "السطر")} ${r.row_ref.slice(4)}` : r.row_ref}</bdi>}</td>
              <td className="p-2"><Chip st={r.status} /></td><td className="p-2 text-xs" data-no-i18n>{r.message}</td></tr>)}
          </Table></div></> : <p className="text-sm text-muted-foreground">{t("Choose a job to see its rows.", "اختر مهمة لعرض أسطرها.")}</p>}
      </EntFrame>
    </div>
  </div>;
}
