/**
 * Pro parity (guided setup + data completeness): Construction's go-live steps and master-data checks on the shared
 * Enterprise setup guide (src/lib/coreShared/setupGuide.ts registerSetupProvider). Steps are DONE from the records that
 * exist, never a stored tick; Finance values (P2 / P5 / P7) are shown as waiting for Finance, never filled in.
 * Read-only: nothing is stored or changed here.
 */
import type { Doc } from "@/lib/adapter";
import { canReadType, scopedList } from "@/lib/scope";
import { completenessCheck, registerSetupProvider, type CompletenessCheck, type SetupStep } from "@/lib/coreShared/setupGuide";
import { constructionProjects, settings } from "./domain/queues";
import { policyDefined } from "./domain/data";
import { SETTING_DEFS } from "./domain/settingsAdmin";

const s = (v: unknown) => (v == null ? "" : String(v));
const PUB = "/construction";
const POLICIES = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9"];
/** Finance values the owner reserved for Finance (empty = the ruled fallback applies). */
const FINANCE_KEYS = ["match_abs_cap", "budget_block_pct"];

export function constructionSetupSteps(company: string, user: string): SetupStep[] {
  const R = (dt: string) => canReadType(dt, user); const L = (dt: string) => (R(dt) ? scopedList(dt, user) : []);
  const st = settings(); const projects = constructionProjects({ company: company || undefined });
  const codes = L("Digit Cost Code").filter((c) => s(c["is_active"]) !== "No" && Number(c["active"] ?? 1) !== 0);
  const ruled = POLICIES.filter((p) => policyDefined(p));
  const fin = SETTING_DEFS.filter((d) => FINANCE_KEYS.includes(d.key)); const finSet = fin.filter((d) => st && s(st[d.key]) !== "" && Number(st[d.key]) !== 0);
  const profiles = new Set(L("Digit Subcontractor Profile").map((p) => s(p["supplier"])));
  return [
    { id: "con_settings", label: ["Construction settings", "إعدادات المقاولات"], why: ["Default company, stale-forecast period, thresholds and print choices every Construction screen reads.", "الشركة الافتراضية وفترة تقادم التوقع والحدود وخيارات الطباعة التي تقرؤها كل شاشات المقاولات."],
      done: !!st, detail: st ? ["Settings saved.", "الإعدادات محفوظة."] : ["Not saved yet — defaults apply.", "لم تُحفظ بعد — تُطبَّق القيم الافتراضية."], open: { kind: "route", to: `${PUB}/settings` }, readable: R("Digit Construction Settings") },
    { id: "con_cost_codes", label: ["Cost codes", "أكواد التكلفة"], why: ["Every budget line, commitment and actual is matched on cost code + category.", "كل سطر موازنة والتزام وفعلي يُطابَق على كود التكلفة + الفئة."],
      done: codes.length > 0, detail: [`${codes.length} active cost codes.`, `${codes.length} كود تكلفة نشط.`], open: { kind: "list", drill: { doctype: "Digit Cost Code", filters: [] } }, readable: R("Digit Cost Code") },
    { id: "con_projects", label: ["Construction projects", "مشاريع المقاولات"], why: ["Projects with a contract type (or a linked construction record) are the only projects Construction screens show.", "المشاريع ذات نوع العقد (أو المرتبطة بسجل مقاولات) هي وحدها التي تظهر في شاشات المقاولات."],
      done: projects.length > 0, detail: [`${projects.length} construction projects.`, `${projects.length} مشروع مقاولات.`], open: { kind: "list", drill: { doctype: "Project", filters: [["digit_contract_type", "is", "set"]] } }, readable: R("Project") },
    { id: "con_subcontractors", label: ["Subcontractor profiles", "ملفات مقاولي الباطن"], why: ["Compliance (CR, VAT, insurance) is checked from the subcontractor's profile before a work order or payment.", "يُتحقق من الامتثال (السجل والضريبة والتأمين) من ملف مقاول الباطن قبل أمر العمل أو الدفع."],
      done: profiles.size > 0, detail: [`${profiles.size} subcontractors with a profile.`, `${profiles.size} مقاول باطن له ملف.`], open: { kind: "list", drill: { doctype: "Digit Subcontractor Profile", filters: [] } }, readable: R("Digit Subcontractor Profile") },
    { id: "con_policies", label: ["Owner policy decisions P1–P9", "قرارات سياسات المالك P1–P9"], why: ["A final action that depends on an undefined policy stays blocked; drafts and calculations stay usable.", "يبقى الإجراء النهائي المعتمد على سياسة غير محددة ممنوعًا؛ وتبقى المسودات والحسابات متاحة."],
      done: ruled.length === POLICIES.length, detail: [`${ruled.length} of ${POLICIES.length} defined.`, `${ruled.length} من ${POLICIES.length} محددة.`], open: { kind: "route", to: `${PUB}/settings/policies` }, readable: R("Digit Policy Decision") },
    { id: "con_finance", label: ["Finance values (P5 tolerances, budget limit)", "قيم المالية (تفاوتات P5، حد الموازنة)"], why: ["Set by Finance only; while empty the ruled fallback applies (report only, warning only).", "تحددها المالية فقط؛ وما دامت فارغة يُطبَّق البديل المقرر (تقرير فقط، تنبيه فقط)."],
      done: fin.length > 0 && finSet.length === fin.length, detail: [`${finSet.length} of ${fin.length} set by Finance.`, `${finSet.length} من ${fin.length} حددتها المالية.`], open: { kind: "route", to: `${PUB}/settings` }, readable: R("Digit Construction Settings") },
  ];
}

export function constructionChecks(user: string): CompletenessCheck[] {
  const L = (dt: string) => (canReadType(dt, user) ? scopedList(dt, user) : []);
  const codes = L("Digit Cost Code").filter((c) => !Number(c["is_group"]) && s(c["is_active"]) !== "No");
  const projects = constructionProjects().filter((p) => canReadType("Project", user));
  const profiles = L("Digit Subcontractor Profile");
  const today = new Date().toISOString().slice(0, 10);
  return [
    completenessCheck("con_code_category", ["Cost codes without a category", "أكواد تكلفة بلا فئة"], ["Budget lines and actuals match on cost code + category.", "تُطابَق أسطر الموازنة والفعلي على كود التكلفة + الفئة."], "Digit Cost Code", codes, (c) => !s(c["category"]), user),
    completenessCheck("con_project_customer", ["Construction projects without a client or company", "مشاريع مقاولات بلا عميل أو شركة"], ["Claims, certificates and invoices bill the project's client in its company.", "تُفوتر المطالبات والشهادات والفواتير عميل المشروع في شركته."], "Project", projects, (p) => !s(p["customer"]) || !s(p["company"]), user),
    completenessCheck("con_project_type", ["Construction projects without a contract type", "مشاريع مقاولات بلا نوع عقد"], ["Contract type sets the revenue and billing basis of the project.", "نوع العقد يحدد أساس الإيراد والفوترة للمشروع."], "Project", projects, (p) => !s(p["digit_contract_type"]), user),
    completenessCheck("con_sub_compliance", ["Subcontractor profiles with missing or expired CR / VAT / insurance", "ملفات مقاولي باطن بسجل أو ضريبة أو تأمين ناقص أو منتهٍ"], ["A non-compliant subcontractor is flagged on work orders and payments.", "يُنبَّه على مقاول الباطن غير الممتثل في أوامر العمل والمدفوعات."], "Digit Subcontractor Profile", profiles,
      (p: Doc) => !s(p["cr_number"]) || !s(p["vat_number"]) || (!!s(p["cr_expiry"]) && s(p["cr_expiry"]) < today) || (!!s(p["insurance_expiry"]) && s(p["insurance_expiry"]) < today), user),
  ];
}

registerSetupProvider({ app: "digit_construction", steps: constructionSetupSteps, checks: constructionChecks });
