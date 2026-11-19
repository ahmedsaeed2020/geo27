/**
 * EXT-03 Controlled print outputs (outputs). Pick a construction document and a bilingual template, preview it (marked
 * "not issued"), then issue a controlled copy: a Digit Print Artifact holding the exact snapshot, its SHA-256, the
 * template version, the source revision and the as-of date. Issued copies can be opened, printed, downloaded,
 * re-verified against the current source, and voided with a reason — never deleted. Source, template, as-of and the
 * opened copy live in the URL. The source document is never changed.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { notifyError, notifySaved } from "./notify";
import type { Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, hasPerm, userRoles } from "@/lib/session";
import type { PluginPageProps } from "@/plugins/pages";
import { DOCTYPE_AR, OPTION_AR } from "../schema";
import { APP, get, list, projectTitle, today } from "../domain/data";
import { finality, formatByName, formatsFor, PRINTABLE_DOCTYPES, renderPrint, sanitizeSnapshot, templateVersion } from "../domain/print";
import { artifactsOf, issuePrint, verifyArtifact, voidPrint, type Verification } from "../domain/printActions";
import { BTN, DataTable, DocRef, Empty, Field, Filters, inputCls, Note, PageHeader, Section, StateBadge, useCx, type Col } from "./kit";
import { DateInput } from "@/components/form/DateInput";

const NAME_AR: Record<string, string> = { "Digit BOQ (Bilingual)": "جدول الكميات (ثنائي اللغة)", "Digit Client Claim (Bilingual)": "طلب دفعة مرحلية (ثنائي اللغة)", "Digit Client Certificate (Bilingual)": "شهادة دفعة مرحلية (ثنائي اللغة)", "Digit Subcontractor Bill (Bilingual)": "مستخلص مقاول باطن (ثنائي اللغة)" };
export const templateLabel = (n: string, ar: boolean) => (ar ? NAME_AR[n] ?? n : n);
const dtLabel = (dt: string, ar: boolean) => (ar ? DOCTYPE_AR[dt] ?? dt : dt.replace(/^Digit /, ""));
const opt = (v: unknown, ar: boolean) => (ar ? OPTION_AR[String(v)] ?? String(v ?? "") : String(v ?? ""));
const stamp = (v: unknown) => String(v ?? "").replace("T", " ").slice(0, 19) || "—";
const docLabel = (dt: string, d: Doc) => (d["title"] ? String(d["title"]) : dt === "Digit Client Claim" ? `#${String(d["claim_no"] ?? "")}` : dt === "Digit Subcontractor Bill" ? `RA ${String(d["ra_no"] ?? "")}` : "");
const canVoid = (a: Doc, user = currentUser()) => user === "Administrator" || user === String(a["owner"] ?? "") || userRoles(user).some((r) => r === "System Manager" || r === "Digit Director");

function useUrl() {
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const nav = useNavigate();
  const val = (k: string) => (typeof search[k] === "string" ? String(search[k]) : "");
  const set = (p: Record<string, string>, replace = true) => void nav({ to: "/plugins/$name/$", params: { name: APP, _splat: "outputs" }, search: Object.fromEntries(Object.entries({ ...search, ...p }).filter(([, v]) => v !== "" && v !== undefined)) as never, replace });
  return { val, set };
}

export function PrintOutputsPage(_: PluginPageProps) {
  const { t, ar } = useCx();
  const { val, set } = useUrl();
  const doctype = PRINTABLE_DOCTYPES.includes(val("doctype")) ? val("doctype") : "";
  const name = val("name");
  const asOf = val("as_of") || today();
  const formats = doctype ? formatsFor(doctype) : [];
  const pf = formatByName(val("format")) ?? formats[0];
  const meta = doctype ? cachedMeta(doctype) : undefined;
  const records = doctype ? list(doctype).sort((a, b) => String(b["modified"] ?? "").localeCompare(String(a["modified"] ?? ""))) : [];
  const src = doctype && name ? get(doctype, name) : undefined;
  const readable = !!src && !!meta && hasPerm(meta, "read", src);
  const artifact = val("artifact");
  return (
    <div className="w-full min-w-0" data-page="construction-outputs">
      <PageHeader title={t("Controlled print outputs", "المخرجات المطبوعة المضبوطة")} crumbs={[{ label: t("Construction settings", "إعدادات المقاولات"), to: "settings?family=print" }]}
        subtitle={t("Issue a controlled copy of a construction document: the exact printed content, its fingerprint, template version and source revision are kept; the document itself never changes.", "أصدر نسخة مضبوطة من مستند مقاولات: يُحفظ المحتوى المطبوع بدقة مع بصمته وإصدار القالب ومراجعة المصدر؛ ولا يتغير المستند نفسه.")} />
      <Filters>
        <Field label={t("Document type", "نوع المستند")}>
          <select className={inputCls} value={doctype} data-out-filter="doctype" onChange={(e) => set({ doctype: e.target.value, name: "", format: "", artifact: "" })}>
            <option value="">{t("— choose —", "— اختر —")}</option>
            {PRINTABLE_DOCTYPES.map((d) => <option key={d} value={d}>{dtLabel(d, ar)}</option>)}
          </select>
        </Field>
        {doctype && <Field label={t("Document", "المستند")}>
          <select className={inputCls} value={name} data-out-filter="name" onChange={(e) => set({ name: e.target.value, artifact: "" })}>
            <option value="">{records.length ? t("— choose —", "— اختر —") : t("No documents you can read", "لا توجد مستندات يمكنك قراءتها")}</option>
            {records.map((r) => <option key={r.name} value={r.name} data-no-i18n>{r.name}{docLabel(doctype, r) ? ` · ${docLabel(doctype, r)}` : ""} · {(projectTitle(get("Project", String(r["project"] ?? ""))) || String(r["project"] ?? ""))}</option>)}
          </select>
        </Field>}
        {doctype && <Field label={t("Template", "القالب")}>
          <select className={inputCls} value={pf?.name ?? ""} data-out-filter="format" onChange={(e) => set({ format: e.target.value })}>
            {formats.map((f) => <option key={f.name} value={f.name}>{templateLabel(f.name, ar)} · v{templateVersion(f)}</option>)}
          </select>
        </Field>}
        {doctype && <Field label={t("Language", "اللغة")}><select className={inputCls} value="Bilingual" disabled aria-describedby="out-lang-note"><option value="Bilingual">{t("Bilingual (Arabic + English)", "ثنائي اللغة (عربي + إنجليزي)")}</option></select></Field>}
        {doctype && <Field label={t("As of", "حتى تاريخ")}><DateInput className={inputCls} value={asOf} data-out-filter="as_of" onChange={(e) => set({ as_of: e.target.value })} /></Field>}
      </Filters>
      {doctype && <p id="out-lang-note" className="-mt-2 mb-3 text-xs text-muted-foreground">{t("These templates print every label in Arabic and English. A single-language print uses the document's standard print from its form.", "تطبع هذه القوالب كل تسمية بالعربية والإنجليزية. الطباعة بلغة واحدة تتم من الطباعة القياسية في نموذج المستند.")}</p>}
      {!doctype && <AllArtifacts />}
      {doctype && name && !src && <Note tone="bad">{t("This document does not exist.", "هذا المستند غير موجود.")} <span data-no-i18n>{name}</span></Note>}
      {src && !readable && <Note tone="bad">{t("You cannot read this document, so it cannot be printed.", "لا يمكنك قراءة هذا المستند، لذلك لا يمكن طباعته.")}</Note>}
      {src && readable && pf && <SourcePanel doctype={doctype} src={src} pfName={pf.name} asOf={asOf} artifact={artifact} onOpen={(a) => set({ artifact: a }, false)} />}
      {doctype && !name && records.length > 0 && <Empty>{t("Choose a document to preview and issue.", "اختر مستندًا لمعاينته وإصداره.")}</Empty>}
    </div>
  );
}

function SourcePanel({ doctype, src, pfName, asOf, artifact, onOpen }: { doctype: string; src: Doc; pfName: string; asOf: string; artifact: string; onOpen: (a: string) => void }) {
  const { t, ar } = useCx();
  const pf = formatByName(pfName)!;
  const fin = finality(doctype, src);
  const preview = useMemo(() => renderPrint(pf, src, asOf), [pf, src, asOf]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = cachedMeta("Digit Print Artifact");
  const canIssue = !!meta && hasPerm(meta, "create");
  const history = artifactsOf(doctype, src.name);
  const issue = async () => {
    setBusy(true);
    try {
      const r = await issuePrint({ doctype, name: src.name, format: pf.name, as_of: asOf, copy_reason: reason.trim() });
      if (!r.ok) { notifyError(r.errors.join("\n")); return; }
      notifySaved(r.reused ? t(`An identical copy was already issued: ${r.name}`, `صدرت نسخة مطابقة سابقًا: ${r.name}`) : t(`Controlled copy ${r.name} issued`, `صدرت النسخة المضبوطة ${r.name}`));
      setReason(""); onOpen(r.name!);
    } finally { setBusy(false); }
  };
  return (
    <>
      <Section title={t("Source", "المصدر")}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr_auto_1fr]" data-out-source={src.name}>
          <dt className="text-muted-foreground">{t("Document", "المستند")}</dt><dd><DocRef doctype={doctype} name={src.name} /></dd>
          <dt className="text-muted-foreground">{t("Status", "الحالة")}</dt><dd><StateBadge state={src["workflow_state"] ?? (Number(src["docstatus"]) === 1 ? "Submitted" : "Draft")} /></dd>
          <dt className="text-muted-foreground">{t("Project", "المشروع")}</dt><dd data-no-i18n>{(projectTitle(get("Project", String(src["project"] ?? ""))) || String(src["project"] ?? "—"))}</dd>
          <dt className="text-muted-foreground">{t("Revision", "المراجعة")}</dt><dd data-no-i18n>{stamp(src["modified"])}</dd>
        </dl>
        {fin.blocked ? <Note tone="bad">{ar ? fin.blocked[1] : fin.blocked[0]}</Note>
          : fin.finality === "Final" ? <p className="mt-2 text-sm text-success" data-out-finality="Final">{t("Final: the document is submitted and approved, so the copy prints without a draft band.", "نهائية: المستند مرحّل ومعتمد، لذلك تُطبع النسخة دون شريط المسودة.")}</p>
          : <p className="mt-2 text-sm text-warning" data-out-finality="Draft copy">{t("Draft copy: the document is not submitted and approved yet, so every copy carries a DRAFT — NOT FINAL band.", "نسخة مسودة: المستند لم يُرحّل ويُعتمد بعد، لذلك تحمل كل نسخة شريط «مسودة — غير نهائية».")}</p>}
      </Section>
      <Section title={t("Preview — not issued", "معاينة — لم تصدر بعد")} actions={!fin.blocked && canIssue ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (!busy) void issue(); }}>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Copy reason (optional)", "سبب النسخة (اختياري)")} aria-label={t("Copy reason", "سبب النسخة")} data-out-reason />
          <button type="submit" className={BTN.primary} disabled={busy} data-out-issue>{busy ? t("Issuing…", "جارٍ الإصدار…") : t("Issue controlled copy", "إصدار نسخة مضبوطة")}</button>
        </form>) : undefined}>
        {!canIssue && !fin.blocked && <Note tone="warn">{t("Your role cannot issue controlled copies.", "دورك لا يسمح بإصدار نسخ مضبوطة.")}</Note>}
        <div className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2">
          <article dir="rtl" className="mx-auto min-w-[640px] max-w-[210mm] bg-card p-6 shadow-sm" data-out-preview data-no-i18n dangerouslySetInnerHTML={{ __html: sanitizeSnapshot(preview.html) }} />
        </div>
      </Section>
      <Section title={<span>{t("Issued copies", "النسخ المصدرة")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({history.length})</span></span>}>
        <ArtifactTable rows={history} onOpen={onOpen} current={artifact} />
      </Section>
      {artifact && history.some((a) => a.name === artifact) && <ArtifactDetail name={artifact} />}
    </>
  );
}

function ArtifactTable({ rows, onOpen, current, withSource }: { rows: Doc[]; onOpen: (a: string) => void; current?: string; withSource?: boolean }) {
  const { t, ar } = useCx();
  type R = Doc & Record<string, unknown>;
  const cols: Col<R>[] = [
    { key: "name", label: t("Copy", "النسخة"), render: (r) => <button type="button" className={`text-primary hover:underline ${current === r.name ? "font-semibold" : ""}`} onClick={() => onOpen(r.name)} data-out-open={r.name}><span data-no-i18n>{r.name}</span></button> },
    ...(withSource ? [{ key: "source_name", label: t("Source", "المصدر"), render: (r: R) => <span className="text-xs"><span>{dtLabel(String(r["source_doctype"]), ar)}</span> · <DocRef doctype={String(r["source_doctype"])} name={String(r["source_name"])} /></span> } as Col<R>] : []),
    { key: "generated_at", label: t("Issued", "وقت الإصدار"), render: (r) => <span className="text-xs" data-no-i18n>{stamp(r["generated_at"])}</span> },
    { key: "owner", label: t("By", "بواسطة"), render: (r) => <span className="text-xs" data-no-i18n>{String(r["owner"] ?? "")}</span> },
    { key: "finality", label: t("Finality", "النهائية"), render: (r) => <span className={r["finality"] === "Final" ? "text-success" : "text-warning"}>{opt(r["finality"], ar)}</span> },
    { key: "status", label: t("Status", "الحالة"), render: (r) => <span className={r["status"] === "Void" ? "text-destructive" : ""} data-out-status={String(r["status"])}>{opt(r["status"], ar)}</span> },
    { key: "content_hash", label: t("Fingerprint", "البصمة"), render: (r) => <code className="text-[11px]" data-no-i18n>{String(r["content_hash"] ?? "").slice(0, 12)}</code> },
    { key: "as_of", label: t("As of", "حتى تاريخ"), render: (r) => <span className="text-xs" data-no-i18n>{String(r["as_of"] ?? "")}</span> },
  ];
  return <DataTable<R> rows={rows as R[]} empty={t("No controlled copy has been issued yet.", "لم تصدر أي نسخة مضبوطة بعد.")} cols={cols} />;
}

function AllArtifacts() {
  const { t } = useCx();
  const { val, set } = useUrl();
  const status = val("status");
  const rows = list("Digit Print Artifact", (a) => !status || a["status"] === status).sort((a, b) => String(b["generated_at"] ?? "").localeCompare(String(a["generated_at"] ?? "")));
  const open = (n: string) => { const a = get("Digit Print Artifact", n); if (a) set({ doctype: String(a["source_doctype"]), name: String(a["source_name"]), format: String(a["print_format"]), as_of: String(a["as_of"] ?? ""), artifact: n }, false); };
  return (
    <Section title={t("Register of issued copies", "سجل النسخ المصدرة")} actions={
      <select className={inputCls} value={status} aria-label={t("Status", "الحالة")} data-out-filter="status" onChange={(e) => set({ status: e.target.value })}>
        <option value="">{t("All", "الكل")}</option><option value="Issued">{t("Issued", "مُصدرة")}</option><option value="Void">{t("Void", "مُبطلة")}</option>
      </select>}>
      <ArtifactTable rows={rows} onOpen={open} withSource />
      <p className="mt-2 text-xs text-muted-foreground">{t("Choose a document type above to preview and issue a new copy.", "اختر نوع مستند أعلاه لمعاينة نسخة جديدة وإصدارها.")}</p>
    </Section>
  );
}

function ArtifactDetail({ name }: { name: string }) {
  const { t, ar } = useCx();
  const a = get("Digit Print Artifact", name)!;
  const [v, setV] = useState<Verification | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const sig = `${String(a["status"])}|${String(a["modified"] ?? "")}`;
  useEffect(() => { let live = true; setV(null); void verifyArtifact(a).then((x) => { if (live) setV(x); }); return () => { live = false; }; }, [name, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const snapshot = sanitizeSnapshot(String(a["html_snapshot"] ?? ""));
  const printIt = () => {
    const w = window.open("", "_blank");
    if (!w) { notifyError(t("The browser blocked the print window.", "منع المتصفح نافذة الطباعة.")); return; }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${a.name}</title></head><body>${a["status"] === "Void" ? `<div style="border:3px solid #b91c1c;color:#b91c1c;text-align:center;font-weight:700;padding:6px;margin-bottom:8px">مُبطلة · VOID</div>` : ""}${snapshot}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
  const download = () => {
    const blob = new Blob([`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${a.name}</title></head><body>${snapshot}</body></html>`], { type: "text/html;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = `${a.name}.html`; el.click(); URL.revokeObjectURL(el.href);
  };
  const doVoid = () => { const r = voidPrint(a.name, reason); if (r.ok) { notifySaved(t("Copy voided", "أُبطلت النسخة")); setVoiding(false); setReason(""); } else notifyError(r.errors.join("\n")); };
  const row = (en: string, arL: string, val: ReactNode) => <><dt className="text-muted-foreground">{t(en, arL)}</dt><dd className="min-w-0 break-words">{val}</dd></>;
  return (
    <Section title={<span>{t("Issued copy", "النسخة المصدرة")} <span data-no-i18n>{a.name}</span></span>} id="artifact" actions={<div className="flex flex-wrap gap-2">
      <button type="button" className={BTN.secondary} onClick={printIt} data-out-print>{t("Print / save as PDF", "طباعة / حفظ PDF")}</button>
      <button type="button" className={BTN.secondary} onClick={download} data-out-download>{t("Download", "تنزيل")}</button>
      {a["status"] === "Issued" && canVoid(a) && !voiding && <button type="button" className={BTN.compact} onClick={() => setVoiding(true)} data-out-void>{t("Void", "إبطال")}</button>}
    </div>}>
      <div data-out-artifact={a.name}>
        {voiding && <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); doVoid(); }}>
          <input className={`${inputCls} min-w-[16rem] flex-1`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Why is this copy void?", "لماذا تُبطل هذه النسخة؟")} aria-label={t("Void reason", "سبب الإبطال")} data-out-void-reason />
          <button type="submit" className={BTN.primary} disabled={!reason.trim()} data-out-void-confirm>{t("Confirm void", "تأكيد الإبطال")}</button>
          <button type="button" className={BTN.compact} onClick={() => setVoiding(false)}>{t("Cancel", "إلغاء")}</button>
        </form>}
        {a["status"] === "Void" && <Note tone="bad">{t("Void copy — kept for the record; it must not be used.", "نسخة مُبطلة — محفوظة للسجل ولا يجوز استخدامها.")} <span data-no-i18n>{String(a["void_reason"] ?? "")}</span></Note>}
        <div className="mb-3" data-out-verify={v ? `${v.hashOk ? "ok" : "bad"}|${v.source}|${v.template}` : "pending"} role="status">
          {!v ? <span className="text-sm text-muted-foreground">{t("Checking the copy…", "جارٍ فحص النسخة…")}</span> : <ul className="space-y-0.5 text-sm">
            <li className={v.hashOk ? "text-success" : "text-destructive"}>{v.hashOk ? t("Content matches its fingerprint.", "المحتوى مطابق لبصمته.") : t("Content does not match its fingerprint — the stored copy was altered.", "المحتوى لا يطابق بصمته — تم تغيير النسخة المحفوظة.")}</li>
            <li className={v.source === "same" ? "text-success" : "text-warning"}>{v.source === "same" ? t("The source document has not changed since this copy was issued.", "لم يتغير المستند المصدر منذ إصدار هذه النسخة.") : v.source === "changed" ? t("The source document changed after this copy was issued; issue a new copy if the change matters.", "تغيّر المستند المصدر بعد إصدار هذه النسخة؛ أصدر نسخة جديدة إذا كان التغيير مهمًا.") : t("The source document no longer exists.", "المستند المصدر لم يعد موجودًا.")}</li>
            <li className={v.template === "same" ? "text-success" : "text-warning"}>{v.template === "same" ? t("The template is unchanged.", "القالب لم يتغير.") : t("The template changed after this copy was issued.", "تغيّر القالب بعد إصدار هذه النسخة.")}</li>
          </ul>}
        </div>
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          {row("Template", "القالب", <span>{templateLabel(String(a["print_format"]), ar)} · <code className="text-xs" data-no-i18n>v{String(a["template_version"] ?? "")}</code></span>)}
          {row("Language", "اللغة", <span>{opt(a["language"], ar)}</span>)}
          {row("Finality", "النهائية", <span>{opt(a["finality"], ar)}</span>)}
          {row("Status", "الحالة", <span>{opt(a["status"], ar)}</span>)}
          {row("Source status", "حالة المصدر", <span>{opt(a["source_state"], ar) || "—"}</span>)}
          {row("Source revision", "مراجعة المصدر", <span data-no-i18n>{stamp(a["source_modified"])}</span>)}
          {row("As of", "حتى تاريخ", <span data-no-i18n>{String(a["as_of"] ?? "")}</span>)}
          {row("Issued", "وقت الإصدار", <span data-no-i18n>{stamp(a["generated_at"])} · {String(a["owner"] ?? "")}</span>)}
          {row("Copy reason", "سبب النسخة", <span data-no-i18n>{String(a["copy_reason"] || "—")}</span>)}
          {a["status"] === "Void" && row("Voided", "أُبطلت", <span data-no-i18n>{stamp(a["voided_on"])} · {String(a["voided_by"] ?? "")}</span>)}
          <dt className="text-muted-foreground">{t("SHA-256", "SHA-256")}</dt><dd className="min-w-0 break-all sm:col-span-3"><code className="text-[11px]" data-no-i18n data-out-hash>{String(a["content_hash"] ?? "")}</code></dd>
        </dl>
        <div className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2">
          <article dir="rtl" className="mx-auto min-w-[640px] max-w-[210mm] bg-card p-6 shadow-sm" data-out-snapshot data-no-i18n dangerouslySetInnerHTML={{ __html: snapshot }} />
        </div>
      </div>
    </Section>
  );
}
