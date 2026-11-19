/**
 * Memory-only Frappe CRM sample volume: organisations, leads in every status, deals across the pipeline with contacts
 * and status history, plus notes, tasks and call logs. The CRM controllers (status log, SLA, assignment) run over these
 * rows through runCrmEngines() in the orchestrator, exactly as for the base CRM demo.
 */
import { LOST_REASONS, statusHistory, CRM_USERS } from "@/lib/seedCrm";
import { addDays, CUTOFF, daysBetween, iso, pad, ymd, type Rec } from "./kit";
import { CITIES, fullAr, fullEn, orgName, person } from "./names";

const V = "DDT-V";
const tag = { __synthetic: 1, __sample: "volume" } as const;
const LS = ["New", "Contacted", "Nurture", "Qualified", "Unqualified", "Junk"];
const DS = ["Qualification", "Demo/Making", "Proposal/Quotation", "Negotiation", "Ready to Close", "Won", "Lost"];
const PROB: Record<string, number> = { Qualification: 10, "Demo/Making": 25, "Proposal/Quotation": 50, Negotiation: 70, "Ready to Close": 90, Won: 100, Lost: 0 };
const SRC = ["Website", "Cold Calling", "Exhibition", "Reference", "Advertisement", "Campaign"];
const IND = ["Construction", "Healthcare", "Hospitality", "Logistics", "Education", "Retail", "Manufacturing"];
const SIZE = ["11-50", "51-200", "201-500", "501-1000", "1000+"];

export function crmVolume(): Rec[] {
  const out: Rec[] = [];
  const users = [...CRM_USERS.map(([u]) => u), "Administrator"];
  const orgs = Array.from({ length: 24 }, (_, i) => orgName(100 + i));
  orgs.forEach(([en, ar], i) => out.push(["CRM Organization", ar, { organization_name: ar, no_of_employees: SIZE[i % 5], annual_revenue: 3200000 + i * 1850000, territory: CITIES[i % 6]![0], industry: IND[i % 7], website: `https://org-v${i + 1}.example.test`, creation: iso(addDays(ymd(1, 5), i * 7)), __name_en: { organization_name: en }, ...tag }]));
  const org = (k: number) => orgs[k % orgs.length]!;

  // CRM C4 E-01 (owner 2026-11-17): leads in every status, source and owner with activity relative to today — first
  // response calls (some late), recent touches (some stale), open next steps due −3 … +14 days, meetings, WhatsApp
  // (sandbox), estimated values, consent, CR / VAT on some, unowned leads, leads created today and 10 duplicate pairs
  // (leads 71–80 repeat the mobile and company of leads 21–30). With the 40 standard leads (15 converted, each with
  // its deal) the sample holds 120 leads.
  const span = daysBetween(ymd(1, 4), CUTOFF); const NOW = Date.now();
  const ago = (mins: number) => new Date(NOW - mins * 60000).toISOString();
  const hrs = (at: string, h: number) => new Date(Date.parse(at) + h * 3600000).toISOString();
  const local = (d: string, h: number) => `${d} ${pad(h, 2)}:00:00`;
  const LSTAT = ["Contacted", "Nurture", "Qualified", "Unqualified", "Nurture", "Qualified", "Contacted", "Junk", "New", "Unqualified"];
  const VALUES = [0, 35000, 80000, 150000, 420000, 950000, 1600000, 60000, 0, 260000, 120000, 2400000];
  const UNQ = ["No budget", "No current need", "Not the decision maker", "Wrong contact details", "Chose a competitor", "Outside our service area"];
  const CAMPS: [string, string][] = [["معرض البناء السعودي 2026", "Saudi Build Expo 2026"], ["حملة الربع الرابع", "Q4 outreach"], ["حملة الموقع الإلكتروني", "Website campaign"]];
  CAMPS.forEach(([ar, en], i) => out.push(["Campaign", ar, { campaign_name: ar, description: ["حملة معرض سنوي لقطاع البناء", "حملة تواصل مباشر للربع الأخير", "حملة إعلانية على الموقع الإلكتروني"][i], __name_en: { campaign_name: en }, ...tag }]));
  const FIRST_CALL_H = [1, 2, 3, 1, 6, 2, 9, 1, 2, 3];
  const DUE = [-3, 0, 2, 5, 9, -1, 1, 3, 0, 14];
  const NOTE_AR = ["تم التعريف بالخدمات وإرسال الملف التعريفي", "العميل مهتم ويطلب عرضًا مبدئيًا", "تمت مناقشة الميزانية التقريبية", "طلب العميل التواصل بعد اجتماع الإدارة", "أكد العميل الحاجة خلال الربع القادم"];
  const leadMobile = (k: number) => `+96657${pad(1300000 + k * 4127, 7)}`;
  const N = 80;
  for (let k = 1; k <= N; k++) {
    const dupOf = k > N - 10 ? k - 50 : 0; const p = person(900 + (dupOf || k));
    const created = k > N - 5 ? ago((N - k) * 37 + 12) : k > N - 10 ? iso(addDays(CUTOFF, -1 - ((k - N + 10) % 3)), 6 + (k % 6)) : iso(addDays(ymd(1, 4), Math.floor((k / (N - 10)) * (span - 6))), 6 + (k % 6));
    const age = Math.max(0, Math.floor((NOW - Date.parse(created)) / 864e5));
    const status = k > N - 10 ? "New" : k > N - 17 ? (k % 2 ? "New" : "Contacted") : LSTAT[k % 10]!;
    const [oen, oar] = org(dupOf || k);
    const lead = `${V}-CRM-LEAD-${pad(k)}`; const src = SRC[k % 6]!; const owner = k % 8 === 2 && status !== "Unqualified" && status !== "Junk" ? "" : users[k % users.length]!;
    const wa = k % 3 !== 0, em = k % 2 === 0, sms = k % 5 === 0;
    out.push(["CRM Lead", lead, { first_name: p.first[1], last_name: p.last[1], lead_name: fullAr(p), email: dupOf && k % 2 ? `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${dupOf}@lead.example.test` : `${p.first[0].toLowerCase()}.${p.last[0].toLowerCase().replace(/[^a-z]/g, "")}${k}@lead.example.test`, mobile_no: leadMobile(dupOf || k), organization: oar,
      job_title: ["مدير المشتريات", "المدير العام", "مدير العمليات", "مدير المشاريع", "مسؤول المرافق"][k % 5], status, source: src, territory: CITIES[k % 6]![0], industry: IND[k % 7], no_of_employees: k % 9 === 0 ? "" : SIZE[k % 5], annual_revenue: 250000 * (1 + (k % 12)),
      lead_owner: owner, converted: 0, communication_status: status === "New" ? "Open" : "Replied", creation: created, custom_estimated_value: VALUES[k % 12], campaign: src === "Campaign" || k % 7 === 0 ? CAMPS[k % 3]![0] : "",
      custom_cr_no: k % 4 === 0 ? `10${pad((k * 7919) % 100000000, 8)}` : "", custom_vat_no: k % 6 === 0 ? `3${pad((k * 104729) % 10000000000000, 13)}3` : "", custom_interest: ["توريد مواد", "صيانة سنوية", "حلول تقنية", "خدمات استشارية", "مشروع إنشائي"][k % 5],
      custom_consent_whatsapp: wa ? 1 : 0, custom_consent_email: em ? 1 : 0, custom_consent_sms: sms ? 1 : 0, custom_consent_date: wa || em || sms ? created : "", custom_consent_by: wa || em || sms ? owner || "Administrator" : "",
      custom_unqualified_reason: status === "Unqualified" ? UNQ[k % 6] : status === "Junk" ? "Duplicate record" : "", __name_en: { lead_name: fullEn(p), first_name: p.first[0], last_name: p.last[0], organization: oen }, ...tag }]);
    const open = ["New", "Contacted", "Nurture", "Qualified"].includes(status); const who = owner || users[k % 3]!;
    // first response: every lead past «New» was called; two of ten later than the 4-hour promise
    if (status !== "New") { const at = hrs(created, FIRST_CALL_H[k % 10]!); if (Date.parse(at) <= NOW) out.push(["CRM Call Log", `${V}-CALL-F${pad(k)}`, { id: `${V}-CALL-F${pad(k)}`, type: "Outgoing", status: "Completed", duration: 120 + k * 7, from: "+966112345678", to: leadMobile(dupOf || k), start_time: at.slice(0, 19).replace("T", " "), caller: who, reference_doctype: "CRM Lead", reference_docname: lead, creation: at, ...tag }]); }
    if (status !== "New" && age >= 1) out.push(["FCRM Note", `${V}-NOTE-L${pad(k)}`, { title: NOTE_AR[k % 5], content: `<p>${NOTE_AR[k % 5]}.</p>`, reference_doctype: "CRM Lead", reference_docname: lead, owner: who, creation: hrs(created, 26), ...tag }]);
    // recent touch: most open leads within the last 2 days, every fifth one stale (4–12 days)
    if (open && status !== "New") {
      const back = k % 5 === 0 ? 4 + (k % 9) : k % 3; const at = back === 0 ? ago(45 + ((k * 37) % 240)) : iso(addDays(CUTOFF, -back), 7 + (k % 5));
      if (Date.parse(at) > Date.parse(created) + 3 * 3600000) {
        if (k % 3 === 2 && wa) out.push(["Communication", `${V}-WA-${pad(k)}`, { communication_type: "Communication", communication_medium: "Chat", custom_channel: "WhatsApp", sent_or_received: "Sent", subject: "WhatsApp · followup", content: `<p>مرحبًا ${p.first[1]}، نتابع معك بخصوص حديثنا الأخير.</p>`, sender: who, recipients: leadMobile(dupOf || k), phone_no: leadMobile(dupOf || k), delivery_status: "Not Sent", custom_sandbox: 1, communication_date: at, reference_doctype: "CRM Lead", reference_name: lead, reference_docname: lead, creation: at, ...tag }]);
        else if (k % 3 === 1) out.push(["FCRM Note", `${V}-NOTE-R${pad(k)}`, { title: "متابعة هاتفية", content: `<p>تمت المتابعة — ${NOTE_AR[(k + 2) % 5]}.</p>`, reference_doctype: "CRM Lead", reference_docname: lead, owner: who, creation: at, ...tag }]);
        else out.push(["CRM Call Log", `${V}-CALL-R${pad(k)}`, { id: `${V}-CALL-R${pad(k)}`, type: k % 2 ? "Incoming" : "Outgoing", status: k % 4 === 0 ? "No Answer" : "Completed", duration: k % 4 === 0 ? 0 : 90 + k * 5, from: "+966112345678", to: leadMobile(dupOf || k), start_time: at.slice(0, 19).replace("T", " "), caller: who, reference_doctype: "CRM Lead", reference_docname: lead, creation: at, ...tag }]);
      }
    }
    // next step: open leads carry one open task (every seventh has none — the list flags it); a done task before it
    if (open && k % 7 !== 0) {
      const off = k > N - 5 ? (k % 2 ? 0 : 1) : DUE[k % 10]!; const due = local(addDays(CUTOFF, off), 9 + (k % 8));
      out.push(["CRM Task", `${V}-TASK-L${pad(k)}`, { title: ["معاودة الاتصال", "إرسال الملف التعريفي", "تأهيل الميزانية", "حجز اجتماع", "إرسال عرض مبدئي"][k % 5], status: ["Todo", "In Progress", "Backlog"][k % 3], priority: ["Medium", "High", "Low"][k % 3], due_date: due, assigned_to: who, reference_doctype: "CRM Lead", reference_docname: lead, creation: hrs(created, 2), ...tag }]);
    }
    if ((status === "Qualified" || status === "Nurture") && age >= 3) out.push(["CRM Task", `${V}-TASK-D${pad(k)}`, { title: "مكالمة تعريفية", status: "Done", priority: "Medium", due_date: local(addDays(created.slice(0, 10), 2), 10), assigned_to: who, reference_doctype: "CRM Lead", reference_docname: lead, creation: hrs(created, 3), ...tag }]);
    if (status === "Qualified" && k % 4 === 0) { const day = addDays(CUTOFF, k % 8 === 0 ? -(2 + (k % 5)) : 1 + (k % 5)); out.push(["Event", `${V}-EV-L${pad(k)}`, { subject: `اجتماع تعريفي — ${oar}`, starts_on: local(day, 13), ends_on: local(day, 14), event_type: "Private", event_category: "Meeting", status: "Open", owner: who, reference_doctype: "CRM Lead", reference_docname: lead, event_participants: [{ reference_doctype: "CRM Lead", reference_docname: lead }], ...tag }]); }
  }

  // deals: one per converted / qualified opportunity, spread over the pipeline by age
  for (let k = 1; k <= 90; k++) {
    const created = addDays(ymd(1, 10), Math.floor((k / 90) * daysBetween(ymd(1, 10), CUTOFF))); const age = daysBetween(created, CUTOFF);
    const status = age < 12 ? DS[k % 2]! : age < 40 ? DS[1 + (k % 4)]! : age < 90 ? DS[2 + (k % 5)]! : DS[5 + (k % 2)]!;
    const [oen, oar] = org(k * 5); const p = person(1200 + k); const value = 40000 + ((k * 7919) % 46) * 9500;
    const contact = `${V}-CRM-CON-${pad(k)}`; const deal = `${V}-CRM-DEAL-${pad(k)}`;
    out.push(["Contact", contact, { first_name: p.first[1], last_name: p.last[1], email_id: `${p.first[0].toLowerCase()}.${k}@deal.example.test`, mobile_no: `+96658${pad(2400000 + k * 3571, 7)}`, company_name: oar, designation: ["مدير المشتريات", "المدير المالي", "مدير المشاريع"][k % 3], links: [{ link_doctype: "CRM Deal", link_name: deal }], __name_en: { first_name: p.first[0], last_name: p.last[0], company_name: oen }, ...tag }]);
    const closeBy = status === "Won" || status === "Lost" ? addDays(created, 35 + (k % 30)) : addDays(CUTOFF, 10 + (k % 50));
    out.push(["CRM Deal", deal, { organization: oar, status, deal_value: value, expected_deal_value: value, annual_revenue: 2000000 + k * 640000, email: `${p.first[0].toLowerCase()}.${k}@deal.example.test`, mobile_no: `+96658${pad(2400000 + k * 3571, 7)}`, website: `https://org-v${(k * 5) % 24 + 1}.example.test`, no_of_employees: SIZE[k % 5], industry: IND[k % 7], currency: "SAR", probability: PROB[status], expected_closure_date: closeBy > CUTOFF && (status === "Won" || status === "Lost") ? CUTOFF : closeBy, ...(status === "Won" ? { closed_date: closeBy > CUTOFF ? CUTOFF : closeBy } : {}), deal_owner: users[(k + 1) % users.length], source: SRC[k % 6], territory: CITIES[k % 6]![0], contacts: [{ contact, is_primary: 1 }], contact, lead: "", lost_reason: status === "Lost" ? LOST_REASONS[k % LOST_REASONS.length]![0] : "", status_change_log: statusHistory(status, iso(created)), communication_status: k % 4 ? "Replied" : "Open", creation: iso(created, 10), __name_en: { organization: oen }, ...tag }]);
    // activity on the deal
    const NOTES = ["تمت مناقشة نطاق التوريد والجدول الزمني", "العميل يطلب خصمًا على الكميات", "تم إرسال العرض الفني والمالي", "اجتماع مع لجنة المشتريات", "طلب العميل زيارة موقع"];
    for (let j = 0; j < (status === "Qualification" ? 1 : 2); j++) {
      const d = addDays(created, 3 + j * 9); if (d > CUTOFF) break;
      out.push(["FCRM Note", `${V}-NOTE-${pad(k)}-${j + 1}`, { title: NOTES[(k + j) % 5], content: `<p>${NOTES[(k + j) % 5]} — قيمة الصفقة ${value.toLocaleString("en-US")} ر.س.</p>`, reference_doctype: "CRM Deal", reference_docname: deal, creation: iso(d, 13), ...tag }]);
    }
    const TASKS = ["إرسال العرض", "جدولة عرض توضيحي", "مكالمة متابعة", "إعداد العقد", "زيارة موقع"];
    for (let j = 0; j < 2; j++) {
      const due = addDays(created, 7 + j * 14); const open = status !== "Won" && status !== "Lost" && due >= addDays(CUTOFF, -7);
      out.push(["CRM Task", `${V}-TASK-${pad(k)}-${j + 1}`, { title: TASKS[(k + j) % 5], description: `<p>${TASKS[(k + j) % 5]} لصفقة ${oar}</p>`, status: open ? ["Todo", "In Progress", "Backlog"][(k + j) % 3] : (k + j) % 7 === 0 ? "Canceled" : "Done", priority: ["Low", "Medium", "High"][(k + j) % 3], due_date: `${due} ${pad(9 + ((k + j) % 8), 2)}:00:00`, assigned_to: users[(k + j) % users.length], reference_doctype: "CRM Deal", reference_docname: deal, creation: iso(created, 11), ...tag }]);
    }
    const cd = addDays(created, 2); if (cd <= CUTOFF) {
      const st = ["Completed", "No Answer", "Completed", "Busy", "Completed"][k % 5]!;
      out.push(["CRM Call Log", `${V}-CALL-${pad(k)}`, { id: `${V}-CALL-${pad(k)}`, type: k % 2 ? "Incoming" : "Outgoing", status: st, duration: st === "Completed" ? 90 + k * 17 : 0, from: k % 2 ? `+96658${pad(2400000 + k * 3571, 7)}` : "+966112345678", to: k % 2 ? "+966112345678" : `+96658${pad(2400000 + k * 3571, 7)}`, start_time: `${cd} ${pad(10 + (k % 7), 2)}:${pad(k % 60, 2)}:00`, end_time: `${cd} ${pad(10 + (k % 7), 2)}:${pad((k % 60) + (st === "Completed" ? 1 : 0), 2)}:30`, reference_doctype: "CRM Deal", reference_docname: deal, receiver: users[k % users.length], caller: users[(k + 2) % users.length], creation: iso(cd, 10), ...tag }]);
    }
  }
  return out;
}
