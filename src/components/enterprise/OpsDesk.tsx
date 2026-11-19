/**
 * DIGIT Enterprise shared operations screens (Run11.1 PL7, S5, PU15, SL4, SL10, IN5, IN12): approval paths and their
 * simulator, scan receive / put away / pick / pack / ship / count on a phone, the dock appointment board, and the
 * document panels for approval path, procurement policy, backorder decision and customer quote acceptance.
 * Logic lives in src/lib/coreShared/operations.ts; every app opens these screens and panels.
 */
import { CrossDockPanel } from "./PlanningDesk";
import { DateInput } from "@/components/form/DateInput";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { t as trl } from "@/i18n";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { canReadType, useScopeMetas } from "@/lib/scope";
import { cachedMeta } from "@/lib/catalog";
import { hasPerm, useSessionUser } from "@/lib/session";
import { CORE_DT } from "@/lib/coreShared/doctypes";
import * as OPS from "@/lib/coreShared/operations";
import { EntDialog, EntFrame } from "./Surfaces";
import { translateTo } from "@/i18n";
import { recordLabel } from "./kit/labels";
import { NewDocLink, Bar, CompanySelect, Denied, DocLink, Field, Kpi, ListLink, Table, money, pick, today, tr, useCompany, useT } from "./FinanceDesk";

const can = (dt: string, p: "read" | "write" | "create", user: string, d?: Doc) => { const m = cachedMeta(dt); return !!m && hasPerm(m, p, d, user); };
const coreList = (dt: string, filters: [string, string, string | number | (string | number)[]][] = []) => ({ doctype: dt, filters });

/* ------------------------------------------------------------------ approval paths + simulator (PL7, S5) ------------------------------------------------------------------ */
function PathSteps({ path }: { path: OPS.ApprovalPath }) {
  const { ar, t } = useT();
  if (!path.template) return <p className="text-sm text-muted-foreground" data-ops-path="none">{t("No approval template applies — the document follows its normal permissions.", "لا ينطبق قالب اعتماد — يتبع المستند صلاحياته العادية.")}</p>;
  return <div className="space-y-2" data-ops-path={path.template.name}>
    <p className="text-sm"><span className="ent-mint-chip" data-no-i18n>{path.template.title}</span> <span className="text-xs text-muted-foreground" data-no-i18n>{ar ? path.template.why[1].replace(/^يطابق ([^·]+)/, (_m, d: string) => `يطابق ${translateTo(d.trim(), "ar")} `) : path.template.why[0]}</span></p>
    <ol className="flex flex-wrap items-stretch gap-2" data-ops-steps={path.steps.length}>{path.steps.map((s, i) => <li key={s.step} className="ent-frame flex min-w-[11rem] flex-1 items-start gap-2 p-2" data-ops-step={s.step}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground" data-no-i18n>{s.step}</span>
      <span className="min-w-0"><span className="ent-title block text-sm">{s.role}</span><span className="block text-[11px] text-muted-foreground" data-no-i18n>{s.holders.length ? s.holders.slice(0, 3).join(", ") + (s.holders.length > 3 ? ` +${s.holders.length - 3}` : "") : t("Nobody holds this role yet", "لا أحد يحمل هذا الدور بعد")}</span></span>
      {i < path.steps.length - 1 && <span aria-hidden className="ms-auto self-center text-muted-foreground">{ar ? "←" : "→"}</span>}
    </li>)}</ol>
  </div>;
}
export function ApprovalPathsPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas([CORE_DT.approvalTemplate, "Branch", "Item Group"]);
  const [dt, setDt] = useState("Purchase Order"); const [amount, setAmount] = useState("75000"); const [branch, setBranch] = useState(""); const [cat, setCat] = useState("");
  if (!canReadType(CORE_DT.approvalTemplate)) return <Denied />;
  const path = OPS.approvalPath({ doctype: dt, company: c.company, amount: Number(amount) || 0, branch, category: cat ? [cat] : [] });
  const tpls = adapter.list(CORE_DT.approvalTemplate).sort((a, b) => String(a["document_type"]).localeCompare(String(b["document_type"])) || Number(a["min_amount"] ?? 0) - Number(b["min_amount"] ?? 0));
  const branches = adapter.list("Branch").map((b) => b.name).sort(); const cats = [...new Set(tpls.map((x) => String(x["category"] ?? "")).filter(Boolean))].sort();
  return <div className="space-y-3">
    <EntFrame id="approval-simulator" title={t("Approval path simulator", "محاكي مسار الاعتماد")} note={t("Pick a document type, amount, branch and category to see who approves and in which order — before anyone submits.", "اختر نوع المستند والمبلغ والفرع والفئة لترى من يعتمد وبأي ترتيب — قبل أن يُرسل أحد.")}>
      <Bar>{can(CORE_DT.approvalTemplate, "create", c.user) && <NewDocLink dt={CORE_DT.approvalTemplate} data-ops-approval-new>{t("New approval path", "مسار اعتماد جديد")}</NewDocLink>}
        <CompanySelect c={c} />
        <Field label={t("Document type", "نوع المستند")}><select className="field-input" value={dt} onChange={(e) => setDt(e.target.value)} data-ops-sim-dt>{OPS.APPROVAL_DOCTYPES.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
        <Field label={t("Amount", "المبلغ")}><input className="field-input w-32" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-ops-sim-amount data-no-i18n /></Field>
        <Field label={t("Branch", "الفرع")}><select className="field-input" value={branch} onChange={(e) => setBranch(e.target.value)} data-ops-sim-branch><option value="">{t("Any", "أي فرع")}</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
        <Field label={t("Category", "الفئة")}><select className="field-input" value={cat} onChange={(e) => setCat(e.target.value)} data-ops-sim-cat><option value="">{t("Any", "أي فئة")}</option>{cats.map((b) => <option key={b} value={b}>{b}</option>)}</select></Field>
      </Bar>
      <PathSteps path={path} />
      {path.considered.length > 0 && <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">{t("Why this template", "لماذا هذا القالب")}</summary>
        <ul className="mt-1 space-y-0.5" data-ops-considered={path.considered.length}>{path.considered.map((x) => <li key={x.name} className={x.match ? "font-semibold text-primary" : "text-muted-foreground"} data-no-i18n>{x.title} — {pick(ar, x.reason)}</li>)}</ul></details>}
    </EntFrame>
    <EntFrame id="approval-templates" title={t("Approval templates", "قوالب الاعتماد")} note={t("Steps by amount, branch and category; the first matching template by priority applies.", "خطوات حسب المبلغ والفرع والفئة؛ يُطبق أول قالب مطابق حسب الأولوية.")}
      actions={can(CORE_DT.approvalTemplate, "create", c.user) ? <ListLink drill={coreList(CORE_DT.approvalTemplate)} className="btn-ghost">{t("Manage templates", "إدارة القوالب")}</ListLink> : undefined}>
      <Table id="approval-templates" head={[t("Template", "القالب"), t("Document", "المستند"), t("Amount", "المبلغ"), t("Branch", "الفرع"), t("Category", "الفئة"), t("Steps", "الخطوات")]}>
        {tpls.map((x) => <tr key={x.name} className={tr} data-ops-template={x.name}><td className="p-2"><DocLink dt={CORE_DT.approvalTemplate} name={x.name}>{String((!ar && x["__name_en"]) || x["template_name"] || x.name)}</DocLink></td><td className="p-2">{String(x["document_type"] ?? "")}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{Number(x["min_amount"] ?? 0).toLocaleString("en-US")} – {Number(x["max_amount"] ?? 0) ? Number(x["max_amount"]).toLocaleString("en-US") : "∞"}</td><td className="p-2" data-no-i18n>{(ar && String(adapter.get("Branch", String(x["branch"] ?? ""))?.["digit_branch_ar"] ?? "")) || String(x["branch"] ?? "") || "—"}</td><td className="p-2">{String(x["category"] ?? "") || "—"}</td>
          <td className="p-2 text-xs">{["step_1_role", "step_2_role", "step_3_role"].map((f) => String(x[f] ?? "")).filter(Boolean).map((r) => trl(r)).join(ar ? " ← " : " → ")}</td></tr>)}
      </Table>
    </EntFrame>
  </div>;
}
export function ApprovalPathPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion(); const { t } = useT();
  const path = OPS.approvalPathFor(doctype, doc);
  return <EntFrame id="approval-path" title={t("Approval path", "مسار الاعتماد")} note={t("Who approves this document, from its amount, branch and category.", "من يعتمد هذا المستند حسب مبلغه وفرعه وفئته.")}><PathSteps path={path} /></EntFrame>;
}

/* ------------------------------------------------------------------ procurement policy panel (PU15) ------------------------------------------------------------------ */
export function ProcurementPolicyPanel({ doctype, doc }: { doctype: string; doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT();
  const chk = OPS.procurementCheck(doctype, doc); const hits = chk.lines.filter((l) => l.policy);
  return <EntFrame id="procurement-policy" title={t("Procurement policy", "سياسة الشراء")} note={t("Each line against the company's purchasing policies and catalogs; a blocked line stops submission.", "كل سطر مقابل سياسات وكتالوجات الشراء؛ السطر المحظور يمنع الاعتماد.")}
    actions={<span className={`ent-qv-status ent-qv-tone-${chk.blocked ? "bad" : "ok"}`} data-ops-policy={chk.blocked ? "blocked" : "ok"}>{chk.blocked ? t("Blocked", "محظور") : t("Within policy", "ضمن السياسة")}</span>}>
    {hits.length ? <ul className="space-y-1 text-sm" data-ops-policy-lines={hits.length}>{hits.map((l) => <li key={l.idx} className="flex flex-wrap items-center gap-2" data-ops-policy-line={l.verdict}>
      <span className={`ent-qv-status ent-qv-tone-${l.verdict === "blocked" ? "bad" : l.verdict === "warn" ? "draft" : "ok"}`}>{l.verdict === "blocked" ? t("Blocked", "محظور") : l.verdict === "warn" ? t("Note", "تنبيه") : t("OK", "سليم")}</span>
      <span data-no-i18n>#{l.idx} {l.item}</span><span className="text-muted-foreground">{pick(ar, l.reason)}</span><span className="text-xs text-muted-foreground" data-no-i18n>({l.policy})</span></li>)}</ul>
      : <p className="text-sm text-muted-foreground" data-ops-policy-lines={0}>{t("No policy applies to these items.", "لا تنطبق سياسة على هذه الأصناف.")}</p>}
  </EntFrame>;
}

/* ------------------------------------------------------------------ backorder decision (SL10) ------------------------------------------------------------------ */
export function BackorderPanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [open, setOpen] = useState(false); const [choice, setChoice] = useState<"Keep remainder as backorder" | "Close the remainder">("Keep remainder as backorder"); const [reason, setReason] = useState("");
  const st = OPS.backorderState(doc); const mayDecide = can(CORE_DT.backorderDecision, "create", user);
  return <EntFrame id="backorder" title={t("Backorder", "الطلب المتأخر")} note={t("Part of this order was delivered. Decide whether the rest stays open as a backorder or is closed.", "سُلّم جزء من هذا الأمر. قرر هل يبقى المتبقي مفتوحًا كطلب متأخر أم يُقفل.")}
    actions={st.open && mayDecide ? <button type="button" className="btn-primary" onClick={() => setOpen(true)} data-ops-backorder-open>{t("Decide", "اتخذ القرار")}</button> : undefined}>
    <ul className="space-y-0.5 text-sm" data-ops-backorder-left={st.leftQty}>{st.remaining.map((r) => <li key={r.item} className="flex gap-2"><span data-no-i18n>{r.item}</span><span className="text-muted-foreground">{t("ordered", "مطلوب")} <bdi data-no-i18n>{r.ordered}</bdi> · {t("delivered", "مُسلّم")} <bdi data-no-i18n>{r.delivered}</bdi> · {t("left", "متبقٍ")} <bdi className="font-semibold" data-no-i18n>{r.left}</bdi></span></li>)}</ul>
    {st.decision && <p className="mt-1 text-sm" data-ops-backorder-decision={String(st.decision["decision"])}><span className="ent-mint-chip">{String(st.decision["decision"]) === "Close the remainder" ? t("Remainder closed", "أُقفل المتبقي") : t("Kept as backorder", "أُبقي كطلب متأخر")}</span> <span className="text-xs text-muted-foreground" data-no-i18n>{String(st.decision["decided_by"] ?? "")} · {String(st.decision["decided_on"] ?? "")} {String(st.decision["reason"] ?? "")}</span></p>}
    <EntDialog open={open} onOpenChange={setOpen} id="backorder" title={t("What happens to the rest of the order?", "ماذا يحدث لبقية الأمر؟")} description={t(`${st.leftQty} units are not delivered yet.`, `${st.leftQty} وحدة لم تُسلّم بعد.`)}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-ops-backorder-confirm onClick={() => { const r = OPS.decideBackorder(doc.name, choice, reason, user); if (r.ok) { toast.success(t("Decision recorded", "سُجّل القرار")); setOpen(false); } else toast.error(pick(ar, r.reason)); }}>{t("Confirm", "تأكيد")}</button></>}>
      <div className="space-y-2 text-sm" role="radiogroup">
        {(["Keep remainder as backorder", "Close the remainder"] as const).map((k) => <label key={k} className="ent-frame flex cursor-pointer items-start gap-2 p-2"><input type="radio" name="bo" checked={choice === k} onChange={() => setChoice(k)} data-ops-backorder-choice={k} />
          <span><span className="ent-title block">{k === "Keep remainder as backorder" ? t("Keep as backorder", "إبقاؤه كطلب متأخر") : t("Close the remainder", "إقفال المتبقي")}</span><span className="text-xs text-muted-foreground">{k === "Keep remainder as backorder" ? t("The order stays open; the rest is delivered later.", "يبقى الأمر مفتوحًا ويُسلّم الباقي لاحقًا.") : t("The order is closed; the rest will not be delivered or billed.", "يُقفل الأمر ولن يُسلّم الباقي أو يُفوتر.")}</span></span></label>)}
        <Field label={t("Reason", "السبب")}><textarea className="field-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-ops-backorder-reason /></Field>
      </div>
    </EntDialog>
  </EntFrame>;
}

/* ------------------------------------------------------------------ quote acceptance (SL4) ------------------------------------------------------------------ */
function SignaturePad({ onChange }: { onChange: (v: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [((e.clientX - r.left) * e.currentTarget.width) / r.width, ((e.clientY - r.top) * e.currentTarget.height) / r.height] as const; };
  return <canvas ref={ref} width={420} height={120} className="h-28 w-full touch-none rounded-lg border border-border bg-card" aria-label="signature" data-ops-signature-pad
    onPointerDown={(e) => { drawing.current = true; const c = ref.current?.getContext("2d"); if (!c) return; const [x, y] = pos(e); c.lineWidth = 2.2; c.lineCap = "round"; c.strokeStyle = getComputedStyle(e.currentTarget).color; c.beginPath(); c.moveTo(x, y); }}
    onPointerMove={(e) => { if (!drawing.current) return; const c = ref.current?.getContext("2d"); if (!c) return; const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); }}
    onPointerUp={() => { drawing.current = false; try { onChange(ref.current?.toDataURL("image/png") ?? ""); } catch { onChange("drawn"); } }} />;
}
export function QuoteAcceptancePanel({ doc }: { doc: Doc }) {
  useStoreVersion(); const { ar, t } = useT(); const user = useSessionUser();
  const [open, setOpen] = useState(false); const [signer, setSigner] = useState(""); const [sig, setSig] = useState(""); const [typed, setTyped] = useState(""); const [pct, setPct] = useState("0");
  const acc = OPS.acceptanceOf(doc.name); const mayRecord = can(CORE_DT.quoteAcceptance, "create", user);
  const valid = Number(doc.docstatus) === 1 && !["Lost", "Ordered", "Cancelled", "Expired"].includes(String(doc["status"] ?? "")) && (!doc["valid_till"] || String(doc["valid_till"]) >= today());
  const cur = String(doc["currency"] ?? "SAR");
  return <EntFrame id="quote-acceptance" title={t("Customer acceptance", "قبول العميل")} note={t("The customer signs the quotation online and can pay a deposit; the signed quotation becomes a sales order in one step.", "يوقّع العميل العرض إلكترونيًا ويمكنه دفع مقدم؛ ويتحول العرض الموقّع إلى أمر بيع بخطوة واحدة.")}
    actions={acc ? <span className="ent-qv-status ent-qv-tone-ok" data-ops-acceptance={String(acc["status"])}>{String(acc["status"]) === "Signed" ? t("Signed", "موقّع") : String(acc["status"]) === "Prepaid" ? t("Deposit requested", "طُلب المقدم") : t("Converted", "حُوّل")}</span>
      : valid && mayRecord ? <button type="button" className="btn-primary" onClick={() => setOpen(true)} data-ops-accept-open>{t("Record signature", "تسجيل التوقيع")}</button> : <span className="text-xs text-muted-foreground" data-ops-acceptance="unavailable">{t("Open, valid quotations only", "للعروض المفتوحة السارية فقط")}</span>}>
    {acc ? <div className="space-y-1 text-sm" data-ops-acceptance-row={acc.name}>
      <p><span className="ent-title">{String(acc["signer_name"])}</span> <span className="text-xs text-muted-foreground" data-no-i18n>{String(acc["signed_on"] ?? "")}</span></p>
      {String(acc["signature"] ?? "").startsWith("data:image") ? <img src={String(acc["signature"])} alt={t("Signature", "التوقيع")} className="h-16 rounded border border-border bg-card" /> : <p className="font-serif text-lg italic" data-no-i18n>{String(acc["signature"] ?? "").replace(/^typed:/, "")}</p>}
      {Number(acc["prepay_pct"] ?? 0) > 0 && <p className="text-xs">{t("Deposit", "الدفعة المقدمة")}: <bdi data-no-i18n>{Number(acc["prepay_pct"])}% · {money(Math.round(Number(doc["grand_total"] ?? 0) * Number(acc["prepay_pct"])) / 100, cur)}</bdi></p>}
      <div className="flex flex-wrap gap-2 pt-1">
        {acc["sales_order"] ? <DocLink dt="Sales Order" name={String(acc["sales_order"])} /> : can("Sales Order", "create", user) && <button type="button" className="btn-primary" data-ops-accept-convert onClick={() => { const r = OPS.convertAccepted(acc.name, user); if (r.ok) toast.success(t(`Sales order ${r.salesOrder} created`, `أُنشئ أمر البيع ${r.salesOrder}`)); else toast.error(pick(ar, r.reason)); }}>{t("Create sales order", "إنشاء أمر بيع")}</button>}
        {acc["payment_request"] ? <DocLink dt="Payment Request" name={String(acc["payment_request"])} /> : null}
      </div>
    </div> : <p className="text-sm text-muted-foreground" data-ops-acceptance="none">{t("Not signed yet.", "لم يُوقّع بعد.")}</p>}
    <EntDialog open={open} onOpenChange={setOpen} id="quote-accept" title={t("Customer signature", "توقيع العميل")} description={t(`Quotation ${doc.name} · ${money(Number(doc["grand_total"] ?? 0), cur)}`, `العرض ${doc.name} · ${money(Number(doc["grand_total"] ?? 0), cur)}`)}
      footer={<><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-ops-accept-confirm onClick={() => { const r = OPS.acceptQuote(doc.name, signer, sig || (typed ? `typed:${typed}` : ""), Number(pct) || 0, user); if (r.ok) { toast.success(t("Acceptance recorded", "سُجّل القبول")); setOpen(false); } else toast.error(pick(ar, r.reason)); }}>{t("Accept quotation", "قبول العرض")}</button></>}>
      <div className="space-y-2">
        <Field label={t("Signer name", "اسم الموقّع")}><input className="field-input" value={signer} onChange={(e) => setSigner(e.target.value)} data-ops-accept-signer data-no-i18n /></Field>
        <Field label={t("Draw the signature", "ارسم التوقيع")}><SignaturePad onChange={setSig} /></Field>
        <Field label={t("…or type it", "…أو اكتبه")}><input className="field-input font-serif italic" value={typed} onChange={(e) => setTyped(e.target.value)} data-ops-accept-typed data-no-i18n /></Field>
        <Field label={t("Deposit (%)", "الدفعة المقدمة (%)")}><input className="field-input w-24" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} data-ops-accept-pct data-no-i18n /></Field>
      </div>
    </EntDialog>
  </EntFrame>;
}

/* ------------------------------------------------------------------ scan page (IN5) ------------------------------------------------------------------ */
export function ScanPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas([CORE_DT.scanSession, "Purchase Order", "Purchase Receipt", "Pick List", "Sales Order", "Delivery Note", "Stock Entry", "Stock Reconciliation", "Item", "Warehouse", "Batch", "Serial No"]);
  const [mode, setMode] = useState<OPS.ScanMode>("Receive"); const [wh, setWh] = useState(""); const [ref, setRef] = useState(""); const [session, setSession] = useState(""); const [code, setCode] = useState(""); const [qty, setQty] = useState("1"); const [lpn, setLpn] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const whs = adapter.list("Warehouse").filter((w) => w["company"] === c.company && !Number(w["is_group"] ?? 0)).map((w) => w.name).sort();
  const against = OPS.SCAN_AGAINST[mode];
  const refs = useMemo(() => !against ? [] : adapter.list(against).filter((d) => d["company"] === c.company && (against === "Pick List" ? Number(d.docstatus) !== 2 : Number(d.docstatus) === 1) && !["Completed", "Closed", "Cancelled"].includes(String(d["status"] ?? ""))).filter((d) => OPS.expectedLines(mode, against, d.name).length).map((d) => d.name).sort(), [against, c.company, mode]);
  if (!canReadType(CORE_DT.scanSession)) return <Denied />;
  const ss = session ? adapter.get(CORE_DT.scanSession, session) : undefined; const progress = session ? OPS.scanProgress(session) : [];
  const recent = adapter.list(CORE_DT.scanSession).filter((x) => !c.company || x["company"] === c.company).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 8);
  const scan = () => { const r = OPS.addScan(session, code, Number(qty) || 1, { lpn }); if (r.ok) { if (r.over) toast.warning(t(`${r.item}: more than expected (${r.total})`, `${r.item}: أكثر من المتوقع (${r.total})`)); setCode(""); setQty("1"); input.current?.focus(); } else toast.error(pick(ar, r.reason)); };
  return <div className="mx-auto max-w-3xl space-y-3" data-ops-scan>
    {!ss || ss["status"] !== "Open" ? <EntFrame id="scan-start" title={t("Start scanning", "ابدأ المسح")} note={t("Choose what you are doing, the warehouse and the document; then scan with the camera scanner or type the barcode.", "اختر العملية والمستودع والمستند ثم امسح بالماسح أو اكتب الرمز.")}>
      <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" data-ops-scan-modes>{OPS.SCAN_MODES.map((m) => <button key={m} type="button" className={mode === m ? "btn-primary" : "btn-ghost"} aria-pressed={mode === m} onClick={() => { setMode(m); setRef(""); }} data-ops-scan-mode={m}>{pick(ar, OPS.SCAN_MODE_LABEL[m])}</button>)}</div>
      <Bar>
        <CompanySelect c={c} />
        <Field label={t("Warehouse", "المستودع")}><select className="field-input" value={wh} onChange={(e) => setWh(e.target.value)} data-ops-scan-wh data-no-i18n><option value="">—</option>{whs.map((w) => <option key={w}>{w}</option>)}</select></Field>
        {against && <Field label={against}><select className="field-input" value={ref} onChange={(e) => setRef(e.target.value)} data-ops-scan-ref data-no-i18n><option value="">—</option>{refs.map((w) => <option key={w}>{w}</option>)}</select></Field>}
        <button type="button" className="btn-primary" data-ops-scan-start onClick={() => { const r = OPS.startScan(mode, c.company, wh, against ? { doctype: against, name: ref } : undefined, c.user); if (r.ok) { setSession(r.name); setTimeout(() => input.current?.focus(), 0); } else toast.error(pick(ar, r.reason)); }}>{t("Start", "ابدأ")}</button>
      </Bar>
    </EntFrame> : <EntFrame id="scan-session" title={`${pick(ar, OPS.SCAN_MODE_LABEL[String(ss["mode"]) as OPS.ScanMode])} · ${String(ss["warehouse"])}`} note={ss["reference_name"] ? `${String(ss["reference_doctype"])} ${String(ss["reference_name"])}` : t("Free count", "جرد حر")}
      actions={<span className="ent-mint-chip" data-no-i18n>{session}</span>}>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); scan(); }}>
        <Field label={t("Barcode / item / batch / serial", "الرمز / الصنف / الدفعة / التسلسلي")}><input ref={input} className="field-input w-64 text-lg" autoFocus inputMode="text" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} data-ops-scan-code data-no-i18n /></Field>
        <Field label={t("Qty", "الكمية")}><input className="field-input w-20" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} data-ops-scan-qty data-no-i18n /></Field>
        <Field label={t("Pallet / LPN", "المنصة / اللوحة")}><input className="field-input w-32" value={lpn} onChange={(e) => setLpn(e.target.value)} data-ops-scan-lpn data-no-i18n /></Field>
        <button type="submit" className="btn-primary" data-ops-scan-add>{t("Add", "إضافة")}</button>
      </form>
      <Table id="scan-progress" head={[t("Item", "الصنف"), t("Expected", "المتوقع"), t("Scanned", "الممسوح"), ""]}>
        {progress.map((p) => <tr key={p.item} className={tr} data-ops-scan-row={p.item}><td className="p-2" data-no-i18n>{p.item}</td><td className="p-2 tabular-nums" data-no-i18n>{p.expected || "—"}</td><td className="p-2 tabular-nums font-semibold" data-no-i18n>{p.scanned}</td>
          <td className="p-2">{p.expected ? <span className={`ent-qv-status ent-qv-tone-${p.scanned === p.expected ? "ok" : p.scanned > p.expected ? "bad" : "draft"}`}>{p.scanned === p.expected ? t("Complete", "مكتمل") : p.scanned > p.expected ? t("Over", "زيادة") : t("Short", "ناقص")}</span> : null}</td></tr>)}
      </Table>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" data-ops-scan-complete onClick={() => { const r = OPS.completeScan(session, c.user); if (r.ok) { toast.success(t(`${r.doctype} ${r.name} created as a draft`, `أُنشئ ${r.doctype} ${r.name} كمسودة`)); } else toast.error(pick(ar, r.reason)); }}>{t(`Finish → ${OPS.SCAN_RESULT[String(ss["mode"]) as OPS.ScanMode]}`, `إنهاء ← ${OPS.SCAN_RESULT[String(ss["mode"]) as OPS.ScanMode]}`)}</button>
        <button type="button" className="btn-ghost" onClick={() => setSession("")}>{t("Pause", "إيقاف مؤقت")}</button>
      </div>
    </EntFrame>}
    <EntFrame id="scan-recent" title={t("Scan sessions", "جلسات المسح")}>
      <Table id="scan-sessions" head={[t("Session", "الجلسة"), t("Mode", "العملية"), t("Warehouse", "المستودع"), t("Against", "مقابل"), t("Status", "الحالة"), t("Created", "المستند الناتج")]}>
        {recent.map((x) => <tr key={x.name} className={tr} data-ops-scan-session={x.name}><td className="p-2">{x["status"] === "Open" ? <button type="button" className="text-primary hover:underline" onClick={() => setSession(x.name)} data-no-i18n>{x.name}</button> : <DocLink dt={CORE_DT.scanSession} name={x.name} />}</td>
          <td className="p-2">{pick(ar, OPS.SCAN_MODE_LABEL[String(x["mode"]) as OPS.ScanMode] ?? [String(x["mode"]), String(x["mode"])])}</td><td className="p-2" data-no-i18n>{String(x["warehouse"] ?? "")}</td><td className="p-2" data-no-i18n>{String(x["reference_name"] ?? "") || "—"}</td>
          <td className="p-2">{x["status"] === "Open" ? t("Open", "مفتوحة") : x["status"] === "Completed" ? t("Completed", "مكتملة") : t("Cancelled", "ملغاة")}</td><td className="p-2">{x["result_name"] ? <DocLink dt={String(x["result_doctype"])} name={String(x["result_name"])} /> : "—"}</td></tr>)}
      </Table>
    </EntFrame>
  </div>;
}

/* ------------------------------------------------------------------ dock board (IN12) ------------------------------------------------------------------ */
/** A door name for the reader: the standard doors "Door N" read "باب N" on Arabic screens; the stored name never changes. */
export const doorLabel = (dock: string, ar: boolean) => (ar ? dock.replace(/^Door (\d+)$/, "باب $1") : dock);
export function DockBoardPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas([CORE_DT.dockAppointment, "Warehouse", "Purchase Order", "Delivery Note"]);
  const whs = adapter.list("Warehouse").filter((w) => w["company"] === c.company && !Number(w["is_group"] ?? 0) && w["warehouse_type"] !== "Transit").map((w) => w.name).sort();
  const withAppts = whs.find((w) => adapter.list(CORE_DT.dockAppointment).some((a) => a["warehouse"] === w));
  const [whSel, setWh] = useState(""); const wh = whSel || withAppts || whs[0] || ""; const [date, setDate] = useState(today());
  const [dlg, setDlg] = useState(false); const [f, setF] = useState({ dock: "Door 1", direction: "Inbound" as "Inbound" | "Outbound", from: "09:00", to: "10:00", carrier: "", ref: "", cross: false });
  if (!canReadType(CORE_DT.dockAppointment)) return <Denied />;
  const day = OPS.dockDay(wh, date); const all = day.flatMap((d) => d.slots); const mayBook = can(CORE_DT.dockAppointment, "create", c.user);
  const refs = adapter.list(f.direction === "Inbound" ? "Purchase Order" : "Delivery Note").filter((d) => d["company"] === c.company && Number(d.docstatus) === 1 && (f.direction === "Outbound" || Number(d["per_received"] ?? 0) < 100)).map((d) => d.name).sort().slice(0, 50);
  const hours = Array.from({ length: 13 }, (_, i) => 6 + i);
  const pos = (ts: string) => { const h = Number(ts.slice(11, 13)) + Number(ts.slice(14, 16)) / 60; return Math.max(0, Math.min(100, ((h - 6) / 12) * 100)); };
  const tone = (s: string) => (s === "Done" ? "ok" : s === "Missed" ? "bad" : s === "Arrived" ? "brand" : "draft");
  return <div className="space-y-3" data-ops-dock>
    <Bar>
      <CompanySelect c={c} />
      <Field label={t("Warehouse", "المستودع")}><select className="field-input" value={wh} onChange={(e) => setWh(e.target.value)} data-ops-dock-wh data-no-i18n>{whs.map((w) => <option key={w}>{w}</option>)}</select></Field>
      <Field label={t("Day", "اليوم")}><DateInput className="field-input" value={date} onChange={(e) => setDate(e.target.value)} data-ops-dock-date /></Field>
      {mayBook && <button type="button" className="btn-primary" onClick={() => setDlg(true)} data-ops-dock-book>{t("Book a slot", "حجز موعد")}</button>}
    </Bar>
    <div className="flex flex-wrap gap-2">
      <Kpi id="dock-in" label={t("Inbound", "وارد")} value={String(all.filter((a) => a["direction"] === "Inbound").length)} />
      <Kpi id="dock-out" label={t("Outbound", "صادر")} value={String(all.filter((a) => a["direction"] === "Outbound").length)} />
      <Kpi id="dock-cross" label={t("Cross-dock", "عبور مباشر")} value={String(all.filter((a) => Number(a["cross_dock"] ?? 0)).length)} />
      <Kpi id="dock-missed" label={t("Missed", "فائت")} value={String(all.filter((a) => a["status"] === "Missed").length)} {...(all.some((a) => a["status"] === "Missed") ? { tone: "bad" } : {})} />
    </div>
    <EntFrame id="dock-board" title={t("Dock doors", "أبواب الرصيف")} note={t("Each door's booked slots for the day; mark arrival and completion as trucks come and go.", "مواعيد كل باب لليوم؛ سجّل الوصول والإنجاز مع حركة الشاحنات.")}>
      <div className="overflow-x-auto"><div className="min-w-[640px] space-y-2">
        <div className="relative ms-24 h-4 text-[10px] text-muted-foreground" aria-hidden>{hours.map((h) => <span key={h} className="absolute -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: `${((h - 6) / 12) * 100}%` }} data-no-i18n>{String(h).padStart(2, "0")}</span>)}</div>
        {day.map((d) => <div key={d.dock} className="flex items-center gap-2" data-ops-dock-door={d.dock} data-slots={d.slots.length}>
          <span className="ent-title w-22 shrink-0 text-sm" data-no-i18n>{doorLabel(d.dock, ar)}</span>
          <div className="relative h-12 flex-1 rounded-lg border border-border bg-muted/40">
            {d.slots.map((a) => <div key={a.name} className={`ent-qv-tone-${tone(String(a["status"]))} absolute top-1 bottom-1 overflow-hidden rounded-md border border-border bg-card px-1.5 text-[11px] shadow-sm`} style={{ insetInlineStart: `${pos(String(a["slot_start"]))}%`, width: `${Math.max(6, pos(String(a["slot_end"])) - pos(String(a["slot_start"])))}%` }} data-ops-dock-slot={a.name} data-status={String(a["status"])}>
              <span className="block truncate font-semibold" data-no-i18n>{String(a["carrier"] ?? "")}{Number(a["cross_dock"] ?? 0) ? " ⇄" : ""}</span><span className="block truncate text-muted-foreground" data-no-i18n>{String(a["slot_start"]).slice(11, 16)} · {String(a["reference_name"] ?? "") || (a["direction"] === "Inbound" ? "IN" : "OUT")}</span>
            </div>)}
          </div>
        </div>)}
      </div></div>
      <Table id="dock-list" head={[t("Time", "الوقت"), t("Door", "الباب"), t("Direction", "الاتجاه"), t("Carrier", "الناقل"), t("For", "المستند"), t("Status", "الحالة"), ""]}>
        {all.sort((a, b) => String(a["slot_start"]).localeCompare(String(b["slot_start"]))).map((a) => <tr key={a.name} className={tr} data-ops-dock-row={a.name}>
          <td className="p-2 tabular-nums" data-no-i18n>{String(a["slot_start"]).slice(11, 16)}–{String(a["slot_end"]).slice(11, 16)}</td><td className="p-2" data-no-i18n>{doorLabel(String(a["dock"]), ar)}</td><td className="p-2">{a["direction"] === "Inbound" ? t("Inbound", "وارد") : t("Outbound", "صادر")}{Number(a["cross_dock"] ?? 0) ? ` · ${t("cross-dock", "عبور مباشر")}` : ""}</td>
          <td className="p-2" data-no-i18n>{String(a["carrier"] ?? "")}</td><td className="p-2">{a["reference_name"] ? <DocLink dt={String(a["reference_doctype"])} name={String(a["reference_name"])} /> : "—"}</td>
          <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${tone(String(a["status"]))}`}>{pick(ar, OPS.DOCK_STATUS[String(a["status"])] ?? [String(a["status"]), String(a["status"])])}</span></td>
          <td className="p-2"><div className="flex gap-1">{(a["status"] === "Booked" ? (["Arrived", "Missed"] as const) : a["status"] === "Arrived" ? (["Done"] as const) : ([] as const)).map((s) => <button key={s} type="button" className="btn-ghost" data-ops-dock-set={s} onClick={() => { const r = OPS.setDockStatus(a.name, s, c.user); if (!r.ok) toast.error(pick(ar, r.reason)); }}>{pick(ar, OPS.DOCK_STATUS[s]!)}</button>)}</div></td></tr>)}
      </Table>
      {!all.length && <p className="text-sm text-muted-foreground" data-ops-dock-empty>{t("No slots booked on this day.", "لا مواعيد محجوزة في هذا اليوم.")}</p>}
    </EntFrame>
    <EntDialog open={dlg} onOpenChange={setDlg} id="dock-book" title={t("Book a dock slot", "حجز موعد رصيف")} description={`${wh} · ${date}`}
      footer={<><button type="button" className="btn-ghost" onClick={() => setDlg(false)}>{t("Cancel", "إلغاء")}</button><button type="button" className="btn-primary" data-ops-dock-confirm onClick={() => {
        const r = OPS.bookDock({ company: c.company, warehouse: wh, dock: f.dock, direction: f.direction, start: `${date} ${f.from}`, end: `${date} ${f.to}`, carrier: f.carrier, ...(f.ref ? { ref: { doctype: f.direction === "Inbound" ? "Purchase Order" : "Delivery Note", name: f.ref } } : {}), crossDock: f.cross }, c.user);
        if (r.ok) { toast.success(t("Slot booked", "حُجز الموعد")); setDlg(false); } else toast.error(pick(ar, r.reason)); }}>{t("Book", "حجز")}</button></>}>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Door", "الباب")}><select className="field-input" value={f.dock} onChange={(e) => setF({ ...f, dock: e.target.value })} data-ops-dock-door-input data-no-i18n>{OPS.docksOf(wh).map((d) => <option key={d} value={d}>{doorLabel(d, ar)}</option>)}</select></Field>
        <Field label={t("Direction", "الاتجاه")}><select className="field-input" value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as "Inbound" | "Outbound", ref: "" })} data-ops-dock-dir><option value="Inbound">{t("Inbound", "وارد")}</option><option value="Outbound">{t("Outbound", "صادر")}</option></select></Field>
        <Field label={t("From", "من")}><input type="time" className="field-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} data-ops-dock-from /></Field>
        <Field label={t("To", "إلى")}><input type="time" className="field-input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} data-ops-dock-to /></Field>
        <Field label={t("Carrier", "الناقل")}><input className="field-input" value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} data-ops-dock-carrier data-no-i18n /></Field>
        <Field label={f.direction === "Inbound" ? t("Purchase order", "أمر الشراء") : t("Delivery note", "إذن التسليم")}><select className="field-input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} data-ops-dock-ref data-no-i18n><option value="">—</option>{refs.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.cross} onChange={(e) => setF({ ...f, cross: e.target.checked })} data-ops-dock-cross />{t("Cross-dock: ship straight from receipt without put-away", "عبور مباشر: الشحن من الاستلام دون تخزين")}</label>
      </div>
    </EntDialog>
    <CrossDockPanel company={c.company} />
  </div>;
}

/* ------------------------------------------------------------------ procurement policies page (PU15) ------------------------------------------------------------------ */
export function ProcurementPoliciesPage() {
  useStoreVersion(); const { ar, t } = useT(); const c = useCompany(); useScopeMetas([CORE_DT.procurementPolicy, "Item Group", "Supplier", "Price List", "Item Price", "Material Request", "Purchase Order"]);
  if (!canReadType(CORE_DT.procurementPolicy)) return <Denied />;
  const pols = adapter.list(CORE_DT.procurementPolicy).filter((p) => !p["company"] || p["company"] === c.company).sort((a, b) => String(a["policy_name"]).localeCompare(String(b["policy_name"])));
  const docs = (["Material Request", "Purchase Order"] as const).flatMap((dt) => adapter.list(dt).filter((d) => d["company"] === c.company && Number(d.docstatus) === 0).map((d) => ({ dt, d, chk: OPS.procurementCheck(dt, d) }))).filter((x) => x.chk.lines.some((l) => l.policy));
  const RULE: Record<string, Bi2> = { Allowed: ["Allowed", "مسموح"], Blocked: ["Blocked", "محظور"], "Preferred supplier only": ["Preferred supplier only", "المورد المفضل فقط"], "Catalog price only": ["Catalog price only", "سعر الكتالوج فقط"] };
  return <div className="space-y-3">
    <Bar><CompanySelect c={c} />{can(CORE_DT.procurementPolicy, "create", c.user) && <NewDocLink dt={CORE_DT.procurementPolicy} data-ops-policy-new>{t("New policy", "سياسة جديدة")}</NewDocLink>}</Bar>
    <div className="flex flex-wrap gap-2" data-ops-policy-kpis>
      <Kpi id="pol-count" label={t("Policies in force", "سياسات سارية")} value={String(pols.length)} />
      <Kpi id="pol-blocked" label={t("Item groups blocked", "مجموعات محظورة")} value={String(pols.filter((p) => p["rule"] === "Blocked").length)} />
      <Kpi id="pol-catalog" label={t("Preferred supplier or catalog price", "مورد مفضل أو سعر كتالوج")} value={String(pols.filter((p) => p["rule"] === "Preferred supplier only" || p["rule"] === "Catalog price only").length)} />
      <Kpi id="pol-drafts" label={t("Drafts under a policy", "مسودات خاضعة لسياسة")} value={String(docs.length)} />
      <Kpi id="pol-drafts-blocked" label={t("Drafts that cannot be submitted", "مسودات لا يمكن اعتمادها")} value={String(docs.filter((x) => x.chk.blocked).length)} {...(docs.some((x) => x.chk.blocked) ? { tone: "bad" } : {})} />
    </div>
    <EntFrame id="procurement-policies" title={t("Procurement policies and catalogs", "سياسات وكتالوجات الشراء")} note={t("What may be bought, from whom and at what price, by item group; checked on every request and purchase order and enforced on submission.", "ما يجوز شراؤه وممن وبأي سعر حسب مجموعة الأصناف؛ يُفحص في كل طلب وأمر شراء ويُفرض عند الاعتماد.")}
      actions={can(CORE_DT.procurementPolicy, "create", c.user) ? <ListLink drill={coreList(CORE_DT.procurementPolicy)} className="btn-ghost">{t("Manage policies", "إدارة السياسات")}</ListLink> : undefined}>
      <Table id="procurement-policies" head={[t("Policy", "السياسة"), t("Item group", "مجموعة الأصناف"), t("Rule", "القاعدة"), t("Supplier", "المورد"), t("Catalog", "الكتالوج"), t("Line limit", "حد السطر"), t("Reason", "السبب")]}>
        {pols.map((p) => <tr key={p.name} className={tr} data-ops-policy-row={p.name}><td className="p-2"><DocLink dt={CORE_DT.procurementPolicy} name={p.name}>{String(p["policy_name"] ?? p.name)}</DocLink></td><td className="p-2" data-no-i18n>{String(p["item_group"] ?? "")}</td>
          <td className="p-2"><span className={`ent-qv-status ent-qv-tone-${p["rule"] === "Blocked" ? "bad" : "ok"}`}>{pick(ar, RULE[String(p["rule"])] ?? [String(p["rule"]), String(p["rule"])])}</span></td><td className="p-2" data-no-i18n>{recordLabel(String(p["supplier"] ?? ""), ["Supplier"]) || "—"}</td><td className="p-2" data-no-i18n>{String(p["price_list"] ?? "") || "—"}</td>
          <td className="p-2 tabular-nums" data-no-i18n>{Number(p["max_amount"] ?? 0) ? money(Number(p["max_amount"]), c.currency) : "—"}</td><td className="p-2 text-xs" data-no-i18n>{String(p["reason"] ?? "")}</td></tr>)}
      </Table>
    </EntFrame>
    <EntFrame id="procurement-drafts" title={t("Drafts touched by a policy", "مسودات تخضع لسياسة")}>
      {docs.length ? <ul className="space-y-1 text-sm" data-ops-policy-drafts={docs.length}>{docs.map(({ dt, d, chk }) => <li key={dt + d.name} className="flex flex-wrap items-center gap-2"><DocLink dt={dt} name={d.name} /><span className={`ent-qv-status ent-qv-tone-${chk.blocked ? "bad" : "ok"}`}>{chk.blocked ? t("Blocked", "محظور") : t("Within policy", "ضمن السياسة")}</span>
        <span className="text-xs text-muted-foreground">{chk.lines.filter((l) => l.verdict !== "ok").map((l) => pick(ar, l.reason)).join(" · ")}</span></li>)}</ul>
        : <p className="text-sm text-muted-foreground" data-ops-policy-drafts={0}>{t("No draft request or order uses a policy item group.", "لا توجد مسودة طلب أو أمر تستخدم مجموعة خاضعة لسياسة.")}</p>}
    </EntFrame>
  </div>;
}
type Bi2 = [string, string];
