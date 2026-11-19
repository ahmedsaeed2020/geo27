/**
 * Round-2 platform features: SHL-03 one search (employees, documents, sections, actions) in the user's scope, SHL-06
 * session policy (expiry, MFA for sensitive roles, password reset through the e-mail provider), SHL-09 local form drafts
 * that survive a re-login (per user, cleared after save or account switch), SHL-10 bulk engine (atomic or per record),
 * PLT-01 outbound webhooks (native Webhook records → provider exchanges), PLT-02 no-code fields (Custom Field records),
 * PLT-03 cache key + purge on account switch, PLT-05 upgrade readiness gate, SEC-04 system usage, SEC-05 identity
 * provider sync and MFA log. Reads use the HR scoped readers; writes go through ../write.ts or the adapter's own rules.
 */
import { adapter, DocValidationError, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { cachedMeta } from "@/lib/catalog";
import { scopedList, assertScoped } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { SECTIONS } from "../../v5/data";
import { queueExchange, hashOf } from "../providers";
import { rulesErrors, guarded, ok, fail, s, todayISO, nowISO, type ActionResult } from "../write";
import { LEVEL1_ROLES } from "../roles";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const slug = (dt: string) => dt.toLowerCase().replace(/[^a-z0-9]+/g, "_");

/* ------------------------------------------------------------------ SHL-03 one search */
/** Arabic-aware fold: hamza forms, taa marbuta, alef maqsura, diacritics and case. */
export function fold(t: string): string {
  return t.toLowerCase().replace(/[\u064B-\u065F\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
}
export interface SearchHit { kind: "employee" | "document" | "section" | "action"; doctype?: string; name?: string; title: [string, string]; subtitle: string; to: string; score: number }
const SEARCHABLE: { dt: string; fields: string[]; title: string }[] = [
  { dt: "Employee", fields: ["name", "employee_name", "first_name", "cell_number", "company_email", "personal_email", "designation"], title: "employee_name" },
  { dt: "DIGIT HR Service Case", fields: ["name", "subject", "employee_name", "category"], title: "subject" },
  { dt: "Leave Application", fields: ["name", "employee_name", "leave_type"], title: "employee_name" },
  { dt: "Job Applicant", fields: ["name", "applicant_name", "email_id", "phone_number"], title: "applicant_name" },
  { dt: "Job Opening", fields: ["name", "job_title", "designation"], title: "job_title" },
  { dt: "Expense Claim", fields: ["name", "employee_name"], title: "employee_name" },
  { dt: "Salary Slip", fields: ["name", "employee_name"], title: "employee_name" },
];
/** Static actions offered by search (section tools and common requests). */
export const SEARCH_ACTIONS: { id: string; en: string; ar: string; section: string; words: string }[] = [
  { id: "new-leave", en: "Request leave", ar: "طلب إجازة", section: "05.1", words: "leave vacation اجازة" },
  { id: "payslip", en: "My payslips", ar: "قسائم راتبي", section: "05.1", words: "payslip salary slip راتب قسيمة" },
  { id: "checkin", en: "Check in / out", ar: "تسجيل الحضور والانصراف", section: "03.2", words: "checkin attendance حضور بصمة" },
  { id: "new-case", en: "Open an HR request", ar: "فتح طلب خدمة", section: "05.3", words: "case request ticket طلب خدمة قضية" },
  { id: "run-payroll", en: "Run payroll", ar: "تشغيل الرواتب", section: "04.1", words: "payroll run مسير رواتب" },
  { id: "hire", en: "Hire wizard", ar: "معالج التعيين", section: "02.2", words: "hire onboard تعيين مباشرة" },
  { id: "roster", en: "Plan the roster", ar: "تخطيط الجدول", section: "03.3", words: "roster shift schedule وردية جدول" },
  { id: "import", en: "Import data", ar: "استيراد البيانات", section: "07.1", words: "import upload csv استيراد" },
  { id: "report", en: "Build a report", ar: "إنشاء تقرير", section: "06.3", words: "report query تقرير استعلام" },
];
const scoreOf = (q: string, hay: string[]): number => {
  let best = 0;
  for (const h of hay) { const f = fold(h); if (!f) continue; if (f === q) best = Math.max(best, 100); else if (f.startsWith(q)) best = Math.max(best, 70); else if (f.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 55); else if (f.includes(q)) best = Math.max(best, 35); }
  return best;
};
/** One search over the user's permitted records + the 30 sections + actions; exact IDs first (HR-2026-00012 opens the case). */
export function hrSearch(q: string, user = currentUser(), limit = 20): SearchHit[] {
  const fq = fold(q); if (fq.length < 2) return [];
  const hits: SearchHit[] = [];
  for (const src of SEARCHABLE) {
    for (const d of list(src.dt, user)) {
      const sc = scoreOf(fq, src.fields.map((f) => s(d[f])));
      if (!sc) continue;
      const kind = src.dt === "Employee" ? "employee" : "document";
      hits.push({ kind, doctype: src.dt, name: d.name, title: [s(d[src.title]) || d.name, s(d[src.title]) || d.name], subtitle: `${src.dt} · ${d.name}${d["company"] ? ` · ${s(d["company"])}` : ""}`,
        to: src.dt === "Employee" ? `/digit-hr/employees/${encodeURIComponent(d.name)}` : `/app/hrms/${slug(src.dt)}/${encodeURIComponent(d.name)}`, score: sc + (src.dt === "Employee" ? 5 : 0) });
    }
  }
  for (const x of SECTIONS) { const sc = scoreOf(fq, [x.en, x.ar, x.id]); if (sc) hits.push({ kind: "section", title: [x.en, x.ar], subtitle: x.id, to: `/digit-hr/s/${x.id}`, score: sc - 10 }); }
  for (const a of SEARCH_ACTIONS) { const sc = scoreOf(fq, [a.en, a.ar, ...a.words.split(" ")]); if (sc) hits.push({ kind: "action", title: [a.en, a.ar], subtitle: a.section, to: `/digit-hr/s/${a.section}?tab=documents&tool=${a.id}`, score: sc - 5 }); }
  return hits.sort((a, b) => b.score - a.score || a.title[0].localeCompare(b.title[0])).slice(0, limit);
}

/* ------------------------------------------------------------------ SHL-06 session policy, password reset, MFA */
export interface SessionPolicy { expiryHours: number; mfaRequired: boolean; resetMinutes: number }
export function sessionPolicy(user = currentUser(), on = todayISO()): SessionPolicy {
  const roles = userRoles(user);
  const sensitive = roles.some((r) => LEVEL1_ROLES.includes(r) || r === "System Manager" || r === "HR Admin" || r === "Integration Admin");
  return { expiryHours: policyValue("session_expiry_hours", on) ?? 8, mfaRequired: sensitive && (policyValue("mfa_sensitive_roles", on) ?? 1) > 0, resetMinutes: policyValue("reset_token_minutes", on) ?? 30 };
}
/** The session asks again only after the configured hours (SHL-06 acceptance). */
export function sessionExpired(startedAt: string, now: string, user = currentUser()): boolean {
  return Date.parse(now.replace(" ", "T") + "Z") - Date.parse(startedAt.replace(" ", "T") + "Z") >= sessionPolicy(user, now.slice(0, 10)).expiryHours * 3600000;
}
/** Password reset: a DIGIT Password Reset Request with a one-time token (only its hint is stored) sent by the e-mail provider. */
export function requestPasswordReset(user: string, now = nowISO()): ActionResult & { token?: string } {
  const u = adapter.get("User", user);
  // the same answer whether or not the user exists, so the form never reveals accounts
  if (!u || Number(u["enabled"] ?? 1) === 0) return ok("If the account exists, a reset link was sent.", "إن كان الحساب موجودًا فقد أُرسل رابط الاستعادة.");
  const token = hashOf(`${user}|${now}|${Math.random()}`) + hashOf(`${now}|${user}`);
  const mins = sessionPolicy(user, now.slice(0, 10)).resetMinutes;
  const expires = new Date(Date.parse(now.replace(" ", "T") + "Z") + mins * 60000).toISOString().slice(0, 19).replace("T", " ");
  for (const old of adapter.list("DIGIT Password Reset Request").filter((d) => d["user"] === user && d["status"] === "Sent")) adapter.update("DIGIT Password Reset Request", old.name, { status: "Superseded" });
  const q = queueExchange({ provider: "Email", operation: "Password Reset", doctype: "User", name: user, payload: { to: user, template: "password_reset", expires }, key: `reset|${user}|${now}` });
  const d = adapter.insertDoc("DIGIT Password Reset Request", { user, requested_on: now, token_hint: `${token.slice(0, 4)}…${hashOf(token)}`, expires_on: expires, status: "Sent", exchange: q.doc?.name ?? "" });
  return { ...ok("If the account exists, a reset link was sent.", "إن كان الحساب موجودًا فقد أُرسل رابط الاستعادة.", { created: [["DIGIT Password Reset Request", d.name]] }), token };
}
export function useResetToken(user: string, token: string, now = nowISO()): ActionResult {
  const d = adapter.list("DIGIT Password Reset Request").find((r) => r["user"] === user && r["status"] === "Sent" && s(r["token_hint"]).endsWith(hashOf(token)));
  if (!d) return fail("The link is not valid.", "الرابط غير صالح.");
  if (s(d["expires_on"]) < now) { adapter.update("DIGIT Password Reset Request", d.name, { status: "Expired" }); return fail("The link has expired; ask for a new one.", "انتهت صلاحية الرابط؛ اطلب رابطًا جديدًا."); }
  adapter.update("DIGIT Password Reset Request", d.name, { status: "Used" });
  logIdentity(user, "Password Reset", "Email", "Reset link used");
  return ok("Password can now be changed.", "يمكن الآن تغيير كلمة المرور.");
}
export function logIdentity(user: string, type: string, provider: string, details: string, now = nowISO()): Doc {
  const emp = adapter.list("Employee").find((e) => e["user_id"] === user);
  return adapter.insertDoc("DIGIT Identity Event", { event_time: now, user, employee: emp?.name ?? "", event_type: type, provider, details });
}
/** SEC-05 MFA: record each challenge; a sensitive-role user without a passed challenge this session is asked again. */
export function recordMfa(user: string, passed: boolean, method = "Authenticator", now = nowISO()): Doc { return logIdentity(user, passed ? "MFA Passed" : "MFA Failed", method, passed ? "Second factor verified" : "Second factor refused", now); }
export function mfaSatisfied(user: string, sessionStart: string): boolean {
  if (!sessionPolicy(user).mfaRequired) return true;
  return adapter.list("DIGIT Identity Event").some((e) => e["user"] === user && e["event_type"] === "MFA Passed" && s(e["event_time"]) >= sessionStart);
}
/** SEC-05 identity provider sync: active employees with a user → Provision; inactive / left → Disable. One exchange per user per state. */
export function syncIdentityProvider(company?: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const emps = list("Employee", user).filter((e) => s(e["user_id"]) && (!company || e["company"] === company));
    let prov = 0, dis = 0, dup = 0;
    adapter.batch(() => {
      for (const e of emps) {
        const active = s(e["status"]) === "Active";
        const q = queueExchange({ provider: "Identity Provider", operation: active ? "Provision User" : "Disable User", doctype: "Employee", name: e.name, payload: { user: e["user_id"], employee: e.name, company: e["company"], department: e["department"], active } });
        if (q.refused) throw new DocValidationError([q.refused[0]]);
        if (q.duplicate) { dup++; continue; }
        if (active) prov++; else dis++;
        logIdentity(s(e["user_id"]), active ? "Provisioned" : "Disabled", "Identity Provider", `Sync from employee ${e.name}`);
      }
    });
    return ok(`Identity sync queued: ${prov} provisioned, ${dis} disabled, ${dup} unchanged.`, `أُرسلت المزامنة: ${prov} تفعيل، ${dis} تعطيل، ${dup} دون تغيير.`, { data: { prov, dis, dup } });
  });
}

/* ------------------------------------------------------------------ SHL-09 local drafts */
type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const DRAFT_PREFIX = "digit-hr:draft:";
export const draftKey = (user: string, dt: string, name: string) => `${DRAFT_PREFIX}${user}|${dt}|${name || "new"}`;
const store = (): KV | null => { try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; } };
const INDEX = "digit-hr:draft-index";
const readIndex = (kv: KV): string[] => { try { return JSON.parse(kv.getItem(INDEX) ?? "[]") as string[]; } catch { return []; } };
const writeIndex = (kv: KV, keys: string[]) => { try { kv.setItem(INDEX, JSON.stringify([...new Set(keys)])); } catch { /* best effort */ } };
export function saveLocalDraft(user: string, dt: string, name: string, values: Record<string, unknown>, kv: KV | null = store(), now = nowISO()): void {
  if (!kv) return;
  const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => !k.startsWith("__") && typeof v !== "function"));
  const key = draftKey(user, dt, name);
  try { kv.setItem(key, JSON.stringify({ at: now, values: clean })); writeIndex(kv, [...readIndex(kv), key]); } catch { /* storage full: drafts are best effort */ }
}
export function loadLocalDraft(user: string, dt: string, name: string, kv: KV | null = store()): { at: string; values: Record<string, unknown> } | null {
  if (!kv) return null;
  try { const raw = kv.getItem(draftKey(user, dt, name)); return raw ? JSON.parse(raw) as { at: string; values: Record<string, unknown> } : null; } catch { return null; }
}
export function clearLocalDraft(user: string, dt: string, name: string, kv: KV | null = store()): void {
  if (!kv) return; const key = draftKey(user, dt, name);
  try { kv.removeItem(key); writeIndex(kv, readIndex(kv).filter((k) => k !== key)); } catch { /* ignore */ }
}
/** On account switch: drafts of every other user are removed, so the next user never sees them. */
export function purgeOtherDrafts(user: string, kv: KV | null = store()): number {
  if (!kv) return 0;
  const all = readIndex(kv); const drop = all.filter((k) => k.startsWith(DRAFT_PREFIX) && !k.startsWith(`${DRAFT_PREFIX}${user}|`));
  drop.forEach((k) => kv.removeItem(k)); writeIndex(kv, all.filter((k) => !drop.includes(k)));
  return drop.length;
}
/** Fields of the draft that differ from the saved record (what "Restore" would put back). */
export function draftDiff(saved: Doc | undefined, values: Record<string, unknown>): string[] {
  return Object.keys(values).filter((k) => !["modified", "creation", "owner", "modified_by", "name", "doctype", "docstatus", "idx"].includes(k) && JSON.stringify(values[k] ?? "") !== JSON.stringify(saved?.[k] ?? ""));
}

/* ------------------------------------------------------------------ SHL-10 bulk engine */
export interface BulkOp { op: "create" | "update"; doctype: string; name?: string; values: Record<string, unknown> }
export interface BulkResult { mode: "atomic" | "each"; ok: number; failed: number; results: { i: number; ok: boolean; name?: string; errors: string[] }[]; committed: boolean }
function check(o: BulkOp, user: string): string[] {
  const cur = o.op === "update" && o.name ? adapter.get(o.doctype, o.name) : undefined;
  if (o.op === "update" && !cur) return [`${o.doctype} ${o.name ?? ""} not found`];
  const doc = { doctype: o.doctype, name: o.name ?? "", ...(cur ?? {}), ...o.values } as Doc;
  try { assertScoped(o.doctype, o.op === "create" ? "create" : "write", doc, user); } catch (e) { return [e instanceof Error ? e.message : String(e)]; }
  return [...mandatoryErrors(o.doctype, doc), ...rulesErrors(o.doctype, doc)];
}
/** Required fields of the DocType (the form's mandatory check, so a bulk row is refused like a form save). */
export function mandatoryErrors(dt: string, doc: Doc): string[] {
  return (cachedMeta(dt)?.fields ?? []).filter((f) => Number(f.reqd) === 1 && !/Break$|^Table|^HTML|^Button/.test(s(f.fieldtype)) && f.default === undefined && !s(f["fetch_from"]) && (doc[s(f.fieldname)] === undefined || doc[s(f.fieldname)] === null || s(doc[s(f.fieldname)]).trim() === "")).map((f) => `${s(f.label) || s(f.fieldname)} is required`);
}
/** Atomic: every row validated first, then all written in one batch or none (limit bulk_atomic_limit). Each: one result per row. */
export function applyBulk(ops: BulkOp[], mode: "atomic" | "each", user = currentUser()): BulkResult {
  const results: BulkResult["results"] = [];
  if (mode === "atomic") {
    const limit = policyValue("bulk_atomic_limit", todayISO()) ?? 50;
    if (ops.length > limit) return { mode, ok: 0, failed: ops.length, committed: false, results: ops.map((_, i) => ({ i, ok: false, errors: [`An all-or-nothing batch takes at most ${limit} rows; use per-record mode`] })) };
    const errs = ops.map((o) => check(o, user));
    if (errs.some((e) => e.length)) return { mode, ok: 0, failed: errs.filter((e) => e.length).length, committed: false, results: errs.map((e, i) => ({ i, ok: !e.length, errors: e })) };
    const snapshot = ops.map((o) => (o.op === "update" && o.name ? { ...adapter.get(o.doctype, o.name)! } : null));
    const done: { dt: string; name: string; op: string; i: number }[] = [];
    try {
      adapter.batch(() => { ops.forEach((o, i) => { if (o.op === "create") { const d = adapter.insertDoc(o.doctype, o.values); done.push({ dt: o.doctype, name: d.name, op: "create", i }); } else { adapter.update(o.doctype, o.name!, o.values); done.push({ dt: o.doctype, name: o.name!, op: "update", i }); } }); });
    } catch (e) {
      // roll back what was written before the failing row (savepoint semantics)
      adapter.batch(() => { for (const w of done.reverse()) { if (w.op === "create") adapter.remove(w.dt, w.name); else { const snap = snapshot[w.i]; if (snap) adapter.update(w.dt, w.name, snap); } } });
      const msg = e instanceof DocValidationError ? e.errors : [e instanceof Error ? e.message : String(e)];
      return { mode, ok: 0, failed: ops.length, committed: false, results: ops.map((_, i) => ({ i, ok: false, errors: i === done.length ? msg : ["Rolled back with the batch"] })) };
    }
    return { mode, ok: ops.length, failed: 0, committed: true, results: done.map((w) => ({ i: w.i, ok: true, name: w.name, errors: [] })) };
  }
  adapter.batch(() => {
    ops.forEach((o, i) => {
      const e = check(o, user);
      if (e.length) { results.push({ i, ok: false, errors: e }); return; }
      try { const name = o.op === "create" ? adapter.insertDoc(o.doctype, o.values).name : (adapter.update(o.doctype, o.name!, o.values), o.name!); results.push({ i, ok: true, name, errors: [] }); }
      catch (err) { results.push({ i, ok: false, errors: err instanceof DocValidationError ? err.errors : [String((err as Error).message)] }); }
    });
  });
  const good = results.filter((r) => r.ok).length;
  return { mode, ok: good, failed: results.length - good, committed: good > 0, results };
}

/* ------------------------------------------------------------------ PLT-01 webhooks */
/** Native Webhook records for a DocType event become provider exchanges (signed payload, idempotent per record + modified). */
export function fireWebhooks(doctype: string, event: string, doc: Doc): Doc[] {
  const hooks = adapter.list("Webhook").filter((w) => Number(w["enabled"] ?? 1) === 1 && w["webhook_doctype"] === doctype && s(w["webhook_docevent"]) === event);
  const out: Doc[] = [];
  for (const w of hooks) {
    const body = { doctype, name: doc.name, event, data: Object.fromEntries(Object.entries(doc).filter(([k]) => !/salary|iban|bank_ac|gosi|ctc|base$/i.test(k))) };
    const sig = w["enable_security"] ? hashOf(`${s(w["webhook_secret"])}|${JSON.stringify(body)}`) : "";
    const q = queueExchange({ provider: "Email", operation: "Send", doctype, name: doc.name, payload: { webhook: w.name, url: w["request_url"], method: w["request_method"] || "POST", signature: sig, body }, key: `webhook|${w.name}|${doc.name}|${s(doc.modified)}` });
    if (q.doc) {
      adapter.update("DIGIT Provider Exchange", q.doc.name, { operation: `Webhook ${event}` });
      out.push(q.doc);
    }
  }
  return out;
}
/* ------------------------------------------------------------------ PLT-02 no-code fields */
const FIELD_TYPES = ["Data", "Int", "Float", "Currency", "Date", "Check", "Select", "Link", "Small Text"];
/** Add a field to an HR document from the screen: a Custom Field record (live through the site customizations overlay). */
export function addCustomField(dt: string, label: string, fieldtype: string, opts: { options?: string; insert_after?: string; reqd?: boolean } = {}, user = currentUser()): ActionResult {
  return guarded(() => {
    if (!userRoles(user).some((r) => ["System Manager", "HR Admin", "HR Manager"].includes(r)) && user !== "Administrator") return fail("Only HR administrators can add fields.", "إضافة الحقول لمسؤولي الموارد البشرية فقط.");
    if (!FIELD_TYPES.includes(fieldtype)) return fail(`Field type ${fieldtype} is not offered.`, `نوع الحقل ${fieldtype} غير متاح.`);
    const fieldname = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    if (fieldname === "custom_") return fail("Give the field an English label.", "اكتب اسم الحقل بالإنجليزية.");
    if (adapter.list("Custom Field").some((c) => c["dt"] === dt && c["fieldname"] === fieldname)) return fail("This field already exists.", "هذا الحقل موجود.");
    if ((fieldtype === "Select" || fieldtype === "Link") && !s(opts.options)) return fail("Select and Link fields need options.", "حقول الاختيار والربط تحتاج خيارات.");
    const d = adapter.insertDoc("Custom Field", { name: `${dt}-${fieldname}`, dt, label, fieldname, fieldtype, options: opts.options ?? "", insert_after: opts.insert_after ?? "", reqd: opts.reqd ? 1 : 0, module: "DIGIT HR" });
    return ok(`Field ${label} added to ${dt}.`, `أُضيف الحقل ${label} إلى ${dt}.`, { created: [["Custom Field", d.name]] });
  });
}
/* ------------------------------------------------------------------ PLT-03 cache key */
/** Cache entries are keyed by user + roles + company scope + data version; a switch of account never reads another key. */
export function cacheKey(user = currentUser()): string {
  const roles = [...userRoles(user)].sort().join(",");
  const cos = adapter.list("User Permission").filter((p) => p["user"] === user && p["allow"] === "Company").map((p) => s(p["for_value"])).sort().join(",");
  return `hr|${user}|${hashOf(roles)}|${hashOf(cos)}|${adapter.version()}`;
}
const CACHE = new Map<string, unknown>();
export function cached<T>(name: string, f: () => T, user = currentUser()): T {
  const k = `${cacheKey(user)}|${name}`; if (CACHE.has(k)) return CACHE.get(k) as T;
  const v = f(); CACHE.set(k, v); return v;
}
/** Account switch: drop every cached entry and every other user's local drafts. */
export function onAccountSwitch(user: string): { cache: number; drafts: number } { const c = CACHE.size; CACHE.clear(); return { cache: c, drafts: purgeOtherDrafts(user) }; }
export const cacheSize = () => CACHE.size;

/* ------------------------------------------------------------------ PLT-05 upgrade readiness gate */
export const REGRESSION_SUITES: { id: string; en: string; ar: string; path: string }[] = [
  { id: "hr-unit", en: "HR unit rules", ar: "قواعد الموارد البشرية", path: "src/plugins/digit_hr/*.test.ts" },
  { id: "hr-acceptance", en: "HR acceptance journeys", ar: "رحلات القبول", path: "src/plugins/digit_hr/acceptance/" },
  { id: "hr-r9", en: "R9 owner features", ar: "ميزات R9", path: "src/plugins/digit_hr/r9/r9.test.ts" },
  { id: "hr-r10", en: "Round-2 features", ar: "ميزات الجولة الثانية", path: "src/plugins/digit_hr/r10/" },
  { id: "security", en: "Negative and security tests", ar: "الاختبارات السلبية والأمان", path: "src/plugins/digit_hr/r10/security.test.ts" },
  { id: "g9", en: "Arabic / English screen crawl (G9)", ar: "فحص الشاشات العربية والإنجليزية", path: "scripts/crawl_routes.py" },
];
/** Record a readiness run from suite results; any failure blocks the release (result "Blocked"). */
export function recordUpgradeRun(version: string, results: Record<string, boolean>, now = nowISO()): ActionResult {
  const failed = REGRESSION_SUITES.filter((x) => results[x.id] !== true);
  const d = adapter.insertDoc("DIGIT Upgrade Readiness Run", { run_on: now, hrms_version: version, checks: REGRESSION_SUITES.length, failures: failed.length, result: failed.length ? "Blocked" : "Ready", details: failed.length ? failed.map((x) => `${x.en}: failed or not run`).join("\n") : "All suites passed" });
  return failed.length ? { ...fail(`Release blocked: ${failed.length} suite(s) failed or not run.`, `النشر موقوف: ${failed.length} مجموعة فشلت أو لم تُشغَّل.`, failed.map((x) => x.en)), created: [["DIGIT Upgrade Readiness Run", d.name]] }
    : ok("All regression suites passed; the update may be released.", "نجحت كل مجموعات التراجع؛ يمكن نشر التحديث.", { created: [["DIGIT Upgrade Readiness Run", d.name]] });
}
export const releaseAllowed = () => { const last = adapter.list("DIGIT Upgrade Readiness Run").sort((a, b) => s(b["run_on"]).localeCompare(s(a["run_on"])))[0]; return !!last && last["result"] === "Ready"; };

/* ------------------------------------------------------------------ SEC-04 system usage */
export interface UsageRow { user: string; full_name: string; actions: number; views: number; exports: number; last_seen: string; days_active: number }
/** Usage per user over a window from Activity Log, Access Log, Version and Comment records (no personal content). */
export function systemUsage(from: string, to: string, user = currentUser()): { rows: UsageRow[]; totals: { users: number; actions: number; exports: number; inactive: number } } {
  if (!userRoles(user).some((r) => ["System Manager", "HR Admin", "HR Manager", "HR Auditor", "CHRO"].includes(r)) && user !== "Administrator") return { rows: [], totals: { users: 0, actions: 0, exports: 0, inactive: 0 } };
  const inWin = (t: unknown) => { const d = s(t).slice(0, 10); return d >= from && d <= to; };
  const map = new Map<string, UsageRow & { days: Set<string> }>();
  const row = (u: string) => { let r = map.get(u); if (!r) { const ud = adapter.get("User", u); r = { user: u, full_name: s(ud?.["full_name"]) || u, actions: 0, views: 0, exports: 0, last_seen: "", days_active: 0, days: new Set() }; map.set(u, r); } return r; };
  const touch = (r: UsageRow & { days: Set<string> }, t: string) => { r.days.add(t.slice(0, 10)); if (t > r.last_seen) r.last_seen = t; };
  for (const a of adapter.list("Activity Log")) if (inWin(a["communication_date"] || a["creation"]) && s(a["user"] || a["owner"])) { const r = row(s(a["user"] || a["owner"])); r.views++; touch(r, s(a["communication_date"] || a["creation"])); }
  for (const a of adapter.list("Access Log")) if (inWin(a["timestamp"] || a["creation"]) && s(a["user"])) { const r = row(s(a["user"])); r.exports++; touch(r, s(a["timestamp"] || a["creation"])); }
  for (const v of adapter.list("Version")) if (inWin(v["creation"]) && s(v["owner"])) { const r = row(s(v["owner"])); r.actions++; touch(r, s(v["creation"])); }
  for (const c of adapter.list("Comment")) if (inWin(c["creation"]) && s(c["comment_email"] || c["owner"])) { const r = row(s(c["comment_email"] || c["owner"])); r.actions++; touch(r, s(c["creation"])); }
  const rows = [...map.values()].map(({ days, ...r }) => ({ ...r, days_active: days.size })).sort((a, b) => b.actions + b.views - (a.actions + a.views));
  const enabled = adapter.list("User").filter((u) => Number(u["enabled"] ?? 1) === 1 && s(u["user_type"]) !== "Website User").length;
  return { rows, totals: { users: rows.length, actions: rows.reduce((a, r) => a + r.actions, 0), exports: rows.reduce((a, r) => a + r.exports, 0), inactive: Math.max(0, enabled - rows.length) } };
}
