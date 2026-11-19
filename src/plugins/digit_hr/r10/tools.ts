/**
 * HR round-2 section tools: every round-2 feature that is a page-level action or view, declared once with its section,
 * inputs and runner, and rendered by components/digithr/product/SectionTools.tsx in the section's Documents & work tab
 * (`?tool=<id>` opens one). Runners only call the feature modules (r10/features/*), which check scope and write through
 * the adapter, so the screen never holds business rules. Cell values: text / number / [en, ar] / { doc } / { to }.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { scopedGet, scopedList } from "../compat/scope";
import { RUNNERS } from "@/lib/reportRunner";
import { s, n, todayISO, addDays, type ActionResult } from "./write";
import { PEX, processQueue, retryExchange } from "./providers";
import * as P from "./features/platform";
import * as A from "./features/analytics";
import * as Pay from "./features/payroll";
import * as T from "./features/talent";
import * as Sv from "./features/service";
import * as Tm from "./features/time";
import * as G from "./features/guards";
import * as St from "./features/setup";
import * as B from "./features/rewards";
import * as Nv from "./features/native";
import * as Cl from "./features/closing";

export type Bi = [string, string];
export type Cell = string | number | Bi | { doc: [string, string]; label?: string } | { to: string; label: Bi };
export interface ToolTable { columns: { key: string; label: Bi; numeric?: boolean; money?: boolean }[]; rows: Record<string, Cell>[]; totals?: Record<string, number> }
export interface ToolOut { ok: boolean; message?: Bi; errors?: string[]; warnings?: string[]; created?: [string, string][]; table?: ToolTable; file?: { name: string; mime: string; text: string } }
export type Values = Record<string, string>;
export interface ToolInput {
  key: string; label: Bi; type: "text" | "textarea" | "number" | "date" | "month" | "select" | "link" | "check";
  doctype?: string; title?: string; where?: (d: Doc, v: Values) => boolean; options?: [string, string, string][] | ((v: Values) => [string, string, string][]);
  def?: string | ((user: string) => string); optional?: boolean; hint?: Bi;
}
export interface HrTool { id: string; features: string[]; sections: string[]; title: Bi; summary: Bi; kind: "view" | "action"; inputs: ToolInput[]; run: (v: Values, user: string) => ToolOut; cta?: Bi }

const col = (key: string, en: string, ar: string, extra: { numeric?: boolean; money?: boolean } = {}) => ({ key, label: [en, ar] as Bi, ...extra });
const doc = (dt: string, name: unknown, label?: unknown): Cell => (s(name) ? { doc: [dt, s(name)], ...(s(label) ? { label: s(label) } : {}) } : "");
const fromAction = (r: ActionResult & { warnings?: string[] | undefined }, table?: ToolTable): ToolOut => ({ ok: r.ok, message: r.message, ...(r.errors?.length ? { errors: r.errors } : {}), ...(r.warnings?.length ? { warnings: r.warnings } : {}), ...(r.created?.length ? { created: r.created } : {}), ...(table ? { table } : {}) });
const view = (table: ToolTable, message?: Bi): ToolOut => ({ ok: true, table, ...(message ? { message } : {}) });
const firstCompany = (user: string) => { try { return scopedList("Company", user)[0]?.name ?? ""; } catch { return ""; } };
const monthStart = () => `${todayISO().slice(0, 7)}-01`;
const yesNo: [string, string, string][] = [["0", "No", "لا"], ["1", "Yes", "نعم"]];
const yn = (v: unknown): Bi => (Number(v) || v === true ? ["Yes", "نعم"] : ["No", "لا"]);

const COMPANY: ToolInput = { key: "company", label: ["Company", "الشركة"], type: "link", doctype: "Company", def: firstCompany };
const EMPLOYEE: ToolInput = { key: "employee", label: ["Employee", "الموظف"], type: "link", doctype: "Employee", title: "employee_name", where: (d) => s(d["status"] || "Active") === "Active" };
const FROM: ToolInput = { key: "from", label: ["From", "من"], type: "date", def: monthStart };
const TO: ToolInput = { key: "to", label: ["To", "إلى"], type: "date", def: () => todayISO() };
const HR_DOCTYPES: [string, string, string][] = ["Employee", "Leave Application", "Attendance", "Salary Slip", "Job Applicant", "Job Opening", "Employee Checkin", "Expense Claim", "Appraisal", "DIGIT HR Service Case", "DIGIT Employee Dependent", "Training Event"].map((d) => [d, d, d]);

/* ------------------------------------------------------------------ the registry */
export const HR_TOOLS: HrTool[] = [
  // ---------- 06.1 command centers / everywhere: search
  { id: "search", features: ["SHL-03"], sections: ["06.1", "05.1", "05.2"], kind: "view", title: ["Search people, documents and actions", "البحث عن الموظفين والمستندات والإجراءات"],
    summary: ["Type a name, employee number, document or task (Arabic or English); results respect your permissions.", "اكتب اسمًا أو رقم موظف أو مستندًا أو مهمة (بالعربية أو الإنجليزية)؛ النتائج حسب صلاحياتك."],
    inputs: [{ key: "q", label: ["Search", "بحث"], type: "text", def: "" }],
    run: (v, u) => { const hits = v["q"]!.trim().length < 2 ? [] : P.hrSearch(v["q"]!, u, 30); return view({ columns: [col("result", "Result", "النتيجة"), col("kind", "Type", "النوع"), col("subtitle", "Details", "التفاصيل")],
      rows: hits.map((h) => ({ result: h.doctype && h.name ? doc(h.doctype, h.name, h.title[0]) : { to: h.to, label: h.title }, kind: KIND[h.kind], subtitle: h.subtitle })) }, hits.length || v["q"]!.trim().length < 2 ? undefined : ["Nothing found.", "لا توجد نتائج."]); } },

  // ---------- 07.2 privacy, access and identity
  { id: "session-policy", features: ["SHL-06"], sections: ["07.2"], kind: "action", title: ["Sign-in and password reset", "تسجيل الدخول واستعادة كلمة المرور"], cta: ["Send reset link", "إرسال رابط الاستعادة"],
    summary: ["Session length, MFA and reset-link lifetime come from the policy settings; a reset link is sent through the e-mail provider and the answer never reveals whether an account exists.", "مدة الجلسة والتحقق الثنائي وصلاحية رابط الاستعادة من إعدادات السياسة؛ يُرسل الرابط عبر مزود البريد ولا يكشف الرد وجود الحساب."],
    inputs: [{ key: "user", label: ["User", "المستخدم"], type: "link", doctype: "User", title: "full_name" }],
    run: (v) => { const p = P.sessionPolicy(v["user"]!); const r = P.requestPasswordReset(v["user"]!);
      return fromAction(r, { columns: [col("k", "Setting", "الإعداد"), col("v", "Value", "القيمة")], rows: [{ k: ["Session expires after (hours)", "تنتهي الجلسة بعد (ساعات)"], v: p.expiryHours }, { k: ["MFA required", "التحقق الثنائي مطلوب"], v: yn(p.mfaRequired) }, { k: ["Reset link valid (minutes)", "صلاحية رابط الاستعادة (دقائق)"], v: p.resetMinutes }] }); } },
  { id: "identity-sync", features: ["SEC-05"], sections: ["07.2", "07.4"], kind: "action", title: ["Identity provider sync and MFA log", "مزامنة مزود الهوية وسجل التحقق الثنائي"], cta: ["Sync now", "مزامنة الآن"],
    summary: ["Pushes active employees' accounts to the identity provider (simulated until a provider is set), disables leavers, and lists sign-in / MFA events.", "يرسل حسابات الموظفين النشطين إلى مزود الهوية (محاكاة حتى يُضبط المزود) ويعطّل المغادرين ويعرض أحداث الدخول والتحقق."],
    inputs: [COMPANY],
    run: (v, u) => { const r = P.syncIdentityProvider(v["company"] || undefined, u); const log = adapter.list("DIGIT Identity Event").sort((a, b) => s(b["event_time"]).localeCompare(s(a["event_time"]))).slice(0, 25);
      return fromAction(r, { columns: [col("on", "When", "الوقت"), col("user", "User", "المستخدم"), col("type", "Event", "الحدث"), col("provider", "Provider", "المزود")], rows: log.map((e) => ({ on: s(e["event_time"]), user: s(e["user"]), type: s(e["event_type"]), provider: s(e["provider"]) })) }); } },
  { id: "system-usage", features: ["SEC-04"], sections: ["07.2", "06.3"], kind: "view", title: ["System usage", "استخدام النظام"],
    summary: ["Actions, views and exports per user from the activity, access and change logs; no personal content is read.", "الإجراءات والمشاهدات والتصدير لكل مستخدم من سجلات النشاط والوصول والتغيير؛ دون قراءة أي محتوى شخصي."],
    inputs: [FROM, TO],
    run: (v, u) => { const r = P.systemUsage(v["from"]!, v["to"]!, u); return view({ columns: [col("user", "User", "المستخدم"), col("actions", "Actions", "الإجراءات", { numeric: true }), col("views", "Views", "المشاهدات", { numeric: true }), col("exports", "Exports", "التصدير", { numeric: true }), col("days", "Active days", "أيام النشاط", { numeric: true }), col("last", "Last seen", "آخر ظهور")],
      rows: r.rows.map((x) => ({ user: x.full_name || x.user, actions: x.actions, views: x.views, exports: x.exports, days: x.days_active, last: x.last_seen })), totals: { actions: r.totals.actions, exports: r.totals.exports } },
      [`${r.totals.users} users, ${r.totals.inactive} inactive in the period.`, `${r.totals.users} مستخدم، ${r.totals.inactive} غير نشط في الفترة.`]); } },
  { id: "session-cache", features: ["PLT-03"], sections: ["07.2"], kind: "action", title: ["Account switch isolation", "عزل البيانات عند تبديل الحساب"], cta: ["Clear for this account", "مسح لهذا الحساب"],
    summary: ["Cached lists are keyed by user, roles and company; switching account clears the cache and other users' saved drafts on this device.", "القوائم المخزنة مؤقتًا مرتبطة بالمستخدم والأدوار والشركة؛ تبديل الحساب يمسحها ويمسح مسودات المستخدمين الآخرين على هذا الجهاز."],
    inputs: [],
    run: (_v, u) => { const key = P.cacheKey(u); const r = P.onAccountSwitch(u); return { ok: true, message: [`Cleared ${r.cache} cached list(s) and ${r.drafts} other draft(s).`, `مُسحت ${r.cache} قائمة مخزنة و${r.drafts} مسودة أخرى.`], table: { columns: [col("k", "Cache key", "مفتاح التخزين")], rows: [{ k: key }] } }; } },
  { id: "retention", features: ["REC-14"], sections: ["07.2", "02.1"], kind: "action", title: ["Candidate data retention", "الاحتفاظ ببيانات المرشحين"], cta: ["Anonymise", "إخفاء الهوية"],
    summary: ["Applicants past their retention date (setting) are listed; anonymising removes name, contact and résumé and keeps the counts.", "يُعرض المرشحون الذين تجاوزوا تاريخ الاحتفاظ (إعداد)؛ إخفاء الهوية يحذف الاسم والتواصل والسيرة ويُبقي الأعداد."],
    inputs: [{ key: "applicant", label: ["Applicant to anonymise", "المرشح المراد إخفاء هويته"], type: "link", doctype: "Job Applicant", title: "applicant_name", optional: true, where: (d) => !Number(d["digit_anonymised"]) }],
    run: (v, u) => { const due = T.retentionSweep(); const table: ToolTable = { columns: [col("a", "Applicant", "المرشح"), col("until", "Retain until", "الاحتفاظ حتى"), col("status", "Status", "الحالة")], rows: due.map((d) => ({ a: doc("Job Applicant", d.name, d["applicant_name"]), until: s(d["retain_until"]), status: s(d["status"]) })) };
      return v["applicant"] ? fromAction(T.anonymiseApplicant(v["applicant"]!, u), table) : view(table, [`${due.length} applicant(s) past retention.`, `${due.length} مرشح تجاوز مدة الاحتفاظ.`]); } },

  // ---------- 07.1 setup
  { id: "bulk-update", features: ["SHL-10"], sections: ["07.1", "01.4"], kind: "action", title: ["Bulk update employees", "تحديث جماعي للموظفين"], cta: ["Apply", "تطبيق"],
    summary: ["All or nothing: one error cancels every change. One by one: each row gets its own result. Mandatory fields and rules are checked per row.", "الكل أو لا شيء: خطأ واحد يلغي كل التغييرات. واحدًا واحدًا: لكل صف نتيجته. تُفحص الحقول الإلزامية والقواعد لكل صف."],
    inputs: [COMPANY, { key: "department", label: ["Department (optional)", "القسم (اختياري)"], type: "link", doctype: "Department", optional: true, where: (d, v) => !v["company"] || d["company"] === v["company"] },
      { key: "field", label: ["Field", "الحقل"], type: "select", options: [["branch", "Branch", "الفرع"], ["department", "Department", "القسم"], ["designation", "Designation", "المسمى الوظيفي"], ["grade", "Grade", "الدرجة"], ["holiday_list", "Holiday list", "قائمة العطل"], ["default_shift", "Default shift", "الوردية الافتراضية"]] },
      { key: "value", label: ["New value", "القيمة الجديدة"], type: "text" }, { key: "mode", label: ["Mode", "الطريقة"], type: "select", options: [["atomic", "All or nothing", "الكل أو لا شيء"], ["each", "One by one", "واحدًا واحدًا"]] }],
    run: (v, u) => { const emps = scopedList("Employee", u).filter((e) => e["company"] === v["company"] && s(e["status"] || "Active") === "Active" && (!v["department"] || e["department"] === v["department"]));
      const r = P.applyBulk(emps.map((e) => ({ op: "update" as const, doctype: "Employee", name: e.name, values: { [v["field"]!]: v["value"] } })), v["mode"] === "each" ? "each" : "atomic", u);
      return { ok: r.failed === 0, message: [`${r.ok} updated, ${r.failed} failed${r.mode === "atomic" && r.failed ? " — nothing was changed" : ""}.`, `حُدّث ${r.ok}، فشل ${r.failed}${r.mode === "atomic" && r.failed ? " — لم يُغيَّر شيء" : ""}.`],
        table: { columns: [col("emp", "Employee", "الموظف"), col("res", "Result", "النتيجة"), col("err", "Reason", "السبب")], rows: r.results.map((x) => ({ emp: doc("Employee", emps[x.i]?.name, emps[x.i]?.["employee_name"]), res: x.ok ? ["Done", "تم"] : ["Failed", "فشل"], err: x.errors.join("; ") })) } }; } },
  { id: "custom-field", features: ["PLT-02"], sections: ["07.1"], kind: "action", title: ["Add a field without code", "إضافة حقل بدون برمجة"], cta: ["Add field", "إضافة الحقل"],
    summary: ["Adds a field to an HR document for everyone at once; it is exported with the app for the real system.", "يضيف حقلًا إلى مستند موارد بشرية للجميع فورًا؛ ويُصدَّر مع التطبيق للنظام الحقيقي."],
    inputs: [{ key: "dt", label: ["Document", "المستند"], type: "select", options: HR_DOCTYPES }, { key: "label", label: ["Field label", "اسم الحقل"], type: "text" },
      { key: "fieldtype", label: ["Type", "النوع"], type: "select", options: [["Data", "Text", "نص"], ["Int", "Whole number", "عدد صحيح"], ["Currency", "Amount", "مبلغ"], ["Date", "Date", "تاريخ"], ["Check", "Yes / No", "نعم / لا"], ["Select", "Choice", "اختيار"], ["Small Text", "Long text", "نص طويل"]] },
      { key: "options", label: ["Choices (one per line, for Choice)", "الخيارات (سطر لكل خيار)"], type: "textarea", optional: true }, { key: "reqd", label: ["Mandatory", "إلزامي"], type: "check", optional: true }],
    run: (v, u) => fromAction(P.addCustomField(v["dt"]!, v["label"]!, v["fieldtype"]!, { ...(v["options"] ? { options: v["options"] } : {}), reqd: v["reqd"] === "1" }, u)) },
  { id: "import", features: ["SET-05"], sections: ["07.1", "03.4"], kind: "action", title: ["Bulk data import", "تحميل بيانات جماعي"], cta: ["Run", "تشغيل"],
    summary: ["Check first: every row is validated (mandatory, links, formats, duplicates, rules) and nothing is written. Then import all or nothing, or the valid rows only.", "افحص أولًا: يُتحقق من كل صف (الإلزامي والروابط والصيغ والتكرار والقواعد) دون كتابة شيء. ثم استورد الكل أو لا شيء أو الصفوف الصحيحة فقط."],
    inputs: [{ key: "dt", label: ["Document", "المستند"], type: "select", options: [["DIGIT Employee Dependent", "Employee dependents", "معالو الموظفين"], ["Employee", "Employees", "الموظفون"], ["Attendance", "Attendance", "الحضور"], ["Additional Salary", "Additional salary", "راتب إضافي"], ["Employee Skill Map", "Skills", "المهارات"]] },
      { key: "csv", label: ["CSV (first line = field names)", "ملف CSV (السطر الأول أسماء الحقول)"], type: "textarea" },
      { key: "mode", label: ["Step", "الخطوة"], type: "select", options: [["check", "Check only", "فحص فقط"], ["atomic", "Import all or nothing", "استيراد الكل أو لا شيء"], ["each", "Import valid rows", "استيراد الصفوف الصحيحة"]] }],
    run: (v, u) => { const pc = St.precheckImport(v["dt"]!, v["csv"]!, u); const table: ToolTable = { columns: [col("row", "Row", "الصف", { numeric: true }), col("ok", "Result", "النتيجة"), col("err", "Reason", "السبب")], rows: pc.rows.map((r) => ({ row: r.row, ok: r.ok ? ["Valid", "صحيح"] : ["Error", "خطأ"], err: r.errors.join("; ") })) };
      if (v["mode"] === "check" || !v["mode"]) return { ok: pc.failed === 0, message: [`${pc.valid} valid, ${pc.failed} with errors; nothing was written.`, `${pc.valid} صحيح، ${pc.failed} بأخطاء؛ لم يُكتب شيء.`], table };
      return fromAction(St.runImport(v["dt"]!, v["csv"]!, v["mode"] === "each" ? "each" : "atomic", "import.csv", u), table); } },
  { id: "reference-data", features: ["SET-04"], sections: ["07.1"], kind: "view", title: ["Reference data sets", "مجموعات البيانات المرجعية"],
    summary: ["A company's own set replaces the shared set of the same name; inactive values are hidden from pickers.", "مجموعة الشركة الخاصة تحل محل المجموعة المشتركة بالاسم نفسه؛ القيم غير النشطة مخفية من الاختيار."],
    inputs: [{ key: "set", label: ["Set", "المجموعة"], type: "select", options: () => [...new Set(adapter.list("DIGIT Reference Data Set").map((d) => s(d["set_name"])))].filter(Boolean).map((x) => [x, x, x] as [string, string, string]) }, COMPANY],
    run: (v) => view({ columns: [col("code", "Code", "الرمز"), col("value", "Value", "القيمة"), col("from", "Source", "المصدر")], rows: St.referenceValues(v["set"]!, v["company"] || undefined).map((x) => ({ code: x.code, value: [x.value_en, x.value_ar], from: x.from === "Company" ? ["Company set", "مجموعة الشركة"] : ["Shared set", "المجموعة المشتركة"] })) }) },

  // ---------- 01.1 organization
  { id: "org-wizard", features: ["SET-02"], sections: ["01.1"], kind: "action", title: ["Organisation wizard", "معالج الهيكل المؤسسي"], cta: ["Add", "إضافة"],
    summary: ["Company › branches › departments with headcount; add a branch or a department under its parent and it appears in the tree at once.", "الشركة › الفروع › الأقسام مع عدد الموظفين؛ أضف فرعًا أو قسمًا تحت الأصل ويظهر في الشجرة فورًا."],
    inputs: [COMPANY, { key: "kind", label: ["Add", "إضافة"], type: "select", options: [["department", "Department", "قسم"], ["branch", "Branch", "فرع"]] }, { key: "name", label: ["Name", "الاسم"], type: "text", optional: true },
      { key: "parent", label: ["Under department", "تحت القسم"], type: "link", doctype: "Department", optional: true, where: (d, v) => !v["company"] || d["company"] === v["company"] }],
    run: (v, u) => { const tree = St.orgTree(u); const rows: Record<string, Cell>[] = []; const walk = (nd: St.OrgNode, depth: number) => { rows.push({ unit: `${"— ".repeat(depth)}${nd.label}`, kind: ORG_KIND[nd.kind], headcount: nd.headcount }); nd.children.forEach((c) => walk(c, depth + 1)); };
      tree.filter((c) => !v["company"] || c.name === v["company"]).forEach((c) => walk(c, 0));
      const table: ToolTable = { columns: [col("unit", "Unit", "الوحدة"), col("kind", "Type", "النوع"), col("headcount", "Headcount", "عدد الموظفين", { numeric: true })], rows };
      if (!v["name"]) return view(table);
      const r = St.addOrgUnit(v["kind"] === "branch" ? "branch" : "department", v["name"]!, v["company"]!, v["parent"] || undefined, u);
      return fromAction(r, r.ok ? HR_TOOLS.find((t) => t.id === "org-wizard")!.run({ ...v, name: "" }, u).table : table); } },
  { id: "registration", features: ["SET-03"], sections: ["01.1", "04.3"], kind: "view", title: ["Legal entity registration", "بيانات تسجيل الكيان القانوني"],
    summary: ["CR, GOSI establishment, Ministry establishment and 700 numbers on the company; WPS and GOSI files are refused while the GOSI number is missing.", "السجل التجاري ورقم منشأة التأمينات ورقم منشأة الوزارة والرقم الموحد 700 على الشركة؛ تُرفض ملفات حماية الأجور والتأمينات بدون رقم المنشأة."],
    inputs: [COMPANY],
    run: (v) => { const c = adapter.get("Company", v["company"]!); const gaps = new Set(St.registrationGaps(v["company"]!).map((g) => g.field));
      return view({ columns: [col("f", "Registration", "التسجيل"), col("v", "Value", "القيمة"), col("st", "Status", "الحالة")], rows: St.REG_FIELDS.map(([f, en, ar]) => ({ f: [en, ar], v: s(c?.[f]), st: gaps.has(f) ? ["Missing", "ناقص"] : ["Recorded", "مسجل"] })) },
        St.wpsRegistrationError(v["company"]!) ? ["WPS files are blocked until the GOSI establishment number is recorded.", "ملفات حماية الأجور موقوفة حتى يُسجَّل رقم منشأة التأمينات."] : undefined); } },

  // ---------- 01.3 positions
  { id: "position-approval", features: ["ORG-05"], sections: ["01.3"], kind: "action", title: ["Position approval", "اعتماد المنصب"], cta: ["Apply decision", "تطبيق القرار"],
    summary: ["A position must be approved before a job opening can use it; the approver can never be the person who asked.", "يجب اعتماد المنصب قبل ربطه بوظيفة شاغرة؛ ولا يكون المعتمد هو مقدم الطلب."],
    inputs: [{ key: "position", label: ["Position", "المنصب"], type: "link", doctype: "DIGIT Position", title: "position_title" }, { key: "action", label: ["Decision", "القرار"], type: "select", options: [["Submit for Approval", "Submit for approval", "إرسال للاعتماد"], ["Approve", "Approve", "اعتماد"], ["Reject", "Reject", "رفض"], ["Revise", "Return for revision", "إعادة للتعديل"]] }],
    run: (v, u) => fromAction(St.decidePosition(v["position"]!, v["action"] as "Approve", u), positionsTable(u)) },
  { id: "position-requisition", features: ["ORG-06"], sections: ["01.3", "02.1"], kind: "action", title: ["Position › requisition › opening", "منصب › طلب توظيف › وظيفة شاغرة"], cta: ["Create next step", "إنشاء الخطوة التالية"],
    summary: ["From an approved vacant position create its requisition, then from the approved requisition its opening; position and department are copied once and never twice.", "من منصب شاغر معتمد يُنشأ طلب التوظيف ثم من الطلب المعتمد الوظيفة الشاغرة؛ يُنسخ المنصب والقسم مرة واحدة دون تكرار."],
    inputs: [{ key: "position", label: ["Position", "المنصب"], type: "link", doctype: "DIGIT Position", title: "position_title", optional: true }, { key: "requisition", label: ["or requisition", "أو طلب التوظيف"], type: "link", doctype: "Job Requisition", title: "designation", optional: true }, { key: "reason", label: ["Reason", "السبب"], type: "text", optional: true }],
    run: (v, u) => v["requisition"] ? fromAction(St.openingFromRequisition(v["requisition"]!, u)) : fromAction(St.requisitionFromPosition(v["position"]!, v["reason"] || "Vacancy", u)) },
  { id: "labor-budget", features: ["INT-12"], sections: ["06.2", "01.3"], kind: "action", title: ["Position budget › labour cost budget", "ميزانية المناصب › ميزانية تكلفة العمالة"], cta: ["Create budget lines", "إنشاء بنود الميزانية"],
    summary: ["Split an approved position budget into salary-component budget lines with each component's budget cost code; components without a code are named.", "تقسيم ميزانية مناصب معتمدة إلى بنود حسب مكونات الراتب مع رمز تكلفة كل مكون؛ وتُذكر المكونات التي ليس لها رمز."],
    inputs: [{ key: "position_budget", label: ["Position budget", "ميزانية المناصب"], type: "link", doctype: "DIGIT Position Budget", title: "budget_title", where: (d) => Number(d.docstatus) === 1 || d["budget_status"] === "Approved" }, { key: "project", label: ["Project (optional)", "المشروع (اختياري)"], type: "link", doctype: "Project", title: "project_name", optional: true }],
    run: (v, u) => { const r = St.laborBudgetFromPosition(v["position_budget"]!, v["project"] ?? "", u);
      return fromAction(r, r.rows?.length ? { columns: [col("salary_component", "Salary component", "مكون الراتب"), col("cost_code", "Cost code", "رمز التكلفة"), col("monthly_amount", "Monthly", "شهري", { money: true }), col("annual_amount", "Annual", "سنوي", { money: true })], rows: r.rows.map((x) => ({ salary_component: s(x["salary_component"]), cost_code: s(x["cost_code"]) || "—", monthly_amount: Number(x["monthly_amount"]), annual_amount: Number(x["annual_amount"]) })), totals: { monthly_amount: r.rows.reduce((a, x) => a + Number(x["monthly_amount"]), 0), annual_amount: r.rows.reduce((a, x) => a + Number(x["annual_amount"]), 0) } } : undefined); } },
  { id: "leave-accrual", features: ["LEV-08"], sections: ["03.1"], kind: "view", title: ["Earned leave accrual", "استحقاق الإجازة المكتسبة"],
    summary: ["When each earned-leave credit falls for a policy frequency, from the joining date or the leave period, prorated for a mid-period joiner. Nothing is written.", "متى يُضاف كل رصيد إجازة مكتسبة حسب دورية السياسة، من تاريخ الالتحاق أو بداية فترة الإجازة، مع التناسب لمن يلتحق أثناء الفترة. لا يُكتب شيء."],
    inputs: [{ key: "annual", label: ["Days a year", "الأيام في السنة"], type: "number", def: "21" }, { key: "frequency", label: ["Frequency", "الدورية"], type: "select", def: "Monthly", options: [["Monthly", "Monthly", "شهري"], ["Quarterly", "Quarterly", "ربع سنوي"], ["Half-Yearly", "Half-yearly", "نصف سنوي"], ["Yearly", "Yearly", "سنوي"]] },
      { key: "based", label: ["Counted from", "يُحسب من"], type: "select", def: "Joining Date", options: [["Joining Date", "Joining date", "تاريخ الالتحاق"], ["Leave Period", "Leave period start", "بداية فترة الإجازة"]] },
      { key: "joining", label: ["Joining date", "تاريخ الالتحاق"], type: "date", def: () => `${todayISO().slice(0, 4)}-03-15` }, { key: "from", label: ["Period from", "بداية الفترة"], type: "date", def: () => `${todayISO().slice(0, 4)}-01-01` }, { key: "to", label: ["Period to", "نهاية الفترة"], type: "date", def: () => `${todayISO().slice(0, 4)}-12-31` }],
    run: (v) => { const r = G.leaveAccrual({ annual: Number(v["annual"]) || 0, frequency: (v["frequency"] || "Monthly") as G.Frequency, basedOn: v["based"] === "Leave Period" ? "Leave Period" : "Joining Date", joining: v["joining"] ?? "", periodFrom: v["from"] ?? "", periodTo: v["to"] ?? "" });
      return { ok: true, message: [`Entitlement for the period ${r.cap} days from ${r.start}; ${r.earned} earned by today.`, `الاستحقاق للفترة ${r.cap} يومًا من ${r.start}؛ المكتسب حتى اليوم ${r.earned}.`], table: { columns: [col("on", "Credited on", "تاريخ الإضافة"), col("days", "Days", "الأيام", { numeric: true }), col("total", "Running total", "الإجمالي التراكمي", { numeric: true })], rows: r.steps.map((x) => ({ on: x.on, days: x.days, total: x.total })) } }; } },
  { id: "shifts-after-exit", features: ["SCH-01"], sections: ["03.3"], kind: "view", title: ["Shifts after an exit", "ورديات بعد انتهاء الخدمة"],
    summary: ["Shift assignments that still run past the employee's relieving date; relieving now ends them automatically, older ones are listed here.", "تعيينات الورديات الممتدة بعد تاريخ انتهاء خدمة الموظف؛ يُنهيها إنهاء الخدمة الآن تلقائيًا، وتُعرض هنا القديمة منها."],
    inputs: [],
    run: (_v, u) => { const rows = G.shiftsAfterExit().filter((a) => { try { return !!scopedGet("Shift Assignment", a.name, u); } catch { return false; } });
      return { ok: true, message: rows.length ? [`${rows.length} shift assignments run past a relieving date.`, `${rows.length} تعيينات ورديات تمتد بعد تاريخ انتهاء الخدمة.`] : ["No shift runs past a relieving date.", "لا توجد وردية تمتد بعد تاريخ انتهاء الخدمة."], table: { columns: [col("a", "Assignment", "التعيين"), col("e", "Employee", "الموظف"), col("s", "Start", "البداية"), col("x", "End", "النهاية")], rows: rows.map((a) => ({ a: doc("Shift Assignment", a.name), e: s(a["employee_name"]) || s(a["employee"]), s: s(a["start_date"]).slice(0, 10), x: s(a["end_date"]).slice(0, 10) || "—" })) } }; } },
  { id: "employee-accounts", features: ["FR26-0137", "FR26-0138", "FR26-0139", "HIR-01", "SEC-02"], sections: ["01.4", "02.3"], kind: "action", title: ["Employee sign-in accounts", "حسابات دخول الموظفين"], cta: ["Create and link the account", "أنشئ الحساب واربطه"],
    summary: ["Active employees without a sign-in account; Create links an existing free account or creates one with the Employee role. With the 'create account on save' setting on, saved and imported employees get one automatically.", "الموظفون النشطون بلا حساب دخول؛ الإنشاء يربط حسابًا موجودًا غير مستخدم أو ينشئ حسابًا بدور الموظف. وعند تفعيل إعداد «إنشاء حساب عند الحفظ» يحصل عليه الموظف المحفوظ أو المستورد تلقائيًا."],
    inputs: [{ ...EMPLOYEE, optional: true, hint: ["Leave empty to review the list only", "اتركه فارغًا لمراجعة القائمة فقط"] }],
    run: (v, u) => {
      const r = v["employee"] ? Nv.createEmployeeUser(v["employee"], u) : null;
      const rows = scopedList("Employee", u).filter((e) => s(e["status"] || "Active") === "Active" && !s(e["user_id"])).slice(0, 40).map((e) => ({ e: doc("Employee", e.name, e["employee_name"]), m: Nv.employeeEmail(e), c: s(e["company"]) }));
      const table: ToolTable = { columns: [col("e", "Employee", "الموظف"), col("m", "E-mail", "البريد الإلكتروني"), col("c", "Company", "الشركة")], rows };
      return r ? fromAction(r, table) : view(table, [`${rows.length} active employee(s) without an account.`, `${rows.length} موظف نشط بلا حساب.`]); } },
  { id: "concepts", features: ["ORG-08"], sections: ["01.3", "01.2", "02.1"], kind: "view", title: ["Position, job, opening and requisition", "المنصب والوظيفة والشاغر وطلب التوظيف"],
    summary: ["What each one means, and the chain of the selected position.", "معنى كل واحد منها، وسلسلة المنصب المختار."],
    inputs: [{ key: "position", label: ["Position", "المنصب"], type: "link", doctype: "DIGIT Position", title: "position_title", optional: true }],
    run: (v) => { const ch = v["position"] ? St.chainOf("DIGIT Position", v["position"]!) : {}; const at: Record<string, Cell> = { Designation: s(ch.designation), "DIGIT Position": doc("DIGIT Position", ch.position), "Job Requisition": doc("Job Requisition", ch.requisition), "Job Opening": doc("Job Opening", ch.opening) };
      return view({ columns: [col("c", "Concept", "المفهوم"), col("m", "Meaning", "المعنى"), col("r", "This position", "هذا المنصب")], rows: St.CONCEPTS.map((c) => ({ c: [c.en[0], c.ar[0]], m: [c.en[1], c.ar[1]], r: at[c.id] ?? "" })) }); } },

  // ---------- 02.1 recruitment
  { id: "resume", features: ["REC-04"], sections: ["02.1"], kind: "action", title: ["Read a résumé", "قراءة السيرة الذاتية"], cta: ["Fill the applicant", "تعبئة بيانات المرشح"],
    summary: ["Paste the résumé text: name, e-mail, phone, skills, years and degree are read with a confidence score; you review before anything is saved, and filled fields are never overwritten.", "الصق نص السيرة: يُقرأ الاسم والبريد والجوال والمهارات والخبرة والمؤهل مع درجة الثقة؛ تراجعها قبل الحفظ ولا تُستبدل الحقول المعبأة."],
    inputs: [{ key: "applicant", label: ["Applicant", "المرشح"], type: "link", doctype: "Job Applicant", title: "applicant_name" }, { key: "text", label: ["Résumé text", "نص السيرة الذاتية"], type: "textarea" }, { key: "apply", label: ["Save to the applicant", "الحفظ في ملف المرشح"], type: "check", optional: true, options: yesNo }],
    run: (v, u) => { const p = T.parseResume(v["text"] ?? ""); const table: ToolTable = { columns: [col("f", "Field", "الحقل"), col("v", "Read value", "القيمة المقروءة")], rows: [
      { f: ["Name", "الاسم"], v: p.applicant_name }, { f: ["E-mail", "البريد"], v: p.email_id }, { f: ["Phone", "الجوال"], v: p.phone_number }, { f: ["Skills", "المهارات"], v: p.skills.join("، ") }, { f: ["Years of experience", "سنوات الخبرة"], v: p.years }, { f: ["Degree", "المؤهل"], v: p.education }, { f: ["Languages", "اللغات"], v: p.languages.join("، ") }, { f: ["Confidence", "الثقة"], v: `${p.confidence}%` }] };
      return v["apply"] === "1" ? fromAction(T.applyResume(v["applicant"]!, p, u), table) : view(table, ["Preview only — tick “Save to the applicant” to fill the record.", "معاينة فقط — اختر «الحفظ في ملف المرشح» لتعبئة السجل."]); } },
  { id: "post-job", features: ["REC-05"], sections: ["02.1"], kind: "action", title: ["Post to job boards", "النشر في مواقع التوظيف"], cta: ["Post", "نشر"],
    summary: ["One posting per channel, sent through the job-board provider (simulated until a provider is set); posting twice to the same channel is refused.", "نشر واحد لكل قناة عبر مزود مواقع التوظيف (محاكاة حتى يُضبط المزود)؛ يُرفض النشر مرتين في القناة نفسها."],
    inputs: [{ key: "opening", label: ["Job opening", "الوظيفة الشاغرة"], type: "link", doctype: "Job Opening", title: "job_title", where: (d) => s(d["status"]) === "Open" },
      { key: "channel", label: ["Channel", "القناة"], type: "select", options: [["*", "All channels", "كل القنوات"], ...T.POST_CHANNELS.map((c) => [c.id, c.en, c.ar] as [string, string, string])] }],
    run: (v, u) => { const r = T.postJob(v["opening"]!, v["channel"] === "*" ? T.POST_CHANNELS.map((c) => c.id) : [v["channel"]!], u); T.syncPostings();
      const posts = adapter.list("DIGIT Job Posting").filter((p) => p["job_opening"] === v["opening"]);
      return fromAction(r, { columns: [col("ch", "Channel", "القناة"), col("st", "Status", "الحالة"), col("on", "Posted", "النشر"), col("apps", "Applicants", "المتقدمون", { numeric: true })], rows: posts.map((p) => ({ ch: s(p["channel"]), st: s(p["status"]), on: s(p["posted_on"]).slice(0, 16), apps: n(p["applicants_received"])})) }); } },
  { id: "interview-summary", features: ["REC-09"], sections: ["02.1"], kind: "action", title: ["Interview recording consent and summary", "موافقة تسجيل المقابلة وتلخيصها"], cta: ["Save", "حفظ"],
    summary: ["Notes are summarised (rule-based; an AI provider can be switched on in settings) only when the candidate consented to recording.", "تُلخص الملاحظات (بالقواعد؛ يمكن تفعيل مزود ذكاء اصطناعي من الإعدادات) فقط عند موافقة المرشح على التسجيل."],
    inputs: [{ key: "interview", label: ["Interview", "المقابلة"], type: "link", doctype: "Interview", title: "job_applicant" }, { key: "consent", label: ["Candidate consented", "وافق المرشح"], type: "select", options: [["", "Keep as is", "دون تغيير"], ["1", "Yes", "نعم"], ["0", "No", "لا"]], optional: true },
      { key: "notes", label: ["Interview notes", "ملاحظات المقابلة"], type: "textarea", optional: true }, { key: "rating", label: ["Rating (1–5)", "التقييم (1–5)"], type: "number", def: "4" }],
    run: (v, u) => { const iv = adapter.get("Interview", v["interview"]!); const ap = s(iv?.["job_applicant"]);
      if (v["consent"] === "1" || v["consent"] === "0") { const c = T.recordConsent(ap, "Interview Recording", v["consent"] === "1", "Portal", u); if (!c.ok || !v["notes"]) return fromAction(c); }
      return fromAction(T.summariseInterview(v["interview"]!, v["notes"] ?? "", n(v["rating"]), u)); } },
  { id: "sourcing", features: ["REC-11"], sections: ["02.1", "02.5"], kind: "action", title: ["Import a profile and talent pools", "استيراد ملف وتجمعات المواهب"], cta: ["Import", "استيراد"],
    summary: ["Paste a LinkedIn profile link or text: an applicant is created (duplicates by e-mail are refused) and added to the opening and / or talent pool.", "الصق رابط ملف لينكدإن أو نصه: يُنشأ مرشح (يُرفض المكرر بالبريد) ويُضاف إلى الوظيفة و/أو تجمع المواهب."],
    inputs: [{ key: "profile", label: ["Profile link or text", "رابط الملف أو نصه"], type: "textarea" }, { key: "opening", label: ["Job opening", "الوظيفة الشاغرة"], type: "link", doctype: "Job Opening", title: "job_title", optional: true }, { key: "pool", label: ["Talent pool", "تجمع المواهب"], type: "link", doctype: "DIGIT Talent Pool", title: "pool_name", optional: true }],
    run: (v, u) => fromAction(T.importProfile(v["profile"]!, v["opening"] || undefined, v["pool"] || undefined, u)) },
  { id: "quality-of-hire", features: ["REC-13"], sections: ["02.1", "02.2"], kind: "action", title: ["Quality of hire", "جودة التعيين"], cta: ["Record rating", "تسجيل التقييم"],
    summary: ["Managers rate new hires after the set days; results by recruiting source.", "يقيّم المديرون المعيّنين الجدد بعد الأيام المحددة؛ والنتائج حسب مصدر التوظيف."],
    inputs: [{ key: "employee", label: ["New hire", "المعيّن الجديد"], type: "link", doctype: "Employee", title: "employee_name", optional: true, where: (d) => T.qualityOfHireDue(todayISO()).some((x) => x.name === d.name) },
      { key: "rating", label: ["Rating (1–5)", "التقييم (1–5)"], type: "number", def: "4" }, { key: "rehire", label: ["Would hire again", "سيعيد التعيين"], type: "check", optional: true }, { key: "comments", label: ["Comments", "ملاحظات"], type: "text", optional: true }],
    run: (v, u) => { const tbl = (): ToolTable => ({ columns: [col("src", "Source", "المصدر"), col("n", "Reviews", "التقييمات", { numeric: true }), col("avg", "Average rating", "متوسط التقييم", { numeric: true }), col("re", "Would rehire %", "نسبة إعادة التعيين", { numeric: true })], rows: T.qualityBySource(u).map((x) => ({ src: x.source, n: x.reviews, avg: x.avg_rating, re: x.rehire_pct })) });
      return v["employee"] ? fromAction(T.recordQualityOfHire(v["employee"]!, n(v["rating"]), v["rehire"] === "1", v["comments"] ?? "", u), tbl()) : view(tbl(), [`${T.qualityOfHireDue(todayISO(), u).length} new hire(s) due for a rating.`, `${T.qualityOfHireDue(todayISO(), u).length} معيّن جديد مستحق للتقييم.`]); } },

  // ---------- 02.2 onboarding
  { id: "hire", features: ["HIR-01", "HIR-02", "HIR-03"], sections: ["02.2", "02.1"], kind: "action", title: ["Hire from an accepted offer", "التعيين من عرض مقبول"], cta: ["Complete hire", "إتمام التعيين"],
    summary: ["Readiness checks first (offer accepted, identity, bank, contract, position, duplicates); the employee is created once with everything the offer already holds; a future start date makes a pending worker activated on the day.", "فحص الجاهزية أولًا (قبول العرض والهوية والبنك والعقد والمنصب والتكرار)؛ يُنشأ الموظف مرة واحدة بكل ما في العرض؛ تاريخ مباشرة لاحق يجعله عاملًا معلّقًا يُفعَّل في يومه."],
    inputs: [{ key: "offer", label: ["Job offer", "عرض العمل"], type: "link", doctype: "Job Offer", title: "applicant_name", where: (d) => s(d["status"]) === "Accepted" }, { key: "date_of_joining", label: ["Start date", "تاريخ المباشرة"], type: "date", def: () => todayISO() },
      { key: "national_id", label: ["National ID / Iqama", "الهوية الوطنية / الإقامة"], type: "text", optional: true }, { key: "gender", label: ["Gender", "الجنس"], type: "select", options: [["Male", "Male", "ذكر"], ["Female", "Female", "أنثى"]] },
      { key: "date_of_birth", label: ["Date of birth", "تاريخ الميلاد"], type: "date", optional: true }, { key: "iban", label: ["IBAN", "الآيبان"], type: "text", optional: true }, { key: "bank_name", label: ["Bank", "البنك"], type: "text", optional: true },
      { key: "contract_type", label: ["Contract", "العقد"], type: "select", options: [["Unlimited", "Unlimited", "غير محدد المدة"], ["Fixed Term", "Fixed term", "محدد المدة"]] }, { key: "check", label: ["Check only", "فحص فقط"], type: "check", optional: true }],
    run: (v, u) => { const inp: T.HireInput = { date_of_joining: v["date_of_joining"]!, ...(v["gender"] ? { gender: v["gender"] } : {}), ...(v["date_of_birth"] ? { date_of_birth: v["date_of_birth"] } : {}), ...(v["national_id"] ? (/^2/.test(v["national_id"]!) ? { iqama_number: v["national_id"] } : { national_id: v["national_id"] }) : {}), ...(v["iban"] ? { iban: v["iban"] } : {}), ...(v["bank_name"] ? { bank_name: v["bank_name"] } : {}), ...(v["contract_type"] ? { contract_type: v["contract_type"] } : {}) };
      const rd = T.hireReadiness(v["offer"]!, inp); const table: ToolTable = { columns: [col("c", "Check", "الفحص"), col("st", "Result", "النتيجة"), col("fix", "What to do", "المطلوب")], rows: rd.map((x) => ({ c: [x.en, x.ar], st: x.ok ? ["Ready", "جاهز"] : ["Missing", "ناقص"], fix: x.ok ? "" : x.fix })) };
      if (v["check"] === "1") return view(table, rd.every((x) => x.ok) ? ["Ready to hire.", "جاهز للتعيين."] : ["Not ready yet.", "غير جاهز بعد."]);
      return fromAction(T.completeHire(v["offer"]!, inp, u), table); } },
  { id: "pending-workers", features: ["HIR-03"], sections: ["02.2"], kind: "action", title: ["Activate pending workers", "تفعيل العمال المعلّقين"], cta: ["Activate due workers", "تفعيل المستحقين"],
    summary: ["Pending workers whose start date has arrived become active employees; the others stay pending.", "العمال المعلّقون الذين حل تاريخ مباشرتهم يصبحون موظفين نشطين؛ ويبقى الآخرون معلّقين."],
    inputs: [],
    run: (_v, u) => { const k = T.activatePendingWorkers(); const co = new Set(scopedList("Company", u).map((c) => c.name)); const rows = adapter.list("DIGIT Pending Worker").filter((p) => s(p["status"]) === "Pending" && co.has(s(p["company"]))).map((p) => ({ e: doc("DIGIT Pending Worker", p.name, p["full_name"]), d: s(p["expected_start"]) }));
      return { ok: true, message: [`${k} worker(s) activated.`, `فُعّل ${k} عامل.`], table: { columns: [col("e", "Still pending", "ما زال معلقًا"), col("d", "Start date", "تاريخ المباشرة")], rows } }; } },
  { id: "preboarding", features: ["ONB-05"], sections: ["02.2"], kind: "action", title: ["Pre-boarding package", "حزمة ما قبل المباشرة"], cta: ["Add to onboarding", "إضافة إلى التهيئة"],
    summary: ["Adds the package's videos, government forms and acknowledgements to the onboarding as dated milestones, without duplicates.", "يضيف مقاطع الحزمة والنماذج الحكومية والإقرارات إلى التهيئة كمراحل مؤرخة دون تكرار."],
    inputs: [{ key: "onboarding", label: ["Onboarding", "التهيئة"], type: "link", doctype: "Employee Onboarding", title: "employee_name" }, { key: "pkg", label: ["Package", "الحزمة"], type: "link", doctype: "DIGIT Preboarding Package", title: "package_name" }],
    run: (v, u) => fromAction(T.applyPreboarding(v["onboarding"]!, v["pkg"]!, u)) },
  { id: "access", features: ["ONB-06"], sections: ["02.2", "07.4"], kind: "action", title: ["System access grant and revoke", "منح وسحب صلاحيات الأنظمة"], cta: ["Queue", "إضافة للطابور"],
    summary: ["Completed onboarding grants and a submitted separation revokes e-mail, ERP, badge, VPN and self-service automatically; you can also queue one here and run the queue.", "إتمام التهيئة يمنح وتقديم إنهاء الخدمة يسحب البريد والنظام والبطاقة والشبكة والخدمة الذاتية تلقائيًا؛ ويمكن إضافة طلب هنا وتشغيل الطابور."],
    inputs: [{ ...EMPLOYEE, optional: true, where: () => true }, { key: "action", label: ["Action", "الإجراء"], type: "select", options: [["Grant", "Grant", "منح"], ["Revoke", "Revoke", "سحب"]] }],
    run: (v, u) => { const r = v["employee"] ? T.provisionAccess(v["employee"]!, v["action"] === "Revoke" ? "Revoke" : "Grant", T.SYSTEMS, todayISO(), undefined, u) : undefined; const k = T.runAccessQueue();
      const rows = adapter.list("DIGIT Access Provision Request").filter((d) => !v["employee"] || d["employee"] === v["employee"]).slice(-30).reverse().map((d) => ({ e: doc("Employee", d["employee"], d["employee_name"]), sys: s(d["system"]), act: s(d["action"]), st: s(d["status"]), on: s(d["scheduled_for"]) }));
      const table: ToolTable = { columns: [col("e", "Employee", "الموظف"), col("sys", "System", "النظام"), col("act", "Action", "الإجراء"), col("st", "Status", "الحالة"), col("on", "Due", "الاستحقاق")], rows };
      return r ? fromAction(r, table) : view(table, [`${k} request(s) processed.`, `عولج ${k} طلب.`]); } },

  // ---------- 02.4 / 02.5 talent
  { id: "nine-box", features: ["TAL-01"], sections: ["02.5", "02.3"], kind: "view", title: ["Performance vs potential (9-box)", "الأداء مقابل الإمكانات (9 مربعات)"],
    summary: ["Performance from the latest submitted appraisal, potential from the appraisal or readiness; flight risk from succession and readiness records.", "الأداء من آخر تقييم معتمد والإمكانات من التقييم أو الجاهزية؛ ومخاطر الفقد من سجلات التعاقب والجاهزية."],
    inputs: [COMPANY],
    run: (v, u) => { const g = T.nineBox(v["company"] || undefined, u); const BANDS: T.Band[] = ["High", "Medium", "Low"]; const lab: Record<string, Bi> = { High: ["High", "مرتفع"], Medium: ["Medium", "متوسط"], Low: ["Low", "منخفض"] };
      const cell = (perf: string, pot: string) => g.cells.find((c) => c.perf === perf && c.pot === pot)?.employees.map((e) => `${e.employee_name}${e.risk && e.risk !== "Low" ? ` (${e.risk})` : ""}`).join("، ") ?? "";
      return view({ columns: [col("pot", "Potential ↓ / Performance →", "الإمكانات ↓ / الأداء →"), col("Low", "Low", "منخفض"), col("Medium", "Medium", "متوسط"), col("High", "High", "مرتفع")], rows: BANDS.map((pot) => ({ pot: lab[pot]!, Low: cell("Low", pot), Medium: cell("Medium", pot), High: cell("High", pot) })) },
        g.unrated.length ? [`${g.unrated.length} employee(s) without a submitted appraisal are not placed.`, `${g.unrated.length} موظف بدون تقييم معتمد غير موضوعين.`] : undefined); } },
  { id: "career", features: ["TAL-03"], sections: ["02.4", "05.1"], kind: "view", title: ["Career explorer", "المستكشف المهني"],
    summary: ["Roles the employee can move to, with the skills they already hold and the gaps, and the learning that closes them.", "الأدوار التي يمكن للموظف الانتقال إليها مع المهارات المتوفرة والفجوات والتعلم الذي يسدها."],
    inputs: [EMPLOYEE],
    run: (v, u) => { const r = T.careerExplorer(v["employee"]!, u); if (!r) return { ok: false, message: ["Employee not found or not permitted.", "الموظف غير موجود أو غير مسموح."] };
      return view({ columns: [col("path", "Career path", "المسار المهني"), col("target", "Next role", "الدور التالي"), col("years", "Typical years", "السنوات المعتادة", { numeric: true }), col("gap", "Skill gaps", "الفجوات"), col("learn", "Suggested learning", "التعلم المقترح"), col("open", "Open roles", "وظائف مفتوحة", { numeric: true })],
        rows: r.options.map((p) => ({ path: p.path_name, target: p.target, years: p.years, gap: p.gaps.join("، "), learn: p.learning.join("، "), open: p.openings.length })) }, [`Current role: ${r.current || "—"}; skills held: ${r.skills.join(", ") || "—"}.`, `الدور الحالي: ${r.current || "—"}؛ المهارات المتوفرة: ${r.skills.join("، ") || "—"}.`]); } },

  // ---------- 03.1 leave
  { id: "leave-simulator", features: ["LEV-08"], sections: ["03.1", "05.1"], kind: "view", title: ["Leave policy simulator", "محاكي سياسات الإجازة"],
    summary: ["What if: entitlement and balance by years of service and leave type under the Saudi rules in the settings; nothing is written.", "ماذا لو: الاستحقاق والرصيد حسب سنوات الخدمة ونوع الإجازة وفق القواعد السعودية في الإعدادات؛ دون كتابة أي شيء."],
    inputs: [EMPLOYEE, { key: "on", label: ["As of", "في تاريخ"], type: "date", def: () => todayISO() }, { key: "type", label: ["Leave type", "نوع الإجازة"], type: "select", options: [["", "All types", "كل الأنواع"], ...Tm.SIM_TYPES.map((x) => [x, x, x] as [string, string, string])], optional: true }, { key: "years", label: ["Years of service (what if)", "سنوات الخدمة (افتراض)"], type: "number", optional: true }],
    run: (v, u) => view({ columns: [col("t", "Leave type", "نوع الإجازة"), col("e", "Entitled", "المستحق", { numeric: true }), col("tk", "Taken", "المأخوذ", { numeric: true }), col("b", "Balance", "الرصيد", { numeric: true }), col("basis", "Rule", "القاعدة")],
      rows: Tm.simulateLeave(v["employee"]!, v["on"] || todayISO(), v["type"] || undefined, v["years"] ? n(v["years"]) : undefined, u).map((x) => ({ t: x.leave_type, e: x.entitled, tk: x.taken, b: x.balance, basis: x.basis })) }) },
  { id: "long-leave", features: ["LEV-06", "LEV-07"], sections: ["03.1", "05.3"], kind: "view", title: ["Long leave cases", "حالات الإجازات الطويلة"],
    summary: ["A leave longer than the set days opens one service case automatically; approved leave writes On Leave attendance on working days.", "الإجازة الأطول من الأيام المحددة تفتح حالة خدمة واحدة تلقائيًا؛ والإجازة المعتمدة تكتب حضور «في إجازة» في أيام العمل."],
    inputs: [],
    run: (_v, u) => view({ columns: [col("c", "Case", "الحالة"), col("e", "Employee", "الموظف"), col("st", "Status", "الوضع"), col("d", "Opened", "الفتح")],
      rows: scopedList(Sv.DSC, u).filter((c) => c["category"] === "Long Leave").map((c) => ({ c: doc(Sv.DSC, c.name, c["subject"]), e: s(c["employee_name"]), st: s(c["case_status"]), d: s(c["opened_on"]).slice(0, 10) })) }) },

  // ---------- 03.2 attendance
  { id: "checkin", features: ["ATT-01"], sections: ["03.2", "05.1"], kind: "action", title: ["Mobile check-in", "تسجيل الحضور من الجوال"], cta: ["Check in / out", "تسجيل دخول / خروج"],
    summary: ["IN or OUT is decided from the last move; a second tap within a minute is ignored; outside the branch radius is refused; offline moves sync once.", "الدخول أو الخروج يُحدد من آخر حركة؛ والضغطة الثانية خلال دقيقة تُهمل؛ ويُرفض التسجيل خارج نطاق الفرع؛ وتُزامن الحركات دون اتصال مرة واحدة."],
    inputs: [EMPLOYEE, { key: "lat", label: ["Latitude", "خط العرض"], type: "number", def: "24.7136" }, { key: "lon", label: ["Longitude", "خط الطول"], type: "number", def: "46.6753" }],
    run: (v, u) => { const r = Tm.checkin({ employee: v["employee"]!, latitude: n(v["lat"]), longitude: n(v["lon"]) }, u);
      const rows = scopedList("Employee Checkin", u).filter((c) => c["employee"] === v["employee"]).sort((a, b) => s(b["time"]).localeCompare(s(a["time"]))).slice(0, 10).map((c) => ({ t: s(c["time"]), l: s(c["log_type"]), d: n(c["digit_distance_m"]), g: s(c["digit_geofence"]) }));
      return fromAction(r, { columns: [col("t", "Time", "الوقت"), col("l", "Move", "الحركة"), col("d", "Distance (m)", "المسافة (م)", { numeric: true }), col("g", "Geofence", "النطاق")], rows }); } },
  { id: "quick-checkin", features: ["FR26-0390", "FR26-0346", "ATT-01"], sections: ["03.2", "03.4"], kind: "action", title: ["Quick check-in from the desk", "تسجيل حضور سريع من المكتب"], cta: ["Record the next move", "سجّل الحركة التالية"],
    summary: ["HR records the next move (IN or OUT, from the day's last move) for an employee at the desk terminal, without a phone or location.", "تسجل الموارد البشرية الحركة التالية (دخول أو خروج حسب آخر حركة اليوم) لموظف من جهاز المكتب، دون جوال أو موقع."],
    inputs: [EMPLOYEE],
    run: (v, u) => { const r = Nv.deskCheckin(v["employee"]!, u);
      const rows = Nv.todaysMoves(u).slice(0, 15).map((c) => ({ t: s(c["time"]).slice(11, 16), e: doc("Employee", c["employee"], c["employee_name"]), l: [s(c["log_type"]) === "IN" ? "In" : "Out", s(c["log_type"]) === "IN" ? "دخول" : "خروج"] as Bi, dv: s(c["device_id"]) }));
      return fromAction(r, { columns: [col("t", "Time", "الوقت"), col("e", "Employee", "الموظف"), col("l", "Move", "الحركة"), col("dv", "Device", "الجهاز")], rows }); } },
  { id: "scheduled-jobs", features: ["GAP-20", "LEV-08", "ATT-01"], sections: ["07.4", "03.1", "03.2", "01.6"], kind: "action", title: ["Run scheduled HR jobs", "تشغيل مهام الموارد البشرية المجدولة"], cta: ["Run the job", "شغّل المهمة"],
    summary: ["Runs a daily HR job now: earned leave, attendance from the day's check-ins, or document expiry with reminders to HR. Running it again changes nothing.", "يشغّل مهمة يومية الآن: الإجازات المكتسبة، أو الحضور من تسجيلات اليوم، أو انتهاء الوثائق مع تذكير الموارد البشرية. إعادة التشغيل لا تغيّر شيئًا."],
    inputs: [COMPANY, { key: "job", label: ["Job", "المهمة"], type: "select", options: Cl.JOBS.map((j) => [j.id, j.en, j.ar] as [string, string, string]), def: "earned_leave" }, { key: "on", label: ["Run for", "التشغيل عن"], type: "date", def: () => todayISO() }],
    run: (v, u) => { const r = Cl.runJob(v["job"] as Cl.JobId, v["company"]!, v["on"] || todayISO(), u);
      return fromAction(r, { columns: [col("ref", "Record", "السجل"), col("what", "Change", "التغيير")], rows: (r.run?.rows ?? []).map((x) => ({ ref: x.ref, what: x.what })) }); } },
  { id: "advance-payment", features: ["GAP-10"], sections: ["04.5", "04.2", "05.1"], kind: "action", title: ["Pay approved advances", "صرف السلف المعتمدة"], cta: ["Pay the advance", "اصرف السلفة"],
    summary: ["Approved employee advances not yet paid; paying one posts a bank journal against the employee and the advance account, and the advance shows Paid.", "السلف المعتمدة غير المصروفة؛ صرف سلفة يرحّل قيد بنك على الموظف وحساب السلف، وتظهر السلفة مصروفة."],
    inputs: [{ key: "advance", label: ["Advance", "السلفة"], type: "link", doctype: "Employee Advance", title: "employee_name", where: (d) => Number(d["docstatus"]) === 1 && n(d["advance_amount"]) > n(d["paid_amount"]), optional: true }],
    run: (v, u) => { const due = (): ToolTable => { let rows: Doc[] = []; try { rows = scopedList("Employee Advance", u).filter((d) => Number(d["docstatus"]) === 1 && n(d["advance_amount"]) > n(d["paid_amount"])); } catch { rows = []; }
        return { columns: [col("a", "Advance", "السلفة"), col("e", "Employee", "الموظف"), col("amt", "Amount", "المبلغ", { numeric: true, money: true }), col("paid", "Paid", "المصروف", { numeric: true, money: true })],
          rows: rows.map((d) => ({ a: doc("Employee Advance", d.name), e: doc("Employee", d["employee"], d["employee_name"]), amt: n(d["advance_amount"]), paid: n(d["paid_amount"]) })), totals: { amt: rows.reduce((x, d) => x + n(d["advance_amount"]), 0), paid: rows.reduce((x, d) => x + n(d["paid_amount"]), 0) } }; };
      if (!v["advance"]) return view(due());
      const r = Cl.payAdvance(v["advance"]!, u); return { ...fromAction(r, due()), ...(r.journal ? { created: [["Journal Entry", r.journal]] as [string, string][] } : {}) }; } },
  { id: "employee-loans", features: ["GAP-18"], sections: ["04.5", "04.1"], kind: "action", title: ["Employee loans", "قروض الموظفين"], cta: ["Run", "تنفيذ"],
    summary: ["Pay out an approved loan (bank journal, installment schedule, the wage cap checked) or add the month's due installments to payroll as deductions.", "صرف قرض معتمد (قيد بنك وجدول أقساط مع التحقق من حد الأجر) أو إضافة أقساط الشهر المستحقة إلى الرواتب كخصومات."],
    inputs: [COMPANY, { key: "action", label: ["Action", "الإجراء"], type: "select", options: [["", "Review only", "مراجعة فقط"], ["disburse", "Pay out the loan", "صرف القرض"], ["deduct", "Add due installments to payroll", "إضافة الأقساط المستحقة للرواتب"]], optional: true },
      { key: "loan", label: ["Loan", "القرض"], type: "link", doctype: Cl.LOAN, title: "employee_name", optional: true }, { key: "month", label: ["Payroll month", "شهر الرواتب"], type: "month", def: () => todayISO().slice(0, 7) }],
    run: (v, u) => { const table = (): ToolTable => { let rows: Doc[] = []; try { rows = scopedList(Cl.LOAN, u).filter((d) => !v["company"] || s(d["company"]) === v["company"]); } catch { rows = []; }
        return { columns: [col("l", "Loan", "القرض"), col("e", "Employee", "الموظف"), col("st", "Status", "الحالة"), col("amt", "Amount", "المبلغ", { numeric: true, money: true }), col("out", "Outstanding", "المتبقي", { numeric: true, money: true })],
          rows: rows.map((d) => ({ l: doc(Cl.LOAN, d.name), e: doc("Employee", d["employee"], d["employee_name"]), st: s(d["loan_status"]) || s(d["approval_status"]), amt: n(d["loan_amount"]), out: n(d["outstanding_amount"]) || n(d["loan_amount"]) })), totals: { amt: rows.reduce((x, d) => x + n(d["loan_amount"]), 0) } }; };
      if (v["action"] === "disburse") { if (!v["loan"]) return { ok: false, message: ["Choose the loan.", "اختر القرض."] }; const r = Cl.disburseLoan(v["loan"]!, u); return { ...fromAction(r, table()), ...(r.journal ? { created: [["Journal Entry", r.journal]] as [string, string][] } : {}) }; }
      if (v["action"] === "deduct") return fromAction(Cl.loanDeductions(v["company"]!, v["month"] || todayISO().slice(0, 7), u), table());
      return view(table()); } },
  { id: "timecards", features: ["TIM-01"], sections: ["03.2", "05.2"], kind: "action", title: ["Timecards", "بطاقات الوقت"], cta: ["Apply to all listed", "تطبيق على الكل"],
    summary: ["Days, hours and overtime per employee from attendance; approve or reject every listed timecard at once.", "الأيام والساعات والعمل الإضافي لكل موظف من الحضور؛ اعتمد أو ارفض كل البطاقات المعروضة دفعة واحدة."],
    inputs: [COMPANY, FROM, TO, { key: "decision", label: ["Decision", "القرار"], type: "select", options: [["", "Review only", "مراجعة فقط"], ["Approved", "Approve", "اعتماد"], ["Rejected", "Reject", "رفض"]], optional: true }],
    run: (v, u) => { const tc = Tm.timecards(v["company"]!, v["from"]!, v["to"]!, u); const table: ToolTable = { columns: [col("e", "Employee", "الموظف"), col("d", "Days present", "أيام الحضور", { numeric: true }), col("h", "Hours", "الساعات", { numeric: true }), col("o", "Overtime hours", "ساعات إضافية", { numeric: true }), col("p", "Awaiting decision", "بانتظار القرار", { numeric: true })],
      rows: tc.map((x) => ({ e: doc("Employee", x.employee, x.employee_name), d: x.days_present, h: x.hours, o: x.overtime_hours, p: x.drafts.length })), totals: { d: tc.reduce((a, x) => a + x.days_present, 0), h: tc.reduce((a, x) => a + x.hours, 0), o: tc.reduce((a, x) => a + x.overtime_hours, 0) } };
      if (!v["decision"]) return view(table);
      return fromAction(Tm.decideTimecards(v["company"]!, v["from"]!, v["to"]!, tc.filter((x) => x.drafts.length).map((x) => x.employee), v["decision"] === "Rejected" ? "Rejected" : "Approved", u), table); } },

  // ---------- 03.3 shifts
  { id: "roster", features: ["SCH-01"], sections: ["03.3", "05.2"], kind: "action", title: ["Roster planner", "مخطط الجدول"], cta: ["Assign shift", "تعيين الوردية"],
    summary: ["Employees by day with the shift, leave and holiday of each day; assign a shift to a department for a date range in one go (consecutive days become one assignment) with leave conflicts warned.", "الموظفون حسب اليوم مع الوردية والإجازة والعطلة؛ عيّن وردية لقسم لفترة دفعة واحدة (الأيام المتتالية تعيين واحد) مع التنبيه لتعارض الإجازات."],
    inputs: [COMPANY, { key: "from", label: ["From", "من"], type: "date", def: () => todayISO() }, { key: "to", label: ["To", "إلى"], type: "date", def: () => addDays(todayISO(), 6) },
      { key: "department", label: ["Department", "القسم"], type: "link", doctype: "Department", optional: true, where: (d, v) => !v["company"] || d["company"] === v["company"] }, { key: "shift", label: ["Shift to assign", "الوردية المراد تعيينها"], type: "link", doctype: "Shift Type", optional: true }],
    run: (v, u) => { const emps = scopedList("Employee", u).filter((e) => e["company"] === v["company"] && s(e["status"] || "Active") === "Active" && (!v["department"] || e["department"] === v["department"])).map((e) => e.name);
      const to = v["to"]! < v["from"]! ? v["from"]! : (v["to"]! > addDays(v["from"]!, 30) ? addDays(v["from"]!, 30) : v["to"]!);
      let res: ToolOut | undefined;
      if (v["shift"]) res = fromAction(Tm.saveRoster(v["company"]!, emps.map((e) => ({ employee: e, shift_type: v["shift"]!, dates: Tm.datesBetween(v["from"]!, to) })), u));
      const g = Tm.rosterGrid(v["company"]!, v["from"]!, to.slice(0, 10) > addDays(v["from"]!, 13) ? addDays(v["from"]!, 13) : to, emps.slice(0, 60), u);
      const table: ToolTable = { columns: [col("e", "Employee", "الموظف"), ...g.days.map((d) => col(d, d.slice(5), d.slice(5)))], rows: g.rows.map((r) => ({ e: doc("Employee", r.employee, r.employee_name), ...Object.fromEntries(r.cells.map((c) => [c.date, c.leave ? `${c.shift ? `${c.shift} ⚠ ` : ""}${c.leave}` : c.holiday ? (c.shift ? `${c.shift} ⚠` : "—") : c.shift ?? ""])) })) };
      return res ? { ...res, table } : view(table); } },
  { id: "availability", features: ["SCH-04"], sections: ["03.3", "05.1"], kind: "view", title: ["Availability vs preferences", "التوفر مقابل التفضيلات"],
    summary: ["Planned shifts on days the employee marked unavailable, or against their preferred shift.", "الورديات المخططة في أيام حدد الموظف أنه غير متاح فيها أو تخالف ورديته المفضلة."],
    inputs: [COMPANY, { key: "from", label: ["From", "من"], type: "date", def: () => todayISO() }, { key: "to", label: ["To", "إلى"], type: "date", def: () => addDays(todayISO(), 13) }],
    run: (v, u) => view({ columns: [col("e", "Employee", "الموظف"), col("d", "Date", "التاريخ"), col("i", "Issue", "الملاحظة")], rows: Tm.availabilityIssues(v["company"]!, v["from"]!, v["to"]!, u).map((x) => ({ e: doc("Employee", x.employee, x.employee_name), d: x.date, i: x.issue })) }) },
  { id: "coverage", features: ["SCH-05"], sections: ["03.3", "06.2"], kind: "view", title: ["Coverage and roster cost", "التغطية وتكلفة الجدول"],
    summary: ["Planned headcount against the coverage rule per day and shift, with planned hours and their cost.", "العدد المخطط مقابل قاعدة التغطية لكل يوم ووردية، مع الساعات المخططة وتكلفتها."],
    inputs: [COMPANY, { key: "from", label: ["From", "من"], type: "date", def: () => todayISO() }, { key: "to", label: ["To", "إلى"], type: "date", def: () => addDays(todayISO(), 6) }],
    run: (v, u) => { const c = Tm.coverage(v["company"]!, v["from"]!, v["to"]!, undefined, u); return view({ columns: [col("d", "Date", "التاريخ"), col("s", "Shift", "الوردية"), col("r", "Required", "المطلوب", { numeric: true }), col("p", "Planned", "المخطط", { numeric: true }), col("g", "Gap", "الفجوة", { numeric: true }), col("h", "Hours", "الساعات", { numeric: true }), col("c", "Cost", "التكلفة", { money: true })],
      rows: c.rows.map((x) => ({ d: x.date, s: x.shift_type, r: x.required, p: x.planned, g: x.gap, h: x.hours, c: x.cost })), totals: { h: c.rows.reduce((a, x) => a + x.hours, 0), c: c.rows.reduce((a, x) => a + x.cost, 0) } }); } },
  { id: "overtime", features: ["SCH-03"], sections: ["03.3", "04.1"], kind: "action", title: ["Overtime pay", "أجر العمل الإضافي"], cta: ["Add to payroll", "إضافة للرواتب"],
    summary: ["Hourly wage × hours × the overtime rate from the settings (150% by the Labour Law) becomes one additional salary for the payroll date.", "الأجر بالساعة × الساعات × نسبة العمل الإضافي من الإعدادات (150% حسب نظام العمل) تصبح راتبًا إضافيًا واحدًا لتاريخ الرواتب."],
    inputs: [EMPLOYEE, { key: "hours", label: ["Hours", "الساعات"], type: "number", def: "4" }, { key: "kind", label: ["Day", "اليوم"], type: "select", options: [["weekday", "Working day", "يوم عمل"], ["rest_day", "Rest day", "يوم راحة"], ["holiday", "Public holiday", "عطلة رسمية"]] }, { key: "date", label: ["Payroll date", "تاريخ الرواتب"], type: "date", def: () => todayISO() }],
    run: (v, u) => { const p = Pay.overtimePay(v["employee"]!, n(v["hours"]), v["kind"] as Pay.OtKind, v["date"]); return fromAction(Pay.recordOvertime(v["employee"]!, n(v["hours"]), v["kind"] as Pay.OtKind, v["date"]!, u), { columns: [col("k", "Item", "البند"), col("v", "Value", "القيمة", { numeric: true })], rows: [{ k: ["Hourly wage", "الأجر بالساعة"], v: p.hourly }, { k: ["Rate %", "النسبة %"], v: p.rate }, { k: ["Amount", "المبلغ"], v: p.amount }] }); } },

  // ---------- 04.1 payroll
  { id: "payroll-query", features: ["PAY-11"], sections: ["04.1", "06.3"], kind: "view", title: ["Payroll query", "استعلام الرواتب"],
    summary: ["Submitted slips grouped with a column per salary component and totals; download as CSV or save the query.", "قسائم معتمدة مجمعة مع عمود لكل بند راتب والإجماليات؛ نزّلها CSV أو احفظ الاستعلام."],
    inputs: [COMPANY, { ...FROM, def: () => `${addDays(monthStart(), -85).slice(0, 7)}-01` }, TO, { key: "group", label: ["Group by", "التجميع حسب"], type: "select", options: [["department", "Department", "القسم"], ["employee", "Employee", "الموظف"], ["designation", "Designation", "المسمى"], ["month", "Month", "الشهر"]] }, { key: "save", label: ["Save as (optional)", "حفظ باسم (اختياري)"], type: "text", optional: true }],
    run: (v, u) => { const q: Pay.PayQuery = { company: v["company"], from: v["from"], to: v["to"], groupBy: (v["group"] || "department") as Pay.PayQuery["groupBy"] }; const r = Pay.payrollQuery(q, u);
      if (v["save"]) Pay.saveQuery(v["save"]!, "Payroll Query", q, u);
      return { ok: true, ...(v["save"] ? { message: ["Query saved.", "حُفظ الاستعلام."] as Bi } : {}), table: { columns: r.columns.map((c) => ({ ...c, ...(c.numeric ? { money: true } : {}) })), rows: r.rows as Record<string, Cell>[], totals: r.totals }, ...(r.rows.length ? { file: { name: `payroll-query-${v["from"]}-${v["to"]}.csv`, mime: "text/csv", text: Pay.toCsv(r) } } : {}) }; } },
  { id: "trial-payroll", features: ["PAY-07"], sections: ["04.1"], kind: "action", title: ["Trial payroll", "رواتب تجريبية"], cta: ["Run trial", "تشغيل تجريبي"],
    summary: ["Calculates every employee's pay for the month without writing salary slips; employees with errors can be re-run after the fix.", "يحسب راتب كل موظف للشهر دون كتابة قسائم رواتب؛ ويُعاد تشغيل من لديهم أخطاء بعد التصحيح."],
    inputs: [COMPANY, { key: "ym", label: ["Month", "الشهر"], type: "month", def: () => todayISO().slice(0, 7) }],
    run: (v, u) => { const r = Pay.trialRun(v["company"]!, v["ym"]!, u); const tr = r.created?.[0] ? adapter.get("DIGIT Payroll Trial Run", r.created[0][1]) : undefined;
      const rows = (Array.isArray(tr?.["lines"]) ? (tr!["lines"] as Doc[]) : []).map((x) => ({ e: doc("Employee", x["employee"], x["employee_name"]), g: n(x["gross"]), net: n(x["net"]), prev: n(x["previous_net"]), ch: n(x["change_pct"]), err: s(x["issue"]) }));
      return fromAction(r, { columns: [col("e", "Employee", "الموظف"), col("g", "Gross", "الإجمالي", { money: true }), col("net", "Net", "الصافي", { money: true }), col("prev", "Last month net", "صافي الشهر السابق", { money: true }), col("ch", "Change %", "التغير %", { numeric: true }), col("err", "Issue", "الملاحظة")], rows, totals: { g: rows.reduce((a, x) => a + x.g, 0), net: rows.reduce((a, x) => a + x.net, 0) } }); } },
  { id: "payroll-verify", features: ["PAY-15"], sections: ["04.1"], kind: "action", title: ["Independent payroll verification", "التحقق المستقل من الرواتب"], cta: ["Record verification", "تسجيل التحقق"],
    summary: ["Four eyes: the person who prepared the run cannot verify it, and posting is refused until another person has verified.", "أربع عيون: من جهّز المسير لا يتحقق منه، ويُرفض الاعتماد حتى يتحقق شخص آخر."],
    inputs: [{ key: "pe", label: ["Payroll run", "مسير الرواتب"], type: "link", doctype: "Payroll Entry", title: "title", where: (d) => Number(d.docstatus) === 0 }, { key: "note", label: ["Verification note", "ملاحظة التحقق"], type: "text" }],
    run: (v, u) => fromAction(Pay.verifyPayroll(v["pe"]!, v["note"]!, u)) },
  { id: "earned-wage", features: ["PAY-13"], sections: ["04.5", "05.1"], kind: "action", title: ["On-demand pay", "الأجر عند الطلب"], cta: ["Request", "طلب"],
    summary: ["Up to the set share of the pay already earned this month; an approved request becomes one employee advance recovered from the next payroll.", "حتى النسبة المحددة من الأجر المكتسب هذا الشهر؛ والطلب المعتمد يصبح سلفة واحدة تُسترد من الرواتب التالية."],
    inputs: [EMPLOYEE, { key: "amount", label: ["Amount (empty = show the limit)", "المبلغ (فارغ = عرض الحد)"], type: "number", optional: true }],
    run: (v, u) => { const w = Pay.earnedWage(v["employee"]!); const table: ToolTable = { columns: [col("k", "Item", "البند"), col("v", "Value", "القيمة", { money: true })], rows: [{ k: ["Monthly base", "الراتب الأساسي الشهري"], v: w.monthly }, { k: ["Earned so far", "المكتسب حتى الآن"], v: w.earned }, { k: ["Already requested", "المطلوب سابقًا"], v: w.taken }, { k: ["Available now", "المتاح الآن"], v: w.limit }] };
      return v["amount"] ? fromAction(Pay.requestEarnedWage(v["employee"]!, n(v["amount"]), u), table) : view(table); } },

  // ---------- 04.4 compensation and benefits
  { id: "comp-worksheet", features: ["CMP-02"], sections: ["04.4", "05.2"], kind: "action", title: ["Compensation cycle worksheet", "ورقة عمل دورة التعويضات"], cta: ["Save proposal", "حفظ المقترح"],
    summary: ["Team, current pay and proposals against the cycle budget; a proposal beyond the budget is refused.", "الفريق والراتب الحالي والمقترحات مقابل ميزانية الدورة؛ ويُرفض المقترح الذي يتجاوز الميزانية."],
    inputs: [{ key: "cycle", label: ["Cycle", "الدورة"], type: "link", doctype: "DIGIT Compensation Review Cycle", title: "title" }, { ...EMPLOYEE, optional: true }, { key: "pct", label: ["Increase %", "نسبة الزيادة %"], type: "number", optional: true }],
    run: (v, u) => { const r = v["employee"] && v["pct"] ? Pay.proposeIncrease(v["cycle"]!, v["employee"]!, n(v["pct"]), u) : undefined; const b = Pay.cycleBudget(v["cycle"]!); const ws = Pay.worksheet(v["cycle"]!, undefined, u);
      const table: ToolTable = { columns: [col("e", "Employee", "الموظف"), col("b", "Current base", "الأساسي الحالي", { money: true }), col("p", "Increase %", "الزيادة %", { numeric: true }), col("n", "Proposed base", "الأساسي المقترح", { money: true }), col("st", "Status", "الحالة")],
        rows: ws.map((x) => ({ e: doc("Employee", x.employee, x.employee_name), b: x.current_base, p: x.proposed_pct, n: x.proposed_base, st: x.status })) };
      const msg: Bi = [`Budget ${b.budget}, used ${b.used} a year, remaining ${b.remaining}.`, `الميزانية ${b.budget}، المستخدم ${b.used} سنويًا، المتبقي ${b.remaining}.`];
      return r ? { ...fromAction(r, table), ...(r.ok ? { message: msg } : {}) } : view(table, msg); } },
  { id: "comp-apply", features: ["CMP-03"], sections: ["04.4"], kind: "action", title: ["Apply approved increases", "ترحيل الزيادات المعتمدة"], cta: ["Create salary assignments", "إنشاء تعيينات الرواتب"],
    summary: ["Every approved proposal becomes one draft salary assignment from the cycle's effective date; running again creates nothing twice.", "كل مقترح معتمد يصبح تعيين راتب واحدًا كمسودة من تاريخ سريان الدورة؛ وإعادة التشغيل لا تكرر شيئًا."],
    inputs: [{ key: "cycle", label: ["Cycle", "الدورة"], type: "link", doctype: "DIGIT Compensation Review Cycle", title: "title" }],
    run: (v, u) => fromAction(Pay.applyApproved(v["cycle"]!, u)) },
  { id: "compa-ratio", features: ["CMP-05"], sections: ["04.4", "06.2"], kind: "view", title: ["Pay vs band and market", "الأجر مقابل النطاق والسوق"],
    summary: ["Compa-ratio = base ÷ band midpoint; flagged outside the set range, with the market median.", "النسبة المقارنة = الأساسي ÷ منتصف النطاق؛ ويُنبّه خارج المدى المحدد، مع وسيط السوق."],
    inputs: [{ ...EMPLOYEE, optional: true }],
    run: (v, u) => { const emps = v["employee"] ? [v["employee"]!] : scopedList("Employee", u).filter((e) => s(e["status"] || "Active") === "Active" && e["grade"]).slice(0, 80).map((e) => e.name);
      const rows = emps.map((e) => ({ e, r: Pay.compaRatio(e) })).filter((x) => x.r).map(({ e, r }) => ({ e: doc("Employee", e, adapter.get("Employee", e)?.["employee_name"]), base: r!.base, mid: r!.mid, ratio: r!.ratio ?? "", mkt: r!.market, f: (r!.flag ? ["Outside range", "خارج المدى"] : ["Within range", "ضمن المدى"]) as Bi }));
      return view({ columns: [col("e", "Employee", "الموظف"), col("base", "Base", "الأساسي", { money: true }), col("mid", "Band midpoint", "منتصف النطاق", { money: true }), col("ratio", "Compa-ratio %", "النسبة %", { numeric: true }), col("mkt", "Market median", "وسيط السوق", { money: true }), col("f", "Flag", "التنبيه")], rows }); } },
  { id: "benefit-plans", features: ["BEN-01"], sections: ["04.4", "05.1"], kind: "action", title: ["Plans for you and your family", "الخطط لك ولعائلتك"], cta: ["Save election", "حفظ الاختيار"],
    summary: ["Each plan's monthly cost for the employee and dependents; elect or decline with an acknowledgement, only while the enrolment window is open.", "تكلفة كل خطة الشهرية للموظف ومعاليه؛ اختر أو ارفض مع إقرار، فقط أثناء فترة التسجيل المفتوحة."],
    inputs: [EMPLOYEE, { key: "plan", label: ["Plan", "الخطة"], type: "link", doctype: "DIGIT Benefits Plan", title: "plan_name", optional: true }, { key: "election", label: ["Choice", "الاختيار"], type: "select", options: [["Elected", "Elect", "اختيار"], ["Declined", "Decline", "رفض"]] }, { key: "ack", label: ["I acknowledge the plan terms", "أقر بشروط الخطة"], type: "check", optional: true }],
    run: (v, u) => { const r = v["plan"] ? B.elect(v["employee"]!, v["plan"]!, v["election"] === "Declined" ? "Declined" : "Elected", v["ack"] === "1", u) : undefined;
      const table: ToolTable = { columns: [col("p", "Plan", "الخطة"), col("c", "Coverage", "التغطية"), col("d", "Dependents", "المعالون", { numeric: true }), col("t", "Total", "الإجمالي", { money: true }), col("er", "Company pays", "تدفع الشركة", { money: true }), col("ee", "You pay", "تدفع أنت", { money: true }), col("el", "Your choice", "اختيارك")],
        rows: B.planCards(v["employee"]!, u).map((c) => ({ p: doc("DIGIT Benefits Plan", c.plan, c.plan_name), c: c.coverage, d: c.family, t: c.total, er: c.employer, ee: c.employee, el: c.election || "" })) };
      return r ? fromAction(r, table) : view(table); } },
  { id: "benefit-compare", features: ["BEN-02"], sections: ["04.4", "05.1"], kind: "view", title: ["Compare plans", "مقارنة الخطط"],
    summary: ["Two plans side by side for a family size.", "خطتان جنبًا إلى جنب لعدد أفراد الأسرة."],
    inputs: [{ key: "a", label: ["Plan A", "الخطة أ"], type: "link", doctype: "DIGIT Benefits Plan", title: "plan_name" }, { key: "b", label: ["Plan B", "الخطة ب"], type: "link", doctype: "DIGIT Benefits Plan", title: "plan_name" }, { key: "deps", label: ["Dependents", "المعالون"], type: "number", def: "2" }],
    run: (v) => { const c = B.comparePlans([v["a"]!, v["b"]!], n(v["deps"])); const nm = (p: string) => s(adapter.get("DIGIT Benefits Plan", p)?.["plan_name"]) || p;
      return view({ columns: [col("f", "", ""), col("a", nm(v["a"]!), nm(v["a"]!)), col("b", nm(v["b"]!), nm(v["b"]!))], rows: c.map((r) => ({ f: r.label, a: r.values[0] ?? "", b: r.values[1] ?? "" })) }); } },
  { id: "benefit-window", features: ["BEN-03"], sections: ["04.4"], kind: "action", title: ["Open enrolment window", "فترة التسجيل المفتوح"], cta: ["Open / extend", "فتح / تمديد"],
    summary: ["Opens for the days in the settings and can be extended; elections outside an open window are refused.", "تُفتح للأيام المحددة في الإعدادات ويمكن تمديدها؛ ويُرفض الاختيار خارج فترة مفتوحة."],
    inputs: [COMPANY, { key: "title", label: ["Title", "العنوان"], type: "text", def: () => `Enrolment ${todayISO().slice(0, 4)}` }, { key: "opens", label: ["Opens on", "تاريخ الفتح"], type: "date", def: () => todayISO() }, { key: "extend", label: ["Extend the open window to", "تمديد الفترة المفتوحة حتى"], type: "date", optional: true }],
    run: (v, u) => { const w = B.activeWindow(v["company"]!); const r = v["extend"] && w ? B.extendWindow(w.name, v["extend"]!, u) : w ? undefined : B.openWindow(v["company"]!, v["title"]!, v["opens"]!, u);
      const rows = adapter.list("DIGIT Benefits Enrollment Window").filter((x) => x["company"] === v["company"]).map((x) => ({ w: doc("DIGIT Benefits Enrollment Window", x.name, x["title"]), o: s(x["opens_on"]), c: s(x["extended_to"] || x["closes_on"]), st: s(x["status"]) }));
      const table: ToolTable = { columns: [col("w", "Window", "الفترة"), col("o", "Opens", "الفتح"), col("c", "Closes", "الإغلاق"), col("st", "Status", "الحالة")], rows };
      return r ? fromAction(r, table) : view(table, ["A window is already open; pick a date to extend it.", "توجد فترة مفتوحة؛ اختر تاريخًا لتمديدها."]); } },
  { id: "benefit-change", features: ["BEN-04"], sections: ["04.4", "05.1"], kind: "action", title: ["Benefit change after a life event", "تغيير المزايا بعد حدث حياتي"], cta: ["Submit / apply", "تقديم / تطبيق"],
    summary: ["Birth, marriage or loss of a dependent with evidence; once approved it is applied to the enrolment and audited.", "ولادة أو زواج أو فقد معال مع الإثبات؛ وبعد الاعتماد يُطبق على التسجيل ويُدقق."],
    inputs: [{ key: "enrollment", label: ["Enrolment", "التسجيل"], type: "link", doctype: "DIGIT Benefit Enrollment", title: "employee_name", optional: true }, { key: "event", label: ["Life event", "الحدث"], type: "select", options: [["Birth", "Birth", "ولادة"], ["Marriage", "Marriage", "زواج"], ["Divorce", "Divorce", "طلاق"], ["Death", "Death of a dependent", "وفاة معال"], ["Other", "Other", "أخرى"]] },
      { key: "date", label: ["Event date", "تاريخ الحدث"], type: "date", def: () => todayISO() }, { key: "deps", label: ["Dependents after the change (names, comma separated)", "المعالون بعد التغيير (الأسماء مفصولة بفواصل)"], type: "text", optional: true }, { key: "evidence", label: ["Evidence", "الإثبات"], type: "text", optional: true },
      { key: "apply", label: ["or apply approved request", "أو تطبيق طلب معتمد"], type: "link", doctype: "DIGIT Benefit Change Request", title: "life_event", optional: true, where: (d) => s(d["approval_status"]) === "Approved" && !s(d["audit_note"]).includes("Applied by") }],
    run: (v, u) => v["apply"] ? fromAction(B.applyBenefitChange(v["apply"]!, u)) : fromAction(B.requestBenefitChange(v["enrollment"]!, v["event"]!, v["date"]!, v["deps"] ?? "", v["evidence"] ?? "", u)) },
  { id: "premium-designer", features: ["BEN-05"], sections: ["04.4"], kind: "view", title: ["Premium designer", "مصمم الأقساط"],
    summary: ["Live: total premium and the company / employee split for a family.", "مباشر: إجمالي القسط وتقسيمه بين الشركة والموظف للأسرة."],
    inputs: [{ key: "ep", label: ["Employee premium", "قسط الموظف"], type: "number", def: "400" }, { key: "dp", label: ["Premium per dependent", "القسط لكل معال"], type: "number", def: "250" }, { key: "share", label: ["Company share %", "حصة الشركة %"], type: "number", def: "80" }, { key: "deps", label: ["Dependents", "المعالون"], type: "number", def: "3" }, { key: "max", label: ["Covered dependents (max)", "الحد الأقصى للمعالين"], type: "number", def: "5" }],
    run: (v) => { const p = B.premium({ employee_premium: n(v["ep"]), dependent_premium: n(v["dp"]), employer_share_pct: n(v["share"]), dependents: n(v["deps"]), max_dependents: n(v["max"]) || undefined as unknown as number });
      return view({ columns: [col("k", "Item", "البند"), col("v", "Monthly", "شهريًا", { money: true })], rows: [{ k: ["Covered dependents", "المعالون المغطون"], v: p.dependents }, { k: ["Total premium", "إجمالي القسط"], v: p.total }, { k: ["Company pays", "تدفع الشركة"], v: p.employer }, { k: ["Employee pays", "يدفع الموظف"], v: p.employee }] }); } },

  // ---------- 05.x service and engagement
  { id: "help", features: ["POR-01", "CAS-02"], sections: ["05.3", "05.1"], kind: "action", title: ["Help centre", "مركز المساعدة"], cta: ["Still need help — open a case", "ما زلت أحتاج مساعدة — افتح حالة"],
    summary: ["Search published policies in Arabic or English; if the answer is not there, open a case in the right category — an earlier open case of the same kind is shown, never blocked.", "ابحث في السياسات المنشورة بالعربية أو الإنجليزية؛ وإن لم تجد الإجابة افتح حالة بالفئة الصحيحة — وتظهر الحالة المفتوحة المشابهة دون منع."],
    inputs: [{ key: "q", label: ["Question", "السؤال"], type: "text", def: "" }, { ...EMPLOYEE, def: (u) => scopedList("Employee", u).find((e) => e["user_id"] === u)?.name ?? "" }, { key: "open", label: ["Open a case", "فتح حالة"], type: "check", optional: true }],
    run: (v, u) => { const hits = v["q"]!.trim().length < 2 ? [] : Sv.searchHelp(v["q"]!); const table: ToolTable = { columns: [col("a", "Article", "المقال"), col("c", "Category", "الفئة"), col("x", "Extract", "مقتطف")], rows: hits.map((h) => ({ a: doc("Help Article", h.name, h.title), c: h.category, x: h.snippet })) };
      if (v["open"] !== "1") return view(table);
      const r = Sv.createCase({ employee: v["employee"]!, category: Sv.categoryFor(`${v["q"]} ${hits[0]?.title ?? ""}`), subject: v["q"]!.slice(0, 120) || "Help request", ...(hits[0] ? { article: hits[0].name } : {}) }, u);
      return { ...fromAction(r, table), ...(r.duplicates?.length ? { warnings: [`An open case of the same kind exists: ${r.duplicates.join(", ")}`] } : {}) }; } },
  { id: "case-actions", features: ["CAS-03"], sections: ["05.3"], kind: "action", title: ["Case actions and SLA", "إجراءات الحالة واتفاقية الخدمة"], cta: ["Apply", "تطبيق"],
    summary: ["Put on hold (the deadline moves by the time on hold), resume, add a sub-case, close (refused while tasks are open) or reopen; cases at risk are listed.", "تعليق (يتأخر الموعد بمدة التعليق) واستئناف وإضافة حالة فرعية وإغلاق (يُرفض مع مهام مفتوحة) وإعادة فتح؛ وتُعرض الحالات المعرضة للتأخر."],
    inputs: [{ key: "case", label: ["Case", "الحالة"], type: "link", doctype: Sv.DSC, title: "subject", optional: true }, { key: "action", label: ["Action", "الإجراء"], type: "select", options: [["hold", "Put on hold", "تعليق"], ["resume", "Resume", "استئناف"], ["sub", "Add sub-case", "حالة فرعية"], ["close", "Close", "إغلاق"], ["reopen", "Reopen", "إعادة فتح"]] }, { key: "text", label: ["Reason / notes / subject", "السبب / الملاحظات / الموضوع"], type: "text", optional: true }],
    run: (v, u) => { const alerts = (): ToolTable => ({ columns: [col("c", "Case", "الحالة"), col("st", "SLA", "الالتزام"), col("r", "Time used %", "الوقت المستهلك %", { numeric: true })], rows: Sv.slaAlerts(new Date(), u).map((a) => ({ c: doc(Sv.DSC, a.name, a.subject), st: SLA[a.state] ?? a.state, r: a.ratio })) });
      if (!v["case"]) return view(alerts());
      const t = v["text"] ?? ""; const c = v["case"]!;
      const r = v["action"] === "hold" ? Sv.pauseCase(c, t || "On hold", u) : v["action"] === "resume" ? Sv.resumeCase(c, u) : v["action"] === "sub" ? Sv.addSubCase(c, t || "Sub-case", u) : v["action"] === "close" ? Sv.closeCase(c, t || "Resolved", u) : Sv.reopenCase(c, t || "Reopened", u);
      return fromAction(r, alerts()); } },
  { id: "confidential", features: ["CAS-05"], sections: ["05.3", "07.2"], kind: "action", title: ["Confidential case assignment", "إسناد الحالات السرية"], cta: ["Assign", "إسناد"],
    summary: ["Confidential cases are seen only by Employee Relations, HR Manager, the employee and the handler; a specialist with a conflict of interest (same reporting line or the subject) is refused.", "الحالات السرية لا يراها إلا علاقات الموظفين ومدير الموارد البشرية والموظف والمعالج؛ ويُرفض الأخصائي صاحب تعارض المصالح (نفس خط الإدارة أو طرف في الحالة)."],
    inputs: [{ key: "case", label: ["Confidential case", "الحالة السرية"], type: "link", doctype: Sv.DSC, title: "subject", where: (d) => Number(d["is_confidential"]) === 1 || d["category"] === "Confidential" }, { key: "specialist", label: ["Specialist", "الأخصائي"], type: "link", doctype: "User", title: "full_name" }],
    run: (v, u) => fromAction(Sv.assignConfidential(v["case"]!, v["specialist"]!, u)) },
  { id: "recognition", features: ["ENG-01"], sections: ["05.1", "05.2"], kind: "action", title: ["Recognition", "تقدير الزملاء"], cta: ["Post", "نشر"],
    summary: ["Thank a colleague publicly; the feed shows the company's latest recognitions you may see.", "اشكر زميلًا علنًا؛ وتعرض الصفحة آخر التقديرات المسموح لك برؤيتها في الشركة."],
    inputs: [{ ...EMPLOYEE, key: "from", label: ["From", "من"], def: (u) => scopedList("Employee", u).find((e) => e["user_id"] === u)?.name ?? "" }, { ...EMPLOYEE, key: "to", label: ["To", "إلى"], optional: true }, { key: "type", label: ["Recognition", "نوع التقدير"], type: "select", options: [["Thank You", "Thank you", "شكرًا"], ["Teamwork", "Teamwork", "روح الفريق"], ["Safety Star", "Safety star", "نجم السلامة"], ["Customer Hero", "Customer hero", "خدمة العملاء"], ["Innovation", "Innovation", "ابتكار"]] }, { key: "msg", label: ["Message", "الرسالة"], type: "text", optional: true }],
    run: (v, u) => { const r = v["to"] ? T.postRecognition(v["from"]!, v["to"]!, v["type"]!, v["msg"] ?? "", "Company", u) : undefined; const co = s(adapter.get("Employee", v["from"] ?? "")?.["company"]) || undefined;
      const table: ToolTable = { columns: [col("to", "Recognised", "المُقدَّر"), col("from", "From", "من"), col("t", "Type", "النوع"), col("m", "Message", "الرسالة"), col("l", "Likes", "الإعجابات", { numeric: true })], rows: T.recognitionFeed(co, u).slice(0, 20).map((x) => ({ to: doc("Employee", x["to_employee"], adapter.get("Employee", s(x["to_employee"]))?.["employee_name"]), from: s(adapter.get("Employee", s(x["from_employee"]))?.["employee_name"]) || s(x["from_employee"]), t: s(x["award_type"]), m: s(x["message"]), l: n(x["likes"]) })) };
      return r ? fromAction(r, table) : view(table); } },

  // ---------- 06.3 analytics
  { id: "report-wizard", features: ["ANL-02"], sections: ["06.3"], kind: "view", title: ["Report wizard", "معالج التقارير"],
    summary: ["Pick a document, a grouping and a measure: the preview updates live; salary fields appear only with salary permission.", "اختر مستندًا وتجميعًا ومقياسًا: تتحدث المعاينة مباشرة؛ ولا تظهر حقول الرواتب إلا بصلاحية الرواتب."],
    inputs: [{ key: "dt", label: ["Document", "المستند"], type: "select", options: HR_DOCTYPES }, { key: "group", label: ["Group by", "التجميع حسب"], type: "select", optional: true, options: (v) => [["", "No grouping", "بدون تجميع"], ...fieldOpts(v["dt"] || "Employee", ["Link", "Select", "Data"])] },
      { key: "fn", label: ["Measure", "المقياس"], type: "select", options: [["count", "Count", "العدد"], ["sum", "Sum", "المجموع"], ["avg", "Average", "المتوسط"]] }, { key: "field", label: ["Of field", "للحقل"], type: "select", optional: true, options: (v) => [["", "—", "—"], ...fieldOpts(v["dt"] || "Employee", ["Int", "Float", "Currency", "Percent"])] },
      { key: "ff", label: ["Filter field", "حقل التصفية"], type: "select", optional: true, options: (v) => [["", "No filter", "بدون تصفية"], ...fieldOpts(v["dt"] || "Employee", ["Link", "Select", "Data", "Date"])] }, { key: "fv", label: ["equals", "يساوي"], type: "text", optional: true }],
    run: (v, u) => { const dt = v["dt"] || "Employee"; const cols = A.fieldDictionary(dt, u).filter((f) => ["Link", "Select", "Data"].includes(f.fieldtype)).slice(0, 4).map((f) => f.fieldname);
      const spec: A.WizardSpec = { doctype: dt, columns: cols, ...(v["ff"] && v["fv"] ? { filters: [[v["ff"]!, "=", v["fv"]!]] } : {}), ...(v["group"] ? { groupBy: v["group"], aggregate: { fn: (v["fn"] || "count") as "count", ...(v["field"] ? { field: v["field"] } : {}) } } : {}), limit: 200 };
      const r = A.runWizard(spec, u); return view({ columns: r.columns, rows: r.rows as Record<string, Cell>[], totals: r.totals }); } },
  { id: "field-dictionary", features: ["ANL-02"], sections: ["06.3", "07.1"], kind: "view", title: ["Field dictionary", "قاموس الحقول"],
    summary: ["Every field of a document with its meaning; sensitive fields are marked and hidden without permission.", "كل حقول المستند مع معناها؛ والحقول الحساسة مميزة ومخفية دون صلاحية."],
    inputs: [{ key: "dt", label: ["Document", "المستند"], type: "select", options: HR_DOCTYPES }],
    run: (v, u) => view({ columns: [col("l", "Field", "الحقل"), col("t", "Type", "النوع"), col("d", "Meaning", "المعنى"), col("s", "Sensitive", "حساس")], rows: A.fieldDictionary(v["dt"] || "Employee", u).map((f) => ({ l: f.label, t: f.fieldtype, d: f.definition, s: yn(f.sensitive) })) }) },
  { id: "schedule-report", features: ["ANL-05"], sections: ["06.3"], kind: "action", title: ["Schedule and send reports", "جدولة التقارير وإرسالها"], cta: ["Schedule", "جدولة"],
    summary: ["Daily, weekly or monthly by e-mail in Arabic or English as CSV or Excel; due schedules are sent once per period.", "يوميًا أو أسبوعيًا أو شهريًا بالبريد بالعربية أو الإنجليزية بصيغة CSV أو Excel؛ وتُرسل الجداول المستحقة مرة واحدة لكل فترة."],
    inputs: [{ key: "report", label: ["Report", "التقرير"], type: "select", options: () => Object.keys(RUNNERS).filter((r) => /^(HR|Employee|Leave|Attendance|Salary|Payroll|Monthly|Recruitment|Job|Shift|Appraisal|Training|Expense|Gratuity|Saudi|GOSI|WPS|Headcount|Labour)/i.test(r)).sort().map((r) => [r, r, r] as [string, string, string]) },
      { key: "to", label: ["Send to (comma separated)", "إرسال إلى (مفصولة بفواصل)"], type: "text" }, { key: "freq", label: ["Frequency", "التكرار"], type: "select", options: [["Weekly", "Weekly", "أسبوعي"], ["Daily", "Daily", "يومي"], ["Monthly", "Monthly", "شهري"]] },
      { key: "lang", label: ["Language", "اللغة"], type: "select", options: [["ar", "Arabic", "العربية"], ["en", "English", "الإنجليزية"]] }, { key: "fmt", label: ["Format", "الصيغة"], type: "select", options: [["CSV", "CSV", "CSV"], ["XLSX", "Excel", "Excel"]] }, { key: "now", label: ["Send due reports now", "إرسال المستحق الآن"], type: "check", optional: true }],
    run: (v, u) => { if (v["now"] === "1") { const r = A.runDueReports(); return { ok: true, message: [`${r.sent} sent, ${r.skipped} not due.`, `أُرسل ${r.sent}، و${r.skipped} غير مستحق.`], ...(r.files[0] ? { file: { name: `${r.files[0].report}.csv`, mime: "text/csv", text: r.files[0].csv } } : {}) }; }
      const r = A.scheduleReport(v["report"]!, (v["to"] ?? "").split(/[,;\s]+/).filter(Boolean), (v["freq"] || "Weekly") as A.Freq, {}, { lang: v["lang"] === "en" ? "en" : "ar", format: v["fmt"] === "XLSX" ? "XLSX" : "CSV" }, u);
      const rows = adapter.list("Auto Email Report").filter((x) => x["user"] === u).map((x) => ({ r: s(x["report"]), f: s(x["frequency"]), t: s(x["email_to"]).replace(/\n/g, ", "), l: s(x["last_sent_on"]) }));
      return fromAction(r, { columns: [col("r", "Report", "التقرير"), col("f", "Frequency", "التكرار"), col("t", "To", "إلى"), col("l", "Last sent", "آخر إرسال")], rows }); } },
  { id: "assistant", features: ["ANL-09"], sections: ["06.3", "06.1"], kind: "view", title: ["Ask HR analytics", "اسأل تحليلات الموارد البشرية"],
    summary: ["Ask in plain words (headcount, on leave today, turnover, expiring documents, payroll cost, open cases); answers use only what you may see. Rule-based; an AI provider can be switched on in settings.", "اسأل بكلمات بسيطة (عدد الموظفين، في إجازة اليوم، الدوران، الوثائق المنتهية، تكلفة الرواتب، الحالات المفتوحة)؛ الإجابات مما يحق لك رؤيته فقط. بالقواعد؛ ويمكن تفعيل مزود ذكاء اصطناعي من الإعدادات."],
    inputs: [{ key: "q", label: ["Question", "السؤال"], type: "text", def: "" }],
    run: (v, u) => { if (v["q"]!.trim().length < 3) return view({ columns: [], rows: [] }); const a = A.askAssistant(v["q"]!, u); const keys = a.rows[0] ? Object.keys(a.rows[0]) : [];
      return view({ columns: keys.map((k) => col(k, k.replace(/_/g, " "), k.replace(/_/g, " "), typeof a.rows[0]![k] === "number" ? { numeric: true } : {})), rows: a.rows as Record<string, Cell>[] }, a.text); } },

  // ---------- 07.4 integrations
  { id: "webhooks", features: ["PLT-01"], sections: ["07.4"], kind: "action", title: ["Webhooks", "خطافات الويب"], cta: ["Send test event", "إرسال حدث تجريبي"],
    summary: ["Enabled webhooks fire on their document event with a signed payload through the exchange queue; send a test with the latest record.", "تُطلق الخطافات المفعلة عند حدث مستندها بحمولة موقعة عبر طابور التبادل؛ أرسل اختبارًا بآخر سجل."],
    inputs: [{ key: "hook", label: ["Webhook", "الخطاف"], type: "link", doctype: "Webhook", title: "webhook_doctype", where: (d) => Number(d["enabled"] ?? 1) === 1 }],
    run: (v, u) => { const w = adapter.get("Webhook", v["hook"]!); const dt = s(w?.["webhook_doctype"]); const last = dt ? scopedList(dt, u).slice(-1)[0] : undefined;
      if (!w || !last) return { ok: false, message: ["No record to send.", "لا يوجد سجل للإرسال."] };
      const ex = P.fireWebhooks(dt, s(w["webhook_docevent"]) || "on_update", last); return { ok: ex.length > 0, message: [`${ex.length} event(s) queued.`, `أُضيف ${ex.length} حدث للطابور.`], ...(ex.length ? { created: ex.map((e) => [PEX, e.name] as [string, string]) } : {}) }; } },
  { id: "exchange-queue", features: ["PLT-04", "INT-01"], sections: ["07.4"], kind: "action", title: ["Integration queue", "طابور التكاملات"], cta: ["Process queue", "معالجة الطابور"],
    summary: ["Every exchange with Mudad, Qiwa, Muqeem, GOSI, job boards, e-mail, SMS and the identity provider, with its status; processing retries failures safely and never sends twice.", "كل تبادل مع مدد وقوى ومقيم والتأمينات ومواقع التوظيف والبريد والرسائل ومزود الهوية مع حالته؛ والمعالجة تعيد المحاولة بأمان دون إرسال مرتين."],
    inputs: [{ key: "retry", label: ["Retry this failed exchange", "إعادة محاولة هذا التبادل"], type: "link", doctype: PEX, title: "operation", optional: true, where: (d) => s(d["status"]) === "Failed" }],
    run: (v) => { if (v["retry"]) retryExchange(v["retry"]!); const r = processQueue(); const rows = adapter.list(PEX).sort((a, b) => s(b["creation"]).localeCompare(s(a["creation"]))).slice(0, 40).map((x) => ({ x: doc(PEX, x.name, x["operation"]), p: s(x["provider"]), st: s(x["status"]), a: n(x["attempts"]), f: s(x["file_name"]) }));
      return { ok: true, message: [`${r.sent} sent, ${r.failed} failed, ${r.parked} parked.`, `أُرسل ${r.sent}، فشل ${r.failed}، متوقف ${r.parked}.`], table: { columns: [col("x", "Exchange", "التبادل"), col("p", "Provider", "المزود"), col("st", "Status", "الحالة"), col("a", "Attempts", "المحاولات", { numeric: true }), col("f", "File", "الملف")], rows } }; } },
  { id: "upgrade-gate", features: ["PLT-05"], sections: ["07.4", "07.1"], kind: "action", title: ["Update readiness", "جاهزية التحديث"], cta: ["Record run", "تسجيل التشغيل"],
    summary: ["Before an HR system update is released, every regression suite must pass; one failure blocks the release.", "قبل نشر تحديث نظام الموارد البشرية يجب أن تنجح كل مجموعات اختبار التراجع؛ وفشل واحد يوقف النشر."],
    inputs: [{ key: "version", label: ["HR system version", "إصدار النظام"], type: "text", def: "16.0" }, ...P.REGRESSION_SUITES.map((x) => ({ key: x.id, label: [x.en, x.ar] as Bi, type: "check" as const, optional: true }))],
    run: (v) => { const r = P.recordUpgradeRun(v["version"]!, Object.fromEntries(P.REGRESSION_SUITES.map((x) => [x.id, v[x.id] === "1"])));
      const rows = adapter.list("DIGIT Upgrade Readiness Run").sort((a, b) => s(b["run_on"]).localeCompare(s(a["run_on"]))).slice(0, 10).map((x) => ({ on: s(x["run_on"]), v: s(x["hrms_version"]), f: n(x["failures"]), r: (s(x["result"]) === "Ready" ? ["Ready", "جاهز"] : ["Blocked", "موقوف"]) as Bi }));
      return fromAction(r, { columns: [col("on", "Run", "التشغيل"), col("v", "Version", "الإصدار"), col("f", "Failures", "الإخفاقات", { numeric: true }), col("r", "Result", "النتيجة")], rows }); } },
];

const KIND: Record<P.SearchHit["kind"], Bi> = { employee: ["Employee", "موظف"], document: ["Document", "مستند"], section: ["Section", "قسم"], action: ["Action", "إجراء"] };
const ORG_KIND: Record<St.OrgNode["kind"], Bi> = { company: ["Company", "شركة"], branch: ["Branch", "فرع"], department: ["Department", "قسم"] };
const SLA: Record<string, Bi> = { "On track": ["On track", "في الموعد"], "At risk": ["At risk", "معرض للتأخر"], Breached: ["Breached", "متأخر"], Paused: ["On hold", "معلق"] };
function fieldOpts(dt: string, types: string[]): [string, string, string][] {
  try { return A.fieldDictionary(dt).filter((f) => types.includes(f.fieldtype)).map((f) => [f.fieldname, f.label[0], f.label[1]]); } catch { return []; }
}
function positionsTable(user: string): ToolTable {
  return { columns: [col("p", "Position", "المنصب"), col("d", "Department", "القسم"), col("st", "Approval", "الاعتماد"), col("by", "Approver", "المعتمد")],
    rows: scopedList(St.POS, user).slice(0, 40).map((p) => ({ p: doc(St.POS, p.name, p["position_title"]), d: s(p["department"]), st: s(p["approval_status"]) || "Approved", by: s(p["approver"]) })) };
}

export const toolsOf = (section: string) => HR_TOOLS.filter((t) => t.sections.includes(section));
export const toolById = (id: string) => HR_TOOLS.find((t) => t.id === id);
/** Initial values of a tool's inputs for a user (defaults; first permitted record for required links). */
export function initialValues(tool: HrTool, user: string): Values {
  const v: Values = {};
  for (const i of tool.inputs) {
    const d = typeof i.def === "function" ? i.def(user) : i.def;
    if (d !== undefined) v[i.key] = d;
    else if (i.type === "select" && !i.optional) { const o = typeof i.options === "function" ? i.options(v) : i.options ?? []; v[i.key] = o[0]?.[0] ?? ""; }
    else if (i.type === "link" && !i.optional) v[i.key] = linkOptions(i, v, user)[0]?.[0] ?? "";
    else v[i.key] = "";
  }
  return v;
}
/** Options of a link input: permitted records of its DocType, labelled by the title field. */
export function linkOptions(i: ToolInput, v: Values, user: string): [string, string][] {
  if (!i.doctype) return [];
  let rows: Doc[] = []; try { rows = scopedList(i.doctype, user); } catch { rows = []; }
  return rows.filter((d) => Number(d.docstatus ?? 0) !== 2 && (!i.where || i.where(d, v))).slice(0, 300).map((d) => [d.name, i.title && s(d[i.title]) ? `${s(d[i.title])} · ${d.name}` : d.name]);
}
/** Run a tool and turn any thrown error into a refused result (the screen never crashes on a rule). */
export function runTool(tool: HrTool, v: Values, user: string): ToolOut {
  const missing = tool.inputs.filter((i) => !i.optional && i.type !== "check" && !s(v[i.key]).trim()).map((i) => i.label[0]);
  if (missing.length && tool.kind === "action") return { ok: false, message: ["Fill the required fields.", "عبّئ الحقول المطلوبة."], errors: missing };
  try { return tool.run(v, user); } catch (e) { return { ok: false, message: ["The action was refused.", "رُفض الإجراء."], errors: [e instanceof Error ? e.message : String(e)] }; }
}
Cl.registerToolSections(() => HR_TOOLS.map((x) => x.sections));
