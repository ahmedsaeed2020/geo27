import { isPinned, recordOpen, togglePin, useRecentVersion } from "@/lib/recentDocs";
import { EntGlyph } from "@/components/enterprise/DigitIcon";
import type { DigitIconName } from "@/components/enterprise/DigitIcon";
import { budgetCheck } from "@/lib/budget";
import { runDocEvent, onChangeScripts, clientRefresh, usePluginsVersion } from "@/plugins/runtime";
import { hasPerm, levelAccess, userRoles, useSessionUser } from "@/lib/session";
import { activeWorkflow, applyWorkflow, canEditInState, currentState, transitionsFor } from "@/lib/workflow";
import { PluginButtons } from "@/components/plugins/PluginButtons";
import { useExperienceSlots, useExperienceUnsavedGuard } from "@/plugins/experienceSlots";
import { renameDoc } from "@/lib/rename";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Shell, Loading } from "@/components/Shell";
import { DocTypeNotFound } from "@/components/DocTypeNotFound";
import { FormView } from "@/components/FormView";
import { GetItemsFrom } from "@/components/enterprise/GetItemsFrom";
import { DocPanelTabs } from "@/components/enterprise/DocPanels";
import { coreDocPanels } from "@/components/enterprise/CorePanels";
import { FormActions, SourceActionList } from "@/components/FormActions";
import { NextStepGuide } from "@/components/form/NextStepGuide";
import { FormSidebar } from "@/components/form/FormSidebar";
import { Timeline } from "@/components/form/Timeline";
import { DocTypeSettings } from "@/components/list/DocTypeSettings";
import { listBehaviorsQuery, indicatorFor, COLOR_CLASS } from "@/lib/engines";
import { cachedMeta, dashboardsQuery, ensureMetas, indexQuery, loadMeta, metaQuery, type DocTypeMeta } from "@/lib/catalog";
import { capabilityQuery } from "@/lib/capabilities";
import { deleteDocument, deleteSupport } from "@/lib/deleteDoc";
import { formCustomizeItems, SITE_DEVELOPER_MODE } from "@/lib/listActions";
import { adapter, DocValidationError, useStoreVersion, type Doc } from "@/lib/adapter";
import { newDocDefaults } from "@/lib/sessionDefaults";
import { activeCustomizations, useMode, useDevMode } from "@/lib/mode";
import { useSettings } from "@/lib/userSettings";
import { fmtCurrency } from "@/lib/format";
import { useLang, t, tLabel, translateTo } from "@/i18n";
import { titleTranslated } from "@/lib/titleDisplay";
import { leadCrumbs } from "@/components/desk/AppCrumb";
import { amendDocument, cancelDocument, createDraft, saveDocument, submitDocument } from "@/lib/documentApi";
import { workflowTransitionGate } from "@/lib/actionRegistry";
import { classifyDocument, runtimeContractQuery } from "@/lib/runtimeContract";
import { formRulesQuery, loadState, applyChange, validateDoc, type FormState } from "@/lib/formRules";
import { useEnterprise } from "@/plugins/enterprise";
import { EmailComposer, takePendingDraft } from "@/components/enterprise/EmailComposer";
import type { Draft } from "@/lib/emailCompose";
import { DocumentBackChip, DocumentSummaryHeader, documentSummaryModel, GL_ACTION_LABELS, STOCK_ACTION_LABELS } from "@/components/enterprise/DocumentSummaryHeader";
import { EffectPreview } from "@/components/enterprise/DocInsight";
import { ApprovalPath } from "@/components/enterprise/ApprovalPath";
import { featureOn } from "@/lib/coreShared/features";
import { ErrorCard, FrameMore, FrameTitle, fullPartyHref, LinkedDocsTab, Party360Mini, SideRelated, SmartButtons, SmartGuide } from "@/components/enterprise/DocFrame";
import { holdState } from "@/lib/coreShared/docFrame";
import { timelineCounts } from "@/components/form/Timeline";
import { FixHintLine } from "@/components/enterprise/FixHint";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { connectionCount, connectionGroups, reverseLinksFor, reverseLinksQuery } from "@/lib/relations";

export const Route = createFileRoute("/app/$app/$doctype/$name")({
  head: ({ params }) => ({ meta: [
    { title: `${params.name} — ${params.doctype.replace(/_/g, " ")} — Digit Virtual Core` },
    { name: "description", content: `${params.doctype.replace(/_/g, " ")} ${params.name} form.` },
    { property: "og:title", content: `${params.name} — Digit Virtual Core` },
    { property: "og:description", content: `${params.doctype.replace(/_/g, " ")} ${params.name} form.` },
  ] }),
  component: RecordPage,
});

function PinButton({ doctype, name, app, title }: { doctype: string; name: string; app: string; title?: string | undefined }) {
  useRecentVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  useEffect(() => { recordOpen(user, { doctype, name, app, ...(title ? { title } : {}) }); }, [user, doctype, name, app, title]);
  const on = isPinned(user, { doctype, name });
  return <button type="button" className={`btn-ghost px-2 ${on ? "text-primary" : ""}`} aria-pressed={on} aria-label={on ? (ar ? "إلغاء التثبيت" : "Unpin") : (ar ? "تثبيت المستند" : "Pin document")} title={on ? (ar ? "إلغاء التثبيت" : "Unpin") : (ar ? "تثبيت المستند" : "Pin document")} data-pin-doc={on ? "on" : "off"}
    onClick={() => togglePin(user, { doctype, name, app, ...(title ? { title } : {}) })}>{on ? "★" : "☆"}</button>;
}

function RecordPage() {
  const { app, doctype, name } = Route.useParams();
  const { data: meta, error: metaError } = useQuery(metaQuery(app, doctype));
  const nav = useNavigate();
  const mode = useMode();
  const dev = useDevMode();
  useStoreVersion();
  const [draft, setDraft] = useState<Doc | null>(null);
  const rulesQ = useQuery(formRulesQuery);
  const dashQ = useQuery(dashboardsQuery);
  const [over, setOver] = useState<FormState["over"]>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabReq, setTabReq] = useState<{ label: string; n: number }>();
  const undo = useRef<{ past: Doc[]; future: Doc[] }>({ past: [], future: [] });
  // shared e-mail composer (communication.js) with the v16 Undo Send window; Undo reopens it with the kept draft
  const [mail, setMail] = useState<{ open: boolean; init?: Partial<Draft> }>({ open: false });
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ doctype: string; name: string }>).detail; if (d?.name !== name) return; const k = takePendingDraft(); setMail({ open: true, ...(k ? { init: k } : {}) }); };
    window.addEventListener("digit:email-reopen", h); return () => window.removeEventListener("digit:email-reopen", h);
  }, [name]);
  useEffect(() => { if (meta) adapter.ensureSeed(meta); }, [meta]);
  // A Single always opens in Frappe: when it was never saved, Document.load_from_db shows frappe.new_doc defaults under
  // the DocType name without writing anything. App-owned Singles start unsaved here, so they open the same way and are
  // stored only when the user saves (nothing is written just by viewing, so no setting changes a figure on its own).
  const savedDoc = meta ? adapter.get(meta.name, name) : undefined;
  const unsavedSingle = !!meta?.issingle && !savedDoc && name === meta.name;
  const stored: Doc | undefined = savedDoc ?? (unsavedSingle && meta ? { ...newDocDefaults(meta), name: meta.name, doctype: meta.name, docstatus: 0 } : undefined);
  useEffect(() => { setDraft(null); setErrors([]); undo.current = { past: [], future: [] }; }, [name]);
  const rules = meta ? rulesQ.data?.[meta.name] : undefined;
  // form load: refresh/onload statements from form_rules.json (ported form scripts)
  useEffect(() => { if (stored && rules) setOver(loadState(rules, stored).over); }, [name, rules, !!stored]);

  const user = useSessionUser(); usePluginsVersion();
  // active DIGIT app experience: its form panels render above the native form; its unsaved guard asks before leaving
  const xp = useExperienceSlots(); const XpPanels = xp?.slots.FormPanels;
  // DIGIT Enterprise: every saved document gets the shared summary card (+ source-aware Back unless the app renders its own)
  const ent = useEnterprise();
  useExperienceUnsavedGuard(!!draft, doctype, meta?.name ?? "");
  const revQ = useQuery(reverseLinksQuery);
  const rcQ = useQuery(runtimeContractQuery);
  const regQ = useQuery(capabilityQuery);
  const [, setMetaTick] = useState(0);
  useEffect(() => { void ensureMetas(["Custom Field", "Property Setter", "DocType"]).then(() => setMetaTick((n) => n + 1)); }, []);
  const ar = useLang() === "ar";
  // frappe router: /app/<doctype>/new → frappe.new_doc — a local new-… draft (documentApi.createDraft: create permission,
  // source create rule, defaults) and the route is replaced by its name, so "+ New" links, a refresh or a pasted /new URL
  // open a blank form instead of "Record new not found"; a refused create shows its reason.
  const isNew = name === "new" && !!meta && !savedDoc && !meta.issingle;
  const [newErr, setNewErr] = useState<string[]>([]);
  useEffect(() => {
    if (!isNew || !meta) return;
    const r = createDraft(meta);
    if (!r.doc) { setNewErr(r.errors); return; }
    setNewErr([]);
    void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: r.doc.name }, replace: true });
  }, [isNew, meta?.name, app, doctype]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!meta) return <Shell>{metaError ? <DocTypeNotFound slug={doctype} error={metaError} /> : <Loading what="record" />}</Shell>;
  if (isNew) return <Shell>{newErr.length ? <div className="panel p-6" data-new-doc-refused><h2 className="font-semibold">Not Permitted</h2><p className="mt-1 text-sm text-muted-foreground"><span>Insufficient Permission for</span> <span>{meta.name}</span></p>{dev && newErr.map((e) => <p key={e} className="mt-1 text-xs text-muted-foreground" data-no-i18n>{e}</p>)}</div> : <Loading what="record" />}</Shell>;
  if (stored && !hasPerm(meta, "read", stored)) return <Shell><div className="panel p-6" data-not-permitted><h2 className="font-semibold">Not Permitted</h2><p className="mt-1 text-sm text-muted-foreground"><span>Insufficient Permission for</span> <span>{meta.name}</span> <span data-no-i18n>{name}</span> <span data-no-i18n>({user})</span></p></div></Shell>;
  if (!stored) return <Shell><p className="text-muted-foreground"><span>Record</span> <span data-no-i18n>{name}</span> <span>not found.</span></p></Shell>;
  const doc = draft ?? stored;
  const dirty = !!draft;
  const ds = doc.docstatus ?? 0;
  const status = ["Draft", "Submitted", "Cancelled"][ds];
  // permissions (frappe/permissions.py) + workflow allow_edit + client-script refresh effects
  const wf = activeWorkflow(meta.name);
  const canWrite = hasPerm(meta, "write", stored) && (!wf || canEditInState(wf, stored));
  const lv = levelAccess(meta);
  const cr = clientRefresh(meta.name, doc);
  const fullOver: FormState["over"] = { ...over };
  for (const [k, v] of Object.entries(cr.over)) fullOver[k] = { ...fullOver[k], ...v };
  for (const f of meta.fields) if (f.fieldname) {
    const l = Number(f["permlevel"] ?? 0);
    if (!lv.read.has(l)) fullOver[f.fieldname] = { ...fullOver[f.fieldname], hidden: true };
    else if (!canWrite || !lv.write.has(l)) fullOver[f.fieldname] = { ...fullOver[f.fieldname], ro: true };
  }
  const local = !!stored["__islocal"];
  // source-backed lifecycle classification (runtime-contract.json): a server-only Submit/Cancel is never executable
  const cap = classifyDocument(meta, rcQ.data?.lifecycle[meta.name]);
  const capReady = !!rcQ.data || meta.source.startsWith("plugin:");
  // workflow transitions that would submit/cancel follow the same lifecycle gate (no transitions on an unsaved draft);
  // a transition whose submit/cancel needs the real server stays visible but disabled, with the reason
  const serverOnlyNote = ar ? "اعتماد هذا المستند أو إلغاؤه يتطلب خادم DIGIT الحقيقي؛ يمكن حفظ المسودات محليًا." : "Submitting or cancelling this document requires the real DIGIT server; drafts can be saved locally.";
  const wfActions: WorkflowAction[] = wf && ds < 2 && !dirty && !local
    ? transitionsFor(wf, doc).flatMap((t) => { const g = workflowTransitionGate(wf, t, ds, cap); if (g.to === ds || (capReady && g.virtual)) return [{ action: t.action }]; return capReady ? [{ action: t.action, disabledReason: serverOnlyNote }] : []; })
    : [];
  const save = (thenNew = false) => {
    if (!canWrite) { setErrors([`No permission to write ${meta.name}`]); return; }
    const errs = validateDoc(meta, rules, { doc, over, applied: [] });
    const ev = runDocEvent(meta.name, "before_save", doc); errs.push(...ev.errors);
    setErrors(errs); if (errs.length) return;
    // first save of a never-saved Single: create its empty record, then save the values as an update (all or nothing),
    // so the history shows who set which value — the same order the app settings screens use
    if (unsavedSingle) {
      try { adapter.insertDoc(meta.name, { name: meta.name, owner: user }); }
      catch (e) { if (e instanceof DocValidationError) { setErrors(e.errors); return; } throw e; }
    }
    // shared lifecycle (documentApi.saveDocument): set_new_name on first save, hooks, child rows re-parented
    const r = saveDocument(meta, name, { ...ev.doc, ...(wf && !ev.doc[wf.workflow_state_field] ? { [wf.workflow_state_field]: currentState(wf, ev.doc) } : {}) }, { prompt: (q) => window.prompt(t(q)), user });
    if (unsavedSingle && (r.cancelled || r.errors.length)) { adapter.remove(meta.name, meta.name); adapter.flush(); }
    if (r.cancelled) return;
    if (r.errors.length) { setErrors(r.errors); return; }
    setDraft(null);
    // form.js after first save: frappe.set_route replaces the new-… route, so Back returns to the list, not a vanished draft
    if (r.name !== name && !thenNew) void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: r.name }, search: (prev) => prev, replace: true });
    runDocEvent(meta.name, "after_save", adapter.get(meta.name, r.name)!);
    // DIGIT document frame "Save & new": the saved document stays; a fresh draft of the same type opens
    if (thenNew) { const nd = createDraft(meta); if (nd.doc) { toast.success(ar ? `حُفظ ${r.name}` : `Saved ${r.name}`); void nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: nd.doc.name } }); } else setErrors(nd.errors); }
  };
  const change = (p: Record<string, unknown>) => { undo.current.past.push(doc); undo.current.future = []; const st = applyChange(meta, rules, { doc, over, applied: [] }, p); setOver(st.over); setDraft(onChangeScripts(meta.name, st.doc, Object.keys(p))); };
  const custom = activeCustomizations(mode, meta.name);
  const toList = () => nav({ to: "/app/$app/$doctype", params: { app, doctype } });
  const canDelete = !meta.issingle && (ds === 0 || ds === 2) && hasPerm(meta, "delete", stored);
  // delete_doc port (deleteDoc.ts): link checks + source on_trash ports; unported business on_trash stays server-only
  const delSup = rcQ.data ? deleteSupport(meta) : null;
  const delBlocked = !delSup || !regQ.data ? "Loading…" : delSup.ok ? null : delSup.reason;
  // toolbar.js make_customize_buttons(): Settings / Customize / Edit DocType gates
  const customize = formCustomizeItems(meta, {
    roles: userRoles(user), can: (p) => hasPerm(meta, p, stored, user), developerMode: SITE_DEVELOPER_MODE, allowImport: false,
    canCreate: (dt) => { if (user === "Administrator") return true; const m = cachedMeta(dt); return !!m && hasPerm(m, "create", undefined, user); },
  });
  const menu: MenuItem[] = [
    { label: "Print", run: () => nav({ to: "/printview", search: { doctype: meta.name, name } }), key: "Ctrl+P" },
    { label: "Email", run: () => setMail({ open: true }) },
    { label: "Jump to Field", run: () => { const q = prompt("Jump to Field")?.toLowerCase(); const f = !q ? undefined : meta.fields.find((x) => (x.label ?? x.fieldname ?? "").toLowerCase().includes(q)); if (f?.fieldname) document.querySelector(`[data-field="${f.fieldname}"]`)?.scrollIntoView({ block: "center" }); }, key: "Ctrl+J" },
    { label: "Links", run: () => setTabReq({ label: "Connections", n: Date.now() }) },
    { label: "Duplicate", run: () => { const { name: _n, docstatus: _d, amended_from: _a, ...rest } = doc; const d = adapter.insertDoc(meta.name, { ...rest, docstatus: 0, status: "Draft" }); nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: d.name } }); }, key: "Shift+D" },
    { label: "Copy to Clipboard", run: () => { void navigator.clipboard?.writeText(JSON.stringify(doc, null, 1)); toast.success("Copied to clipboard"); } },
    ...(!meta.issingle && ds !== 1 ? [{ label: "Rename", run: () => { const nn = prompt("Rename", name)?.trim(); if (!nn || nn === name) return; const merge = !!adapter.get(meta.name, nn) && confirm(`Merge with existing ${nn}?`); const r = renameDoc(meta.name, name, nn, { merge }); if (!r.ok) { alert(r.error); return; } adapter.flush(); nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: nn } }); } }] : []),
    { label: "Reload", run: () => { setDraft(null); location.reload(); }, key: "Shift+R" },
    { label: "Remind Me", run: () => { const at = prompt("Remind Me", new Date(Date.now() + 864e5).toISOString().slice(0, 16).replace("T", " ")); if (at) { adapter.insertDoc("Reminder", { user: "Administrator", remind_at: at, reference_doctype: meta.name, reference_name: name, description: `${meta.name} ${name}` }); toast.success("Saved"); } } },
    { label: "Undo", disabled: !undo.current.past.length, run: () => { const p = undo.current.past.pop(); if (p) { undo.current.future.push(doc); setDraft(p === stored ? null : p); } }, key: "Ctrl+Z" },
    { label: "Redo", disabled: !undo.current.future.length, run: () => { const f = undo.current.future.pop(); if (f) { undo.current.past.push(doc); setDraft(f); } }, key: "Ctrl+Y" },
    { label: `New ${meta.name}`, disabled: !hasPerm(meta, "create") || !cap.create, run: () => { const r = createDraft(meta); if (r.errors.length || !r.doc) { setErrors(r.errors); return; } nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: r.doc.name } }); }, key: "Ctrl+B" },
    ...(customize.customize ? [{ label: "Customize", run: () => nav({ to: "/customize-form", search: { doctype: meta.name } }) }] : []),
    ...(customize.editDocType ? [{ label: "Edit DocType", run: () => nav({ to: "/app/$app/$doctype", params: { app: "frappe", doctype: "doctype" } }) }] : []),
    ...(customize.settings ? [{ label: "DocType Settings", run: () => setSettingsOpen(true) }] : []),
    ...(canDelete ? [{ label: "Delete", danger: true, disabled: !!delBlocked, hint: delBlocked && delBlocked !== "Loading…" ? delBlocked : undefined, run: () => {
      if (!regQ.data || !confirm(tLabel(`Permanently delete ${name}?`))) return;
      const errs = deleteDocument(meta, name, regQ.data, user);
      if (errs.length) { setErrors(errs); return; }
      toList();
    }, key: "Shift+Ctrl+D" }] : []),
    { label: "Toggle Sidebar", run: () => setSidebar(!sidebar), key: "Ctrl+G" },
    { label: "View Audit Trail", run: () => nav({ to: "/app/$app/$doctype", params: { app: "frappe", doctype: "version" }, search: { filters: JSON.stringify([["docname", "=", name]]) } as never }) },
  ];
  const slots: Record<string, React.ReactNode> = {};
  if (meta.name === "Customer" || meta.name === "Supplier") slots["overview_html"] = <PartyOverview party={meta.name} name={name} doc={doc} />;
  const hasLinks = meta.links.length > 0 || !!dashQ.data?.[meta.name] || reverseLinksFor(meta.name, revQ.data?.doctypes).length > 0;
  // DIGIT document frame (owner FINAL WORK LIST Part 1a): one header for every document, also a new unsaved one
  const sumOn = ent.on && !meta.issingle;
  const frameOn = sumOn;
  const held = frameOn && !local ? holdState(meta.name, doc).held : false;
  const counts = frameOn && !local ? timelineCounts(meta.name, name) : { activity: 0, changes: 0 };
  // OWN-45: Administration shows or hides each document block per role and company (Core feature switches, session user)
  const fon = (k: string) => !frameOn || featureOn(k, { user, company: String(doc["company"] ?? "") });
  const tabsOn = frameOn && fon("doc:tabs");
  const wfState = wf ? currentState(wf, doc) : undefined;
  const summary = sumOn ? documentSummaryModel(meta, doc, wfState) : null;
  // the card's General Ledger / Stock Ledger buttons replace the same toolbar actions (owner: keep only the card button)
  const hideActions = summary ? [...(summary.ledger ? GL_ACTION_LABELS : []), ...(summary.stock ? STOCK_ACTION_LABELS : [])] : undefined;

  return (
    <Shell crumbs={[
      // breadcrumbs.js form_items: DocType list link, then the document title (get_doc_title), not a link
      ...leadCrumbs(meta, app),
      { label: "", to: meta.issingle ? <span>{meta.name}</span> : <Link to="/app/$app/$doctype" params={{ app, doctype }} className="hover:underline" data-crumb-doctype>{meta.name}</Link> },
      ...(meta.issingle ? [] : [{ label: "", to: doc["__islocal"] ? <span data-crumb-doc>{ar ? `${t(meta.name)} — جديد` : `New ${meta.name}`}</span> : <bdi data-no-i18n data-crumb-doc>{meta.title_field && typeof doc[meta.title_field] === "string" && doc[meta.title_field] ? String(doc[meta.title_field]) : name}</bdi> }]),
    ]}>
      {sumOn && !xp?.slots.ownsBack && <DocumentBackChip meta={meta} doc={doc} app={app} doctypeSlug={doctype} />}
      {ent.on && !!meta.issingle && <div className="mb-3" data-single-band><ContextStrip icon={<img src="/icons/digit/ui/digit-ui-settings-dark.svg" alt="" />} eyebrow={t(String(meta.module ?? "Settings"))}
        title={<span data-single-title>{t(meta.name)}</span>} sub={ar ? "إعدادات تنطبق على كل المستندات والشاشات المرتبطة بها." : "Settings that apply to every related document and screen."} /></div>}
      {(() => {
        const headActions = <>
          {!meta.issingle && !local && <PinButton doctype={meta.name} name={name} app={app} title={meta.title_field && typeof doc[meta.title_field] === "string" ? String(doc[meta.title_field]) : undefined} />}
          {!meta.issingle && <FormNav meta={meta} name={name} app={app} doctype={doctype} />}
          {!dirty && !local && <PluginButtons doctype={meta.name} doc={doc} />}
          {!dirty && !local && <FormActions meta={meta} doc={doc} hide={hideActions} onPatch={(p) => adapter.update(meta.name, name, p)} />}
          {canWrite && ds === 0 && <GetItemsFrom meta={meta} doc={doc} onPatch={change} />}
          {ds === 1 && <button type="button" className="btn-ghost px-2" aria-label="Print" title="Print" data-print-icon onClick={() => nav({ to: "/printview", search: { doctype: meta.name, name } })}><EntGlyph name="ui-print" fallback="⎙" /></button>}
          <FormMenu items={menu} />
          {wfActions.length > 0 && <WorkflowActions actions={wfActions} run={(a) => { const e = applyWorkflow(meta.name, name, a); setErrors(e); if (!e.length) toast.success(a); }} />}
          {canWrite && ds === 0 && (dirty || local || !meta.is_submittable) && <button type="button" className="btn-primary" data-save disabled={!dirty && !local} onClick={() => save()}><EntGlyph name="ui-save" on="dark" /><span>Save</span></button>}
          {meta.is_submittable && !wf && hasPerm(meta, "submit", stored) && ds === 0 && !dirty && !local && capReady ? (cap.submit === "VIRTUAL"
            ? <button type="button" className="btn-primary" data-submit disabled={held} title={held ? (ar ? "المستند موقوف — أفرج عنه أولًا" : "On hold — release it first") : undefined} onClick={() => { const pre = [...validateDoc(meta, rules, { doc, over, applied: [] }), ...runDocEvent(meta.name, "before_submit", doc).errors]; if (pre.length) { setErrors(pre); return; } const bw = budgetCheck(meta.name, stored ?? doc).warnings; const e = submitDocument(meta, name); setErrors(e); if (!e.length && bw.length && typeof window !== "undefined") window.alert(bw.join("\n")); if (!e.length) runDocEvent(meta.name, "on_submit", adapter.get(meta.name, name)!); }}>Submit</button>
            : <button type="button" className="btn-primary opacity-50" disabled aria-disabled data-submit-server-only title={serverOnlyNote}>Submit</button>) : null}
          {meta.is_submittable && !wf && hasPerm(meta, "cancel", stored) && ds === 1 && capReady ? (cap.cancel === "VIRTUAL"
            ? <button type="button" className="btn-ghost" data-cancel onClick={() => { if (confirm(`Permanently Cancel ${name}?`)) setErrors(cancelDocument(meta, name)); }}>Cancel</button>
            : <button type="button" className="btn-ghost opacity-50" disabled aria-disabled data-cancel-server-only title={serverOnlyNote}>Cancel</button>) : null}
          {meta.is_submittable && hasPerm(meta, "amend", stored) && hasPerm(meta, "create") && ds === 2 && cap.amend === "VIRTUAL" ? <button type="button" className="btn-primary" data-amend onClick={() => { const r = amendDocument(meta, name); if (r.errors.length) { setErrors(r.errors); return; } if (r.name) nav({ to: "/app/$app/$doctype/$name", params: { app, doctype, name: r.name } }); }}>Amend</button> : null}
        </>;
        const headChips = <>
        <Indicator meta={meta} doc={doc} fallback={meta.is_submittable ? status : undefined} />
        {(dirty || local) && <span className="chip bg-warning/20" data-not-saved>Not Saved</span>}
        {/* stored workflow state stays in data-workflow-state; only the shown label is localized */}
        {wf && <span className="chip bg-accent" data-workflow-state={currentState(wf, doc)}><bdi data-no-i18n>{ar ? t(currentState(wf, doc)) : currentState(wf, doc)}</bdi></span>}
        {dev && <span className="chip bg-muted text-[10px]" data-document-class={cap.class} title={cap.reasons.join("\n")} data-no-i18n>{cap.class}</span>}
        </>;
        const titleText = local ? (ar ? `${t(meta.name)} — جديد` : `New ${meta.name}`) : meta.title_field && typeof doc[meta.title_field] === "string" && doc[meta.title_field] ? (ar && titleTranslated(meta) ? translateTo(String(doc[meta.title_field]), "ar") : String(doc[meta.title_field])) : name;
        if (frameOn) return <>
          <DocumentSummaryHeader meta={meta} doc={doc} dirty={dirty} workflowState={wfState} model={summary ?? undefined} hideId
            head={<FrameTitle meta={meta} doc={doc} docstatus={ds} title={<bdi data-no-i18n={local ? undefined : ""}>{titleText}</bdi>} chips={<>{!local && titleText !== name && <span className="dx-docsum-chip" data-doc-name><bdi data-no-i18n>{name}</bdi></span>}{headChips}</>} actions={headActions} />}
            below={<div className="dx-frame-below">{fon("doc:smart-buttons") && <SmartButtons meta={meta} doc={doc} />}{fon("doc:actions") && <FrameMore meta={meta} doc={doc} canWrite={canWrite} onSaveNew={dirty || local ? () => save(true) : undefined} onPatch={(p) => adapter.update(meta.name, name, p)} />}</div>} />
        </>;
        return <div className="flex flex-wrap items-center gap-3" data-form-head data-docstatus={ds}>
        {!(ent.on && meta.issingle) && <h1 className="text-xl font-semibold" {...(meta.issingle ? {} : { "data-no-i18n": "" })}>{meta.issingle ? <span>{meta.name}</span> : <bdi>{meta.title_field && typeof doc[meta.title_field] === "string" ? (ar && titleTranslated(meta) ? translateTo(String(doc[meta.title_field]), "ar") : String(doc[meta.title_field])) : name}</bdi>}</h1>}
          {headChips}
          <div className="ms-auto flex flex-wrap items-center gap-2">{headActions}</div>
        </div>;
      })()}
      {!!meta.is_submittable && capReady && cap.submit === "SERVER_ONLY" && ds < 2 && <p className="mt-2 text-xs text-muted-foreground" data-server-only-note data-no-i18n>{serverOnlyNote}</p>}
      {cr.intro.map((t) => <div key={t} className="mt-3 rounded-md border border-border bg-accent/40 p-2 text-sm" data-form-intro>{t}</div>)}
      {!canWrite && ds === 0 && <p className="mt-2 text-xs text-muted-foreground" data-read-only-perm>You do not have permission to edit this document</p>}
      {ent.on && !meta.issingle && (() => {
        const nextAction = <NextStepGuide meta={meta} doc={doc} over={over} local={!!local} dirty={!!dirty} canWrite={canWrite} hide={hideActions}
          canSubmit={!held && (meta.is_submittable ? (ds === 2 ? hasPerm(meta, "amend", stored) && hasPerm(meta, "create") && cap.amend === "VIRTUAL" : hasPerm(meta, "submit", stored)) : false)}
          submitServerOnly={!capReady || cap.submit !== "VIRTUAL"} workflowActions={wfActions.filter((w) => !w.disabledReason).map((w) => w.action)} onPatch={(p) => adapter.update(meta.name, name, p)} />;
        return fon("ent:smart-guide") ? <SmartGuide meta={meta} doc={doc} dirty={!!dirty} local={!!local} held={held} nextAction={nextAction} /> : nextAction;
      })()}
      {ent.on && fon("doc:effect") && <EffectPreview meta={meta} doc={doc} />}
      {/* Enterprise Visual Round 1 §9: the approval path of a workflow document (steps, waiting time, approver buttons) */}
      {ent.on && !local && <ApprovalPath doctype={meta.name} doc={doc} ar={ar} />}
      {(() => {
        // OWN-65: Core panels + the active app's panels, organized in brand tabs (an app without a panel list keeps its own component)
        const pp = { meta, doc, dirty, canWrite, onChange: change };
        const list = xp?.slots.formPanelList;
        // the ledger / stock effect is shown once, always visible, by EffectPreview above (owner 2026-11-12 evening §9); the panels keep the rest
        const own = list ? list(pp) : [];
        const panels = [...own, ...coreDocPanels(meta, doc).filter((p) => !(ent.on && ["ledger-impact", "doc-status", "post-check"].includes(p.id)))].filter((p) => fon(`doc:panels-${p.group}`));
        return <>{panels.length > 0 && <DocPanelTabs doctype={meta.name} panels={panels} />}{!list && XpPanels && <XpPanels {...pp} />}</>;
      })()}
      {frameOn ? <ErrorCard errors={errors} meta={meta} /> : errors.length > 0 && <div role="alert" data-form-errors className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errors.map((e) => <FixHintLine key={e} message={e} />)}</div>}
      {dev && mode === "customized" && <p className="mt-2 text-xs text-muted-foreground"><span>Customized mode:</span> {custom.length} <span>customization(s) registered for this DocType.</span></p>}

      <div className={`us-form-grid mt-4 grid gap-6 ${sidebar ? (frameOn ? "lg:grid-cols-[240px_minmax(0,1fr)]" : "lg:grid-cols-[200px_minmax(0,1fr)]") : ""}`}>
        {sidebar && (frameOn ? <div className="min-w-0 space-y-4" data-doc-side>{fon("doc:party360") && <Party360Mini meta={meta} doc={doc} fullHref={fullPartyHref(ent.apps.some((a) => a.name === "digit_pro"))} />}{!local && <SideRelated meta={meta} doc={doc} />}<FormSidebar meta={meta} doc={doc} /></div> : <FormSidebar meta={meta} doc={doc} />)}
        <div className="min-w-0">
          <FormView meta={meta} doc={doc} dev={dev} over={fullOver} onChange={change} onSeed={(p) => adapter.update(meta.name, name, p)} htmlSlots={slots} tabRequest={tabReq}
            extraTabs={[...(hasLinks || sumOn ? [{ label: "Connections", node: <div data-us="form-dashboard"><Connections meta={meta} name={name} /></div> }] : []),
              ...(tabsOn && !local ? [{ label: ar ? "المستندات المرتبطة" : "Linked documents", node: <LinkedDocsTab meta={meta} doc={doc} /> },
                { label: ar ? `النشاط (${counts.activity})` : `Activity (${counts.activity})`, node: <Timeline doctype={meta.name} name={name} only="activity" onEmail={() => setMail({ open: true })} /> },
                { label: ar ? `التغييرات (${counts.changes})` : `Changes (${counts.changes})`, node: <Timeline doctype={meta.name} name={name} only="changes" /> }] : [])]} />
          {dev && <div className="panel mt-4 p-3 text-xs" data-dev-panel>
            <h3 className="mb-2 text-sm font-semibold">Action inventory</h3>
            <p className="text-muted-foreground">Field rules and totals run the ported client form scripts (form_rules.json) on every edit; submit, cancel and amend post through the local posting engine.</p>
            <SourceActionList meta={meta} doc={doc} />
            <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground"><span data-no-i18n>source: {meta.source}</span></p>
          </div>}
          {!(tabsOn && !local) && <div data-us="form-timeline"><Timeline doctype={meta.name} name={name} /></div>}
        </div>
      </div>
      {settingsOpen && <DocTypeSettings meta={meta} initial={"General" as never} onClose={() => setSettingsOpen(false)} />}
      <EmailComposer open={mail.open} onClose={() => setMail({ open: false })} doctype={meta.name} doc={doc} {...(mail.init ? { initial: mail.init } : {})} />
    </Shell>
  );
}

type WorkflowAction = { action: string; disabledReason?: string };
/** Workflow "Actions" dropdown (frappe/public/js/frappe/form/workflow.js). Server-only transitions render disabled with the reason. */
/** Action labels are display text (the shared Arabic layer shows each app's action translation, owner work list AR-071); the stored action stays on data-workflow-action. */
function WorkflowActions({ actions, run }: { actions: WorkflowAction[]; run: (a: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-workflow-actions>
      <button type="button" className="btn-primary" aria-expanded={open} onClick={() => setOpen(!open)}><span>Actions</span> <span aria-hidden>▾</span></button>
      {open && <div role="menu" className="absolute end-0 top-full z-40 mt-1 w-64 rounded-md border border-border bg-popover py-1 text-sm shadow-lg">
        {actions.map(({ action: a, disabledReason }) => disabledReason
          ? <div key={a} role="menuitem" aria-disabled="true" data-workflow-action={a} data-workflow-server-only className="px-3 py-1.5 text-start opacity-60" title={disabledReason}>
              <bdi>{a}</bdi>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground" data-no-i18n>{disabledReason}</span>
            </div>
          : <button key={a} type="button" role="menuitem" data-workflow-action={a} className="block w-full px-3 py-1.5 text-start hover:bg-muted" onClick={() => { setOpen(false); run(a); }}><bdi>{a}</bdi></button>)}
      </div>}
    </div>
  );
}

type MenuItem = { label: string; run: () => void; key?: string; danger?: boolean; disabled?: boolean; hint?: string | undefined };
/** Form toolbar "…" menu (frappe/public/js/frappe/form/toolbar.js make_menu_items). */

/** DIGIT Enterprise menu glyphs for the source form menu labels (icons only; labels and actions unchanged). */
const MENU_ICON: Record<string, DigitIconName> = { Print: "ui-print", Delete: "ui-trash", Reload: "ui-refresh", Email: "trust-email", Duplicate: "ui-add", Rename: "ui-edit", Customize: "svc-customization", "Edit DocType": "ui-edit", Links: "ui-share", "Copy to Clipboard": "ui-share", "Jump to field": "ui-search", "Remind Me": "ui-calendar", Undo: "ui-refresh", Redo: "ui-refresh", "Print Settings": "ui-settings", "Download PDF": "ui-download", Share: "ui-share" };
const menuIcon = (label: string): DigitIconName | undefined => MENU_ICON[label] ?? (label.startsWith("New ") ? "ui-add" : undefined);

function FormMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" data-form-menu>
      <button type="button" className="btn-ghost px-2" aria-label="Menu" aria-expanded={open} data-form-menu-toggle onClick={() => setOpen(!open)}>…</button>
      {open && (
        <div role="menu" className="absolute end-0 top-full z-40 mt-1 w-60 rounded-md border border-border bg-popover py-1 text-sm shadow-lg" onMouseLeave={() => setOpen(false)}>
          {items.map((i) => (
            <button key={i.label} type="button" role="menuitem" disabled={i.disabled} data-menu-item={i.label} className={`flex w-full items-center px-3 py-1.5 text-start hover:bg-muted disabled:opacity-40 ${i.danger ? "text-destructive" : ""}`} onClick={() => { setOpen(false); i.run(); }}>
              {menuIcon(i.label) && <EntGlyph name={menuIcon(i.label)!} />}<span className="flex flex-col"><span>{i.label}</span>{i.hint && <span className="text-[11px] text-muted-foreground" data-server-only>{i.hint}</span>}</span>{i.key && <span className="ms-auto text-[10px] text-muted-foreground" data-no-i18n>{i.key}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Customer/Supplier Overview tab (erpnext/public/js/utils.js party dashboard): annual billing, outstanding and monthly chart. */
function PartyOverview({ party, name, doc }: { party: string; name: string; doc: Doc }) {
  const inv = party === "Customer" ? "Sales Invoice" : "Purchase Invoice";
  const field = party === "Customer" ? "customer" : "supplier";
  const rows = adapter.list(inv).filter((d) => d[field] === name && d.docstatus === 1);
  const year = rows.reduce((y, r) => Math.max(y, Number(String(r["posting_date"] ?? "").slice(0, 4)) || 0), new Date().getFullYear());
  const thisYear = rows.filter((r) => String(r["posting_date"] ?? "").startsWith(String(year)));
  const billing = thisYear.reduce((s, r) => s + Number(r["grand_total"] ?? 0), 0);
  const unpaid = rows.reduce((s, r) => s + Number(r["outstanding_amount"] ?? 0), 0);
  const months = Array.from({ length: 12 }, (_, m) => thisYear.filter((r) => Number(String(r["posting_date"]).slice(5, 7)) === m + 1).reduce((s, r) => s + Number(r["grand_total"] ?? 0), 0));
  const max = Math.max(1, ...months);
  const cur = String(doc["default_currency"] || "SAR");
  return (
    <div data-party-overview className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground"><span>Annual Billing</span> <span data-no-i18n>({year})</span></div><div className="text-lg font-semibold tabular-nums" data-no-i18n data-annual-billing={billing}>{fmtCurrency(billing, cur)}</div></div>
        <div className="rounded-md border border-border p-3"><div className="text-xs text-muted-foreground">Total Unpaid</div><div className="text-lg font-semibold tabular-nums" data-no-i18n data-total-unpaid={unpaid}>{fmtCurrency(unpaid, cur)}</div></div>
      </div>
      <div className="flex h-32 items-end gap-1" data-overview-chart aria-label="Billing This Year">
        {months.map((v, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-primary/70" style={{ height: `${(v / max) * 100}%` }} title={fmtCurrency(v, cur)} /><span className="text-[9px] text-muted-foreground" data-no-i18n>{i + 1}</span></div>)}
      </div>
    </div>
  );
}

/** Prev/next record arrows (frappe form toolbar "Previous/Next Document"); User Settings › Forms › Show navigation buttons. */
function FormNav({ meta, name, app, doctype }: { meta: DocTypeMeta; name: string; app: string; doctype: string }) {
  const s = useSettings();
  if (!s.form_nav_buttons) return null;
  const names = adapter.list(meta.name).map((d) => d.name);
  const i = names.indexOf(name);
  const btn = (n: string | undefined, label: string, icon: string) => n
    ? <Link to="/app/$app/$doctype/$name" params={{ app, doctype, name: n }} className="btn-ghost px-2" aria-label={label} title={label} data-form-nav={label}>{icon}</Link>
    : <span className="btn-ghost px-2 opacity-40" aria-label={label} data-form-nav={label}>{icon}</span>;
  return <span className="flex" data-us="form-nav">{btn(names[i - 1], "Previous Document", "‹")}{btn(names[i + 1], "Next Document", "›")}</span>;
}

/**
 * Form dashboard Connections — groups and counts come from the shared relation mechanism (src/lib/relations.ts):
 * header Link, child-row Link (frappe get_filter), Dynamic Link and internal (upstream) links, permission-scoped.
 */
function Connections({ meta, name }: { meta: DocTypeMeta; name: string }) {
  const idx = useQuery(indexQuery);
  const dashes = useQuery(dashboardsQuery);
  const rev = useQuery(reverseLinksQuery);
  const user = useSessionUser();
  const nav = useNavigate();
  // the app context of this form (?app=…) travels with every connection, so a linked list or draft opens inside the same app at its own address
  const appCtx = useRouterState({ select: (st) => (st.location.search as Record<string, unknown>)["app"] });
  const keep = typeof appCtx === "string" && appCtx ? { app: appCtx } : {};
  useStoreVersion();
  const groups = connectionGroups(meta, dashes.data?.[meta.name], reverseLinksFor(meta.name, rev.data?.doctypes));
  const dev = useDevMode();
  const [ready, setReady] = useState(0);
  const linkKey = groups.flatMap((g) => g.items.map((i) => i.link_doctype)).join("|");
  useEffect(() => {
    if (!idx.data || !linkKey) return;
    let live = true;
    const names = linkKey.split("|");
    // linked definitions first (seed + permission), then their child tables so child-row matches use exact field locations
    void Promise.all(names.map((l) => loadMeta(idx.data!, l).then((m) => { if (m) adapter.ensureSeed(m); return m; }).catch(() => undefined)))
      .then((ms) => ensureMetas([...new Set(ms.flatMap((m) => (m?.fields ?? []).filter((f) => f.options && (f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect")).map((f) => String(f.options))))]))
      .then(() => { if (live) setReady((x) => x + 1); });
    return () => { live = false; };
  }, [idx.data, linkKey]);
  const doc = adapter.get(meta.name, name);
  // dashboard "+" = frm.make_new(doctype): a new draft linked back to this form (documentApi.linkFieldValues)
  const newLinked = (e: { app: string; slug: string }, dt: string) => {
    if (!idx.data || !doc) return;
    void loadMeta(idx.data, dt).then((m) => {
      if (!m) return;
      const r = createDraft(m, { from: { doctype: meta.name, doc } });
      if (!r.doc) { toast.error(r.errors.join("\n")); return; }
      void nav({ to: "/app/$app/$doctype/$name", params: { app: e.app, doctype: e.slug, name: r.doc.name }, search: keep as never });
    });
  };
  if (!groups.length) return <p className="text-sm text-muted-foreground">No connections</p>;
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-ready={ready} data-connections={groups.length}>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">{g.label}</div>
          {g.items.map((l) => {
            const e = idx.data?.find((d) => d.name === l.link_doctype);
            const rc = doc ? connectionCount(l, meta.name, doc, user) : undefined;
            const shown = rc && (rc.status === "ok" || rc.status === "limited");
            const filters = shown && rc.filters.length ? JSON.stringify(rc.filters) : undefined;
            return (
              <div key={l.link_doctype + l.link_fieldname} className="mb-1.5 flex items-center gap-2 text-sm" data-connection={l.link_doctype} data-connection-status={rc?.status ?? "unavailable"} data-connection-match={rc?.path.match}>
                {shown
                  ? <span className="chip bg-muted tabular-nums" data-no-i18n title={rc.status === "limited" ? t("Limited to records you can see") : undefined}>{rc.count}</span>
                  : <span className="chip bg-muted text-muted-foreground" title={t(rc?.status === "denied" ? "Not permitted" : "Not available")}>—</span>}
                {e && shown ? <Link to="/app/$app/$doctype" params={{ app: e.app, doctype: e.slug }} search={{ filters, ...keep } as never} className="text-primary hover:underline">{l.link_doctype}</Link> : <span>{l.link_doctype}</span>}
                {e && doc && rc?.status !== "denied" && l.kind !== "internal" && <button type="button" className="ms-auto rounded px-1.5 text-muted-foreground hover:bg-muted" aria-label={`New ${l.link_doctype}`} data-connection-new={l.link_doctype} onClick={() => newLinked(e, l.link_doctype)}>+</button>}
                {dev && <span className="text-[9px] text-muted-foreground" title={`${l.kind}; matched on ${l.link_fieldname || "internal"} (${rc?.path.match ?? "?"})`}>{l.kind}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Indicator({ meta, doc, fallback }: { meta: DocTypeMeta; doc: Doc; fallback?: string | undefined }) {
  const { data: lbs } = useQuery(listBehaviorsQuery);
  const ind = indicatorFor(meta, lbs?.[meta.name], doc);
  if (!ind) return fallback ? <span className="chip bg-accent">{fallback}</span> : null;
  return <span className={`chip ${COLOR_CLASS[ind.color] ?? "bg-muted"}`} data-indicator={ind.label} title={ind.source}>{ind.label}</span>;
}
