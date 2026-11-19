/**
 * DIGIT Enterprise shared document frame (owner FINAL WORK LIST 2026-11-13, Part 1a). Every document of every app, in
 * DIGIT mode, opens with ONE header (title, status, party, totals, actions, smart buttons with counts), then the Smart
 * Guide (what this document is, stage strip from its linked documents, next step and who does it, step checklist, why it
 * cannot post yet with the fix), then the ledger / stock effect, the organised panel tabs and the form with its
 * Linked documents · Activity · Changes tabs. Logic: src/lib/coreShared/docFrame.ts (+ docInsight.ts). Apps add nothing.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Open360 } from "./Open360";
import { partyOf as partyOf360 } from "@/lib/coreShared/profile360";
import { DateInput } from "@/components/form/DateInput";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Compass, Check, Pause, Play, Repeat, Undo2, CopyPlus, AlertTriangle, Zap } from "lucide-react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { cachedMeta, dashboardsQuery, indexQuery, type DocTypeMeta } from "@/lib/catalog";
import { formActionsQuery } from "@/lib/engines";
import { useFormActionRunner, visibleFormActions } from "@/components/FormActions";
import { connectionCount, connectionGroups, reverseLinksFor, reverseLinksQuery } from "@/lib/relations";
import { hasPerm, useSessionUser } from "@/lib/session";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { useLang, t as tr } from "@/i18n";
import * as DI from "@/lib/coreShared/docInsight";
import * as DF from "@/lib/coreShared/docFrame";
import { FREQ_LABEL, FREQUENCIES, makeRecurring, nextDate, type Frequency } from "@/lib/coreShared/recurring";
import { fixHint } from "@/lib/coreShared/fixHints";
import { openQuickView, QuickKpiButton, QuickLink } from "./QuickView";
import { EntDialog } from "./Surfaces";
import { useMetaReady } from "./DocInsight";
import { QuickProcessPanel } from "./TradeDesk";
import { featureOn } from "@/lib/coreShared/features";
import { docPath } from "@/lib/coreShared/docPath";
import { activeWorkflow, currentState } from "@/lib/workflow";
import { QUICK_FEATURE, quickPlan } from "@/lib/coreShared/quickProcess";

const bi = (ar: boolean, x: DF.Bi) => (ar ? x[1] : x[0]);
const today = () => new Date().toISOString().slice(0, 10);
const stageTitle = (ar: boolean, dt: string) => (ar ? DF.STAGE_AR[dt] ?? tr(dt) : dt);
const focusField = (label: string, meta: DocTypeMeta) => {
  const f = meta.fields.find((x) => x.fieldname && (x.label === label || x.fieldname === label));
  const el = f?.fieldname ? document.querySelector<HTMLElement>(`[data-field="${f.fieldname}"]`) : null;
  el?.scrollIntoView({ block: "center" }); el?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
  return !!el;
};

/* ------------------------------------------------------------------ header: title, status, actions (single owner) ------------------------------------------------------------------ */
export function FrameTitle({ meta, doc, title, chips, actions, docstatus }: { meta: DocTypeMeta; doc: Doc; title: ReactNode; chips?: ReactNode; actions: ReactNode; docstatus: number }) {
  const ar = useLang() === "ar"; useStoreVersion();
  const hold = DF.holdState(meta.name, doc);
  const zatca = meta.name === "Sales Invoice" && !doc["__islocal"] ? zatcaState(doc) : null;
  // owner notes A-05: the document band carries the status path next to the key actions
  const wf = activeWorkflow(meta.name);
  const path = docPath(meta, doc, wf ? { states: wf.states, current: currentState(wf, doc) } : undefined);
  // owner notes A-06: the record's own 360 (a master) or its party's 360, one click from the document header
  const party = partyOf360(meta.name, doc);
  return <div className="dx-frame-top" data-doc-frame-head data-doc-band>
    <div className="dx-frame-id">
      <p className="dx-docsum-label">{tr(meta.name)}</p>
      <h1 className="dx-frame-title" data-doc-frame-title>{title}</h1>
      <div className="dx-frame-chips">
        {chips}
        {hold.held && <span className="dx-docsum-chip" data-tone="warn" data-doc-hold title={hold.reason}><Pause className="h-3 w-3" aria-hidden /> {ar ? "موقوف" : "On hold"}</span>}
        {zatca && <span className="dx-docsum-chip" data-tone={zatca.tone} data-doc-zatca={zatca.key}>{ar ? zatca.label[1] : zatca.label[0]}</span>}
      </div>
    </div>
    <div className="dx-frame-actions" data-form-head data-docstatus={docstatus}>{party && !doc["__islocal"] && <Open360 doctype={party.doctype} name={party.name} />}{actions}</div>
    {path && <ol className="dx-band-path" aria-label={ar ? "مسار المستند" : "Document path"} data-doc-path={path.find((x) => x.state === "current")?.key}>
      {path.map((x) => <li key={x.key} data-state={x.state} aria-current={x.state === "current" ? "step" : undefined} data-doc-path-step={x.key}>
        {x.state === "done" && <Check className="h-3 w-3" aria-hidden />}<span>{wf ? tr(x.label[0]) : ar ? x.label[1] : x.label[0]}</span></li>)}
    </ol>}
  </div>;
}

/* ------------------------------------------------------------------ side column: related documents, next step, activity (owner notes A-05) ------------------------------------------------------------------ */
export function SideRelated({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const dashes = useQuery(dashboardsQuery); const rev = useQuery(reverseLinksQuery);
  const groups = useMemo(() => connectionGroups(meta, dashes.data?.[meta.name], reverseLinksFor(meta.name, rev.data?.doctypes)), [meta, dashes.data, rev.data]);
  if (doc["__islocal"]) return null;
  // source ← : documents this one was made from (its own Link fields and child-row references to other transactions)
  const SRC = /^(sales_order|purchase_order|quotation|delivery_note|purchase_receipt|material_request|against_sales_order|against_delivery_note|prevdoc_docname|opportunity|project|against_voucher|return_against|amended_from)$/;
  const src = new Map<string, { dt: string; name: string }>();
  for (const f of meta.fields) if (f.fieldname && SRC.test(f.fieldname) && (f.fieldtype === "Link") && f.options && doc[f.fieldname]) src.set(`${f.options}:${doc[f.fieldname]}`, { dt: f.options, name: String(doc[f.fieldname]) });
  for (const f of meta.fields) if (f.fieldtype === "Table" && Array.isArray(doc[f.fieldname ?? ""])) for (const r of doc[f.fieldname!] as Doc[]) {
    for (const [k, dt] of [["sales_order", "Sales Order"], ["purchase_order", "Purchase Order"], ["delivery_note", "Delivery Note"], ["purchase_receipt", "Purchase Receipt"], ["material_request", "Material Request"], ["prevdoc_docname", "Quotation"], ["against_sales_order", "Sales Order"]] as const)
      if (r[k] && typeof r[k] === "string") src.set(`${dt}:${r[k]}`, { dt, name: String(r[k]) });
  }
  const sources = [...src.values()].filter((x) => x.name !== doc.name && cachedMeta(x.dt) && hasPerm(cachedMeta(x.dt)!, "read", undefined, user) && adapter.get(x.dt, x.name)).slice(0, 6);
  // → created from here: the Connections counts (same reverse-link index the smart buttons use)
  const srcTypes = new Set(sources.map((x) => x.dt));
  const made = groups.flatMap((g) => g.items).filter((it) => !srcTypes.has(it.link_doctype)).map((it) => ({ it, rc: connectionCount(it, meta.name, doc, user) })).filter(({ rc }) => (rc.status === "ok" || rc.status === "limited") && rc.count > 0).slice(0, 6);
  const versions = adapter.list("Version").filter((v) => v["ref_doctype"] === meta.name && v["docname"] === doc.name).sort((a, b) => String(b["creation"] ?? "").localeCompare(String(a["creation"] ?? ""))).slice(0, 3);
  const files = adapter.list("File").filter((f) => f["attached_to_doctype"] === meta.name && f["attached_to_name"] === doc.name).length;
  const open = (dt: string, name: string, el: HTMLElement) => openQuickView({ kind: "doc", doctype: dt, name }, el);
  const title = (dt: string, name: string) => { const d = adapter.get(dt, name); const t = d ? String(d["title"] ?? d["customer_name"] ?? d["supplier_name"] ?? "") : ""; return t && t !== name ? t : ""; };
  return <section className="dx-side-rel" aria-label={tr("Related documents")} data-doc-side-related>
    <h3 className="dx-side-h"><span className="dx-sec-ico" aria-hidden>⇄</span>{tr("Related documents")}</h3>
    <ol className="dx-rel-flow">
      <li data-rel="source"><p className="dx-rel-k">← {tr("Created from")}</p>
        {sources.length ? <ul>{sources.map((x) => <li key={`${x.dt}:${x.name}`}><button type="button" className="dx-rel-link" onClick={(e) => open(x.dt, x.name, e.currentTarget)} data-rel-doc={`${x.dt}:${x.name}`}>
          <span className="dx-rel-dt">{tr(x.dt)}</span><bdi className="r1-mono" data-no-i18n>{x.name}</bdi>{title(x.dt, x.name) && <bdi className="dx-rel-dt" data-no-i18n>· {title(x.dt, x.name)}</bdi>}</button></li>)}</ul>
          : <p className="dx-rel-none">{ar ? "أُنشئ مباشرة (لا يوجد مستند مصدر)" : "Created directly (no source document)"}</p>}</li>
      <li data-rel="here"><p className="dx-rel-here"><span>{tr("This document")}</span> <bdi className="r1-mono" data-no-i18n>{doc.name}</bdi></p></li>
      <li data-rel="made"><p className="dx-rel-k">→ {tr("Created from here")}</p>
        {made.length ? <ul>{made.map(({ it, rc }) => <li key={it.link_doctype + it.link_fieldname}><QuickKpiButton doctype={it.link_doctype} filters={rc.filters as never} title={`${tr(it.link_doctype)} · ${doc.name}`} className="dx-rel-link">
          <span className="dx-rel-n" data-no-i18n>{rc.count}</span><span>{tr(it.link_doctype)}</span></QuickKpiButton></li>)}</ul>
          : <p className="dx-rel-none">{ar ? "لم يُنشأ منه مستند بعد" : "Nothing created from it yet"}</p>}</li>
    </ol>
    <h3 className="dx-side-h mt-3"><span className="dx-sec-ico" data-hue="blue" aria-hidden>◷</span>{tr("Latest activity")}</h3>
    {versions.length ? <ul className="dx-rel-act">{versions.map((v) => <li key={v.name}><bdi data-no-i18n>{String(v["owner"] ?? "")}</bdi> · <bdi data-no-i18n>{fmtDate(String(v["creation"] ?? "").slice(0, 10))}</bdi></li>)}</ul>
      : <p className="dx-rel-none">{tr("No activity yet")}</p>}
    <p className="dx-rel-files" data-doc-side-files={files}>📎 {ar ? `المرفقات: ${files}` : `Attachments: ${files}`}</p>
  </section>;
}
function zatcaState(doc: Doc): { key: string; label: DF.Bi; tone: "ok" | "warn" | "muted" } {
  const log = adapter.list("Digit Integration Log").filter((l) => l["engine"] === "zatca" && l["reference_name"] === doc.name).sort((a, b) => String(b["last_attempt"] ?? b["creation"] ?? "").localeCompare(String(a["last_attempt"] ?? a["creation"] ?? "")))[0];
  const st = String(log?.["status"] ?? (Number(doc.docstatus) === 1 ? "Prepared" : ""));
  if (!st) return { key: "draft", label: ["ZATCA: prepared on submit", "زاتكا: يُجهّز عند الاعتماد"], tone: "muted" };
  if (st === "Accepted" || st === "Sent") return { key: st, label: [`ZATCA: ${st === "Accepted" ? "cleared" : "reported"}`, `زاتكا: ${st === "Accepted" ? "مقبولة" : "مُبلّغ عنها"}`], tone: "ok" };
  return { key: st, label: [`ZATCA: ${st === "Awaiting Provider" ? "awaiting provider" : "QR ready, not sent"}`, `زاتكا: ${st === "Awaiting Provider" ? "بانتظار المزوّد" : "رمز QR جاهز، لم تُرسل"}`], tone: "warn" };
}

/* ------------------------------------------------------------------ smart buttons with counts ------------------------------------------------------------------ */
export function SmartButtons({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const dashes = useQuery(dashboardsQuery); const rev = useQuery(reverseLinksQuery);
  const groups = useMemo(() => connectionGroups(meta, dashes.data?.[meta.name], reverseLinksFor(meta.name, rev.data?.doctypes)), [meta, dashes.data, rev.data]);
  const ready = useMetaReady(groups.flatMap((g) => g.items.map((i) => i.link_doctype)).slice(0, 24));
  if (doc["__islocal"]) return null;
  const items = groups.flatMap((g) => g.items).map((it) => ({ it, rc: connectionCount(it, meta.name, doc, user) }))
    .filter(({ rc }) => (rc.status === "ok" || rc.status === "limited") && rc.count > 0);
  if (!items.length) return ready ? <p className="dx-frame-smart-empty" data-doc-smart="0">{ar ? "لا توجد مستندات مرتبطة بعد" : "No related documents yet"}</p> : null;
  return <div className="dx-frame-smart" role="group" aria-label={ar ? "المستندات المرتبطة" : "Related documents"} data-doc-smart={items.length}>
    {items.map(({ it, rc }) => <QuickKpiButton key={it.link_doctype + it.link_fieldname} doctype={it.link_doctype} filters={rc.filters as never} title={`${tr(it.link_doctype)} · ${doc.name}`} className="dx-frame-smart-btn">
      <span className="dx-frame-smart-n" data-no-i18n>{rc.count}</span><span>{tr(it.link_doctype)}</span>
    </QuickKpiButton>)}
  </div>;
}

/* ------------------------------------------------------------------ Smart Guide ------------------------------------------------------------------ */
export function SmartGuide({ meta, doc, dirty, local, held, nextAction }: { meta: DocTypeMeta; doc: Doc; dirty: boolean; local: boolean; held: boolean; nextAction?: ReactNode }) {
  useStoreVersion(); const ar = useLang() === "ar"; const user = useSessionUser();
  const guide = DF.guideFor(meta); const ds = Number(doc.docstatus ?? 0);
  const st = useMemo(() => DF.frameStages(meta.name, doc, user), [meta.name, doc, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = useMemo(() => (meta.is_submittable && ds === 0 ? DI.postReadiness(meta, doc, user) : null), [meta, doc, user, ds]);
  const blockers = [...(ready?.blockers ?? []), ...(held ? [{ message: "On hold", kind: "hold", title: ["The document is on hold", "المستند موقوف"] as DF.Bi, fix: ["Release the hold, then submit.", "أفرج عن الإيقاف ثم اعتمد."] as DF.Bi }] : [])];
  const hasNextStage = !!st.chain && DF.SEQUENTIAL.has(st.chain) && st.stages.findIndex((x) => x.state === "current") < st.stages.length - 1;
  const steps = DF.checklist(meta, doc, { dirty, blockers: blockers.length, next: st.next, hasNextStage });
  const axes = DI.ORDER_AXES_DOCTYPES.includes(meta.name) ? frameAxes(meta.name, doc) : [];
  const audit = local ? null : DI.auditTrail(meta.name, doc.name);
  const party = partyOf(meta.name, doc);
  const who = (dt: string, p: "submit" | "create") => { const r = DF.rolesFor(dt, p); const mine = cachedMeta(dt) && hasPerm(cachedMeta(dt)!, p, p === "submit" ? doc : undefined, user);
    return mine ? (ar ? "أنت" : "you") : r.length ? r.slice(0, 3).map((x) => tr(x)).join(ar ? "، " : ", ") : bi(ar, guide.who); };
  const nextLine: DF.Bi = ds === 2 ? ["Cancelled — amend it to make a corrected copy", "ملغى — عدّله لإنشاء نسخة مصحّحة"]
    : held ? ["On hold — release it to continue", "موقوف — أفرج عنه للمتابعة"]
    : ds === 0 && (local || dirty) ? ["Save the draft", "احفظ المسودة"]
    : ds === 0 && meta.is_submittable ? (blockers.length ? [`Fix ${blockers.length} item(s) below, then submit`, `أصلح ${blockers.length} بند أدناه ثم اعتمد`] : ["Submit — it becomes final and posts", "اعتمد — يصبح نهائيًا ويُرحَّل"])
    : st.next ? [`Create the ${st.next}`, `إنشاء ${DF.STAGE_AR[st.next] ?? st.next}`] : ["Nothing pending — this flow is complete", "لا شيء معلق — اكتملت الدورة"];
  const nextWho = ds === 0 && (local || dirty) ? (ar ? "أنت" : "you") : ds === 0 ? who(meta.name, "submit") : st.next ? who(st.next, "create") : "";
  const openStage = (x: DF.FrameStage, el: HTMLElement) => {
    if (x.state === "current") return;
    if (x.docs.length === 1) openQuickView({ kind: "doc", doctype: x.doctype, name: x.docs[0]!.name }, el);
    else if (x.docs.length > 1) openQuickView({ kind: "list", doctype: x.doctype, filters: [["name", "in", x.docs.map((d) => d.name)]] as never, title: stageTitle(ar, x.doctype) }, el);
    else openQuickView({ kind: "list", doctype: x.doctype, filters: (party ? [[party.field, "=", party.name]] : doc["company"] ? [["company", "=", doc["company"]]] : []) as never, title: stageTitle(ar, x.doctype) }, el);
  };
  return <section className="dx-guide" aria-label={ar ? "الدليل الذكي" : "Smart guide"} data-doc-guide={meta.name} data-smart-guide-panel>
    <header className="dx-guide-h"><Compass className="h-4 w-4 shrink-0" aria-hidden /><div className="min-w-0"><p className="dx-guide-kicker">{ar ? "الدليل الذكي" : "Smart guide"}</p><p className="dx-guide-what" data-doc-guide-what>{bi(ar, guide.what)}</p></div></header>
    <ol className="dx-stage" data-doc-stage={st.chain ?? "own"} aria-label={ar ? "مراحل الدورة" : "Flow stages"}>
      {st.stages.map((x) => <li key={x.doctype} data-doc-stage-step={x.state} data-stage={x.doctype}>
        <button type="button" className="dx-stage-btn" data-state={x.state} aria-current={x.state === "current" ? "step" : undefined} onClick={(e) => openStage(x, e.currentTarget)}
          title={x.state === "pending" ? (ar ? "لم يُنشأ بعد" : "Not created yet") : x.docs.map((d) => d.name).join(", ")}>
          {(x.state === "done" || x.state === "after") && <Check className="h-3 w-3" aria-hidden />}<span>{bi(ar, x.label)}</span>{x.docs.length > 0 && x.state !== "current" && <span className="dx-stage-n" data-no-i18n>{x.docs.length}</span>}
        </button></li>)}
    </ol>
    {axes.length > 0 && <div className="dx-axes" data-doc-axes={axes.length}>{axes.map((a) => <div key={a.key} className="dx-axis" data-doc-axis={a.key}>
      <span className="dx-axis-l">{bi(ar, a.label)}</span><span className="dx-axis-s">{bi(ar, a.state)}</span>
      <span className="dx-axis-bar" aria-hidden><span style={{ width: `${a.pct ?? 0}%` }} data-empty={a.pct === null ? "" : undefined} /></span></div>)}</div>}
    <p className="dx-guide-next" data-doc-next><span className="dx-guide-next-k">{ar ? "التالي:" : "Next:"}</span> <span>{bi(ar, nextLine)}</span>{nextWho && <> <span className="dx-guide-who" data-doc-next-who>— {ar ? "يقوم به" : "by"} {nextWho}</span></>}</p>
    <ol className="dx-check" data-doc-checklist={steps.length}>{steps.map((x) => <li key={x.key} data-doc-check={x.key} data-done={x.done ? "1" : "0"} data-current={x.current ? "1" : undefined}>
      <span className="dx-check-dot" aria-hidden>{x.done ? <Check className="h-3 w-3" /> : null}</span><span>{bi(ar, x.label)}</span></li>)}</ol>
    {ready && <div className="dx-why" data-doc-why={blockers.length ? "blocked" : "ok"}>
      <p className="dx-why-h">{ar ? "لماذا لا يمكن ترحيله؟" : "Why can't this post?"}</p>
      {blockers.length ? <ul className="dx-why-list">{blockers.map((b, i) => <BlockerRow key={i} b={b} meta={meta} />)}</ul>
        : <p className="dx-why-ok"><span className="ent-mint-chip">{ar ? "لا عوائق — جاهز للاعتماد" : "No blockers — ready to submit"}</span></p>}
    </div>}
    {nextAction && <div className="dx-guide-act">{nextAction}</div>}
    {audit && (audit.created || audit.submitted) && <p className="dx-guide-audit" data-doc-audit>
      {audit.created && <span>{ar ? "أنشأه" : "Created by"} <bdi data-no-i18n>{audit.created.by}</bdi> <bdi data-no-i18n>{audit.created.on.slice(0, 16).replace("T", " ")}</bdi></span>}
      {audit.submitted && <span>{ar ? "اعتمده" : "Submitted by"} <bdi data-no-i18n>{audit.submitted.by}</bdi> <bdi data-no-i18n>{audit.submitted.on.slice(0, 16).replace("T", " ")}</bdi></span>}
    </p>}
  </section>;
}
function frameAxes(dt: string, doc: Doc): DF.FrameAxis[] {
  const a = DI.orderAxes(dt, doc); const get = (k: string) => a.find((x) => x.key === k)!;
  const closure = get("closure"); const appr = get("approval");
  return [
    { key: "order", label: ["Order", "الأمر"], pct: appr.pct, state: closure.pct === 100 || String(doc["status"]) === "On Hold" ? closure.state : appr.state },
    DF.reservationAxis(dt, doc),
    { key: "fulfilment", label: get("fulfilment").label, pct: get("fulfilment").pct, state: get("fulfilment").state },
    { key: "billing", label: ["Invoicing", "الفوترة"], pct: get("billing").pct, state: get("billing").state },
    { key: "payment", label: get("payment").label, pct: get("payment").pct, state: get("payment").state },
  ];
}
function BlockerRow({ b, meta }: { b: DI.Blocker; meta: DocTypeMeta }) {
  const ar = useLang() === "ar";
  const field = fieldIn(b.message, meta);
  const go = field ?? (b.kind === "period" || b.kind === "frozen" ? "posting_date" : b.kind === "balance" ? "accounts" : b.kind === "qty" || b.kind === "stock" ? "items" : null);
  return <li className="dx-why-row" data-doc-blocker={b.kind}>
    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
    <div className="min-w-0 flex-1"><p className="dx-why-t">{bi(ar, b.title)}{field && <span className="dx-why-field" data-doc-blocker-field={field}> · {tr(meta.fields.find((f) => f.fieldname === field || f.label === field)?.label ?? field)}</span>}</p>
      <p className="dx-why-fix">{bi(ar, b.fix)}</p></div>
    {go && <button type="button" className="btn-ghost h-8 border border-border px-3 text-xs" data-doc-blocker-go={go} onClick={() => { if (!focusField(go, meta)) toast.message(bi(ar, b.fix)); }}>{ar ? "اذهب للحقل" : "Go to field"}</button>}
  </li>;
}
/** The field a validation message names (label or fieldname, longest match first). */
export function fieldIn(message: string, meta: DocTypeMeta): string | null {
  // the message may already be in the UI language (formRules translates the labels), so both label forms are matched; earliest mention wins
  const m = message.toLowerCase(); let best: { f: string; at: number; len: number } | null = null;
  for (const f of meta.fields) {
    if (!f.fieldname || !f.label || ["Section Break", "Column Break", "Tab Break", "HTML", "Heading"].includes(f.fieldtype)) continue;
    for (const lab of new Set([f.label, tr(f.label, meta.name), tr(f.label)])) {
      if (!lab || lab.length < 3) continue; const at = m.indexOf(lab.toLowerCase());
      if (at >= 0 && (!best || at < best.at || (at === best.at && lab.length > best.len))) best = { f: f.fieldname, at, len: lab.length };
    }
  }
  return best?.f ?? null;
}
type PartyRef = { dt: "Customer" | "Supplier"; name: string; field: string };
export function partyOf(dt: string, doc: Doc): PartyRef | null {
  if (doc["customer"]) return { dt: "Customer", name: String(doc["customer"]), field: "customer" };
  if (doc["supplier"]) return { dt: "Supplier", name: String(doc["supplier"]), field: "supplier" };
  if (dt === "Quotation" && doc["quotation_to"] === "Customer" && doc["party_name"]) return { dt: "Customer", name: String(doc["party_name"]), field: "party_name" };
  if ((doc["party_type"] === "Customer" || doc["party_type"] === "Supplier") && doc["party"]) return { dt: doc["party_type"] as "Customer" | "Supplier", name: String(doc["party"]), field: "party" };
  if (dt === "Request for Quotation") { const s0 = ((doc["suppliers"] as Doc[] | undefined) ?? [])[0]; if (s0?.["supplier"]) return { dt: "Supplier", name: String(s0["supplier"]), field: "supplier" }; }
  return null;
}

/* ------------------------------------------------------------------ error card with the fix ------------------------------------------------------------------ */
export function ErrorCard({ errors, meta }: { errors: string[]; meta: DocTypeMeta }) {
  const ar = useLang() === "ar";
  if (!errors.length) return null;
  return <section role="alert" className="dx-errcard" data-form-errors data-doc-errcard={errors.length}>
    <p className="dx-errcard-h"><AlertTriangle className="h-4 w-4" aria-hidden /> {ar ? `تعذّر المتابعة — ${errors.length} ملاحظة` : `Cannot continue — ${errors.length} issue(s)`}</p>
    <ul>{errors.map((e) => { const b = DI.explainBlocker(e); const field = fieldIn(e, meta); const h = fixHint(e);
      return <li key={e} className="dx-errcard-row" data-form-error data-doc-error-kind={b.kind}>
        <div className="min-w-0 flex-1">
          {field && <p className="dx-errcard-field" data-doc-error-field={field}>{ar ? "الحقل:" : "Field:"} <b>{tr(meta.fields.find((f) => f.fieldname === field)?.label ?? field)}</b></p>}
          <p className="dx-errcard-rule">{ar ? "القاعدة:" : "Rule:"} {bi(ar, b.title)} <span className="dx-errcard-msg" data-no-i18n>· {e}</span></p>
          <p className="dx-errcard-fix" data-fix-hint>{ar ? "طريقة الحل:" : "How to fix:"} {h ? bi(ar, h as DF.Bi) : bi(ar, b.fix)}</p>
        </div>
        {field && <button type="button" className="btn-primary h-8 px-3 text-xs" data-doc-error-go={field} onClick={() => focusField(field, meta)}>{ar ? "اذهب للحقل" : "Go to field"}</button>}
      </li>; })}</ul>
  </section>;
}

/* ------------------------------------------------------------------ Linked documents tab ------------------------------------------------------------------ */
export function LinkedDocsTab({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  useStoreVersion(); const ar = useLang() === "ar"; const user = useSessionUser();
  const { linked } = useMemo(() => DF.frameStages(meta.name, doc, user), [meta.name, doc, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = linked; const cur = String(doc["currency"] ?? "SAR");
  if (!up.length) return <p className="text-sm text-muted-foreground" data-doc-linked="0">{ar ? "لا توجد مستندات مرتبطة بعد." : "No linked documents yet."}</p>;
  return <div className="dx-linked" data-doc-linked={up.length}>
    <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="p-2 text-start">{ar ? "النوع" : "Type"}</th><th className="p-2 text-start">{ar ? "المستند" : "Document"}</th>
      <th className="p-2 text-start">{ar ? "التاريخ" : "Date"}</th><th className="p-2 text-start">{ar ? "الحالة" : "Status"}</th><th className="p-2 text-end">{ar ? "المبلغ" : "Amount"}</th></tr></thead>
      <tbody>{up.map((d) => <tr key={d.doctype + d.name} className="border-t border-border" data-doc-linked-row={`${d.doctype}:${d.name}`}>
        <td className="p-2">{stageTitle(ar, d.doctype)}</td><td className="p-2"><QuickLink doctype={d.doctype} name={d.name} /></td>
        <td className="p-2 tabular-nums" data-no-i18n>{d.date ? fmtDate(d.date) : ""}</td><td className="p-2"><span className="dx-docsum-chip">{tr(d.status)}</span></td>
        <td className="p-2 text-end tabular-nums" data-no-i18n>{d.total ? fmtCurrency(d.total, cur) : ""}</td></tr>)}</tbody></table>
  </div>;
}

/* ------------------------------------------------------------------ Party 360 beside the document ------------------------------------------------------------------ */
export function Party360Mini({ meta, doc, fullHref }: { meta: DocTypeMeta; doc: Doc; fullHref?: (p: { dt: string; name: string }) => string | undefined }) {
  useStoreVersion(); const ar = useLang() === "ar"; const user = useSessionUser();
  const p = partyOf(meta.name, doc);
  useMetaReady(p ? [p.dt === "Customer" ? "Sales Invoice" : "Purchase Invoice", p.dt === "Customer" ? "Sales Order" : "Purchase Order"] : []);
  if (!p) return null;
  const snap = DI.partySnapshot(p.dt, p.name, String(doc["company"] ?? ""), user);
  const cur = String(doc["currency"] ?? "SAR");
  const partyName = String(adapter.get(p.dt, p.name)?.[p.dt === "Customer" ? "customer_name" : "supplier_name"] ?? p.name);
  const invDt = p.dt === "Customer" ? "Sales Invoice" : "Purchase Invoice";
  const last = adapter.list(invDt).filter((d) => d[p.dt === "Customer" ? "customer" : "supplier"] === p.name && Number(d.docstatus) === 1).sort((a, b) => String(b["posting_date"]).localeCompare(String(a["posting_date"]))).slice(0, 3);
  const supHold = p.dt === "Supplier" ? adapter.get("Supplier", p.name) : undefined;
  const href = fullHref?.({ dt: p.dt, name: p.name });
  return <aside className="dx-p360" aria-label={ar ? (p.dt === "Customer" ? "العميل 360" : "المورد 360") : `${p.dt} 360`} data-doc-party360={p.dt}>
    <p className="dx-p360-k">{ar ? (p.dt === "Customer" ? "العميل 360" : "المورد 360") : `${p.dt} 360`}</p>
    <p className="dx-p360-n"><QuickLink doctype={p.dt} name={p.name}><bdi data-no-i18n>{partyName}</bdi></QuickLink></p>
    {snap ? <dl className="dx-p360-f">
      <div><dt>{ar ? "الرصيد" : "Balance"}</dt><dd data-no-i18n data-p360-balance={snap.balance}>{fmtCurrency(snap.balance, cur)}</dd></div>
      <div><dt>{ar ? "متأخر" : "Overdue"}</dt><dd data-no-i18n data-p360-overdue={snap.overdue}>{fmtCurrency(snap.overdue, cur)} <span className="text-muted-foreground">({snap.overdueCount})</span></dd></div>
      {snap.creditUsedPct !== null && <div><dt>{ar ? "الائتمان المستخدم" : "Credit used"}</dt><dd data-no-i18n>{snap.creditUsedPct}%</dd></div>}
      <div><dt>{ar ? "الحالة" : "Status"}</dt><dd data-p360-hold>{snap.hold?.held || Number(supHold?.["on_hold"] ?? 0) ? <span className="dx-docsum-chip" data-tone="bad">{ar ? "موقوف" : "On hold"}</span> : <span className="ent-mint-chip">{ar ? "نشط" : "Active"}</span>}</dd></div>
    </dl> : <p className="text-xs text-muted-foreground" data-p360-denied>{ar ? "لا تملك صلاحية رؤية أرصدة هذا الطرف." : "You cannot see this party's balances."}</p>}
    {snap && last.length > 0 && <ul className="dx-p360-last" data-p360-last={last.length}>{last.map((d) => <li key={d.name}><QuickLink doctype={invDt} name={d.name} /><span data-no-i18n>{fmtCurrency(Number(d["grand_total"] ?? 0), cur)}</span></li>)}</ul>}
    {href && <a href={href} className="dx-p360-full" data-p360-full>{ar ? "فتح صفحة 360 الكاملة" : "Open the full 360 page"}</a>}
  </aside>;
}

/* ------------------------------------------------------------------ hold / release, reverse, repeat, save & new ------------------------------------------------------------------ */
export function FrameMore({ meta, doc, canWrite, onSaveNew, onPatch }: {
  meta: DocTypeMeta; doc: Doc; canWrite: boolean; onSaveNew?: (() => void) | undefined; onPatch?: (p: Record<string, unknown>) => void;
}) {
  useStoreVersion(); const ar = useLang() === "ar"; const user = useSessionUser();
  const { data: all } = useQuery(formActionsQuery); const { data: index } = useQuery(indexQuery);
  const { run } = useFormActionRunner(meta, doc, onPatch);
  const native = (label: string | undefined) => (label ? visibleFormActions(meta, doc, all, index).find((a) => a.label === label) : undefined);
  const revAct = native(DF.REVERSE_ACTION[meta.name]);
  const onReverse = Number(doc.docstatus ?? 0) === 1 ? () => { if (revAct) void run(revAct); else document.querySelector<HTMLButtonElement>("[data-form-head] [data-cancel]")?.click(); } : undefined;
  const natHold = DF.NATIVE_HOLD[meta.name];
  const onNativeHold = natHold ? (release: boolean) => { const a = native(release ? natHold.release : natHold.hold); if (a) void run(a); } : undefined;
  const [dlg, setDlg] = useState<"hold" | "release" | "repeat" | "quick" | null>(null); const [reason, setReason] = useState("");
  const [freq, setFreq] = useState<Frequency>("Monthly"); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [sub, setSub] = useState(false);
  const ds = Number(doc.docstatus ?? 0); const local = !!doc["__islocal"];
  const hold = DF.holdState(meta.name, doc); const nat = DF.NATIVE_HOLD[meta.name]; const useNative = !!(nat && nat.when(doc) && onNativeHold && native(hold.held ? nat.release : nat.hold));
  const rep = DF.canRepeat(meta) ? DF.repeatOf(meta.name, doc.name) : undefined;
  const btn = (k: string, icon: ReactNode, label: string, on: () => void, dis?: string) => <button key={k} type="button" className="btn-ghost h-8 border border-border px-2.5 text-xs" data-doc-more={k} disabled={!!dis} title={dis} onClick={on}>{icon}<span>{label}</span></button>;
  const out: ReactNode[] = [];
  if (onSaveNew && ds === 0 && canWrite) out.push(btn("save-new", <CopyPlus className="h-3.5 w-3.5" aria-hidden />, ar ? "حفظ وإنشاء جديد" : "Save & new", onSaveNew));
  if (!local && ds < 2) out.push(hold.held
    ? btn("release", <Play className="h-3.5 w-3.5" aria-hidden />, ar ? "إفراج" : "Release", () => (useNative ? onNativeHold!(true) : setDlg("release")))
    : btn("hold", <Pause className="h-3.5 w-3.5" aria-hidden />, ar ? "إيقاف مؤقت" : "Hold", () => (useNative ? onNativeHold!(false) : (setReason(""), setDlg("hold")))));
  if (ds === 1 && onReverse && (revAct || meta.is_submittable)) out.push(btn("reverse", <Undo2 className="h-3.5 w-3.5" aria-hidden />, revAct ? (ar ? "عكس بمستند" : "Reverse") : (ar ? "إلغاء بقيد عكسي" : "Reverse by cancel"), onReverse));
  if (DF.canRepeat(meta) && !local && ds < 2) out.push(btn("repeat", <Repeat className="h-3.5 w-3.5" aria-hidden />, rep ? (ar ? `يتكرر: ${bi(ar, FREQ_LABEL[String(rep["frequency"]) as Frequency] ?? [String(rep["frequency"]), String(rep["frequency"])])}` : `Repeats ${String(rep["frequency"]).toLowerCase()}`) : (ar ? "تكرار" : "Repeat"),
    () => { const base = String(doc["posting_date"] ?? doc["transaction_date"] ?? today()); setStart(nextDate(base, freq)); setEnd(""); setSub(false); setDlg("repeat"); }, rep ? (ar ? "هذا المستند مكرر بالفعل" : "This document already repeats") : undefined));
  // one step from a submitted order: deliver available + invoice (SO) / receive + bill (PO) — the same Quick process panel as the Work tab
  const quickDt = meta.name === "Sales Order" || meta.name === "Purchase Order" ? meta.name : null;
  if (quickDt && ds === 1 && featureOn(QUICK_FEATURE, { company: String(doc["company"] ?? "") }) && quickPlan(quickDt, doc).applicable)
    out.unshift(btn("quick", <Zap className="h-3.5 w-3.5" aria-hidden />, quickDt === "Sales Order" ? (ar ? "تنفيذ سريع: تسليم + فوترة" : "Quick: deliver + invoice") : (ar ? "تنفيذ سريع: استلام + فوترة" : "Quick: receive + bill"), () => setDlg("quick")));
  if (!out.length) return null;
  return <>
    <div className="dx-frame-more" data-doc-more-bar>{out}</div>
    {quickDt && <EntDialog open={dlg === "quick"} onOpenChange={(o) => { if (!o) setDlg(null); }} size="lg" id="doc-quick" kicker={tr(meta.name)} title={ar ? "تنفيذ سريع" : "Quick process"}>
      <QuickProcessPanel doctype={quickDt} doc={doc} />
    </EntDialog>}
    <EntDialog open={dlg === "hold" || dlg === "release"} onOpenChange={(o) => { if (!o) setDlg(null); }} size="sm" id="doc-hold" kicker={tr(meta.name)}
      title={dlg === "hold" ? (ar ? "إيقاف المستند مؤقتًا" : "Put the document on hold") : (ar ? "الإفراج عن المستند" : "Release the document")}
      description={dlg === "hold" ? (ar ? "لا يُعتمد المستند ولا يتابع دورته حتى الإفراج عنه. يُسجّل السبب في النشاط." : "The document cannot be submitted or continued until it is released. The reason is recorded in the activity.") : (hold.reason ? `${ar ? "سبب الإيقاف" : "Held because"}: ${hold.reason}` : undefined)}
      footer={<><button type="button" className="btn-ghost" onClick={() => setDlg(null)}>{ar ? "إلغاء" : "Cancel"}</button>
        <button type="button" className="btn-primary" data-doc-hold-go disabled={dlg === "hold" && !reason.trim()} onClick={() => {
          const r = dlg === "hold" ? DF.holdDocument(meta.name, doc.name, reason, user) : DF.releaseDocument(meta.name, doc.name, reason, user);
          if (!r.ok) { toast.error(bi(ar, r.error!)); return; } toast.success(dlg === "hold" ? (ar ? "أُوقف المستند" : "Document on hold") : (ar ? "أُفرج عن المستند" : "Document released")); setDlg(null);
        }}>{dlg === "hold" ? (ar ? "إيقاف" : "Hold") : (ar ? "إفراج" : "Release")}</button></>}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{dlg === "hold" ? (ar ? "السبب" : "Reason") : (ar ? "ملاحظة (اختياري)" : "Note (optional)")}</span>
        <textarea className="field-input min-h-[5rem]" value={reason} onChange={(e) => setReason(e.target.value)} data-doc-hold-reason /></label>
    </EntDialog>
    <EntDialog open={dlg === "repeat"} onOpenChange={(o) => { if (!o) setDlg(null); }} size="sm" id="doc-repeat" kicker={tr(meta.name)} title={ar ? "تكرار المستند" : "Repeat this document"}
      description={ar ? "يُنشئ نسخة من المستند في كل موعد (التكرار التلقائي الأصلي)." : "Creates a copy of this document on each date (native Auto Repeat)."}
      footer={<><button type="button" className="btn-ghost" onClick={() => setDlg(null)}>{ar ? "إلغاء" : "Cancel"}</button>
        <button type="button" className="btn-primary" data-doc-repeat-go onClick={() => { const r = makeRecurring(meta.name, doc.name, freq, start, end, sub, user); if (r.ok) { toast.success(ar ? "أُنشئ جدول التكرار" : "Repeat schedule created"); setDlg(null); } else toast.error(bi(ar, r.reason)); }}>{ar ? "إنشاء الجدول" : "Create schedule"}</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{ar ? "التكرار" : "Repeats"}</span><select className="field-input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)} data-doc-repeat-freq>{FREQUENCIES.map((f) => <option key={f} value={f}>{bi(ar, FREQ_LABEL[f])}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{ar ? "أول موعد" : "First date"}</span><DateInput className="field-input" value={start} onChange={(e) => setStart(e.target.value)} data-doc-repeat-start /></label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{ar ? "حتى (اختياري)" : "Until (optional)"}</span><DateInput className="field-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> <span>{ar ? "اعتماد النسخ تلقائيًا" : "Submit the copies automatically"}</span></label>
      </div>
    </EntDialog>
  </>;
}

export const fullPartyHref = (proOn: boolean) => (p: { dt: string; name: string }) => !proOn ? undefined
  : p.dt === "Customer" ? `/pro/customer-360?customer=${encodeURIComponent(p.name)}` : p.dt === "Supplier" ? `/pro/supplier-360?supplier=${encodeURIComponent(p.name)}` : undefined;
