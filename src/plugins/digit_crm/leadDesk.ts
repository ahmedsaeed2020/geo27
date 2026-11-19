/**
 * DIGIT CRM C4 lead desk (owner 2026-11-17): read models and writes behind the lead list, the create drawer and the lead
 * record. Everything reads and writes the canonical records through the adapter — CRM Lead, CRM Task, FCRM Note,
 * CRM Call Log, Communication (+ Email Queue), Event, Comment, File, CRM Organization, Contact, CRM Deal — so every
 * screen (list, record, pipeline, reports) shows the same lead. Rules come from leadRules.ts (FCRM Settings).
 *  - score = wf05.scoreLead (settings rule set), SLA = first response against custom_first_response_hours / at-risk %
 *  - email / WhatsApp are sandbox: recorded on the timeline, never sent outside the app
 *  - convertLead is idempotent: a converted lead returns its organisation, contact and deal («موجود مسبقاً»)
 * Messages are [English, Arabic] pairs so the screens never show a raw English error in Arabic.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { crmActivityRows } from "@/lib/crmActivity";
import { queueCrmEmail } from "@/lib/crmEmail";
import { ADMIN } from "@/lib/session";
import { assignLead, bucketOf, canUseCrm, crmUsers, isManager, isOpenLead, OPEN_TASK, parseDue, scopedLeads, toDatetime, userLabel } from "./wf01";
import { duplicatesOf, leadTasks, normEmail, normPhone, qualification, scoreLead, type Factor } from "./wf05";
import { leadRules, SOURCE_AR, type LeadRules } from "./leadRules";
import { crmRules } from "./salesDesk";

export type Msg = readonly [string, string];
export type Res<T = { name: string }> = ({ ok: true } & T) | { ok: false; error: Msg; errors?: Record<string, Msg> | undefined };
const s = (v: unknown) => String(v ?? "");
const nowIso = () => new Date().toISOString();
const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysSince = (v: unknown, now = Date.now()) => { const t = Date.parse(s(v)); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 864e5)) : null; };
const fail = (en: string, ar: string, errors?: Record<string, Msg>): { ok: false; error: Msg; errors?: Record<string, Msg> } => ({ ok: false, error: [en, ar], ...(errors ? { errors } : {}) });

/* ------------------------------------------------------------------ statuses ------------------------------------------------------------------ */
/** The path a lead walks (C-02) and the side exits; every CRM Lead Status record has a place, so strip parts add up to the list. */
export const LEAD_PATH = ["New", "Contacted", "Nurture", "Qualified", "Converted"] as const;
export const LEAD_EXITS = ["Unqualified", "Junk"] as const;
export const LEAD_STATUS_ORDER = [...LEAD_PATH, ...LEAD_EXITS] as string[];
export const LEAD_STATUS_AR: Record<string, string> = { New: "جديد", Contacted: "تم التواصل", Nurture: "مُتابَع", Qualified: "مؤهل", Converted: "تم التحويل", Unqualified: "غير مؤهل", Junk: "غير صالح" };
export const LEAD_STATUS_TONE: Record<string, "neutral" | "info" | "warn" | "ok" | "bad"> = { New: "info", Contacted: "warn", Nurture: "neutral", Qualified: "ok", Converted: "ok", Unqualified: "bad", Junk: "bad" };
export const LEAD_STATUS_HUE: Record<string, "blue" | "amber" | "violet" | "emerald" | "teal" | "rose" | "grey"> = { New: "blue", Contacted: "amber", Nurture: "violet", Qualified: "emerald", Converted: "teal", Unqualified: "rose", Junk: "grey" };
/** The status a lead shows: a converted lead reads «تم التحويل» whatever status it was converted from. */
export const leadStage = (l: Doc) => (Number(l["converted"]) ? "Converted" : s(l["status"]) || "New");
export const statusLabel = (k: string, ar: boolean) => (ar ? LEAD_STATUS_AR[k] ?? k : k);

/* ------------------------------------------------------------------ SLA (first response) ------------------------------------------------------------------ */
export type SlaState = "ok" | "risk" | "breached" | "met" | "na";
export interface LeadSla { state: SlaState; hours: number; elapsed: number | null; due: string; respondedAt: string; late: boolean }
/** First response = the native first_responded_on (when it is not in the future) or the first answered call / sent message. */
export function firstResponse(l: Doc, now = Date.now()): number | null {
  const created = Date.parse(s(l["creation"])); if (!Number.isFinite(created)) return null;
  const native = Date.parse(s(l["first_responded_on"]));
  const times = crmActivityRows("CRM Lead", l.name).filter(({ doc }) => doc.doctype === "CRM Call Log" ? doc["status"] === "Completed"
    : doc.doctype === "Communication" && doc["sent_or_received"] === "Sent" && !Number(doc["custom_sandbox"]) && !["Queued", "Not Sent", "Error"].includes(s(doc["delivery_status"]))).map((r) => Date.parse(r.when)).filter((t) => t >= created && t <= now);
  if (Number.isFinite(native) && native >= created && native <= now) times.push(native);
  return times.length ? Math.min(...times) : null;
}
export function leadSla(l: Doc, rules: LeadRules = leadRules(), now = Date.now()): LeadSla {
  const hours = rules.slaHours, created = Date.parse(s(l["creation"]));
  const due = Number.isFinite(created) ? new Date(created + hours * 36e5).toISOString() : "";
  if (!Number.isFinite(created)) return { state: "na", hours, elapsed: null, due, respondedAt: "", late: false };
  const first = firstResponse(l, now);
  if (first !== null) { const took = (first - created) / 36e5; return { state: took <= hours ? "met" : "breached", hours, elapsed: Math.round(took * 10) / 10, due, respondedAt: new Date(first).toISOString(), late: took > hours }; }
  if (!isOpenLead(l)) return { state: "na", hours, elapsed: null, due, respondedAt: "", late: false };
  const el = (now - created) / 36e5;
  return { state: el >= hours ? "breached" : el >= (hours * rules.slaRiskPct) / 100 ? "risk" : "ok", hours, elapsed: Math.round(el * 10) / 10, due, respondedAt: "", late: el >= hours };
}

/* ------------------------------------------------------------------ list rows ------------------------------------------------------------------ */
export interface LeadRow {
  l: Doc; name: string; title: string; company: string; stage: string; score: number; band: "Hot" | "Warm" | "Cold"; factors: Factor[];
  source: string; owner: string; next?: Doc | undefined; nextDue: string; nextTone: "bad" | "warn" | undefined; lastAt: string; lastAge: number | null;
  sla: LeadSla; phone: string; email: string; city: string; industry: string; created: string; value: number; campaign: string; open: boolean;
}
export const nextStepOf = (name: string): Doc | undefined => leadTasks(name).filter((t) => OPEN_TASK.includes(s(t["status"]))).sort((a, b) => s(a["due_date"] || "9").localeCompare(s(b["due_date"] || "9")))[0];
export function lastActivityAt(dt: string, name: string, now = Date.now()) { return crmActivityRows(dt, name).find((r) => Date.parse(r.when) <= now && r.doc.doctype !== "CRM Task")?.when ?? ""; }
/** Display name of a lead: first + last name (the fields sample names are localised in), else the stored full name. */
export const leadTitle = (l: Doc) => [s(l["first_name"]), s(l["last_name"])].filter(Boolean).join(" ") || s(l["lead_name"]) || l.name;
export function leadRowOf(l: Doc, rules: LeadRules = leadRules(), now = new Date()): LeadRow {
  const sc = scoreLead(l, now.getTime()), next = nextStepOf(l.name), b = next ? bucketOf(next, now) : undefined;
  const lastAt = lastActivityAt("CRM Lead", l.name, now.getTime());
  return { l, name: l.name, title: leadTitle(l), company: s(l["organization"]), stage: leadStage(l),
    score: sc.score, band: sc.band, factors: sc.factors, source: s(l["source"]), owner: s(l["lead_owner"]), next, nextDue: s(next?.["due_date"]), nextTone: b === "overdue" ? "bad" : b === "today" ? "warn" : undefined,
    lastAt, lastAge: daysSince(lastAt, now.getTime()), sla: leadSla(l, rules, now.getTime()), phone: s(l["mobile_no"] || l["phone"]), email: s(l["email"]), city: s(l["territory"]), industry: s(l["industry"]),
    created: s(l["creation"]), value: Number(l["custom_estimated_value"] ?? 0) || 0, campaign: s(l["campaign"]), open: isOpenLead(l) };
}
export function leadRows(user: string, now = new Date()): LeadRow[] { const r = leadRules(); return scopedLeads(user).map((l) => leadRowOf(l, r, now)); }

/** A-02 built-in views. */
export const LEAD_VIEW_KEYS = ["all", "mine", "unowned", "today", "stale", "hot"] as const;
export function leadViewTest(key: string, user: string, now = new Date()): (r: LeadRow) => boolean {
  const today = localDay(now), idle = crmRules().inactivityDays;
  switch (key) {
    case "mine": return (r) => r.owner === user;
    case "unowned": return (r) => !r.owner;
    case "today": return (r) => !!r.created && localDay(new Date(r.created)) === today;
    case "stale": return (r) => r.open && (r.lastAge === null ? (daysSince(r.created, now.getTime()) ?? 0) >= idle : r.lastAge >= idle);
    case "hot": return (r) => r.open && r.band === "Hot";
    default: return () => true;
  }
}
/** A-04 strip: every status (path + exits) with count and estimated value, so the parts add up to the rows. */
export function leadStrip(rows: LeadRow[]) {
  return LEAD_STATUS_ORDER.map((k) => { const xs = rows.filter((r) => r.stage === k); return { key: k, label: [k, LEAD_STATUS_AR[k] ?? k] as [string, string], tone: LEAD_STATUS_TONE[k] ?? "neutral", count: xs.length, amount: xs.reduce((a, r) => a + r.value, 0), currency: "SAR" }; })
    .filter((t) => t.count > 0 || LEAD_PATH.includes(t.key as never));
}

/* ------------------------------------------------------------------ validation (Saudi) ------------------------------------------------------------------ */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** +966 5X XXX XXXX in any common writing (05…, 5…, 9665…, 009665…) → "+9665XXXXXXXX"; anything else is not a Saudi mobile. */
export function ksaMobile(v: unknown): string | null {
  const d = s(v).replace(/[\s\-().]/g, "").replace(/^\+/, "").replace(/^00/, "");
  const m = /^(?:966|0)?(5\d{8})$/.exec(d); return m ? `+966${m[1]}` : null;
}
export const validVat = (v: unknown) => /^3\d{13}3$/.test(s(v).trim());
export const validCr = (v: unknown) => /^\d{10}$/.test(s(v).trim());
export const validEmail = (v: unknown) => EMAIL.test(s(v).trim());

/* ------------------------------------------------------------------ duplicates (B-03) ------------------------------------------------------------------ */
export interface Dup { key: string; dt: string; name: string; title: string; sub: string; on: ("phone" | "email" | "company" | "cr" | "vat")[] }
const normCo = (v: unknown) => s(v).trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*—\s*crm$/, "");
export function leadDuplicates(input: { name?: string | undefined; email?: unknown; mobile_no?: unknown; organization?: unknown; custom_cr_no?: unknown; custom_vat_no?: unknown }): Dup[] {
  const out = new Map<string, Dup>();
  const add = (dt: string, name: string, title: string, sub: string, on: Dup["on"][number]) => { if (dt === "CRM Lead" && name === input.name) return; const k = `${dt}:${name}`; const x = out.get(k); if (x) { if (!x.on.includes(on)) x.on.push(on); } else out.set(k, { key: k, dt, name, title, sub, on: [on] }); };
  for (const m of duplicatesOf({ ...(input.name ? { name: input.name } : {}), email: input.email, mobile_no: input.mobile_no })) {
    const d = adapter.get(m.dt, m.name); const sub = s(d?.[m.dt === "CRM Lead" ? "organization" : m.dt === "Contact" ? "company_name" : "territory"]);
    const title = m.dt === "CRM Lead" && d ? leadTitle(d) : m.dt === "Contact" && d ? [s(d["first_name"]), s(d["last_name"])].filter(Boolean).join(" ") || m.title : m.title;
    for (const on of m.on.split(" + ")) add(m.dt, m.name, title, sub, on === "email" ? "email" : "phone");
  }
  const co = normCo(input.organization), cr = s(input.custom_cr_no).trim(), vat = s(input.custom_vat_no).trim();
  if (co || cr || vat) for (const l of adapter.list("CRM Lead")) {
    if (co && normCo(l["organization"]) === co) add("CRM Lead", l.name, leadTitle(l), s(l["organization"]), "company");
    if (cr && s(l["custom_cr_no"]) === cr) add("CRM Lead", l.name, leadTitle(l), s(l["organization"]), "cr");
    if (vat && s(l["custom_vat_no"]) === vat) add("CRM Lead", l.name, leadTitle(l), s(l["organization"]), "vat");
  }
  if (co || vat) for (const c of adapter.list("Customer")) {
    if (co && normCo(c["customer_name"]) === co) add("Customer", c.name, s(c["customer_name"]), s(c["territory"]), "company");
    if (vat && s(c["tax_id"]) === vat) add("Customer", c.name, s(c["customer_name"]), s(c["territory"]), "vat");
  }
  if (co) for (const o of adapter.list("CRM Organization")) if (normCo(o["organization_name"] || o.name) === co) add("CRM Organization", o.name, s(o["organization_name"]) || o.name, s(o["territory"]), "company");
  const w = (d: Dup) => (d.on.includes("cr") || d.on.includes("vat") ? 4 : 0) + (d.on.includes("email") ? 2 : 0) + (d.on.includes("phone") ? 2 : 0) + d.on.length;
  return [...out.values()].sort((a, b) => w(b) - w(a));
}

/* ------------------------------------------------------------------ create (B-01 … B-05) ------------------------------------------------------------------ */
export interface LeadInput {
  first_name: string; last_name?: string; job_title?: string; mobile_no?: string; email?: string;
  organization?: string; custom_cr_no?: string; custom_vat_no?: string; industry?: string; no_of_employees?: string; territory?: string;
  source: string; campaign?: string; custom_interest?: string; custom_estimated_value?: number | string; lead_owner?: string;
  consent?: { whatsapp?: boolean; email?: boolean; sms?: boolean } | undefined;
}
export function validateLead(i: LeadInput): Record<string, Msg> {
  const e: Record<string, Msg> = {};
  if (!s(i.first_name).trim()) e["first_name"] = ["First name is required", "الاسم الأول مطلوب"];
  if (!s(i.mobile_no).trim() && !s(i.email).trim()) e["mobile_no"] = ["Enter a mobile or an email", "أدخل رقم الجوال أو البريد الإلكتروني"];
  if (s(i.mobile_no).trim() && !ksaMobile(i.mobile_no)) e["mobile_no"] = ["Saudi mobile: +966 5X XXX XXXX", "رقم جوال سعودي: ‎+966 5X XXX XXXX‎"];
  if (s(i.email).trim() && !validEmail(i.email)) e["email"] = ["Invalid email address", "البريد الإلكتروني غير صحيح"];
  if (!s(i.source).trim()) e["source"] = ["Source is required", "المصدر مطلوب"];
  if (s(i.custom_cr_no).trim() && !validCr(i.custom_cr_no)) e["custom_cr_no"] = ["Commercial registration is 10 digits", "السجل التجاري 10 أرقام"];
  if (s(i.custom_vat_no).trim() && !validVat(i.custom_vat_no)) e["custom_vat_no"] = ["VAT number is 15 digits starting and ending with 3", "الرقم الضريبي 15 رقمًا يبدأ وينتهي بالرقم 3"];
  const v = s(i.custom_estimated_value).trim(); if (v && !(Number(v) >= 0)) e["custom_estimated_value"] = ["Enter an amount of zero or more", "أدخل مبلغًا صفرًا أو أكثر"];
  return e;
}
/** Owner: a Sales User owns what they create; a manager picks a user or "rule" (the CRM Lead assignment rule decides). */
export function createLeadFull(i: LeadInput, user: string, opts: { owner?: string | undefined; dupReason?: string | undefined; dupOf?: string | undefined } = {}): Res<{ name: string; owner: string }> {
  if (!canUseCrm(user)) return fail("Not permitted", "غير مسموح");
  const errors = validateLead(i); if (Object.keys(errors).length) return fail("Check the marked fields", "راجع الحقول المحددة", errors);
  const pick = !isManager(user) ? user : !opts.owner || opts.owner === "me" ? user : opts.owner === "rule" ? "" : opts.owner;
  if (pick && pick !== user && !crmUsers().some((u) => u.name === pick)) return fail("Owner must be an enabled sales user", "المالك يجب أن يكون مستخدم مبيعات مفعّلًا", { lead_owner: ["Owner must be an enabled sales user", "المالك يجب أن يكون مستخدم مبيعات مفعّلًا"] });
  const first = i.first_name.trim(), last = s(i.last_name).trim(), c = i.consent ?? {};
  const consentAny = !!(c.whatsapp || c.email || c.sms);
  const d = adapter.insertDoc("CRM Lead", {
    naming_series: "CRM-LEAD-.YYYY.-", first_name: first, last_name: last, lead_name: [first, last].filter(Boolean).join(" "), job_title: s(i.job_title).trim(),
    mobile_no: ksaMobile(i.mobile_no) ?? "", email: s(i.email).trim().toLowerCase(), organization: s(i.organization).trim(), custom_cr_no: s(i.custom_cr_no).trim(), custom_vat_no: s(i.custom_vat_no).trim(),
    industry: s(i.industry), no_of_employees: s(i.no_of_employees), territory: s(i.territory), source: s(i.source), campaign: s(i.campaign), custom_interest: s(i.custom_interest).trim(),
    custom_estimated_value: Number(i.custom_estimated_value) || 0, status: adapter.get("CRM Lead Status", "New") ? "New" : s(adapter.list("CRM Lead Status")[0]?.name), lead_owner: pick, converted: 0,
    custom_consent_whatsapp: c.whatsapp ? 1 : 0, custom_consent_email: c.email ? 1 : 0, custom_consent_sms: c.sms ? 1 : 0, custom_consent_date: consentAny ? nowIso() : "", custom_consent_by: consentAny ? user : "",
  });
  let owner = pick;
  if (!owner) { try { owner = s((JSON.parse(s(adapter.get("CRM Lead", d.name)?.["_assign"] || "[]")) as string[])[0]); } catch { owner = ""; } owner = owner || user; adapter.update("CRM Lead", d.name, { lead_owner: owner }); }
  if (opts.dupReason) adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "CRM Lead", reference_name: d.name, comment_email: user, content: `Created although a similar record exists${opts.dupOf ? ` (${opts.dupOf})` : ""} — reason: ${opts.dupReason}`, custom_dup_reason: opts.dupReason });
  return { ok: true, name: d.name, owner };
}
/** B-05 «تراجع»: removes the lead just created (and its assignment) while nothing else refers to it. */
export function undoCreateLead(name: string, user: string): Res {
  const l = adapter.get("CRM Lead", name); if (!l) return fail("Already removed", "حُذف بالفعل");
  if (s(l["owner"]) && s(l["owner"]) !== user && user !== ADMIN) return fail("Only the creator can undo", "التراجع لمن أنشأ السجل فقط");
  if ((daysSince(l["creation"]) ?? 0) > 0 || adapter.list("CRM Deal").some((d) => d["lead"] === name)) return fail("Too late to undo — use delete", "فات وقت التراجع — استخدم الحذف");
  for (const dt of ["ToDo", "CRM Notification", "Comment"]) for (const x of adapter.list(dt)) if ((x["reference_name"] === name || x["reference_docname"] === name) && (x["reference_type"] === "CRM Lead" || x["reference_doctype"] === "CRM Lead")) adapter.remove(dt, x.name);
  adapter.remove("CRM Lead", name);
  return { ok: true, name };
}
/** B-03 «دمج»: the form's new values fill the blanks of the existing lead instead of creating a second one. */
export function mergeInputInto(existing: string, i: LeadInput, user: string): Res {
  const l = adapter.get("CRM Lead", existing); if (!l || !scopedLeads(user).some((x) => x.name === existing)) return fail("Not permitted", "غير مسموح");
  if (Number(l["converted"])) return fail("The existing lead is converted — open it instead", "السجل الموجود محوّل — افتحه بدلًا من ذلك");
  const want: Record<string, unknown> = { first_name: i.first_name, last_name: i.last_name, job_title: i.job_title, mobile_no: ksaMobile(i.mobile_no) ?? "", email: s(i.email).toLowerCase(), organization: i.organization, custom_cr_no: i.custom_cr_no, custom_vat_no: i.custom_vat_no, industry: i.industry, no_of_employees: i.no_of_employees, territory: i.territory, source: i.source, campaign: i.campaign, custom_interest: i.custom_interest, custom_estimated_value: Number(i.custom_estimated_value) || 0 };
  const patch: Record<string, unknown> = {}; for (const [k, v] of Object.entries(want)) if (v && !l[k]) patch[k] = v;
  if (Object.keys(patch).length) adapter.update("CRM Lead", existing, patch);
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "CRM Lead", reference_name: existing, comment_email: user, content: `New details merged from the lead form: ${Object.keys(patch).join(", ") || "nothing new"}` });
  return { ok: true, name: existing };
}

/* ------------------------------------------------------------------ activities (A-06, C-05) ------------------------------------------------------------------ */
export type ActMode = "note" | "call" | "email" | "whatsapp" | "task" | "meeting";
export interface ActInput { text?: string | undefined; direction?: "Outgoing" | "Incoming" | undefined; outcome?: string | undefined; minutes?: number | undefined; to?: string | undefined; subject?: string | undefined; template?: string | undefined; title?: string | undefined; due?: string | undefined; start?: string | undefined }
export const CALL_OUTCOMES = [["Completed", "تم الرد"], ["No Answer", "لم يرد"], ["Busy", "مشغول"], ["Failed", "تعذّر الاتصال"]] as const;
export const WA_TEMPLATES = [
  { key: "greeting", en: "Greeting", ar: "ترحيب", body: ["Hello {name}, thank you for your interest in DIGIT. When is a good time to talk?", "مرحبًا {name}، شكرًا لاهتمامك بديجيت. متى يناسبك التواصل؟"] },
  { key: "followup", en: "Follow-up", ar: "متابعة", body: ["Hello {name}, following up on our last conversation — do you have any questions?", "مرحبًا {name}، نتابع معك بخصوص حديثنا الأخير — هل لديك أي استفسار؟"] },
  { key: "meeting", en: "Meeting confirmation", ar: "تأكيد اجتماع", body: ["Hello {name}, confirming our meeting. Reply if you need another time.", "مرحبًا {name}، نؤكد موعد اجتماعنا. ردّ علينا إن احتجت موعدًا آخر."] },
] as const;
const localDt = (v: string) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? toDatetime(d) : ""; };
const canTouch = (dt: string, name: string, user: string) => dt === "CRM Lead" ? scopedLeads(user).some((x) => x.name === name) : !!adapter.get(dt, name) && canUseCrm(user);
const refOwner = (d: Doc) => s(d["lead_owner"] || d["deal_owner"]);
const phoneOf = (d: Doc) => s(d["mobile_no"] || d["phone"]);
/** Records one activity on a lead or a deal; returns null or the [en, ar] reason it was refused. */
export function logActivity(dt: "CRM Lead" | "CRM Deal", name: string, mode: ActMode, p: ActInput, user: string): Msg | null {
  const d = adapter.get(dt, name); if (!d || !canTouch(dt, name, user)) return ["Not permitted", "غير مسموح"];
  if (dt === "CRM Lead" && Number(d["converted"])) return ["A converted lead is read-only — log it on the deal", "العميل المحتمل المحوّل للقراءة فقط — سجّل النشاط على الصفقة"];
  const ref = { reference_doctype: dt, reference_docname: name };
  const text = s(p.text).trim();
  if (mode === "note") {
    if (!text) return ["Write the note first", "اكتب الملاحظة أولًا"];
    adapter.insertDoc("FCRM Note", { title: text.slice(0, 60), content: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`, ...ref });
  } else if (mode === "call") {
    const outcome = s(p.outcome) || "Completed", mins = Math.max(0, Number(p.minutes) || 0);
    if (!CALL_OUTCOMES.some(([k]) => k === outcome)) return ["Pick the call outcome", "اختر نتيجة المكالمة"];
    const end = new Date(), start = new Date(end.getTime() - mins * 60000);
    let note = ""; if (text) note = adapter.insertDoc("FCRM Note", { title: text.slice(0, 60), content: `<p>${text.replace(/</g, "&lt;")}</p>`, ...ref }).name;
    const id = `CALL-${Date.now().toString(36)}`;
    adapter.insertDoc("CRM Call Log", { id, name: id, type: p.direction ?? "Outgoing", status: outcome, duration: outcome === "Completed" ? mins * 60 : 0, from: p.direction === "Incoming" ? phoneOf(d) : "", to: p.direction === "Incoming" ? "" : phoneOf(d), start_time: toDatetime(start), end_time: toDatetime(end), receiver: p.direction === "Incoming" ? user : "", caller: p.direction === "Incoming" ? "" : user, note, ...ref });
    if (outcome === "Completed" && dt === "CRM Lead") { const patch: Record<string, unknown> = {}; if (s(d["communication_status"]) !== "Replied") patch["communication_status"] = "Replied"; if (d["status"] === "New" && adapter.get("CRM Lead Status", "Contacted")) patch["status"] = "Contacted"; if (Object.keys(patch).length) adapter.update(dt, name, patch); }
  } else if (mode === "email") {
    const to = s(p.to).trim(); if (!to || !to.split(/[,;]/).every((x) => validEmail(x))) return ["Enter a valid recipient email", "أدخل بريد مستلم صحيحًا"];
    if (!s(p.subject).trim()) return ["Write a subject", "اكتب الموضوع"];
    if (dt === "CRM Lead" && d["custom_consent_email"] === 0 && d["custom_consent_date"]) return ["The customer declined email — record consent first", "رفض العميل التواصل بالبريد — سجّل الموافقة أولًا"];
    const c = queueCrmEmail(d, { to, cc: "", bcc: "", subject: s(p.subject).trim(), body: text }, user);
    adapter.update("Communication", c.name, { custom_sandbox: 1, delivery_status: "Not Sent" });
  } else if (mode === "whatsapp") {
    const to = ksaMobile(p.to); if (!to) return ["Enter a Saudi mobile (+966 5X XXX XXXX)", "أدخل جوالًا سعوديًا (‎+966 5X XXX XXXX‎)"];
    if (!text) return ["Pick a template or write the message", "اختر قالبًا أو اكتب الرسالة"];
    if (dt === "CRM Lead" && !Number(d["custom_consent_whatsapp"])) return ["No WhatsApp consent on record — record it on the lead first", "لا توجد موافقة مسجّلة على واتساب — سجّلها في بيانات العميل أولًا"];
    adapter.insertDoc("Communication", { communication_type: "Communication", communication_medium: "Chat", custom_channel: "WhatsApp", sent_or_received: "Sent", subject: `WhatsApp · ${s(p.template) || "message"}`, content: `<p>${text.replace(/</g, "&lt;")}</p>`, sender: user, recipients: to, phone_no: to, delivery_status: "Not Sent", custom_sandbox: 1, communication_date: nowIso(), reference_doctype: dt, reference_name: name, reference_docname: name, custom_template: s(p.template) });
  } else if (mode === "task") {
    const title = s(p.title).trim(); if (!title) return ["Write what has to be done", "اكتب المطلوب"];
    const due = localDt(s(p.due)); if (!due) return ["Pick a due date and time", "حدّد تاريخ ووقت الاستحقاق"];
    adapter.insertDoc("CRM Task", { title, status: "Todo", priority: "Medium", due_date: due, assigned_to: refOwner(d) || user, ...ref });
  } else if (mode === "meeting") {
    const subject = s(p.subject).trim(); if (!subject) return ["Write the meeting subject", "اكتب موضوع الاجتماع"];
    const st = new Date(s(p.start)); if (!Number.isFinite(st.getTime())) return ["Pick the meeting time", "حدّد موعد الاجتماع"];
    const en = new Date(st.getTime() + Math.max(15, Number(p.minutes) || 30) * 60000);
    adapter.insertDoc("Event", { subject, starts_on: toDatetime(st), ends_on: toDatetime(en), event_type: "Private", event_category: "Meeting", status: "Open", owner: user, ...ref, event_participants: [{ reference_doctype: dt, reference_docname: name }] });
  }
  return null;
}
/** Comment and pin on any timeline item (C-04). Pins live on the activity record itself. */
export function commentOn(dt: string, name: string, text: string, user: string): Msg | null {
  if (!text.trim()) return ["Write the comment", "اكتب التعليق"]; if (!adapter.get(dt, name)) return ["Not found", "غير موجود"];
  adapter.insertDoc("Comment", { comment_type: "Comment", reference_doctype: dt, reference_name: name, comment_email: user, content: text.trim(), custom_on_activity: 1 }); return null;
}
export function pinActivity(dt: string, name: string, on: boolean): Msg | null { if (!adapter.get(dt, name)) return ["Not found", "غير موجود"]; adapter.update(dt, name, { custom_pinned: on ? 1 : 0 }); return null; }
export const commentsOf = (dt: string, name: string) => adapter.list("Comment").filter((c) => c["reference_doctype"] === dt && c["reference_name"] === name && c["comment_type"] === "Comment" && Number(c["custom_on_activity"])).sort((a, b) => s(a["creation"]).localeCompare(s(b["creation"])));

/* ------------------------------------------------------------------ next step (C-06) ------------------------------------------------------------------ */
export function setNextStep(dt: "CRM Lead" | "CRM Deal", name: string, step: { title: string; due: string }, user: string): Msg | null {
  const d = adapter.get(dt, name); if (!d || !canTouch(dt, name, user)) return ["Not permitted", "غير مسموح"];
  const title = step.title.trim(); if (!title) return ["Write the next step", "اكتب الخطوة التالية"];
  const due = localDt(step.due); if (!due) return ["Pick the due date", "حدّد تاريخ الاستحقاق"];
  const cur = dt === "CRM Lead" ? nextStepOf(name) : adapter.list("CRM Task").filter((t) => t["reference_doctype"] === dt && t["reference_docname"] === name && OPEN_TASK.includes(s(t["status"]))).sort((a, b) => s(a["due_date"] || "9").localeCompare(s(b["due_date"] || "9")))[0];
  if (cur) adapter.update("CRM Task", cur.name, { title, due_date: due });
  else adapter.insertDoc("CRM Task", { title, status: "Todo", priority: "Medium", due_date: due, assigned_to: refOwner(d) || user, reference_doctype: dt, reference_docname: name });
  if (dt === "CRM Deal") adapter.update(dt, name, { next_step: title });
  return null;
}
export function completeStep(task: string, user: string): Msg | null { const t = adapter.get("CRM Task", task); if (!t) return ["Not found", "غير موجود"]; if (!canTouch(s(t["reference_doctype"]), s(t["reference_docname"]), user)) return ["Not permitted", "غير مسموح"]; adapter.update("CRM Task", task, { status: "Done" }); return null; }

/* ------------------------------------------------------------------ status path (C-02) ------------------------------------------------------------------ */
/** Days spent in each status from the lead's own status log (current status counts to now). */
export function stageDays(d: Doc, now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of ((d["status_change_log"] as Doc[] | undefined) ?? [])) {
    const k = s(r["from"]); const a = Date.parse(s(r["from_date"])), b = r["to_date"] ? Date.parse(s(r["to_date"])) : now;
    if (k && Number.isFinite(a) && Number.isFinite(b)) out[k] = (out[k] ?? 0) + Math.max(0, Math.floor((b - a) / 864e5));
  }
  const cur = s(d["status"]); if (cur && out[cur] === undefined) { const c = daysSince(d["creation"], now); if (c !== null) out[cur] = c; }
  return out;
}
export function setLeadStatus(name: string, to: string, user: string, why?: { reason: string; notes?: string | undefined }): Res {
  const l = adapter.get("CRM Lead", name);
  if (!l || !scopedLeads(user).some((x) => x.name === name)) return fail("Not permitted", "غير مسموح");
  if (Number(l["converted"])) return fail("A converted lead is read-only", "العميل المحتمل المحوّل للقراءة فقط");
  if (to === "Converted") return fail("Use «Convert» to create the deal", "استخدم «تحويل» لإنشاء الصفقة");
  if (!adapter.get("CRM Lead Status", to)) return fail(`Status ${to} is not configured`, `الحالة ${statusLabel(to, true)} غير معرّفة`);
  if (s(l["status"]) === to) return { ok: true, name };
  const patch: Record<string, unknown> = { status: to };
  if (to === "Unqualified" || to === "Junk") {
    const r = why?.reason?.trim(); const list = leadRules().unqualified;
    if (!r) return fail("Pick the reason", "اختر السبب", { reason: ["The reason is required", "السبب مطلوب"] });
    if (to === "Unqualified" && !list.includes(r)) return fail("Pick a reason from the list in the settings", "اختر سببًا من القائمة في الإعدادات");
    patch["custom_unqualified_reason"] = r; if (why?.notes) patch["lost_notes"] = why.notes;
  } else {
    if (to === "Qualified") { const b = qualification(l).blockers; if (b.length) return fail(`Complete first: ${b.join(", ")}`, `أكمل أولًا: ${b.map((x) => ({ "Contact name": "اسم جهة الاتصال", "Email or mobile": "البريد أو الجوال", Owner: "المالك" } as Record<string, string>)[x] ?? x).join("، ")}`); }
    if (!nextStepOf(name)) return fail("Set the next step first — it is required while the lead is open", "حدّد الخطوة التالية أولًا — مطلوبة ما دام السجل مفتوحًا", { next: ["Next step required", "الخطوة التالية مطلوبة"] });
    patch["custom_unqualified_reason"] = "";
  }
  adapter.update("CRM Lead", name, patch);
  return { ok: true, name };
}
/** «وضع علامة كمكتمل»: the next path step after the current one (Qualified → convert). */
export function nextPathStep(l: Doc): string | null { const i = LEAD_PATH.indexOf(leadStage(l) as never); return i >= 0 && i < LEAD_PATH.length - 1 ? LEAD_PATH[i + 1]! : null; }

/* ------------------------------------------------------------------ inline edit (C-03) ------------------------------------------------------------------ */
export const LEAD_EDITABLE = ["first_name", "last_name", "job_title", "mobile_no", "email", "organization", "website", "custom_cr_no", "custom_vat_no", "industry", "no_of_employees", "territory", "source", "campaign", "custom_interest", "custom_estimated_value", "custom_consent_whatsapp", "custom_consent_email", "custom_consent_sms"] as const;
export function updateLeadField(name: string, field: string, value: string, user: string): Res<{ name: string; before: unknown }> {
  const l = adapter.get("CRM Lead", name); if (!l || !scopedLeads(user).some((x) => x.name === name)) return fail("Not permitted", "غير مسموح");
  if (Number(l["converted"])) return fail("A converted lead is read-only", "العميل المحتمل المحوّل للقراءة فقط");
  if (!(LEAD_EDITABLE as readonly string[]).includes(field)) return fail("This field is not editable here", "هذا الحقل لا يُعدّل هنا");
  const v = value.trim(); let out: unknown = v;
  if (field === "mobile_no" && v) { const m = ksaMobile(v); if (!m) return fail("Saudi mobile: +966 5X XXX XXXX", "رقم جوال سعودي: ‎+966 5X XXX XXXX‎"); out = m; }
  if (field === "email" && v && !validEmail(v)) return fail("Invalid email address", "البريد الإلكتروني غير صحيح");
  if (field === "custom_vat_no" && v && !validVat(v)) return fail("VAT number is 15 digits starting and ending with 3", "الرقم الضريبي 15 رقمًا يبدأ وينتهي بالرقم 3");
  if (field === "custom_cr_no" && v && !validCr(v)) return fail("Commercial registration is 10 digits", "السجل التجاري 10 أرقام");
  if (field === "first_name" && !v) return fail("First name is required", "الاسم الأول مطلوب");
  if (field === "source" && !v) return fail("Source is required", "المصدر مطلوب");
  if (field === "custom_estimated_value") { const n = Number(v || 0); if (!(n >= 0)) return fail("Enter an amount of zero or more", "أدخل مبلغًا صفرًا أو أكثر"); out = n; }
  if (field.startsWith("custom_consent_")) out = v === "1" ? 1 : 0;
  const before = l[field]; const patch: Record<string, unknown> = { [field]: out };
  if (field === "first_name" || field === "last_name") patch["lead_name"] = [field === "first_name" ? v : l["first_name"], field === "last_name" ? v : l["last_name"]].filter(Boolean).join(" ");
  if (field.startsWith("custom_consent_") && out === 1) { patch["custom_consent_date"] = nowIso(); patch["custom_consent_by"] = user; }
  adapter.update("CRM Lead", name, patch);
  return { ok: true, name, before };
}
export function setLeadOwner(name: string, owner: string, user: string): Res {
  const r = assignLead(name, owner, user); return r.ok ? { ok: true, name } : fail(s(Object.values(r.errors)[0]) || "Not permitted", s(Object.values(r.errors)[0]) === "Only a Sales Manager can assign leads" ? "تغيير المالك لمدير المبيعات فقط" : "غير مسموح");
}

/* ------------------------------------------------------------------ record side cards (C-06) ------------------------------------------------------------------ */
export function linkedCompany(l: Doc): { kind: "Customer" | "Prospect" | "CRM Organization"; name: string; title: string } | null {
  const org = s(l["organization"]).trim(); if (!org) return null;
  const o = adapter.get("CRM Organization", org) ?? adapter.list("CRM Organization").find((x) => normCo(x["organization_name"]) === normCo(org));
  const cust = (o?.["customer"] ? adapter.get("Customer", s(o["customer"])) : undefined) ?? adapter.list("Customer").find((c) => normCo(c["customer_name"]) === normCo(org));
  if (cust) return { kind: "Customer", name: cust.name, title: s(cust["customer_name"]) || cust.name };
  const pr = adapter.list("Prospect").find((p) => normCo(p["company_name"] || p.name) === normCo(org));
  if (pr) return { kind: "Prospect", name: pr.name, title: s(pr["company_name"]) || pr.name };
  return o ? { kind: "CRM Organization", name: o.name, title: s(o["organization_name"]) || o.name } : null;
}
export const dealsOfLead = (name: string) => adapter.list("CRM Deal").filter((d) => d["lead"] === name);
export const filesOf = (dt: string, name: string) => adapter.list("File").filter((f) => f["attached_to_doctype"] === dt && f["attached_to_name"] === name);
/** C-06 rule-based summary (AI off by default): pairs of [en, ar] sentences built only from the record's own facts. */
export function leadSummary(r: LeadRow, now = Date.now()): Msg[] {
  const out: Msg[] = []; const age = daysSince(r.created, now) ?? 0;
  out.push([`Created ${age} day(s) ago${r.source ? ` from ${r.source}` : ""}; status ${r.stage}.`, `أُنشئ ${age === 0 ? "اليوم" : `قبل ${age} يوم`}${r.source ? ` من مصدر ${SOURCE_AR[r.source] ?? r.source}` : ""}؛ الحالة ${LEAD_STATUS_AR[r.stage] ?? r.stage}.`]);
  out.push(r.lastAge === null ? ["No activity logged yet.", "لا يوجد نشاط مسجّل بعد."] : [`Last activity ${r.lastAge} day(s) ago.`, r.lastAge === 0 ? "آخر نشاط اليوم." : `آخر نشاط قبل ${r.lastAge} يوم.`]);
  out.push([`Score ${r.score} (${r.band}).`, `الدرجة ${r.score} (${r.band === "Hot" ? "ساخن" : r.band === "Warm" ? "دافئ" : "بارد"}).`]);
  if (r.open) out.push(r.next ? [`Next step: ${s(r.next["title"])}.`, `الخطوة التالية: ${s(r.next["title"])}.`] : ["No next step — set one.", "لا توجد خطوة تالية — حدّد واحدة."]);
  out.push(r.sla.state === "met" ? [`First response in ${r.sla.elapsed} h (promise ${r.sla.hours} h).`, `أول رد خلال ${r.sla.elapsed} ساعة (المهلة ${r.sla.hours} ساعات).`]
    : r.sla.state === "breached" ? [`First-response promise of ${r.sla.hours} h missed.`, `تجاوز مهلة أول رد (${r.sla.hours} ساعات).`]
    : r.sla.state === "na" ? ["No first-response promise applies.", "لا تنطبق مهلة أول رد."] : [`First response due within ${r.sla.hours} h.`, `أول رد مطلوب خلال ${r.sla.hours} ساعات.`]);
  return out;
}

/* ------------------------------------------------------------------ convert (C-08) ------------------------------------------------------------------ */
export interface ConvertInput {
  org: { mode: "new" | "existing"; name?: string | undefined }; contact: { mode: "new" | "existing"; name?: string | undefined };
  deal: null | { name: string; pipeline: string; stage: string; value: number; close: string; owner: string }; transfer: boolean;
}
export interface Converted { deal: string; org: string; contact: string; existing: boolean }
export function convertedOf(l: Doc): Converted | null {
  if (!Number(l["converted"])) return null;
  return { deal: s(l["custom_converted_deal"]) || s(dealsOfLead(l.name)[0]?.name), org: s(l["custom_converted_org"] || l["organization"]), contact: s(l["custom_converted_contact"]), existing: true };
}
export function orgChoices(l: Doc) {
  const co = normCo(l["organization"]);
  return adapter.list("CRM Organization").map((o) => ({ key: o.name, label: s(o["organization_name"]) || o.name, sub: s(o["territory"]), match: !!co && normCo(o["organization_name"] || o.name) === co }));
}
export function contactChoices(l: Doc) {
  const e = normEmail(l["email"]), p = normPhone(l["mobile_no"]);
  return adapter.list("Contact").map((c) => ({ key: c.name, label: s(c["full_name"]) || [c["first_name"], c["last_name"]].filter(Boolean).join(" ") || c.name, sub: s(c["company_name"]), match: (!!e && normEmail(c["email_id"]) === e) || (!!p && normPhone(c["mobile_no"]) === p) }));
}
export function convertLead(name: string, i: ConvertInput, user: string): Res<Converted> {
  const l = adapter.get("CRM Lead", name); if (!l || !scopedLeads(user).some((x) => x.name === name)) return fail("Not permitted", "غير مسموح");
  const done = convertedOf(l); if (done) return { ok: true, ...done };
  const st = adapter.get("CRM Lead Status", s(l["status"]));
  if (st?.["type"] === "Lost") return fail("An unqualified or junk lead cannot be converted — reopen it first", "لا يُحوّل عميل غير مؤهل أو غير صالح — أعد فتحه أولًا");
  if (i.org.mode === "existing" && !adapter.get("CRM Organization", s(i.org.name))) return fail("Pick the existing company", "اختر الشركة الموجودة", { org: ["Pick a company", "اختر شركة"] });
  if (i.contact.mode === "existing" && !adapter.get("Contact", s(i.contact.name))) return fail("Pick the existing contact", "اختر جهة الاتصال الموجودة", { contact: ["Pick a contact", "اختر جهة اتصال"] });
  if (i.deal) {
    const ds = adapter.get("CRM Deal Status", i.deal.stage);
    if (!ds || ["Won", "Lost"].includes(s(ds["type"]))) return fail("Pick an open stage", "اختر مرحلة مفتوحة", { stage: ["Pick an open stage", "اختر مرحلة مفتوحة"] });
    if (!i.deal.name.trim()) return fail("Name the deal", "اكتب اسم الصفقة", { dealName: ["Name the deal", "اكتب اسم الصفقة"] });
    if (!(Number(i.deal.value) >= 0)) return fail("Enter the deal value", "أدخل قيمة الصفقة", { value: ["Enter an amount", "أدخل مبلغًا"] });
    if (i.deal.owner && !crmUsers().some((u) => u.name === i.deal!.owner) && i.deal.owner !== user) return fail("Owner must be a sales user", "المالك يجب أن يكون مستخدم مبيعات", { owner: ["Pick a sales user", "اختر مستخدم مبيعات"] });
  }
  let org = s(i.org.name);
  if (i.org.mode === "new") {
    const title = s(l["organization"]).trim() || leadTitle(l);
    const same = adapter.get("CRM Organization", title) ?? adapter.list("CRM Organization").find((o) => normCo(o["organization_name"]) === normCo(title));
    org = same ? same.name : adapter.insertDoc("CRM Organization", { name: title, organization_name: title, website: l["website"] ?? "", territory: l["territory"] ?? "", industry: l["industry"] ?? "", no_of_employees: l["no_of_employees"] ?? "", annual_revenue: l["annual_revenue"] ?? 0, custom_cr_no: l["custom_cr_no"] ?? "", custom_vat_no: l["custom_vat_no"] ?? "" }).name;
  }
  const orgTitle = s(adapter.get("CRM Organization", org)?.["organization_name"]) || org;
  let contact = s(i.contact.name);
  if (i.contact.mode === "new") contact = adapter.insertDoc("Contact", { first_name: l["first_name"] ?? "", last_name: l["last_name"] ?? "", email_id: l["email"] ?? "", mobile_no: l["mobile_no"] ?? "", company_name: orgTitle, designation: l["job_title"] ?? "", links: [{ link_doctype: "CRM Lead", link_name: name }] }).name;
  let deal = "";
  if (i.deal) {
    const ds = adapter.get("CRM Deal Status", i.deal.stage)!;
    const next = nextStepOf(name);
    deal = adapter.insertDoc("CRM Deal", { naming_series: "CRM-DEAL-.YYYY.-", organization: org, lead: name, lead_name: l["lead_name"] ?? "", custom_deal_name: i.deal.name.trim(), custom_pipeline: i.deal.pipeline, status: ds.name, probability: Number(ds["probability"] ?? 0),
      deal_value: Number(i.deal.value) || 0, expected_deal_value: Number(i.deal.value) || 0, expected_closure_date: i.deal.close || "", currency: "SAR", deal_owner: i.deal.owner || user, source: l["source"] ?? "", territory: l["territory"] ?? "", industry: l["industry"] ?? "",
      no_of_employees: l["no_of_employees"] ?? "", email: l["email"] ?? "", mobile_no: l["mobile_no"] ?? "", first_name: l["first_name"] ?? "", last_name: l["last_name"] ?? "", job_title: l["job_title"] ?? "", contacts: contact ? [{ contact, is_primary: 1, custom_role: "decision" }] : [], contact,
      next_step: s(next?.["title"]), custom_lead_activities: i.transfer ? 1 : 0 }).name;
    if (i.transfer) {
      for (const n of adapter.list("FCRM Note")) if (n["reference_doctype"] === "CRM Lead" && n["reference_docname"] === name) adapter.insertDoc("FCRM Note", { title: n["title"], content: n["content"], reference_doctype: "CRM Deal", reference_docname: deal, custom_from_lead: name });
      for (const t of leadTasks(name)) if (OPEN_TASK.includes(s(t["status"]))) adapter.update("CRM Task", t.name, { reference_doctype: "CRM Deal", reference_docname: deal, custom_from_lead: name });
      for (const f of filesOf("CRM Lead", name)) adapter.insertDoc("File", { file_name: f["file_name"], file_url: f["file_url"], file_size: f["file_size"], is_private: f["is_private"] ?? 1, attached_to_doctype: "CRM Deal", attached_to_name: deal, custom_from_lead: name });
    }
  }
  adapter.update("CRM Lead", name, { ...(adapter.get("CRM Lead Status", "Converted") ? { status: "Converted" } : {}), converted: 1, custom_converted_on: nowIso(), custom_converted_deal: deal, custom_converted_org: org, custom_converted_contact: contact });
  return { ok: true, deal, org, contact, existing: false };
}

/* ------------------------------------------------------------------ merge, bulk (A-08) ------------------------------------------------------------------ */
const REF_FIELDS: [string, string, string][] = [["CRM Task", "reference_doctype", "reference_docname"], ["FCRM Note", "reference_doctype", "reference_docname"], ["CRM Call Log", "reference_doctype", "reference_docname"], ["Communication", "reference_doctype", "reference_name"], ["Event", "reference_doctype", "reference_docname"], ["Comment", "reference_doctype", "reference_name"], ["File", "attached_to_doctype", "attached_to_name"]];
/** Keeps `keep`, fills its blanks from `drop`, moves every activity, attachment and deal of `drop` to it, then removes `drop`. */
export function mergeLeads(keep: string, drop: string, user: string): Res {
  if (keep === drop) return fail("Pick two different leads", "اختر عميلين مختلفين");
  const a = adapter.get("CRM Lead", keep), b = adapter.get("CRM Lead", drop);
  const mine = new Set(scopedLeads(user).map((x) => x.name));
  if (!a || !b || !mine.has(keep) || !mine.has(drop)) return fail("Not permitted", "غير مسموح");
  if (!isManager(user) && (a["lead_owner"] !== user || b["lead_owner"] !== user)) return fail("Only a Sales Manager can merge another owner's lead", "دمج سجل مالك آخر لمدير المبيعات فقط");
  if (Number(b["converted"])) return fail("The lead to remove is converted — keep it instead", "السجل المراد حذفه محوّل — احتفظ به بدلًا منه");
  const patch: Record<string, unknown> = {}; for (const f of LEAD_EDITABLE) if (!a[f] && b[f]) patch[f] = b[f];
  if (Object.keys(patch).length) adapter.update("CRM Lead", keep, patch);
  for (const [dt, rdt, rn] of REF_FIELDS) for (const x of adapter.list(dt)) if (x[rdt] === "CRM Lead" && x[rn] === drop) adapter.update(dt, x.name, { [rn]: keep, ...(dt === "Communication" ? { reference_docname: keep } : {}) });
  for (const d of dealsOfLead(drop)) adapter.update("CRM Deal", d.name, { lead: keep });
  for (const t of adapter.list("ToDo")) if (t["reference_type"] === "CRM Lead" && t["reference_name"] === drop) adapter.remove("ToDo", t.name);
  adapter.insertDoc("Comment", { comment_type: "Info", reference_doctype: "CRM Lead", reference_name: keep, comment_email: user, content: `Merged ${drop} (${s(b["lead_name"])}) into this lead: ${Object.keys(patch).join(", ") || "no new fields"}` });
  adapter.remove("CRM Lead", drop);
  return { ok: true, name: keep };
}
export function bulkOwner(names: string[], owner: string, user: string) { const r = names.map((n) => ({ n, r: setLeadOwner(n, owner, user) })); return { done: r.filter((x) => x.r.ok).map((x) => x.n), refused: r.filter((x) => !x.r.ok).map((x) => ({ name: x.n, error: (x.r as { error: Msg }).error })) }; }
export function bulkStatus(names: string[], to: string, user: string, why?: { reason: string; notes?: string }) { const r = names.map((n) => ({ n, r: setLeadStatus(n, to, user, why) })); return { done: r.filter((x) => x.r.ok).map((x) => x.n), refused: r.filter((x) => !x.r.ok).map((x) => ({ name: x.n, error: (x.r as { error: Msg }).error })) }; }
export function bulkCampaign(names: string[], campaign: string, user: string) {
  if (!adapter.get("Campaign", campaign)) return { done: [] as string[], refused: names.map((name) => ({ name, error: ["Pick a campaign", "اختر حملة"] as Msg })) };
  const mine = new Set(scopedLeads(user).map((x) => x.name)); const done: string[] = [], refused: { name: string; error: Msg }[] = [];
  for (const n of names) { const l = adapter.get("CRM Lead", n); if (!l || !mine.has(n)) refused.push({ name: n, error: ["Not permitted", "غير مسموح"] }); else if (Number(l["converted"])) refused.push({ name: n, error: ["Converted (read-only)", "محوّل (للقراءة فقط)"] }); else { adapter.update("CRM Lead", n, { campaign }); done.push(n); } }
  return { done, refused };
}
/** Sandbox bulk send: one recorded message per lead with the channel's consent; the rest are listed with the reason. */
export function bulkSend(names: string[], channel: "email" | "whatsapp", template: string, user: string, ar: boolean) {
  const t = WA_TEMPLATES.find((x) => x.key === template) ?? WA_TEMPLATES[0]; const done: string[] = [], refused: { name: string; error: Msg }[] = [];
  for (const n of names) {
    const l = adapter.get("CRM Lead", n); if (!l) continue; const nm = s(l["first_name"]) || s(l["lead_name"]);
    const body = t.body[ar ? 1 : 0].replace("{name}", nm);
    const e = channel === "whatsapp" ? logActivity("CRM Lead", n, "whatsapp", { to: s(l["mobile_no"]), text: body, template: t.key }, user)
      : logActivity("CRM Lead", n, "email", { to: s(l["email"]), subject: ar ? t.ar : t.en, text: body }, user);
    if (e) refused.push({ name: n, error: e }); else done.push(n);
  }
  return { done, refused };
}
const csvCell = (v: unknown) => { const x = s(v); return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x; };
export function leadsCsv(rows: LeadRow[], ar: boolean) {
  const head = ar ? ["الرقم", "الاسم", "الشركة", "الحالة", "الدرجة", "المصدر", "المالك", "الجوال", "البريد", "المدينة", "القيمة التقديرية (SAR)", "آخر نشاط"] : ["ID", "Name", "Company", "Status", "Score", "Source", "Owner", "Mobile", "Email", "City", "Estimated value (SAR)", "Last activity"];
  return [head, ...rows.map((r) => [r.name, r.title, r.company, ar ? LEAD_STATUS_AR[r.stage] ?? r.stage : r.stage, r.score, r.source, userLabel(r.owner), r.phone, r.email, r.city, r.value, r.lastAt.slice(0, 10)])].map((x) => x.map(csvCell).join(",")).join("\n");
}
export const dueOf = (t: Doc | undefined) => parseDue(t?.["due_date"]);

/* ------------------------------------------------------------------ followers, attachments ------------------------------------------------------------------ */
export const followersOf = (dt: string, name: string) => adapter.list("Document Follow").filter((f) => f["ref_doctype"] === dt && f["ref_docname"] === name).map((f) => s(f["user"]));
export function toggleFollow(dt: string, name: string, user: string): boolean {
  const f = adapter.list("Document Follow").find((x) => x["ref_doctype"] === dt && x["ref_docname"] === name && x["user"] === user);
  if (f) { adapter.remove("Document Follow", f.name); return false; }
  adapter.insertDoc("Document Follow", { ref_doctype: dt, ref_docname: name, user }); return true;
}
export function attachFile(dt: string, name: string, file: { name: string; size: number; url: string }, user: string): Msg | null {
  if (!canTouch(dt, name, user)) return ["Not permitted", "غير مسموح"];
  if (file.size > 2 * 1024 * 1024) return ["Files up to 2 MB in the preview", "الملفات حتى 2 ميجابايت في المعاينة"];
  adapter.insertDoc("File", { file_name: file.name, file_url: file.url, file_size: file.size, is_private: 1, attached_to_doctype: dt, attached_to_name: name });
  adapter.insertDoc("Comment", { comment_type: "Attachment", reference_doctype: dt, reference_name: name, comment_email: user, content: file.name });
  return null;
}

/* ------------------------------------------------------------------ owner notes C-05 qualification board ------------------------------------------------------------------ */
export interface QualStats {
  total: number; open: number; qualified: number; converted: number; unqualified: number;
  /** qualified = reached «مؤهل» or was converted; both shares are of all leads except junk */ qualifiedPct: number | null; convertedPct: number | null; qualToConvPct: number | null;
  /** «سرعة الوصول»: mean hours from creation to the first response, over leads that got one */ avgFirstHours: number | null; responded: number; breached: number;
  newRecent: number; newPrev: number;
}
/** The qualification funnel and its indicators, from the same lead rows the board and the list show. */
export function qualificationStats(rows: LeadRow[], now = new Date()): QualStats {
  const live = rows.filter((r) => !Number(r.l["custom_archived"]) && r.stage !== "Junk");
  const qualified = live.filter((r) => r.stage === "Qualified" || r.stage === "Converted").length, converted = live.filter((r) => r.stage === "Converted").length;
  const took = live.filter((r) => r.sla.respondedAt && r.sla.elapsed !== null).map((r) => r.sla.elapsed!);
  const t = now.getTime(), d30 = 30 * 864e5; const at = (r: LeadRow) => Date.parse(r.created);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    total: live.length, open: live.filter((r) => r.open).length, qualified, converted, unqualified: live.filter((r) => r.stage === "Unqualified").length,
    qualifiedPct: pct(qualified, live.length), convertedPct: pct(converted, live.length), qualToConvPct: pct(converted, qualified),
    avgFirstHours: took.length ? Math.round((took.reduce((a, x) => a + x, 0) / took.length) * 10) / 10 : null, responded: took.length,
    breached: live.filter((r) => r.open && r.sla.state === "breached").length,
    newRecent: live.filter((r) => t - at(r) >= 0 && t - at(r) < d30).length, newPrev: live.filter((r) => t - at(r) >= d30 && t - at(r) < 2 * d30).length,
  };
}
