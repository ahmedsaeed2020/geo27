/**
 * Shared create panel (owner notes round 2026-11-17, A-04): «+ جديد» / «+ إنشاء» on any screen of any app opens a centred,
 * wide panel UNDER the green band instead of leaving the page — same coloured header as the side panel, the document's
 * own form (sections as coloured cards with icon tiles, child tables, form rules, permissions per level) and a sticky
 * footer «إلغاء · حفظ وإضافة آخر · حفظ وفتح · حفظ» (Ctrl+Enter = حفظ, Esc = إلغاء). The draft is the same local `new-…`
 * draft the full page uses (documentApi.createDraft) and saving goes through documentApi.saveDocument with the same
 * before/after-save events, so a record created here is identical to one created on its page. Ctrl/Cmd/middle click on a
 * «جديد» link keeps the full page. Core component, app-agnostic: apps only link to /…/<doctype>/new or call openCreate().
 */
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { indexQuery, metaQuery, slugOf, type DocTypeMeta } from "@/lib/catalog";
import { createDraft, deleteDraft, saveDocument } from "@/lib/documentApi";
import { formRulesQuery, loadState, applyChange, validateDoc, type FormState } from "@/lib/formRules";
import { clientRefresh, onChangeScripts, runDocEvent } from "@/plugins/runtime";
import { activeWorkflow, currentState } from "@/lib/workflow";
import { levelAccess, useSessionUser } from "@/lib/session";
import { internalPath } from "@/lib/appUrls";
import { useLang, t as tr } from "@/i18n";
import { FormView } from "@/components/FormView";
import { ErrorCard } from "./DocFrame";
import { useUnderBand } from "./underBand";
import { OpenFullLink } from "./OpenFull";

type Req = { n: number; slug?: string | undefined; app?: string | undefined; doctype?: string | undefined; values?: Record<string, unknown> | undefined };
let req: Req | null = null; let seq = 0;
const subs = new Set<() => void>();
const emit = (r: Req | null) => { req = r; subs.forEach((f) => f()); };
const useReq = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => req, () => null);

/** Opens the create panel for a DocType (by name), optionally with initial values. */
export function openCreate(doctype: string, opts: { app?: string; values?: Record<string, unknown> } = {}) { emit({ n: ++seq, doctype, app: opts.app, values: opts.values }); }
export function closeCreate() { emit(null); }
export const createPanelOpen = () => !!req;

/** An app may replace the generic quick-create with its approved short form without Core importing app UI eagerly. */
export type CreateOverrideProps = { values?: Record<string, unknown> | undefined };
type CreateLoader = () => Promise<{ default: ComponentType<CreateOverrideProps> }>;
const createOverrides = new Map<string, ComponentType<CreateOverrideProps>>();
export function registerCreateOverride(doctype: string, loader: CreateLoader) { createOverrides.set(doctype, lazy(loader)); }
export const createOverrideFor = (doctype: string) => createOverrides.has(doctype);

/** «/app/<app>/<slug>/new» (or an app's own address for it) → app + slug, else null. */
export function newDocTarget(href: string): { app: string; slug: string } | null {
  const m = internalPath(href).match(/^\/app\/([^/]+)\/([^/]+)\/new$/);
  return m ? { app: decodeURIComponent(m[1]!), slug: decodeURIComponent(m[2]!) } : null;
}

/** Catalog entry of a create request: by DocType name, or by the link's slug — a «/new» link may spell the DocType
 *  frappe-style (sales-invoice) or as the catalog slug (sales_invoice), both open the same panel. */
export function entryForNew<E extends { name: string; app: string; slug: string }>(idx: E[], r: { doctype?: string | undefined; slug?: string | undefined; app?: string | undefined }): E | undefined {
  const want = r.slug ? slugOf(decodeURIComponent(r.slug)) : "";
  return idx.find((e) => (r.doctype ? e.name === r.doctype : e.slug === want && (!r.app || e.app === r.app)));
}

/** One capture listener per document: a plain click on a «new document» link inside a DIGIT work area opens the panel. */
let installed = 0;
function onCapture(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
  const a = e.target.closest<HTMLAnchorElement>("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-create-full]")) return;
  if (!a.closest("html[data-enterprise] :is([data-shell-main], .ent-qv, [data-shell-header])")) return;
  const tg = newDocTarget(a.getAttribute("href") ?? "");
  if (!tg) return;
  e.preventDefault(); e.stopPropagation();
  emit({ n: ++seq, app: tg.app, slug: tg.slug });
}
export function installCreateLinks(doc: Document = document): () => void {
  if (installed++ === 0) doc.addEventListener("click", onCapture, true);
  let done = false;
  return () => { if (done) return; done = true; if (--installed === 0) doc.removeEventListener("click", onCapture, true); };
}

/** Mounted once by the shared Shell. */
export function CreatePanelHost() {
  const r = useReq();
  const idx = useQuery(indexQuery);
  const entry = r ? entryForNew(idx.data ?? [], r) : undefined;
  const mq = useQuery({ ...metaQuery(entry?.app ?? "erpnext", entry?.slug ?? "-"), enabled: !!entry });
  useUnderBand(!!r);
  useEffect(() => { if (!r) return; const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, [!!r]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  if (!entry || !mq.data) return <Frame title={r.doctype ? tr(r.doctype) : "…"} onClose={closeCreate}><p className="cp-wait">{tr("Loading…")}</p></Frame>;
  const Custom = createOverrides.get(entry.name);
  if (Custom) return <Suspense fallback={<Frame title={tr(entry.name)} onClose={closeCreate}><p className="cp-wait">{tr("Loading…")}</p></Frame>}><Custom key={r.n} values={r.values} /></Suspense>;
  return <CreateBody key={r.n} meta={mq.data} app={entry.app} slug={entry.slug} values={r.values} />;
}

function Frame({ title, kicker, onClose, children, footer, onKey, actions }: { title: React.ReactNode; kicker?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; onKey?: (e: React.KeyboardEvent) => void; actions?: React.ReactNode }) {
  const ar = useLang() === "ar";
  return <div className="cp-wrap" data-create-panel dir={ar ? "rtl" : "ltr"}>
    <button type="button" className="cp-scrim" aria-label={ar ? "إغلاق" : "Close"} tabIndex={-1} onClick={onClose} />
    <div className="cp-card" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } onKey?.(e); }}>
      <header className="cp-head"><span className="cp-ico" aria-hidden><Plus className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">{kicker && <p className="cp-kicker">{kicker}</p>}<h2 className="cp-title" data-cp-title>{title}</h2></div>
        {actions}
        <button type="button" className="cp-x" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"} data-cp-close><X className="h-5 w-5" /></button></header>
      {children}
      {footer && <footer className="cp-foot" data-cp-foot>{footer}</footer>}
    </div>
  </div>;
}

function CreateBody({ meta, app, slug, values }: { meta: DocTypeMeta; app: string; slug: string; values?: Record<string, unknown> | undefined }) {
  const ar = useLang() === "ar"; const user = useSessionUser(); const nav = useNavigate();
  useStoreVersion();
  const rulesQ = useQuery(formRulesQuery); const rules = rulesQ.data?.[meta.name];
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Doc | null>(null);
  const [over, setOver] = useState<FormState["over"]>({});
  const [errors, setErrors] = useState<string[]>([]);
  const start = () => { const nd = createDraft(meta, values ? { mapped: values } : {}); if (!nd.doc) { setErrors(nd.errors); setName(null); return; } setName(nd.doc.name); setDraft(null); setErrors([]); };
  useEffect(start, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stored = name ? adapter.get(meta.name, name) : undefined;
  useEffect(() => { if (stored && rules) setOver(loadState(rules, stored).over); }, [name, !!rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const doc = draft ?? stored;
  const fullOver = useMemo(() => {
    if (!doc) return over;
    const o: FormState["over"] = { ...over };
    for (const [k, v] of Object.entries(clientRefresh(meta.name, doc).over)) o[k] = { ...o[k], ...v };
    const lv = levelAccess(meta);
    for (const f of meta.fields) if (f.fieldname) { const l = Number(f["permlevel"] ?? 0); if (!lv.read.has(l)) o[f.fieldname] = { ...o[f.fieldname], hidden: true }; else if (!lv.write.has(l)) o[f.fieldname] = { ...o[f.fieldname], ro: true }; }
    return o;
  }, [doc, over, meta]);
  const discard = () => { const d = name ? adapter.get(meta.name, name) : undefined; if (d?.["__islocal"]) deleteDraft(meta, d.name); closeCreate(); };
  const change = (p: Record<string, unknown>) => { if (!doc) return; const s = applyChange(meta, rules, { doc, over, applied: [] }, p); setOver(s.over); setDraft(onChangeScripts(meta.name, s.doc, Object.keys(p))); };
  const save = (then: "close" | "new" | "open") => {
    if (!doc || !name) return;
    const errs = validateDoc(meta, rules, { doc, over, applied: [] });
    const ev = runDocEvent(meta.name, "before_save", doc); errs.push(...ev.errors);
    setErrors(errs); if (errs.length) return;
    const wf = activeWorkflow(meta.name);
    const r = saveDocument(meta, name, { ...ev.doc, ...(wf && !ev.doc[wf.workflow_state_field] ? { [wf.workflow_state_field]: currentState(wf, ev.doc) } : {}) }, { prompt: (q) => window.prompt(tr(q)), user });
    if (r.cancelled) return;
    if (r.errors.length) { setErrors(r.errors); return; }
    const saved = adapter.get(meta.name, r.name); if (saved) runDocEvent(meta.name, "after_save", saved);
    toast.success(ar ? `تم حفظ ${tr(meta.name)} ${r.name}` : `Saved ${meta.name} ${r.name}`);
    if (then === "new") { start(); return; }
    closeCreate();
    if (then === "open") void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug, name: r.name } });
  };
  // «فتح الصفحة كاملة»: what was typed goes into the same new-… draft, then its full page opens (the draft is kept)
  const keepTyped = () => { if (!draft || !name) return; const { name: _n, doctype: _d, ...typed } = draft; void _n; void _d; adapter.update(meta.name, name, typed); };
  const openFull = () => { if (!name) return; keepTyped(); closeCreate(); void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype: slug, name } }); };
  const title = ar ? `${tr(meta.name)} — جديد` : `New ${meta.name}`;
  return <Frame title={title} kicker={<>{ar ? "إنشاء" : "Create"}{meta.module ? <> · {tr(String(meta.module))}</> : null}</>} onClose={discard}
    onKey={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save("close"); } }}
    footer={<>
      <button type="button" className="btn-ghost" onClick={discard} data-cp-btn="cancel">{ar ? "إلغاء" : "Cancel"}</button>
      {name && <OpenFullLink href={`/app/${app}/${slug}/${encodeURIComponent(name)}`} onOpen={openFull} onBefore={keepTyped} />}
      <span className="cp-hint">Ctrl+Enter = {ar ? "حفظ" : "Save"}</span>
      <button type="button" className="btn-secondary" onClick={() => save("new")} disabled={!doc} data-cp-btn="new">{ar ? "حفظ وإضافة آخر" : "Save & add another"}</button>
      <button type="button" className="btn-secondary" onClick={() => save("open")} disabled={!doc} data-cp-btn="open">{ar ? "حفظ وفتح" : "Save & open"}</button>
      <button type="button" className="btn-primary" onClick={() => save("close")} disabled={!doc} data-cp-btn="save">{ar ? "حفظ" : "Save"}</button>
    </>}>
    <div className="cp-body" data-cp-body={meta.name} data-cp-doc={name ?? ""}>
      {errors.length > 0 && <ErrorCard errors={errors} meta={meta} />}
      {doc ? <FormView meta={meta} doc={doc} dev={false} over={fullOver} onChange={change} onSeed={(p) => { if (name) adapter.update(meta.name, name, p); }} />
        : !errors.length && <p className="cp-wait">{tr("Loading…")}</p>}
    </div>
  </Frame>;
}
