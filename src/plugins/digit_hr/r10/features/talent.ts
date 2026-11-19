/**
 * Round-2 talent features: REC-04 résumé reading with preview (rule-based, AI provider optional), REC-05 job-board and
 * LinkedIn posting through the provider queue, REC-09 interview summary only with the candidate's recorded consent,
 * REC-11 sourcing (profile import + talent pools), REC-13 quality of hire after start, REC-14 candidate retention
 * (mark only; anonymise by a manual HR decision), HIR-01/02/03 hire wizard with readiness gate and pending worker,
 * ONB-05 preboarding content and government forms, ONB-06 system access grant / revoke, TAL-01 9-box, TAL-03 career
 * explorer, ENG-01 peer recognition. Writes go through ../write.ts (scope + Before Save rules); each hire is idempotent.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { currentUser, userRoles } from "@/lib/session";
import { scopedList, scopedGet, assertScoped } from "../../compat/scope";
import { policyValue } from "../../product/settings";
import { providerMode, queueExchange, type Provider } from "../providers";
import { createDoc, updateDoc, guarded, ok, fail, s, n, d10, todayISO, nowISO, addDays, daysBetween, type ActionResult } from "../write";

const list = (dt: string, user = currentUser()): Doc[] => { try { return scopedList(dt, user); } catch { return []; } };
const r1 = (x: number) => Math.round(x * 10) / 10;
const isHrAdmin = (user: string) => user === "Administrator" || userRoles(user).some((r) => ["HR Manager", "CHRO", "System Manager", "Compliance Officer", "HR Admin"].includes(r));

/* ------------------------------------------------------------------ REC-04 résumé reading */
export interface ParsedResume { applicant_name: string; email_id: string; phone_number: string; skills: string[]; years: number; education: string; languages: string[]; confidence: number }
const DEGREES: [RegExp, string][] = [[/ph\.?d|doctorate|دكتوراه/i, "Doctorate"], [/master|m\.sc|mba|ماجستير/i, "Master"], [/bachelor|b\.sc|b\.a\b|بكالوريوس/i, "Bachelor"], [/diploma|دبلوم/i, "Diploma"]];
/** Read a pasted résumé: name, e-mail, Saudi / international phone, known skills (Skills Taxonomy + interview skills), years, degree. */
export function parseResume(text: string): ParsedResume {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) ?? [""])[0];
  const phone = ((text.match(/(?:\+?966|0)?5\d(?:[\s-]?\d){7}/) ?? text.match(/\+\d[\d\s-]{8,14}\d/) ?? [""])[0]).replace(/[\s-]/g, "");
  const name = lines.find((l) => !/@|\d{4,}|resume|cv|curriculum|سيرة/i.test(l) && l.split(/\s+/).length >= 2 && l.split(/\s+/).length <= 5) ?? "";
  const taxonomy = [...new Set([...adapter.list("DIGIT Skills Taxonomy").map((d) => s(d["skill_name"])), ...adapter.list("Skill").map((d) => s(d["skill_name"] || d.name)), ...adapter.list("Interview Type").flatMap((d) => ((d["expected_skill_set"] as Doc[] | undefined) ?? []).map((x) => s(x["skill"])))])].filter(Boolean);
  const low = text.toLowerCase();
  const skills = taxonomy.filter((k) => low.includes(k.toLowerCase()));
  const yrs = [...text.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?|سنوات|سنة)/gi)].map((m) => Number(m[1])).filter((x) => x < 50);
  const education = DEGREES.find(([re]) => re.test(text))?.[1] ?? "";
  const languages = [/arabic|العربية/i.test(text) ? "Arabic" : "", /english|الإنجليزية/i.test(text) ? "English" : ""].filter(Boolean);
  const found = [name, email, phone, skills.length ? "x" : "", education].filter(Boolean).length;
  return { applicant_name: name, email_id: email, phone_number: phone, skills, years: yrs.length ? Math.max(...yrs) : 0, education, languages, confidence: Math.round(found / 5 * 100) };
}
/** Apply the confirmed preview to a Job Applicant (only empty fields are filled; skills go to the notes). */
export function applyResume(applicant: string, p: ParsedResume, user = currentUser()): ActionResult {
  return guarded(() => {
    const a = scopedGet("Job Applicant", applicant, user); if (!a) return fail("Applicant not found or not permitted.", "المتقدم غير موجود أو غير مسموح.");
    const patch: Record<string, unknown> = {};
    if (!s(a["applicant_name"]) && p.applicant_name) patch["applicant_name"] = p.applicant_name;
    if (!s(a["email_id"]) && p.email_id) patch["email_id"] = p.email_id;
    if (!s(a["phone_number"]) && p.phone_number) patch["phone_number"] = p.phone_number;
    const note = [`Skills: ${p.skills.join(", ") || "—"}`, `Experience: ${p.years} years`, p.education ? `Education: ${p.education}` : "", p.languages.length ? `Languages: ${p.languages.join(", ")}` : ""].filter(Boolean).join("\n");
    patch["notes"] = [s(a["notes"]), note].filter(Boolean).join("\n");
    updateDoc("Job Applicant", applicant, patch, user);
    if (providerMode("AI") !== "Off") queueExchange({ provider: "AI", operation: "Summarise", doctype: "Job Applicant", name: applicant, payload: { kind: "resume", fields: Object.keys(patch) } });
    return ok("Résumé details added to the applicant.", "أُضيفت بيانات السيرة إلى المتقدم.", { data: patch });
  });
}

/* ------------------------------------------------------------------ REC-05 posting */
export const POST_CHANNELS: { id: string; provider: Provider; en: string; ar: string }[] = [
  { id: "LinkedIn", provider: "LinkedIn", en: "LinkedIn", ar: "لينكدإن" }, { id: "Bayt", provider: "Job Boards", en: "Bayt", ar: "بيت.كوم" },
  { id: "Indeed", provider: "Job Boards", en: "Indeed", ar: "إنديد" }, { id: "Tanqeeb", provider: "Job Boards", en: "Tanqeeb", ar: "تنقيب" }, { id: "Careers Page", provider: "Job Boards", en: "Careers page", ar: "صفحة الوظائف" },
];
/** Post an open Job Opening to the chosen channels: one DIGIT Job Posting + one provider exchange per channel (never twice). */
export function postJob(opening: string, channels: string[], user = currentUser()): ActionResult {
  return guarded(() => {
    const jo = scopedGet("Job Opening", opening, user); if (!jo) return fail("Job opening not found or not permitted.", "الوظيفة الشاغرة غير موجودة أو غير مسموحة.");
    if (s(jo["status"]) !== "Open") return fail("Only an open job opening can be posted.", "تُنشر الوظائف الشاغرة المفتوحة فقط.");
    const created: [string, string][] = []; const skipped: string[] = [];
    for (const ch of channels) {
      const c = POST_CHANNELS.find((x) => x.id === ch); if (!c) { skipped.push(ch); continue; }
      if (adapter.list("DIGIT Job Posting").some((p) => p["job_opening"] === opening && p["channel"] === ch && s(p["status"]) !== "Closed")) { skipped.push(ch); continue; }
      const q = queueExchange({ provider: c.provider, operation: "Post Job", doctype: "Job Opening", name: opening, payload: { channel: ch, title: jo["job_title"], designation: jo["designation"], location: jo["location"], closes_on: jo["closes_on"], description: s(jo["description"]).slice(0, 2000) }, key: `post|${opening}|${ch}` });
      if (q.refused) { skipped.push(`${ch} (${q.refused[0]})`); continue; }
      const d = createDoc("DIGIT Job Posting", { job_opening: opening, channel: ch, posted_on: todayISO(), status: "Queued", exchange: q.doc?.name ?? "", external_url: "", applicants_received: 0 }, user);
      created.push(["DIGIT Job Posting", d.name]);
    }
    return created.length ? ok(`Posted to ${created.length} channel(s).`, `نُشرت في ${created.length} قناة.`, { created, ...(skipped.length ? { errors: skipped.map((x) => `Skipped: ${x}`) } : {}) }) : fail("Nothing new to post (already posted or unknown channel).", "لا جديد للنشر (منشورة مسبقًا أو قناة غير معروفة).", skipped);
  });
}
/** Read provider acknowledgements back onto the postings (status Live + the external link). */
export function syncPostings(): number {
  let k = 0;
  for (const p of adapter.list("DIGIT Job Posting").filter((x) => s(x["status"]) === "Queued" && s(x["exchange"]))) {
    const ex = adapter.get("DIGIT Provider Exchange", s(p["exchange"]));
    if (ex && s(ex["status"]) === "Acknowledged") { adapter.update("DIGIT Job Posting", p.name, { status: "Live", external_url: `https://jobs.example.sa/${s(p["channel"]).toLowerCase().replace(/\s+/g, "-")}/${p["job_opening"]}` }); k++; }
    else if (ex && s(ex["status"]) === "Failed") { adapter.update("DIGIT Job Posting", p.name, { status: "Failed" }); }
  }
  return k;
}

/* ------------------------------------------------------------------ REC-09 interview summary with consent */
const POS = /strong|excellent|good|clear|experienced|confident|solid|impressive|ممتاز|قوي|جيد|واضح|خبرة/i;
const NEG = /weak|lack|unclear|concern|limited|late|nervous|poor|ضعيف|يفتقر|غير واضح|قلق|محدود/i;
export function consentOf(applicant: string, type = "Interview Recording"): Doc | undefined {
  return adapter.list("DIGIT Candidate Consent").filter((c) => c["job_applicant"] === applicant && c["consent_type"] === type).sort((a, b) => s(b["given_on"]).localeCompare(s(a["given_on"])))[0];
}
export function recordConsent(applicant: string, type: string, given: boolean, channel = "Portal", user = currentUser()): ActionResult {
  return guarded(() => {
    const a = scopedGet("Job Applicant", applicant, user); if (!a) return fail("Applicant not found or not permitted.", "المتقدم غير موجود أو غير مسموح.");
    const months = policyValue("candidate_retention_months", todayISO()) ?? 24;
    const d = createDoc("DIGIT Candidate Consent", { job_applicant: applicant, applicant_name: a["applicant_name"], consent_type: type, given_on: todayISO(), retain_until: addDays(todayISO(), months * 30), status: given ? "Given" : "Withdrawn", channel }, user);
    return ok(given ? "Consent recorded." : "Consent withdrawal recorded.", given ? "سُجلت الموافقة." : "سُجل سحب الموافقة.", { created: [["DIGIT Candidate Consent", d.name]] });
  });
}
/** Summarise interviewer notes into strengths / concerns on a DIGIT Hiring Scorecard — refused without recording consent. */
export function summariseInterview(interview: string, notes: string, rating: number, user = currentUser()): ActionResult {
  return guarded(() => {
    const iv = scopedGet("Interview", interview, user); if (!iv) return fail("Interview not found or not permitted.", "المقابلة غير موجودة أو غير مسموحة.");
    const ap = s(iv["job_applicant"]); const c = consentOf(ap);
    if (!c || s(c["status"]) !== "Given") return fail("The candidate has not consented to recording and summarising this interview.", "لم يوافق المرشح على تسجيل المقابلة وتلخيصها.");
    const sentences = notes.split(/(?<=[.!؟?\n])\s*/).map((x) => x.trim()).filter(Boolean);
    const strengths = sentences.filter((x) => POS.test(x) && !NEG.test(x)); const concerns = sentences.filter((x) => NEG.test(x));
    const summary = `${sentences.length} notes · ${strengths.length} strengths · ${concerns.length} concerns · rating ${rating}/5`;
    const rec = rating >= 4 && concerns.length <= 1 ? "Hire" : rating >= 3 ? "Hold" : "Reject";
    const d = createDoc("DIGIT Hiring Scorecard", { job_applicant: ap, interview, interviewer: user, overall_rating: rating, recommendation: rec, recording_consent: 1, notes, summary, strengths: strengths.join("\n"), concerns: concerns.join("\n") }, user);
    return ok(`Summary saved (${rec}).`, `حُفظ الملخص (${rec === "Hire" ? "توظيف" : rec === "Hold" ? "انتظار" : "رفض"}).`, { created: [["DIGIT Hiring Scorecard", d.name]], data: { strengths, concerns, rec } });
  });
}

/* ------------------------------------------------------------------ REC-11 sourcing + talent pools */
export function importProfile(profile: string, opening: string | undefined, pool: string | undefined, user = currentUser()): ActionResult {
  return guarded(() => {
    const p = parseResume(profile); const url = (profile.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i) ?? [""])[0];
    if (!p.applicant_name && !p.email_id) return fail("No name or e-mail found in the profile.", "لم يُعثر على اسم أو بريد في الملف.");
    const dup = p.email_id ? adapter.list("Job Applicant").find((a) => s(a["email_id"]).toLowerCase() === p.email_id.toLowerCase()) : undefined;
    const created: [string, string][] = [];
    const ap = dup ?? createDoc("Job Applicant", { applicant_name: p.applicant_name || p.email_id, email_id: p.email_id, phone_number: p.phone_number, job_title: opening ?? "", status: "Open", source: "Campaign", source_name: "LinkedIn", resume_link: url, notes: `Sourced from LinkedIn. Skills: ${p.skills.join(", ") || "—"}` }, user);
    if (!dup) created.push(["Job Applicant", ap.name]);
    queueExchange({ provider: "LinkedIn", operation: "Import Profile", doctype: "Job Applicant", name: ap.name, payload: { url, email: p.email_id }, key: `import|${p.email_id || url || ap.name}` });
    if (pool) { const r = addToPool(pool, { job_applicant: ap.name }, user); if (!r.ok) return r; }
    return ok(dup ? "Already in the pipeline — linked to the existing applicant." : "Profile imported as an applicant.", dup ? "موجود مسبقًا — رُبط بالمتقدم الحالي." : "استُورد الملف كمتقدم.", { created, data: { applicant: ap.name, duplicate: !!dup } });
  });
}
export function addToPool(pool: string, who: { employee?: string; job_applicant?: string }, user = currentUser()): ActionResult {
  return guarded(() => {
    const p = adapter.get("DIGIT Talent Pool", pool); if (!p) return fail("Talent pool not found.", "مجمع المواهب غير موجود.");
    const members = ((p["members"] as Doc[] | undefined) ?? []);
    if (members.some((m) => (who.employee && m["employee"] === who.employee) || (who.job_applicant && m["job_applicant"] === who.job_applicant))) return ok("Already in the pool.", "موجود في المجمع.");
    const nm = who.employee ? s(adapter.get("Employee", who.employee)?.["employee_name"]) : s(adapter.get("Job Applicant", who.job_applicant ?? "")?.["applicant_name"]);
    updateDoc("DIGIT Talent Pool", pool, { members: [...members, { idx: members.length + 1, member_type: who.employee ? "Employee" : "Candidate", employee: who.employee ?? "", job_applicant: who.job_applicant ?? "", member_name: nm, source: who.employee ? "Internal" : "LinkedIn", added_on: todayISO() }] }, user);
    return ok(`${nm} added to the pool.`, `أُضيف ${nm} إلى المجمع.`);
  });
}

/* ------------------------------------------------------------------ REC-13 quality of hire */
/** New hires whose review is due: joined at least quality_of_hire_days ago, hired through an applicant, no review yet. */
export function qualityOfHireDue(on = todayISO(), user = currentUser()): Doc[] {
  const days = policyValue("quality_of_hire_days", on) ?? 90;
  const done = new Set(adapter.list("DIGIT Quality of Hire Review").map((r) => s(r["employee"])));
  return list("Employee", user).filter((e) => s(e["job_applicant"]) && d10(e["date_of_joining"]) && daysBetween(d10(e["date_of_joining"]), on) >= days && daysBetween(d10(e["date_of_joining"]), on) <= days + 180 && !done.has(e.name));
}
export function recordQualityOfHire(employee: string, rating: number, wouldRehire: boolean, comments: string, user = currentUser(), on = todayISO()): ActionResult {
  return guarded(() => {
    const e = scopedGet("Employee", employee, user); if (!e) return fail("Employee not found or not permitted.", "الموظف غير موجود أو غير مسموح.");
    if (rating < 1 || rating > 5) return fail("Rating is from 1 to 5.", "التقييم من 1 إلى 5.");
    const ap = adapter.get("Job Applicant", s(e["job_applicant"]));
    const d = createDoc("DIGIT Quality of Hire Review", { employee, employee_name: e["employee_name"], company: e["company"], job_applicant: s(e["job_applicant"]), source: s(ap?.["source_name"] || ap?.["source"]) || "Direct", review_date: on, days_since_start: daysBetween(d10(e["date_of_joining"]), on), manager_rating: rating, would_rehire: wouldRehire ? 1 : 0, comments }, user);
    return ok("Quality-of-hire review saved.", "حُفظ تقييم جودة التعيين.", { created: [["DIGIT Quality of Hire Review", d.name]] });
  });
}
export function qualityBySource(user = currentUser()): { source: string; reviews: number; avg_rating: number; rehire_pct: number }[] {
  const g = new Map<string, Doc[]>(); for (const r of list("DIGIT Quality of Hire Review", user)) { const k = s(r["source"]) || "Direct"; const a = g.get(k); if (a) a.push(r); else g.set(k, [r]); }
  return [...g].map(([source, v]) => ({ source, reviews: v.length, avg_rating: r1(v.reduce((a, r) => a + n(r["manager_rating"]), 0) / v.length), rehire_pct: Math.round(v.filter((r) => Number(r["would_rehire"]) === 1).length / v.length * 100) })).sort((a, b) => b.avg_rating - a.avg_rating);
}

/* ------------------------------------------------------------------ REC-14 retention */
/** Daily mark: applicants past retain_until (never deleted automatically); returns the marked list. */
export function retentionSweep(on = todayISO()): Doc[] {
  const months = policyValue("candidate_retention_months", on) ?? 24;
  return adapter.list("Job Applicant").filter((a) => Number(a["digit_anonymised"] ?? 0) !== 1 && s(a["status"]) !== "Accepted" && (d10(a["retain_until"]) || addDays(d10(a["creation"]) || on, months * 30)) < on);
}
export function anonymiseApplicant(name: string, user = currentUser()): ActionResult {
  return guarded(() => {
    if (!isHrAdmin(user)) return fail("Only HR managers or compliance can anonymise a candidate.", "إخفاء هوية المرشح لمديري الموارد البشرية أو الامتثال فقط.");
    const a = adapter.get("Job Applicant", name); if (!a) return fail("Applicant not found.", "المتقدم غير موجود.");
    if (Number(a["digit_anonymised"] ?? 0) === 1) return ok("Already anonymised.", "مخفي الهوية مسبقًا.");
    adapter.update("Job Applicant", name, { applicant_name: `Anonymised ${name}`, email_id: "", phone_number: "", notes: "", resume_link: "", resume_attachment: "", cover_letter: "", digit_anonymised: 1 });
    adapter.insertDoc("DIGIT HR Audit Event", { event_time: nowISO(), user, event_type: "Anonymise", reference_doctype: "Job Applicant", reference_name: name, details: "Candidate personal data removed after the retention period (manual HR decision)" });
    return ok("Candidate anonymised; the decision is in the audit log.", "أُخفيت هوية المرشح وسُجل القرار في سجل التدقيق.");
  });
}

/* ------------------------------------------------------------------ HIR-01 / HIR-02 / HIR-03 hire wizard */
export interface HireInput { date_of_joining: string; gender?: string; date_of_birth?: string; national_id?: string; iqama_number?: string; nationality?: string; iban?: string; bank_name?: string; contract_type?: string; contract_end?: string; salary_structure?: string; base?: number; department?: string; reports_to?: string; branch?: string; position?: string }
export interface Readiness { key: string; ok: boolean; en: string; ar: string; fix: string }
/** Fields copied once from the offer / applicant / onboarding into the new Employee (no field is typed twice). */
export function inheritance(offer: Doc): { field: string; value: unknown; from: string }[] {
  const ap = adapter.get("Job Applicant", s(offer["job_applicant"])); const onb = adapter.list("Employee Onboarding").find((b) => b["job_applicant"] === offer["job_applicant"] && Number(b.docstatus) !== 2);
  const jo = adapter.get("Job Opening", s(ap?.["job_title"]));
  return [
    { field: "employee_name", value: offer["applicant_name"] || ap?.["applicant_name"], from: "Job Offer" }, { field: "personal_email", value: ap?.["email_id"] ?? offer["applicant_email"], from: "Job Applicant" },
    { field: "cell_number", value: ap?.["phone_number"], from: "Job Applicant" }, { field: "designation", value: offer["designation"], from: "Job Offer" },
    { field: "company", value: offer["company"], from: "Job Offer" }, { field: "department", value: onb?.["department"] || jo?.["department"], from: onb?.["department"] ? "Employee Onboarding" : "Job Opening" },
    { field: "digit_position", value: jo?.["digit_position"], from: "Job Opening" }, { field: "date_of_joining", value: onb?.["date_of_joining"], from: "Employee Onboarding" },
  ];
}
export function hireReadiness(offerName: string, inp: HireInput): Readiness[] {
  const offer = adapter.get("Job Offer", offerName);
  return [
    { key: "offer", ok: s(offer?.["status"]) === "Accepted", en: "Offer accepted", ar: "العرض مقبول", fix: "Job Offer" },
    { key: "id", ok: !!(s(inp.national_id) || s(inp.iqama_number)), en: "National ID or Iqama recorded", ar: "رقم الهوية أو الإقامة مسجل", fix: "national_id" },
    { key: "contract", ok: !!s(inp.contract_type), en: "Employment contract terms chosen", ar: "شروط عقد العمل محددة", fix: "contract_type" },
    { key: "iban", ok: /^SA\d{22}$/.test(s(inp.iban).replace(/\s/g, "").toUpperCase()), en: "Saudi IBAN for salary (WPS)", ar: "آيبان سعودي للراتب (حماية الأجور)", fix: "iban" },
    { key: "salary", ok: !!s(inp.salary_structure) && n(inp.base) > 0, en: "Salary structure and base pay", ar: "هيكل الراتب والأساسي", fix: "salary_structure" },
    { key: "joining", ok: /^\d{4}-\d{2}-\d{2}$/.test(s(inp.date_of_joining)), en: "Start date", ar: "تاريخ المباشرة", fix: "date_of_joining" },
    { key: "personal", ok: !!s(inp.gender) && !!s(inp.date_of_birth), en: "Gender and date of birth", ar: "الجنس وتاريخ الميلاد", fix: "gender" },
  ];
}
/** Offer → Employee (+ contract, salary assignment draft, onboarding link, pending worker when the start is in the future), once. */
export function completeHire(offerName: string, inp: HireInput, user = currentUser(), on = todayISO()): ActionResult {
  return guarded(() => {
    const offer = scopedGet("Job Offer", offerName, user); if (!offer) return fail("Job offer not found or not permitted.", "عرض العمل غير موجود أو غير مسموح.");
    const ap = s(offer["job_applicant"]);
    const existing = adapter.list("Employee").find((e) => ap && e["job_applicant"] === ap);
    if (existing) return ok(`Already hired as ${existing.name}; nothing was created twice.`, `عُيّن مسبقًا برقم ${existing.name}؛ لم يُنشأ شيء مرتين.`, { data: { employee: existing.name, duplicate: true } });
    const ready = hireReadiness(offerName, inp); const missing = ready.filter((r) => !r.ok);
    if (missing.length) return fail("Hire readiness is not complete.", "جاهزية التعيين غير مكتملة.", missing.map((m) => m.en));
    assertScoped("Employee", "create", { doctype: "Employee", name: "", company: offer["company"] } as Doc, user);
    const inh = Object.fromEntries(inheritance(offer).filter((x) => x.value).map((x) => [x.field, x.value]));
    const future = inp.date_of_joining > on;
    const created: [string, string][] = [];
    let emp: Doc | undefined;
    adapter.batch(() => {
      const nm = s(inh["employee_name"]); const [first, ...rest] = nm.split(/\s+/);
      emp = adapter.insertDoc("Employee", { ...inh, first_name: first, last_name: rest.join(" "), employee_name: nm, date_of_joining: inp.date_of_joining, gender: inp.gender, date_of_birth: inp.date_of_birth, nationality: inp.nationality ?? "", iban: s(inp.iban).replace(/\s/g, "").toUpperCase(), bank_name: inp.bank_name ?? "", department: inp.department || inh["department"] || "", reports_to: inp.reports_to ?? "", branch: inp.branch ?? "", digit_position: inp.position || inh["digit_position"] || "", job_applicant: ap, status: future ? "Inactive" : "Active" });
      created.push(["Employee", emp.name]);
      if (inp.national_id || inp.iqama_number) { const doc = adapter.insertDoc("DIGIT Employee Document", { employee: emp.name, employee_name: nm, company: offer["company"], document_type: inp.iqama_number ? "Iqama" : "National ID", document_number: inp.iqama_number || inp.national_id, status: "Valid" }); created.push(["DIGIT Employee Document", doc.name]); }
      const c = adapter.insertDoc("DIGIT Employment Contract", { employee: emp.name, employee_name: nm, company: offer["company"], contract_type: inp.contract_type, start_date: inp.date_of_joining, end_date: inp.contract_end ?? "", contract_status: "Draft", probation_days: policyValue("probation_days", on, s(offer["company"])) ?? 90, notice_days: policyValue("notice_days_employer", on, s(offer["company"])) ?? 60 });
      created.push(["DIGIT Employment Contract", c.name]);
      const ssa = adapter.insertDoc("Salary Structure Assignment", { employee: emp.name, employee_name: nm, company: offer["company"], salary_structure: inp.salary_structure, from_date: inp.date_of_joining, base: inp.base, currency: "SAR", docstatus: 0 });
      created.push(["Salary Structure Assignment", ssa.name]);
      const onb = adapter.list("Employee Onboarding").find((b) => b["job_applicant"] === ap && Number(b.docstatus) !== 2);
      if (onb) adapter.update("Employee Onboarding", onb.name, { employee: emp.name, employee_name: nm, date_of_joining: inp.date_of_joining });
      if (future) { const pw = adapter.insertDoc("DIGIT Pending Worker", { full_name: nm, company: offer["company"], job_offer: offerName, designation: offer["designation"], department: inp.department ?? "", expected_start: inp.date_of_joining, status: "Pending", employee: emp.name }); created.push(["DIGIT Pending Worker", pw.name]); }
      if (adapter.get("Job Applicant", ap)) adapter.update("Job Applicant", ap, { status: "Accepted" });
      adapter.insertDoc("DIGIT Employee Lifecycle Event", { employee: emp.name, employee_name: nm, company: offer["company"], event_type: "Hire", event_date: inp.date_of_joining, reference_doctype: "Job Offer", reference_name: offerName, summary: future ? "Hired as pending worker until the start date" : "Hired" });
    });
    return ok(future ? `Pending worker ${emp!.name} created; becomes active on ${inp.date_of_joining}.` : `Employee ${emp!.name} created.`, future ? `أُنشئ عامل معلّق ${emp!.name}؛ يصبح نشطًا في ${inp.date_of_joining}.` : `أُنشئ الموظف ${emp!.name}.`, { created, data: { employee: emp!.name } });
  });
}
/** HIR-03: pending workers whose start date arrived become Active employees (Pending Worker → Converted). */
export function activatePendingWorkers(on = todayISO()): number {
  let k = 0;
  adapter.batch(() => {
    for (const p of adapter.list("DIGIT Pending Worker").filter((x) => s(x["status"]) === "Pending" && d10(x["expected_start"]) <= on)) {
      const e = adapter.get("Employee", s(p["employee"])); if (e && s(e["status"]) === "Inactive") adapter.update("Employee", e.name, { status: "Active" });
      adapter.update("DIGIT Pending Worker", p.name, { status: "Converted" }); k++;
    }
  });
  return k;
}

/* ------------------------------------------------------------------ ONB-05 preboarding content + government forms */
const GOV_FORMS: [string, string][] = [["GOSI registration", "Government Form"], ["Qiwa contract authentication", "Government Form"], ["Medical insurance enrolment", "Government Form"], ["Muqeem iqama transfer (non-Saudi)", "Government Form"]];
export function applyPreboarding(onboarding: string, pkg: string, user = currentUser()): ActionResult {
  return guarded(() => {
    const b = scopedGet("Employee Onboarding", onboarding, user); const p = adapter.get("DIGIT Preboarding Package", pkg);
    if (!b || !p) return fail("Onboarding or package not found.", "التهيئة أو الحزمة غير موجودة.");
    const exists = new Set(adapter.list("DIGIT Onboarding Milestone").filter((m) => m["employee_onboarding"] === onboarding).map((m) => s(m["milestone"])));
    const start = d10(b["date_of_joining"] || b["boarding_begins_on"]) || todayISO();
    const items: [string, string, string, string][] = [];
    if (s(p["welcome_video_url"])) items.push(["Welcome video", "Learning", s(p["welcome_video_url"]), addDays(start, -3)]);
    const forms = s(p["government_forms"]).split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    for (const [f, t] of forms.length ? forms.map((f) => [f, "Government Form"] as [string, string]) : GOV_FORMS) items.push([f, t, "", addDays(start, 7)]);
    for (const d of s(p["documents_required"]).split(/\n|,/).map((x) => x.trim()).filter(Boolean)) items.push([`Upload: ${d}`, "Document", "", addDays(start, -1)]);
    const created: [string, string][] = [];
    adapter.batch(() => { for (const [m, t, url, due] of items) { if (exists.has(m)) continue; const d = adapter.insertDoc("DIGIT Onboarding Milestone", { employee_onboarding: onboarding, employee: b["employee"] ?? "", milestone: m, milestone_type: t, due_date: due, owner_role: t === "Government Form" ? "HR Operations" : "Employee", status: "Open", resource_url: url }); created.push(["DIGIT Onboarding Milestone", d.name]); } });
    return ok(`${created.length} preboarding step(s) added.`, `أُضيفت ${created.length} خطوة تهيئة مسبقة.`, { created });
  });
}

/* ------------------------------------------------------------------ ONB-06 system access */
export const SYSTEMS = ["E-mail", "ERP account", "Building badge", "VPN", "Payroll self-service"];
export function provisionAccess(employee: string, action: "Grant" | "Revoke", systems = SYSTEMS, on = todayISO(), source?: [string, string], user = currentUser()): ActionResult {
  return guarded(() => {
    const e = adapter.get("Employee", employee); if (!e) return fail("Employee not found.", "الموظف غير موجود.");
    const delay = action === "Revoke" ? (policyValue("access_revoke_days", on, s(e["company"])) ?? 0) : 0;
    const when = addDays(on, delay); const created: [string, string][] = [];
    for (const sys of systems) {
      if (adapter.list("DIGIT Access Provision Request").some((r) => r["employee"] === employee && r["system"] === sys && r["action"] === action && s(r["status"]) !== "Cancelled")) continue;
      const d = createDoc("DIGIT Access Provision Request", { employee, employee_name: e["employee_name"], company: e["company"], action, system: sys, scheduled_for: when, status: "Scheduled", source_doctype: source?.[0] ?? "", source_name: source?.[1] ?? "" }, user, { skipPerm: true });
      created.push(["DIGIT Access Provision Request", d.name]);
    }
    return ok(`${created.length} access request(s) scheduled for ${when}.`, `جُدول ${created.length} طلب صلاحية في ${when}.`, { created });
  });
}
/** Send the access requests that are due to the identity provider (one exchange each). */
export function runAccessQueue(on = todayISO()): number {
  let k = 0;
  for (const r of adapter.list("DIGIT Access Provision Request").filter((x) => s(x["status"]) === "Scheduled" && d10(x["scheduled_for"]) <= on)) {
    const q = queueExchange({ provider: "Identity Provider", operation: r["action"] === "Grant" ? "Grant Access" : "Revoke Access", doctype: "DIGIT Access Provision Request", name: r.name, payload: { employee: r["employee"], system: r["system"] } });
    if (q.refused) continue;
    adapter.update("DIGIT Access Provision Request", r.name, { status: "Sent", exchange: q.doc?.name ?? "" }); k++;
  }
  return k;
}

/* ------------------------------------------------------------------ TAL-01 9-box */
export type Band = "Low" | "Medium" | "High";
export interface NineBox { cells: { perf: Band; pot: Band; employees: { name: string; employee_name: string; risk: string }[] }[]; unrated: string[] }
const perfBand = (score: number): Band => (score >= 3.75 ? "High" : score >= 2.5 ? "Medium" : "Low");
/** Performance from the latest submitted Appraisal, potential from Appraisal.potential_rating or Role Readiness; risk from succession / readiness. */
export function nineBox(company?: string, user = currentUser()): NineBox {
  const apps = list("Appraisal", user).filter((a) => Number(a.docstatus) !== 2 && n(a["final_score"]) > 0);
  const latest = new Map<string, Doc>(); for (const a of apps.sort((x, y) => d10(x["end_date"]).localeCompare(d10(y["end_date"])))) latest.set(s(a["employee"]), a);
  const readiness = new Map(list("DIGIT Role Readiness", user).map((r) => [s(r["employee"]), r]));
  const risk = new Map(list("DIGIT Succession Plan", user).map((p) => [s(p["successor"]), s(p["risk_of_loss"])]));
  const bands: Band[] = ["Low", "Medium", "High"];
  const cells = bands.flatMap((pot) => bands.map((perf) => ({ perf, pot, employees: [] as { name: string; employee_name: string; risk: string }[] })));
  const unrated: string[] = [];
  for (const e of list("Employee", user).filter((x) => s(x["status"]) === "Active" && (!company || x["company"] === company))) {
    const a = latest.get(e.name); if (!a) { unrated.push(e.name); continue; }
    const pot = (s(a["potential_rating"]) || s(readiness.get(e.name)?.["potential_rating"]) || "Medium") as Band;
    const cell = cells.find((c) => c.perf === perfBand(n(a["final_score"])) && c.pot === (bands.includes(pot) ? pot : "Medium"))!;
    cell.employees.push({ name: e.name, employee_name: s(e["employee_name"]), risk: risk.get(e.name) || s(readiness.get(e.name)?.["flight_risk"]) || "" });
  }
  return { cells, unrated };
}

/* ------------------------------------------------------------------ TAL-03 career explorer */
export function careerExplorer(employee: string, user = currentUser()) {
  const e = scopedGet("Employee", employee, user); if (!e) return null;
  const profile = adapter.list("DIGIT Job Profile").find((p) => p["designation"] === e["designation"]);
  const paths = adapter.list("DIGIT Career Path").filter((p) => ((p["steps"] as Doc[] | undefined) ?? []).some((st) => st["job_profile"] === profile?.name));
  const next = paths.flatMap((p) => { const steps = ((p["steps"] as Doc[] | undefined) ?? []).sort((a, b) => n(a["step_no"]) - n(b["step_no"])); const i = steps.findIndex((st) => st["job_profile"] === profile?.name); return i >= 0 && steps[i + 1] ? [{ path: p.name, path_name: s(p["path_name"]), step: steps[i + 1]!, years: n(steps[i + 1]!["typical_years"]) }] : []; });
  const have = new Set([...adapter.list("DIGIT Skills Matrix").filter((x) => x["employee"] === employee).map((x) => s(x["skill"]).toLowerCase()), ...adapter.list("DIGIT Employee Skill Evidence").filter((x) => x["employee"] === employee && s(x["approval_status"]) !== "Rejected").map((x) => s(x["skill"]).toLowerCase())]);
  const options = next.map((x) => {
    const req = s(x.step["required_skills"]).split(/,|\n/).map((t) => t.trim()).filter(Boolean);
    const tp = adapter.get("DIGIT Job Profile", s(x.step["job_profile"]));
    return { ...x, target: s(tp?.["profile_name"]) || s(x.step["job_profile"]), gaps: req.filter((r) => !have.has(r.toLowerCase())), learning: adapter.list("DIGIT Learning Path").filter((l) => l["job_profile"] === x.step["job_profile"] && s(l["path_status"]) !== "Retired").map((l) => s(l["path_name"])), openings: adapter.list("DIGIT Internal Opportunity").filter((o) => s(o["status"]) === "Open" && (o["company"] === e["company"])).map((o) => s(o["title"])) };
  });
  return { employee: e.name, employee_name: s(e["employee_name"]), current: s(profile?.["profile_name"]) || s(e["designation"]), skills: [...have], options };
}

/* ------------------------------------------------------------------ ENG-01 recognition */
export function postRecognition(fromEmployee: string, toEmployee: string, awardType: string, message: string, visibility = "Company", user = currentUser()): ActionResult {
  return guarded(() => {
    if (fromEmployee === toEmployee) return fail("You cannot recognise yourself.", "لا يمكنك تقدير نفسك.");
    const to = adapter.get("Employee", toEmployee); const from = adapter.get("Employee", fromEmployee);
    if (!to || !from) return fail("Employee not found.", "الموظف غير موجود.");
    if (to["company"] !== from["company"]) return fail("Recognition stays inside your company.", "التقدير داخل شركتك فقط.");
    if (message.trim().length < 5) return fail("Write a short message.", "اكتب رسالة قصيرة.");
    const d = createDoc("DIGIT Recognition Award", { from_employee: fromEmployee, to_employee: toEmployee, award_type: awardType, posted_on: todayISO(), company: to["company"], message, likes: 0, visibility }, user, { skipPerm: true });
    return ok(`Recognition posted for ${s(to["employee_name"])}.`, `نُشر التقدير لـ ${s(to["employee_name"])}.`, { created: [["DIGIT Recognition Award", d.name]] });
  });
}
export function likeRecognition(name: string, user = currentUser()): ActionResult {
  const d = adapter.get("DIGIT Recognition Award", name); if (!d) return fail("Post not found.", "المنشور غير موجود.");
  if (adapter.list("Comment").some((c) => c["comment_type"] === "Like" && c["reference_doctype"] === "DIGIT Recognition Award" && c["reference_name"] === name && c["comment_email"] === user)) return ok("Already liked.", "أُعجبت به مسبقًا.");
  adapter.insertDoc("Comment", { comment_type: "Like", reference_doctype: "DIGIT Recognition Award", reference_name: name, comment_email: user, owner: user, content: "Liked" });
  adapter.update("DIGIT Recognition Award", name, { likes: n(d["likes"]) + 1 });
  return ok("Liked.", "أُعجبت به.");
}
export function recognitionFeed(company: string | undefined, user = currentUser()): Doc[] {
  const me = adapter.list("Employee").find((e) => e["user_id"] === user);
  return adapter.list("DIGIT Recognition Award").filter((d) => (!company || d["company"] === company) && (isHrAdmin(user) || !me || d["company"] === me["company"]) && (d["visibility"] !== "Private" || d["to_employee"] === me?.name || d["from_employee"] === me?.name)).sort((a, b) => s(b["posted_on"]).localeCompare(s(a["posted_on"])));
}
