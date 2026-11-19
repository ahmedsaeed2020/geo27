import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { CRM, RECORD_TABS, convertLeadToDeal, timeAgo, type CrmKind } from "@/lib/crm";
import { CrmShell, Badge, Modal, StatusDot } from "./CrmShell";
import { LayoutRenderer, statusColor, useCrm, type CrmBundle } from "./useCrm";
import { CRM_AR, dval, useL } from "./crmI18n";
import { useDevMode } from "@/lib/mode";
import { DevOnly } from "@/components/DevOnly";
import { Button } from "@/components/ui/button";
import { queueCrmEmail, replyDraft } from "@/lib/crmEmail";
import { CrmLostReason } from "./CrmLostReason";
import { CrmSlaSection } from "./CrmSlaSection";
import { MessageContent, messageText } from "./messageContent";
import { currentUser, hasPerm, useSessionUser } from "@/lib/session";
import { scopedList } from "@/lib/scope";
import { DealFinancialSummary } from "@/plugins/digit_crm/DealFinancialSummary";
import { fieldTitle, linkTitle } from "@/lib/linkTitle";
import { useEnterprise } from "@/plugins/enterprise";
import { DocumentSummaryHeader } from "@/components/enterprise/DocumentSummaryHeader";
import { CheckSquare, Mail, MessageSquare, Paperclip, Pencil, Phone, Sparkles, StickyNote, type LucideIcon } from "lucide-react";
import { fmtDate } from "@/lib/format";

/** Session identity: email/phone come from the simulated session User record, never illustrative constants. */
const sessionEmail = () => { const u = currentUser(); return String(adapter.get("User", u)?.["email"] || (u.includes("@") ? u : "")); };
const sessionPhone = () => String(adapter.get("User", currentUser())?.["mobile_no"] || adapter.get("User", currentUser())?.["phone"] || "");

const actorName = (value: unknown, lang: string) => { const id = String(value ?? ""); return id === "Administrator" ? (lang === "ar" ? "المسؤول" : id) : String(adapter.get("User", id)?.["full_name"] || id || "—"); };

/** Reconstructs pages/Lead.vue and pages/Deal.vue: header actions, tab bar, right SidePanelLayout. */
export function CrmRecordPage({ kind, id }: { kind: CrmKind; id: string }) {
  const b = useCrm();
  const cfg = CRM[kind];
  const [tab, setTab] = useState("Activity");
  const [converting, setConverting] = useState(false);
  const [lost, setLost] = useState("");
  const { L, lang } = useL();
  const dev = useDevMode();
  const hyd = useHydrated();
  const user = useSessionUser();
  const ent = useEnterprise();
  const candidate = b && hyd ? adapter.get(cfg.doctype, id) : undefined;
  const recordMeta = b ? (kind === "lead" ? b.lead : b.deal) : undefined;
  const doc = candidate && recordMeta && hasPerm(recordMeta, "read", candidate, user) ? candidate : undefined;
  const crumbs = (
    <div className="flex min-w-0 items-center gap-1 text-lg">
      <Link to={kind === "lead" ? "/digit-crm/leads" : "/digit-crm/pipeline"} className="text-crm-muted hover:text-crm-ink">{L(cfg.label)}</Link>
      <span className="text-crm-muted">/</span><span className="truncate font-semibold" data-no-i18n>{doc ? dval(fieldTitle(cfg.doctype, recordMeta?.fields, cfg.title, doc[cfg.title]) || doc.name, lang) : id}</span>
    </div>
  );
  if (!b || !hyd) return <CrmShell header={crumbs}><p className="p-6 text-crm-muted">Loading…</p></CrmShell>;
  if (!doc) return <CrmShell header={crumbs}><p role="alert" className="p-6 text-crm-muted">{L("Not permitted")}</p></CrmShell>;
  const meta = kind === "lead" ? b.lead : b.deal;
  const set = (k: string, v: unknown) => { if (!hasPerm(meta, "write", doc, user)) return; adapter.update(cfg.doctype, id, { [k]: v, ...(kind === "lead" && (k === "first_name" || k === "last_name") ? { lead_name: [k === "first_name" ? v : doc["first_name"], k === "last_name" ? v : doc["last_name"]].filter(Boolean).join(" ") } : {}) }); };
  const statuses = Object.keys(kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses);
  const deals = kind === "lead" ? scopedList("CRM Deal", user).filter(d => d["lead"] === id) : [];
  const header = (
    <>
      {crumbs}
      <div className="ms-auto flex items-center gap-2">
        <select aria-label={L("Status")} className="crm-btn" value={String(doc["status"] ?? "")} onChange={(e) => { const status = e.target.value; const config = kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses; if (config[status]?.type === "Lost") setLost(status); else set("status", status); }}>{statuses.map((s) => <option key={s} value={s}>{L(s)}</option>)}</select>
        <Link to="/app/$app/$doctype/$name" params={{ app: "crm", doctype: cfg.slug, name: doc.name }} className="crm-btn">{L("Full form")}</Link>
        {kind === "lead" && <button className="crm-btn-solid" onClick={() => setConverting(true)}>{L("Convert to Deal")}</button>}
      </div>
    </>
  );
  const sidePanel = b.layouts[`${cfg.doctype}-Side Panel`]?.layout ?? [];
  const dataFields = b.layouts[`${cfg.doctype}-Data Fields`]?.layout ?? [];
  return (
    <CrmShell header={header}>
      <div className="flex min-h-full flex-col lg:h-full">
      {/* DIGIT Enterprise: the shared document summary card (source values only) above the record's tabs and details */}
      {ent.on && <div className="shrink-0 px-4" data-crm-docsum><DocumentSummaryHeader meta={meta} doc={doc} dirty={false} displayValue={(_dt, v) => (lang === "ar" ? CRM_AR[v] : undefined)} /></div>}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-crm-line px-4">
            {RECORD_TABS.map((t) => (
              <button key={t.name} onClick={() => setTab(t.name)} className={`shrink-0 border-b-2 px-2.5 py-2 text-sm ${tab === t.name ? "border-crm-dark text-crm-ink" : "border-transparent text-crm-muted"}`}>
                {L(t.name)}{dev && t.status === "server" && <span className="ms-1 text-[9px] uppercase">srv</span>}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-5">
            {tab === "Activity" && <Activity kind={kind} doc={doc} b={b} />}
            {tab === "Comments" && <Comments doc={doc} />}
            {tab === "Notes" && <Notes doc={doc} />}
            {tab === "Tasks" && <Tasks doc={doc} />}
            {tab === "Emails" && <Emails doc={doc} />}
            {tab === "Calls" && <Calls doc={doc} />}
            {tab === "Attachments" && <Attachments doc={doc} />}
            {tab === "Data" && <>{kind === "deal" && <DealFinancialSummary doc={doc} />}<LayoutRenderer layout={dataFields} meta={meta} doc={doc} b={b} onChange={set} />{dev && <p className="mt-3 text-[11px] text-crm-muted">Layout: {cfg.doctype}-Data Fields (crm/install.py). Edits save immediately to the shared synthetic record.</p>}</>}
            {RECORD_TABS.find((t) => t.name === tab)?.status === "server" && <ServerTab name={tab} />}
          </div>
        </div>
        <aside className="w-full shrink-0 overflow-auto border-t border-crm-line lg:w-[24rem] lg:border-e lg:border-t-0 xl:w-[28rem]">
          <div className="border-b border-crm-line p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-crm-hover text-lg font-semibold">{String(fieldTitle(cfg.doctype, recordMeta?.fields, cfg.title, doc[cfg.title]) || "?")[0]}</div>
              <div className="min-w-0"><div className="truncate font-semibold" data-no-i18n>{dval(fieldTitle(cfg.doctype, recordMeta?.fields, cfg.title, doc[cfg.title]) || doc.name, lang)}</div><div className="text-xs text-crm-muted" data-no-i18n>{doc.name}</div></div>
            </div>
            <div className="mt-2"><Badge tone={statusColor(b, kind, doc["status"])}><StatusDot color={statusColor(b, kind, doc["status"])} />{String(doc["status"])}</Badge>
              {kind === "lead" && doc["converted"] ? <Badge tone="teal">{L("Converted")}</Badge> : null}</div>
          </div>
          <div className="p-4"><LayoutRenderer layout={sidePanel} meta={meta} doc={doc} b={b} onChange={set} inline /></div>
          <CrmSlaSection doc={doc} />
          {kind === "lead" && deals.length > 0 && (
            <div className="border-t border-crm-line p-4 text-sm">
              <h3 className="mb-1 font-semibold">{L("Deals from this lead")}</h3>
              {deals.map((d) => <Link key={d.name} to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="block text-crm-ink underline">{d.name} · {String(d["status"])}</Link>)}
            </div>
          )}
          {kind === "deal" && doc["lead"] ? <div className="border-t border-crm-line p-4 text-sm">{L("Lead")}: <Link to="/digit-crm/leads/$leadId" params={{ leadId: String(doc["lead"]) }} className="underline">{String(doc["lead"])}</Link></div> : null}
          {dev && <div className="border-t border-crm-line p-4 text-[11px] text-crm-muted">
            <Link to="/app/$app/$doctype/$name" params={{ app: "crm", doctype: cfg.slug, name: doc.name }} className="underline">Open in generic DocType form (fallback)</Link>
          </div>}
        </aside>
      </div>
      </div>
      {converting && kind === "lead" && <ConvertModal lead={doc} b={b} onClose={() => setConverting(false)} />}
      {lost && <CrmLostReason doc={doc} status={lost} onClose={() => setLost("")} />}
    </CrmShell>
  );
}

function ServerTab({ name }: { name: string }) {
  const src: Record<string, string> = { Emails: "Communication + email account (frappe.email)", Calls: "Twilio / Exotel telephony integration (CRM Call Log)", Attachments: "File uploads (frappe File, server storage)", WhatsApp: "frappe_whatsapp app integration" };
  const { L } = useL(); const dev = useDevMode();
  return <div className="rounded-lg border border-dashed border-crm-line p-6 text-sm text-crm-muted">{L(name)} — {L("requires a connected server or external integration.")}{dev && <> {src[name]}</>}</div>;
}

type TlKind = "created" | "changed" | "comment" | "note" | "task" | "email" | "call" | "file";
const TL_ICON: Record<TlKind, LucideIcon> = { created: Sparkles, changed: Pencil, comment: MessageSquare, note: StickyNote, task: CheckSquare, email: Mail, call: Phone, file: Paperclip };

function Activity({ kind, doc, b }: { kind: CrmKind; doc: Doc; b: CrmBundle }) {
  const dt = CRM[kind].doctype;
  const { L, fmt, lang } = useL(); const dev = useDevMode();
  const fl = (f: string) => L(b[kind].fields.find((x) => x.fieldname === f)?.label ?? f);
  const versions = adapter.list("Version").filter((v) => v["ref_doctype"] === dt && v["docname"] === doc.name);
  const comments = adapter.list("Comment").filter((c) => c["reference_doctype"] === dt && c["reference_name"] === doc.name);
  const notes = adapter.list("FCRM Note").filter((n) => n["reference_doctype"] === dt && n["reference_docname"] === doc.name);
  const tasks = adapter.list("CRM Task").filter((n) => n["reference_doctype"] === dt && n["reference_docname"] === doc.name);
  const emails = adapter.list("Communication").filter(c => c["reference_doctype"] === dt && c["reference_name"] === doc.name);
  const calls = adapter.list("CRM Call Log").filter(c => c["reference_doctype"] === dt && c["reference_docname"] === doc.name);
  const files = adapter.list("File").filter(c => c["attached_to_doctype"] === dt && c["attached_to_name"] === doc.name);
  const items = [
    ...versions.map((v) => {
      const d = JSON.parse(String(v["data"]));
      return { kind: (d.created ? "created" : "changed") as TlKind, actor: v["owner"], at: v["creation"], text: d.created ? fmt("created this {0}", L(kind)) : (d.changed as [string, unknown, unknown][]).map(([f, a, c]) => fmt("changed {0} from {1} to {2}", fl(f), ["status", "lost_reason"].includes(f) ? L(String(a ?? "—")) : String(a ?? "—"), ["status", "lost_reason"].includes(f) ? L(String(c)) : String(c))).join("، ") };
    }),
    ...comments.map((c) => ({ kind: "comment" as TlKind, actor: c["comment_by"] || c["comment_email"] || c["owner"], at: c["creation"], text: fmt("commented: {0}", messageText(c["content"])) })),
    ...notes.map((n) => ({ kind: "note" as TlKind, actor: n["owner"], at: n["creation"], text: fmt("added a note: {0}", String(n["title"])) })),
    ...tasks.map((t) => ({ kind: "task" as TlKind, actor: t["owner"], at: t["creation"], text: fmt("added a task: {0} ({1})", String(t["title"]), L(String(t["status"]))) })),
    ...emails.map(c => ({ kind: "email" as TlKind, actor: c["sender"] || c["owner"], at: c["communication_date"] ?? c["creation"], text: `${L("Email")}: ${String(c["subject"])} · ${L(String(c["delivery_status"] ?? c["sent_or_received"]))}` })),
    ...calls.map(c => ({ kind: "call" as TlKind, actor: (c["type"] === "Outgoing" ? c["caller"] : c["receiver"]) || c["owner"], at: c["start_time"] ?? c["creation"], text: `${L("Calls")}: ${L(String(c["type"]))} · ${L(String(c["status"]))}` })),
    ...files.map(c => ({ kind: "file" as TlKind, actor: c["owner"], at: c["creation"], text: `${L("Attachments")}: ${String(c["file_name"])}` })),
  ].sort((a, c) => String(c.at).localeCompare(String(a.at)));
  return (
    <div>
      {/* timeline: one marker per event type on a vertical line (logical sides, so it mirrors in Arabic) */}
      {items.length ? <ol className="crm-timeline" data-crm-timeline={items.length}>
        {items.map((i, k) => { const Icon = TL_ICON[i.kind]; return <li key={k} className="crm-tl-item" data-kind={i.kind}>
          <span className="crm-tl-dot" aria-hidden><Icon size={14} strokeWidth={2} /></span>
          <div className="crm-tl-body">
            <div className="crm-tl-head"><span className="crm-tl-actor" data-no-i18n>{actorName(i.actor, lang)}</span><time className="crm-tl-time" dateTime={String(i.at ?? "")} title={fmtDate(i.at)}>{timeAgo(i.at)}</time></div>
            <div className="crm-tl-text" data-no-i18n dir="auto">{i.text}</div>
          </div>
        </li>; })}
      </ol> : <p className="text-sm text-crm-muted" data-crm-timeline={0}>{L("No activity yet.")}</p>}
      {dev && <p className="mt-4 text-[11px] text-crm-muted">Activity reads shared record history, comments, tasks, notes, email, calls and files. Email delivery requires a mail server.</p>}
    </div>
  );
}

function Comments({ doc }: { doc: Doc }) {
  const [t, setT] = useState(""); const { L, lang } = useL();
  const list = adapter.list("Comment").filter((c) => c["reference_name"] === doc.name && c["reference_doctype"] === doc.doctype);
  return (
    <div className="space-y-3">
      {list.map((c) => <div key={c.name} className="rounded-lg bg-crm-sidebar p-3 text-sm"><div className="text-xs text-crm-muted"><span data-no-i18n>{actorName(c["comment_by"] || c["comment_email"] || c["owner"], lang)}</span> · {timeAgo(c["creation"])}</div><MessageContent value={c["content"]} /></div>)}
      <textarea className="crm-input h-20 py-1" placeholder={L("Add a comment")} value={t} onChange={(e) => setT(e.target.value)} aria-label="Comment" />
      <button className="crm-btn-solid" disabled={!t} onClick={() => { adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: doc.doctype, reference_name: doc.name, content: t, comment_email: sessionEmail(), comment_by: currentUser() }); setT(""); }}>{L("Comment")}</button>
    </div>
  );
}

function Notes({ doc }: { doc: Doc }) {
  const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const { L } = useL();
  const list = adapter.list("FCRM Note").filter((n) => n["reference_docname"] === doc.name && n["reference_doctype"] === doc.doctype);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">{list.map((n) => <div key={n.name} className="rounded-lg border border-crm-line p-3 text-sm"><div className="font-medium">{String(n["title"])}</div><div className="text-crm-muted"><MessageContent value={n["content"]} /></div></div>)}</div>
      <div className="space-y-2 rounded-lg border border-crm-line p-3">
        <input className="crm-input" placeholder={L("Title")} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Note title" />
        <textarea className="crm-input h-16 py-1" placeholder={L("Content")} value={content} onChange={(e) => setContent(e.target.value)} />
        <button className="crm-btn-solid" disabled={!title} onClick={() => { adapter.insertDoc("FCRM Note", { title, content, reference_doctype: doc.doctype, reference_docname: doc.name }); setTitle(""); setContent(""); }}>{L("Add note")}</button>
      </div>
    </div>
  );
}

function Tasks({ doc }: { doc: Doc }) {
  const [title, setTitle] = useState(""); const { L } = useL();
  const list = adapter.list("CRM Task").filter((n) => n["reference_docname"] === doc.name && n["reference_doctype"] === doc.doctype);
  const STAT = ["Backlog", "Todo", "In Progress", "Done", "Canceled"];
  return (
    <div className="space-y-2">
      {list.map((t) => (
        <div key={t.name} className="flex items-center gap-3 rounded-lg border border-crm-line p-2 text-sm">
          <span className="flex-1">{String(t["title"])}</span><span className="text-crm-muted">{L(String(t["priority"]))}</span>
          <select className="crm-btn" value={String(t["status"])} onChange={(e) => adapter.update("CRM Task", t.name, { status: e.target.value })}>{STAT.map((s) => <option key={s} value={s}>{L(s)}</option>)}</select>
        </div>
      ))}
      <div className="flex gap-2"><input className="crm-input" placeholder={L("New task title")} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" />
        <button className="crm-btn-solid" disabled={!title} onClick={() => { adapter.insertDoc("CRM Task", { title, status: "Backlog", priority: "Medium", assigned_to: currentUser(), reference_doctype: doc.doctype, reference_docname: doc.name }); setTitle(""); }}>{L("Add task")}</button></div>
    </div>
  );
}

/** Activities.vue emails list + EmailEditor.vue: stored as Communication; sending needs a mail server, so new mail stays Queued. */
function Emails({ doc }: { doc: Doc }) {
  const { L } = useL();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(String(doc["email"] ?? "")); const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [cc, setCc] = useState(""); const [bcc, setBcc] = useState(""); const [replyTo, setReplyTo] = useState<string | undefined>();
  const sender = sessionEmail();
  const reply = (mail: Doc, mode: "Reply" | "Reply all" | "Forward") => { const draft = replyDraft(mail, mode, sender); setTo(draft.to); setCc(draft.cc); setBcc(draft.bcc); setSubject(draft.subject); setBody(draft.body); setReplyTo(draft.replyTo); setOpen(true); };
  const list = adapter.list("Communication").filter((c) => c["reference_doctype"] === doc.doctype && c["reference_name"] === doc.name && c["communication_medium"] === "Email")
    .sort((a, c) => String(c["communication_date"] ?? c["creation"]).localeCompare(String(a["communication_date"] ?? a["creation"])));
  const strip = (h: unknown) => String(h ?? "").replace(/<[^>]+>/g, " ").trim();
  return (
    <div className="space-y-3">
      <button className="crm-btn-solid" onClick={() => setOpen(!open)}>{L("New Email")}</button>
      {open && (
        <div className="space-y-2 rounded-lg border border-crm-line p-3">
          <input className="crm-input" placeholder={L("To")} aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} data-no-i18n />
          <input className="crm-input" aria-label={L("Cc")} placeholder={L("Cc")} data-no-i18n value={cc} onChange={e => setCc(e.target.value)} />
          <input className="crm-input" aria-label={L("Bcc")} placeholder={L("Bcc")} data-no-i18n value={bcc} onChange={e => setBcc(e.target.value)} />
          <select className="crm-input" aria-label={L("Email Template")} defaultValue="" onChange={e => { const template = adapter.get("Email Template", e.target.value); if (template) { setSubject(String(template["subject"] ?? "")); setBody(String(template[template["content_type"] === "HTML" ? "response_html" : "response"] ?? "").replace(/<[^>]*>/g, " ")); } }}><option value="">{L("Email Template")}</option>{adapter.list("Email Template").filter(t => Number(t["enabled"] ?? 1) && (!t["reference_doctype"] || t["reference_doctype"] === doc.doctype)).map(t => <option key={t.name} value={t.name} data-no-i18n>{t.name}</option>)}</select>
          <input className="crm-input" placeholder={L("Subject")} aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="crm-input h-24 py-1" placeholder={L("Content")} aria-label="Email body" value={body} onChange={(e) => setBody(e.target.value)} />
          <button className="crm-btn-solid" disabled={!to || !subject || !sender} onClick={() => {
            queueCrmEmail(doc, { to, cc, bcc, subject, body, replyTo }, sender);
            setOpen(false); setSubject(""); setBody(""); setCc(""); setBcc(""); setReplyTo(undefined);
          }}>{L("Queue Email")}</button>
        </div>
      )}
      {list.map((c) => (
        <div key={c.name} className="rounded-lg border border-crm-line p-3 text-sm">
          <div className="flex items-center gap-2 text-xs text-crm-muted"><span data-no-i18n>{String(c["sender"])}</span> → <span data-no-i18n>{String(c["recipients"])}</span><span className="ms-auto">{timeAgo(c["communication_date"] ?? c["creation"])}</span>
            {c["delivery_status"] ? <Badge tone={c["delivery_status"] === "Queued" ? "orange" : "green"}>{L(String(c["delivery_status"]))}</Badge> : null}</div>
          <div className="mt-1 font-medium" data-no-i18n>{String(c["subject"])}</div>
          <div className="text-crm-muted" data-no-i18n><MessageContent value={c["content"]} /></div>
          <div className="mt-2 flex gap-2">{(["Reply", "Reply all", "Forward"] as const).map(mode => <Button key={mode} variant="outline" size="sm" onClick={() => reply(c, mode)}>{L(mode)}</Button>)}</div>
        </div>
      ))}
      {!list.length && <p className="text-sm text-crm-muted">{L("No Emails")}</p>}
    </div>
  );
}

/** CallLogs in Activities.vue + CallLogModal.vue: manual call log (telephony dialing itself needs Twilio/Exotel). */
function Calls({ doc }: { doc: Doc }) {
  const { L } = useL();
  const [open, setOpen] = useState(false);
  const [c, setC] = useState({ type: "Outgoing", status: "Completed", duration: 60, note: "" });
  const list = adapter.list("CRM Call Log").filter((x) => x["reference_doctype"] === doc.doctype && x["reference_docname"] === doc.name);
  return (
    <div className="space-y-3">
      <button className="crm-btn-solid" onClick={() => setOpen(!open)}>{L("Log a Call")}</button>
      {open && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-crm-line p-3 text-sm">
          <label>{L("Type")}<select className="crm-input mt-1" value={c.type} onChange={(e) => setC({ ...c, type: e.target.value })}>{["Outgoing", "Incoming"].map((o) => <option key={o} value={o}>{L(o)}</option>)}</select></label>
          <label>{L("Status")}<select className="crm-input mt-1" value={c.status} onChange={(e) => setC({ ...c, status: e.target.value })}>{["Completed", "No Answer", "Busy", "Canceled"].map((o) => <option key={o} value={o}>{L(o)}</option>)}</select></label>
          <label>{L("Duration")} (s)<input type="number" className="crm-input mt-1 w-24" value={c.duration} onChange={(e) => setC({ ...c, duration: Number(e.target.value) })} /></label>
          <input className="crm-input flex-1" placeholder={L("Note")} value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} />
          <button className="crm-btn-solid" onClick={() => {
            const id = `CALL-${Date.now()}`;
            adapter.insertDoc("CRM Call Log", { name: id, id, type: c.type, status: c.status, duration: c.status === "Completed" ? c.duration : 0, from: c.type === "Outgoing" ? sessionPhone() : String(doc["mobile_no"] ?? ""), to: c.type === "Outgoing" ? String(doc["mobile_no"] ?? "") : sessionPhone(), start_time: new Date().toISOString().slice(0, 19).replace("T", " "), reference_doctype: doc.doctype, reference_docname: doc.name, ...(c.type === "Outgoing" ? { caller: currentUser() } : { receiver: currentUser() }), telephony_medium: "Manual" });
            if (c.note) adapter.insertDoc("FCRM Note", { title: L("Call note"), content: c.note, reference_doctype: doc.doctype, reference_docname: doc.name });
            setOpen(false);
          }}>{L("Save")}</button>
        </div>
      )}
      {list.map((x) => (
        <div key={x.name} className="flex items-center gap-3 rounded-lg border border-crm-line p-2 text-sm">
          <span>{L(String(x["type"]))}</span><Badge tone={x["status"] === "Completed" ? "green" : "orange"}>{L(String(x["status"]))}</Badge>
          <span className="text-crm-muted" data-no-i18n>{Math.floor(Number(x["duration"] ?? 0) / 60)}:{String(Number(x["duration"] ?? 0) % 60).padStart(2, "0")}</span>
          <span className="ms-auto text-xs text-crm-muted">{timeAgo(x["start_time"] ?? x["creation"])}</span>
          {x["recording_url"] ? <audio controls preload="metadata" src={String(x["recording_url"])} aria-label={L("Call recording")} className="max-w-full" /> : null}
        </div>
      ))}
      {!list.length && <p className="text-sm text-crm-muted">{L("No Call Logs Found")}</p>}
    </div>
  );
}

/** AttachmentArea.vue / FilesUploader: File records attached_to_doctype/name (stored as data URL locally). */
function Attachments({ doc }: { doc: Doc }) {
  const { L } = useL();
  const list = adapter.list("File").filter((f) => f["attached_to_doctype"] === doc.doctype && f["attached_to_name"] === doc.name);
  const upload = (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      const r = new FileReader();
      r.onload = () => adapter.insertDoc("File", { file_name: f.name, file_size: f.size, file_url: f.size < 400_000 ? String(r.result) : "", is_private: 1, attached_to_doctype: doc.doctype, attached_to_name: doc.name });
      r.readAsDataURL(f);
    }
  };
  return (
    <div className="space-y-3">
      <label className="crm-btn-solid inline-block cursor-pointer">{L("Upload Attachment")}<input type="file" multiple className="hidden" aria-label="Upload attachment" onChange={(e) => upload(e.target.files)} /></label>
      {list.map((f) => (
        <div key={f.name} className="flex items-center gap-3 rounded-lg border border-crm-line p-2 text-sm">
          {f["file_url"] ? <a href={String(f["file_url"])} download={String(f["file_name"])} className="underline" data-no-i18n>{String(f["file_name"])}</a> : <span data-no-i18n>{String(f["file_name"])}</span>}
          <span className="text-xs text-crm-muted" data-no-i18n>{Math.ceil(Number(f["file_size"] ?? 0) / 1024)} KB</span>
          <button className="ms-auto text-crm-muted" aria-label={L("Delete")} onClick={() => adapter.remove("File", f.name)}>✕</button>
        </div>
      ))}
      {!list.length && <p className="text-sm text-crm-muted">{L("No Attachments")}</p>}
    </div>
  );
}

function ConvertModal({ lead, b, onClose }: { lead: Doc; b: CrmBundle; onClose: () => void }) {
  const nav = useNavigate();
  const { L } = useL();
  const [err, setErr] = useState("");
  return (
    <Modal title={L("Convert to Deal")} onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p>{L("Organization")}: <b data-no-i18n>{lead["organization"] ? linkTitle("CRM Organization", lead["organization"]) : "—"}</b> {L(lead["organization"] && adapter.get("CRM Organization", String(lead["organization"])) ? "Existing Organization" : "New organization will be created")}</p>
        <p>{L("Contact")}: <b data-no-i18n>{String(lead["lead_name"] || "")}</b> {L("New contact will be created")}</p>
        <DevOnly><p className="text-[11px] text-crm-muted">Preview simulation of crm_lead.convert_to_deal(): field copy follows create_deal() restricted lists and LEAD_DEAL_FIELD_MAP. Permission checks, row locking, assignment copy and realtime events run only on a DIGIT server.</p></DevOnly>
        {err && <p className="text-destructive">{err}</p>}
      </div>
      <div className="mt-4 flex justify-end"><button className="crm-btn-solid" onClick={() => {
        const r = convertLeadToDeal(lead, b.lead, b.deal, b.defaults);
        if (r.error || !r.deal) return setErr(r.error ?? "Unable to convert lead");
        onClose(); nav({ to: "/digit-crm/deals/$dealId", params: { dealId: r.deal.name } });
      }}>{L("Convert")}</button></div>
    </Modal>
  );
}
