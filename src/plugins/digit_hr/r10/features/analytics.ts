/**
 * Round-2 analytics: ANL-02 report wizard (field dictionary from the DocType definition with an Arabic label and a
 * plain definition per column, live preview, permission-checked rows, sensitive fields only for level-1 readers),
 * ANL-05 report schedules (native Auto Email Report records; the run builds the CSV with Arabic or English headings and
 * hands it to the e-mail provider queue), ANL-09 people-analytics assistant (rule-based answers from scoped records;
 * an AI provider can be switched on later in the provider settings, AI is Off by default).
 */
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { currentUser, levelAccess } from "@/lib/session";
import { translateTo } from "@/i18n";
import { RUNNERS } from "@/lib/reportRunner";
import { scopedList } from "../../compat/scope";
import { providerMode, queueExchange } from "../providers";
import { toCsv } from "./payroll";
import { fold } from "./platform";
import { guarded, ok, fail, s, n, d10, todayISO, nowISO, addDays, type ActionResult } from "../write";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const r2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------------------------------------------ ANL-02 report wizard */
export interface DictField { fieldname: string; label: [string, string]; fieldtype: string; options: string; definition: [string, string]; sensitive: boolean }
const SKIP = /Break$|^HTML$|^Button$|^Table|^Image$|^Attach/;
/** Field dictionary of a DocType: every reportable column with Arabic label, type and a plain definition. */
export function fieldDictionary(dt: string, user = currentUser()): DictField[] {
  const meta = cachedMeta(dt); if (!meta) return [];
  const lv = levelAccess(meta, user);
  const base: DictField[] = [{ fieldname: "name", label: ["ID", "المعرّف"], fieldtype: "Data", options: "", definition: [`Unique ID of the ${dt}`, `المعرّف الفريد لـ ${translateTo(dt, "ar")}`], sensitive: false }];
  for (const f of meta.fields ?? []) {
    const ft = s(f.fieldtype); if (SKIP.test(ft) || !f.fieldname) continue;
    const pl = Number(f["permlevel"] ?? 0); if (!lv.read.has(pl)) continue;
    const label = s(f.label) || s(f.fieldname); const ar = translateTo(label, "ar");
    const how = ft === "Link" ? [`Linked ${s(f.options)} record`, `سجل ${translateTo(s(f.options), "ar")} المرتبط`] : ft === "Select" ? [`One of: ${s(f.options).split("\n").filter(Boolean).join(", ")}`, `أحد الخيارات: ${s(f.options).split("\n").filter(Boolean).map((o) => translateTo(o, "ar")).join("، ")}`] : ft === "Currency" ? ["Amount in the record currency (SAR)", "مبلغ بعملة السجل (ريال)"] : ft === "Date" || ft === "Datetime" ? ["Calendar date", "تاريخ"] : ft === "Check" ? ["Yes / No", "نعم / لا"] : ["Value as entered", "القيمة كما أُدخلت"];
    base.push({ fieldname: s(f.fieldname), label: [label, ar], fieldtype: ft, options: s(f.options), definition: [`${s(f.description) || `${label} on the ${dt}`}. ${how[0]}`, `${ar} في ${translateTo(dt, "ar")}. ${how[1]}`], sensitive: pl > 0 });
  }
  return base;
}
export type Op = "=" | "!=" | ">" | "<" | ">=" | "<=" | "like" | "in";
export interface WizardSpec { doctype: string; columns: string[]; filters?: [string, Op, string][]; groupBy?: string; aggregate?: { fn: "count" | "sum" | "avg"; field?: string }; limit?: number; sort?: string }
const match = (v: unknown, op: Op, want: string) => {
  const a = s(v); const x = Number(a), y = Number(want); const num = a !== "" && want !== "" && !Number.isNaN(x) && !Number.isNaN(y);
  switch (op) { case "=": return a === want; case "!=": return a !== want; case ">": return num ? x > y : a > want; case "<": return num ? x < y : a < want; case ">=": return num ? x >= y : a >= want; case "<=": return num ? x <= y : a <= want; case "like": return fold(a).includes(fold(want.replace(/%/g, ""))); case "in": return want.split(",").map((t) => t.trim()).includes(a); }
};
/** Run a wizard spec over permitted rows; columns outside the user's field levels are refused, not blanked. */
export function runWizard(spec: WizardSpec, user = currentUser()): { columns: { key: string; label: [string, string]; numeric?: boolean }[]; rows: Record<string, unknown>[]; totals: Record<string, number>; total: number; refused: string[] } {
  const dict = fieldDictionary(spec.doctype, user); const known = new Map(dict.map((f) => [f.fieldname, f]));
  const refused = [...spec.columns, ...(spec.filters ?? []).map((f) => f[0]), ...(spec.groupBy ? [spec.groupBy] : []), ...(spec.aggregate?.field ? [spec.aggregate.field] : [])].filter((c) => !known.has(c));
  const cols = spec.columns.filter((c) => known.has(c));
  let rows = list(spec.doctype, user).filter((d) => Number(d.docstatus ?? 0) !== 2 && (spec.filters ?? []).every(([f, op, v]) => known.has(f) && match(d[f], op, v)));
  const total = rows.length;
  const numeric = (f: string) => ["Currency", "Int", "Float", "Percent"].includes(known.get(f)?.fieldtype ?? "");
  if (spec.groupBy && known.has(spec.groupBy)) {
    const g = new Map<string, Doc[]>(); for (const d of rows) { const k = s(d[spec.groupBy]) || "—"; const a = g.get(k); if (a) a.push(d); else g.set(k, [d]); }
    const fn = spec.aggregate?.fn ?? "count"; const af = spec.aggregate?.field;
    const out = [...g].map(([k, v]) => ({ [spec.groupBy!]: k, count: v.length, ...(af && fn !== "count" ? { [af]: r2(fn === "sum" ? v.reduce((a, d) => a + n(d[af]), 0) : v.reduce((a, d) => a + n(d[af]), 0) / (v.length || 1)) } : {}) }));
    out.sort((a, b) => n(b["count"]) - n(a["count"]));
    const gl = known.get(spec.groupBy)!.label;
    const columns = [{ key: spec.groupBy, label: gl }, { key: "count", label: ["Count", "العدد"] as [string, string], numeric: true }, ...(af && fn !== "count" ? [{ key: af, label: [`${fn === "sum" ? "Sum" : "Average"} of ${known.get(af)?.label[0] ?? af}`, `${fn === "sum" ? "مجموع" : "متوسط"} ${known.get(af)?.label[1] ?? af}`] as [string, string], numeric: true }] : [])];
    return { columns, rows: out, totals: { count: total, ...(af && fn === "sum" ? { [af]: r2(rows.reduce((a, d) => a + n(d[af]), 0)) } : {}) }, total, refused };
  }
  if (spec.sort && known.has(spec.sort)) rows = [...rows].sort((a, b) => (numeric(spec.sort!) ? n(b[spec.sort!]) - n(a[spec.sort!]) : s(a[spec.sort!]).localeCompare(s(b[spec.sort!]))));
  const out = rows.slice(0, spec.limit ?? 20).map((d) => Object.fromEntries(["name", ...cols.filter((c) => c !== "name")].map((c) => [c, d[c] ?? ""])));
  const columns = ["name", ...cols.filter((c) => c !== "name")].map((c) => ({ key: c, label: known.get(c)!.label, ...(numeric(c) ? { numeric: true } : {}) }));
  const totals = Object.fromEntries(cols.filter(numeric).map((c) => [c, r2(rows.reduce((a, d) => a + n(d[c]), 0))]));
  return { columns, rows: out, totals, total, refused };
}

/* ------------------------------------------------------------------ ANL-05 schedules */
export type Freq = "Daily" | "Weekly" | "Monthly";
/** A native Auto Email Report for an HR report (filters, recipients, frequency, CSV/XLSX, Arabic or English headings). */
export function scheduleReport(report: string, emailTo: string[], frequency: Freq, filters: Record<string, string> = {}, opts: { lang?: "ar" | "en"; format?: "CSV" | "XLSX"; dayOfWeek?: string } = {}, user = currentUser()): ActionResult {
  return guarded(() => {
    if (!RUNNERS[report]) return fail(`Report ${report} is not available.`, `التقرير ${report} غير متاح.`);
    const bad = emailTo.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)); if (!emailTo.length || bad.length) return fail(`Recipient address not valid: ${bad.join(", ") || "(none)"}`, `عنوان المستلم غير صالح: ${bad.join("، ") || "(لا يوجد)"}`);
    const d = adapter.insertDoc("Auto Email Report", { report, user, enabled: 1, report_type: "Script Report", send_if_data: 1, filters: JSON.stringify(filters), email_to: emailTo.join("\n"), frequency, day_of_week: opts.dayOfWeek ?? "Sunday", format: opts.format ?? "CSV", description: `lang:${opts.lang ?? "ar"}`, data_modified_till: 0, no_of_rows: 1000 });
    return ok(`${report} scheduled ${frequency.toLowerCase()} to ${emailTo.length} recipient(s).`, `جُدول ${report} (${translateTo(frequency, "ar")}) إلى ${emailTo.length} مستلم.`, { created: [["Auto Email Report", d.name]] });
  });
}
const due = (d: Doc, on: string) => {
  const last = d10(d["last_sent_on"]); if (!last) return true;
  const f = s(d["frequency"]); return f === "Daily" ? last < on : f === "Weekly" ? addDays(last, 7) <= on : last.slice(0, 7) < on.slice(0, 7);
};
/** Build every due schedule now: one e-mail exchange carrying the CSV per schedule and period (idempotent). */
export function runDueReports(on = todayISO()): { sent: number; skipped: number; files: { report: string; csv: string }[] } {
  let sent = 0, skipped = 0; const files: { report: string; csv: string }[] = [];
  for (const d of adapter.list("Auto Email Report").filter((x) => Number(x["enabled"] ?? 1) === 1 && RUNNERS[s(x["report"])])) {
    if (!due(d, on)) { skipped++; continue; }
    let f: Record<string, string> = {}; try { f = JSON.parse(s(d["filters"]) || "{}") as Record<string, string>; } catch { f = {}; }
    const res = RUNNERS[s(d["report"])]!.run(f);
    if (Number(d["send_if_data"] ?? 1) === 1 && !res.rows.length) { skipped++; continue; }
    const ar = s(d["description"]).includes("lang:ar");
    const csv = toCsv({ columns: res.columns.map((c) => ({ key: c.fieldname, label: [c.label, translateTo(c.label, "ar")] as [string, string] })), rows: res.rows as Record<string, unknown>[] }, ar);
    const q = queueExchange({ provider: "Email", operation: "Scheduled Report", doctype: "Auto Email Report", name: d.name, payload: { to: s(d["email_to"]).split("\n"), subject: s(d["report"]), period: on, rows: res.rows.length }, file_name: `${s(d["report"]).replace(/\W+/g, "_")}-${on}.${s(d["format"]).toLowerCase() === "xlsx" ? "xlsx" : "csv"}`, key: `report|${d.name}|${on}` });
    if (q.refused) { skipped++; continue; }
    adapter.update("Auto Email Report", d.name, { last_sent_on: on });
    files.push({ report: s(d["report"]), csv }); sent++;
  }
  return { sent, skipped, files };
}

/* ------------------------------------------------------------------ ANL-09 assistant */
interface Answer { text: [string, string]; rows: Record<string, unknown>[]; source: string; mode: "Rules" | "AI" }
const INTENTS: { id: string; words: RegExp; run: (user: string, q: string) => Answer }[] = [
  { id: "headcount", words: /headcount|how many employees|عدد الموظفين|كم موظف/i, run: (u) => { const e = list("Employee", u).filter((x) => s(x["status"]) === "Active"); const by = groupCount(e, "company"); return { text: [`${e.length} active employees in your scope.`, `${e.length} موظفًا نشطًا ضمن صلاحيتك.`], rows: by, source: "Employee (status Active)", mode: "Rules" }; } },
  { id: "leave", words: /on leave|leave today|في إجازة|إجازة اليوم/i, run: (u) => { const t = todayISO(); const l = list("Leave Application", u).filter((x) => Number(x.docstatus) === 1 && s(x["status"]) === "Approved" && d10(x["from_date"]) <= t && d10(x["to_date"]) >= t); return { text: [`${l.length} employees are on approved leave today.`, `${l.length} موظفًا في إجازة معتمدة اليوم.`], rows: l.map((x) => ({ employee: x["employee_name"], leave_type: x["leave_type"], to: d10(x["to_date"]) })), source: "Leave Application (approved, covering today)", mode: "Rules" }; } },
  { id: "turnover", words: /turnover|attrition|دوران|استقالات|ترك العمل/i, run: (u) => { const from = addDays(todayISO(), -365); const e = list("Employee", u); const ex = e.filter((x) => d10(x["relieving_date"]) >= from); const pct = e.length ? r2(ex.length / e.length * 100) : 0; return { text: [`${ex.length} leavers in the last 12 months (${pct}% of ${e.length}).`, `${ex.length} مغادرًا في آخر 12 شهرًا (${pct}% من ${e.length}).`], rows: groupCount(ex, "department"), source: "Employee.relieving_date in the last 365 days", mode: "Rules" }; } },
  { id: "expiring", words: /expir|iqama|passport|تنتهي|الإقامة|جواز/i, run: (u) => { const lim = addDays(todayISO(), 60); const d = list("DIGIT Employee Document", u).filter((x) => d10(x["expiry_date"]) && d10(x["expiry_date"]) <= lim); return { text: [`${d.length} employee documents expire within 60 days.`, `${d.length} وثيقة موظف تنتهي خلال 60 يومًا.`], rows: d.map((x) => ({ employee: x["employee_name"], document: x["document_type"], expiry: d10(x["expiry_date"]) })), source: "DIGIT Employee Document.expiry_date ≤ today + 60", mode: "Rules" }; } },
  { id: "payroll", words: /payroll cost|salar(y|ies) total|تكلفة الرواتب|إجمالي الرواتب/i, run: (u) => { const sl = list("Salary Slip", u).filter((x) => Number(x.docstatus) === 1); const last = sl.map((x) => d10(x["start_date"]).slice(0, 7)).sort().pop() ?? ""; const m = sl.filter((x) => d10(x["start_date"]).startsWith(last)); const g = r2(m.reduce((a, x) => a + n(x["gross_pay"]), 0)); return { text: [`Gross payroll for ${last || "—"}: ${g} SAR across ${m.length} slips.`, `إجمالي رواتب ${last || "—"}: ${g} ريال في ${m.length} قسيمة.`], rows: groupSum(m, "department", "gross_pay"), source: "Salary Slip (submitted, latest month)", mode: "Rules" }; } },
  { id: "open-cases", words: /cases|requests open|طلبات مفتوحة|قضايا/i, run: (u) => { const c = list("DIGIT HR Service Case", u).filter((x) => !["Resolved", "Closed", "Cancelled"].includes(s(x["case_status"]) || "Open")); return { text: [`${c.length} HR service cases are open.`, `${c.length} طلب خدمة مفتوح.`], rows: groupCount(c, "category"), source: "DIGIT HR Service Case (not resolved / closed)", mode: "Rules" }; } },
];
function groupCount(rows: Doc[], f: string) { const m = new Map<string, number>(); for (const r of rows) m.set(s(r[f]) || "—", (m.get(s(r[f]) || "—") ?? 0) + 1); return [...m].map(([k, v]) => ({ [f]: k, count: v })).sort((a, b) => b.count - a.count); }
function groupSum(rows: Doc[], f: string, v: string) { const m = new Map<string, number>(); for (const r of rows) m.set(s(r[f]) || "—", r2((m.get(s(r[f]) || "—") ?? 0) + n(r[v]))); return [...m].map(([k, x]) => ({ [f]: k, [v]: x })).sort((a, b) => n(b[v]) - n(a[v])); }
export const ASSISTANT_TOPICS = INTENTS.map((i) => i.id);
/** Answer a people-analytics question from the asker's own scope; unknown questions list what it can answer. */
export function askAssistant(q: string, user = currentUser()): Answer {
  const hit = INTENTS.find((i) => i.words.test(q));
  const mode = providerMode("AI") === "Off" ? "Rules" : "AI";
  if (!hit) return { text: ["I can answer: headcount, who is on leave today, turnover, expiring documents, payroll cost, open HR cases.", "أستطيع الإجابة عن: عدد الموظفين، من في إجازة اليوم، الدوران، الوثائق التي تنتهي، تكلفة الرواتب، طلبات الخدمة المفتوحة."], rows: [], source: "—", mode: "Rules" };
  const a = hit.run(user, q);
  if (mode === "AI") queueExchange({ provider: "AI", operation: "Answer", payload: { question: q, topic: hit.id, rows: a.rows.length }, key: `ai|${user}|${hit.id}|${nowISO().slice(0, 13)}` });
  return { ...a, mode: "Rules" };
}

