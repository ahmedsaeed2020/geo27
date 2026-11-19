/**
 * DIGIT Enterprise cross-app defect hand-off (SH-045): one header action on every app screen — "Report a problem on this
 * screen". The shared shell captures the context (app, registered screen, route, the team that renders it, language,
 * screen size); the person only describes what went wrong and whether it is the screen itself or the shared frame
 * (header, dock, menus, side panels → DIGIT Enterprise). The report is a support issue (Support Desk), optionally handed
 * to DIGIT support at once. Logic: src/lib/coreShared/providers.ts raiseScreenDefect / defectOwner. App-agnostic.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { cachedMeta } from "@/lib/catalog";
import { useStoreVersion } from "@/lib/adapter";
import { hasPerm, useSessionUser } from "@/lib/session";
import { defaultCompany } from "@/lib/sessionDefaults";
import { useScopeMetas } from "@/lib/scope";
import { useLang } from "@/i18n";
import { useExperienceSlots } from "@/plugins/experienceSlots";
import { defectOwner, escalateIssue, raiseScreenDefect } from "@/lib/coreShared/providers";
import { DigitIcon } from "./DigitIcon";
import { EntDialog } from "./Surfaces";

type Ctx = { app: string; appLabel: [string, string]; screenId?: string; rendererOwner?: string };
const OWNER_LABEL: Record<string, [string, string]> = {
  digit_enterprise: ["DIGIT Enterprise (shared frame)", "ديجيت إنتربرايز (الإطار المشترك)"], digit_pro: ["DIGIT Pro team", "فريق ديجيت برو"],
  digit_hr: ["DIGIT HR team", "فريق ديجيت للموارد البشرية"], digit_construction: ["DIGIT Construction team", "فريق ديجيت للمقاولات"], digit_crm: ["DIGIT CRM team", "فريق ديجيت لإدارة العملاء"],
};

export function ReportProblem() {
  const app = useExperienceSlots()?.name ?? "digit_enterprise";
  useStoreVersion(); useScopeMetas(["Issue"]);
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const user = useSessionUser(); const path = useRouterState({ select: (r) => r.location.pathname });
  const [open, setOpen] = useState(false); const [ctx, setCtx] = useState<Ctx | null>(null);
  const [area, setArea] = useState<"screen" | "shell">("screen"); const [summary, setSummary] = useState(""); const [detail, setDetail] = useState(""); const [send, setSend] = useState(false);
  const [error, setError] = useState(""); const [done, setDone] = useState<{ name: string; owner: string } | null>(null);
  const meta = cachedMeta("Issue");
  if (!meta || !hasPerm(meta, "create", undefined, user)) return null;
  const start = () => {
    setOpen(true); setDone(null); setError(""); setSummary(""); setDetail(""); setArea("screen"); setSend(false);
    import("@/plugins/experience/registry").then((R) => {
      const hit = R.screenAtPath(path);
      const a = hit && !("conflict" in hit) ? hit.app : R.experienceRegistry().apps.get(app);
      setCtx({ app: a?.appId ?? app, appLabel: (a?.title as [string, string] | undefined) ?? [app, app], ...(hit && !("conflict" in hit) ? { screenId: hit.screen.screenId, rendererOwner: hit.screen.rendererOwner } : {}) });
    }).catch(() => setCtx({ app, appLabel: [app, app] }));
  };
  const c = ctx ?? { app, appLabel: [app, app] as [string, string] };
  const owner = defectOwner({ area, app: c.app });
  const viewport = typeof window === "undefined" ? "" : `${window.innerWidth}×${window.innerHeight}`;
  const submit = () => {
    const r = raiseScreenDefect({ app: c.app, appLabel: c.appLabel[0], route: path, screenId: c.screenId, rendererOwner: c.rendererOwner, area, lang: ar ? "ar" : "en", viewport, summary, detail, user, company: defaultCompany(user) });
    if (!r.ok) { setError(r.reason[ar ? 1 : 0]); return; }
    if (send) escalateIssue(r.issue, user);
    setDone({ name: r.issue.name, owner: r.owner }); setError("");
    toast.success(t(`Problem reported as ${r.issue.name}`, `سُجّلت المشكلة برقم ${r.issue.name}`));
  };
  const ownerLabel = (o: string) => (OWNER_LABEL[o] ?? [o, o])[ar ? 1 : 0];
  return <>
    <button type="button" className="dx-hdr-btn" aria-label={t("Report a problem on this screen", "الإبلاغ عن مشكلة في هذه الشاشة")} title={t("Report a problem on this screen", "الإبلاغ عن مشكلة في هذه الشاشة")} onClick={start} data-defect-report={app}>
      <DigitIcon name="ui-warning" size={20} />
    </button>
    <EntDialog open={open} onOpenChange={setOpen} id="report-problem" kicker={t("Support", "الدعم")} title={t("Report a problem on this screen", "الإبلاغ عن مشكلة في هذه الشاشة")} icon={<DigitIcon name="ui-warning" size={18} />}
      footer={done ? <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Close", "إغلاق")}</button>
        : <><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" onClick={submit} data-defect-submit>{t("Send report", "إرسال البلاغ")}</button></>}>
      {done ? <div className="space-y-2 text-sm" data-defect-done={done.name} data-defect-owner={done.owner}>
        <p>{t("Thank you — the report is saved as support issue", "شكرًا — حُفظ البلاغ كطلب دعم رقم")} <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "issue", name: done.name }} className="font-medium text-primary hover:underline" data-no-i18n onClick={() => setOpen(false)}>{done.name}</Link>.</p>
        <p className="text-muted-foreground">{t("It goes to:", "يُحال إلى:")} <strong>{ownerLabel(done.owner)}</strong></p>
      </div> : <div className="space-y-3 text-sm" data-defect-form>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-muted/40 p-2 text-xs" data-defect-context>
          <dt className="text-muted-foreground">{t("App", "التطبيق")}</dt><dd data-defect-app={c.app}>{c.appLabel[ar ? 1 : 0]}</dd>
          <dt className="text-muted-foreground">{t("Screen", "الشاشة")}</dt><dd><bdi data-no-i18n data-defect-screen={c.screenId ?? ""}>{c.screenId ?? path}</bdi></dd>
          <dt className="text-muted-foreground">{t("Goes to", "يُحال إلى")}</dt><dd data-defect-owner-preview={owner}>{ownerLabel(owner)}</dd>
        </dl>
        <fieldset className="flex flex-wrap gap-3" data-defect-area={area}>
          <legend className="mb-1 text-xs text-muted-foreground">{t("Where is the problem?", "أين المشكلة؟")}</legend>
          <label className="flex items-center gap-1"><input type="radio" name="defect-area" checked={area === "screen"} onChange={() => setArea("screen")} />{t("In this screen's content", "في محتوى هذه الشاشة")}</label>
          <label className="flex items-center gap-1"><input type="radio" name="defect-area" checked={area === "shell"} onChange={() => setArea("shell")} data-defect-area-shell />{t("In the header, menus or side panels", "في الترويسة أو القوائم أو اللوحات الجانبية")}</label>
        </fieldset>
        <label className="block"><span className="text-xs text-muted-foreground">{t("What went wrong?", "ما المشكلة؟")}</span>
          <input className="field-input mt-1 w-full" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={120} data-defect-summary /></label>
        <label className="block"><span className="text-xs text-muted-foreground">{t("Details (optional): what you did and what you expected", "تفاصيل (اختياري): ما الذي فعلته وما الذي توقعته")}</span>
          <textarea className="field-input mt-1 min-h-20 w-full" value={detail} onChange={(e) => setDetail(e.target.value)} data-defect-detail /></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} data-defect-send />{t("Also send it to DIGIT support now", "أرسله أيضًا إلى دعم ديجيت الآن")}</label>
        {error && <p className="text-xs text-destructive" role="alert" data-defect-error>{error}</p>}
      </div>}
    </EntDialog>
  </>;
}
