import { migrateCrmAnalytics } from "./migrations";
import { isServerHosted } from "@/lib/serverHost";
/**
 * DIGIT CRM enterprise demo generator (source: CRM snapshot enterpriseDemo.ts, unchanged logic). Deterministic synthetic
 * corpus (~15k records: 1,400 leads, 700 deals, 6,500 tasks, …) written through whichever adapter instance runs it.
 * In the Final Core app it runs only inside the read-only preview worker (demoPreview.worker.ts) — its own memory, never the
 * shared store or browser storage — and in vitest fixtures. Kept free of UI/plugin-runtime imports so the worker stays small.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { activeDemoProfile, CRM_DEMO_PROFILE } from "./dataContext";
import defaults from "@/lib/crmSourceDefaults.json";
import { DEMO_TYPES } from "./demoSchema";
import { seedDemoSales } from "./demoSales";

export const DEMO_COUNTS = { companies: 2, branches: 5, teams: 8, users: 32, territories: 8, organizations: 220, contacts: 480, leads: 1400, deals: 700, tasks: 6500, communications: 3000, calls: 1200, notes: 500, campaigns: 40, spend: 100, targets: 576, forecasts: 576 } as const;
const N = (kind: string, i: number) => `DCE-${kind}-${String(i + 1).padStart(4, "0")}`;
export const demoUser = (i: number) => `demo${i + 1}@example.test`;
export const demoCompany = (i: number) => N("COMPANY", i % 2);
const at = (date: string, days: number) => new Date(Date.parse(`${date.slice(0, 10)}T12:00:00Z`) + days * 86400000).toISOString();
const month = (asOf: string, ago: number) => { const d = new Date(`${asOf}T12:00:00Z`); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - ago); return d.toISOString().slice(0, 7); };
export const cleanDate = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Invalid as-of date"); return value; };
const tags = { __synthetic: 1, __fixture_id: CRM_DEMO_PROFILE };
/** Generator revision stored on activation; an older stored revision means the dataset predates a generator fix. */
export const DEMO_VERSION = "1.2.0";
export function demoVersion() { return String(adapter.get("FCRM Settings", "FCRM Settings")?.["custom_demo_version"] ?? ""); }
export function demoAsOf() { return String(adapter.get("FCRM Settings", "FCRM Settings")?.["custom_demo_as_of"] ?? ""); }
export function demoCounts() { return Object.fromEntries(adapter.doctypes().map(dt => [dt, adapter.list(dt).filter(d => d["__fixture_id"] === CRM_DEMO_PROFILE).length])); }

export function seedEnterpriseDemo(asOf: string) {
  if (isServerHosted()) return undefined as never;
  migrateCrmAnalytics();
  cleanDate(asOf);
  if (!activeDemoProfile()) throw new Error("Explicit demo activation required");
  if (demoAsOf()) return demoCounts();
  const put = (dt: string, name: string, data: Record<string, unknown>, creation = at(asOf, -540)) => adapter.insertDocQuiet(dt, { ...tags, ...data, name, owner: data["owner"] ?? "Administrator", creation });
  const companyOf = (person: number) => demoCompany(Math.floor(person / 4) % 2);
  const teamOf = (person: number) => N("TEAM", Math.floor(person / 4));
  // Accounts, their contacts and campaigns alternate between the two companies (even index → company 1), so a lead or deal
  // links the record of its own company: flip to the neighbouring index when the parity differs (220 and 40 are even).
  const sameCompany = (index: number, person: number) => index % 2 === Math.floor(person / 4) % 2 ? index : index ^ 1;
  const orgOf = (i: number, person: number) => sameCompany(i % 220, person);
  const campOf = (i: number, person: number) => sameCompany(i % 40, person);
  const leadStatuses = Object.keys(defaults.lead_statuses);
  const dealStatuses = Object.keys(defaults.deal_statuses);
  const cities = ["الرياض", "جدة", "الدمام", "الخبر", "مكة", "المدينة", "تبوك", "أبها"];
  const names = ["سالم", "نورة", "خالد", "ريم", "فهد", "سارة", "عمر", "هند"];
  const sectors = ["تقنية", "تجارة", "خدمات", "صناعة", "تعليم", "صحة", "نقل", "ضيافة"];
  const sources = ["الموقع", "معرض", "إحالة", "هاتف", "حملة رقمية", "زيارة"];
  const reasons = ["السعر", "التوقيت", "منافس", "عدم التوافق", "Other"];
  const typeOf = (status: string) => defaults.deal_statuses[status as keyof typeof defaults.deal_statuses]?.type ?? "Open";
  adapter.batch(() => {
    put("Currency", "SAR", { currency_name: "ريال سعودي", enabled: 1 });
    put("Country", "Saudi Arabia", { country_name: "المملكة العربية السعودية" });
    put("UOM", "Nos", { uom_name: "وحدة", must_be_whole_number: 1 });
    put("Item Group", "DCE-Services", { item_group_name: "خدمات تجريبية", is_group: 0 });
    put("Customer Group", "DCE-Commercial", { customer_group_name: "عملاء تجريبيون", is_group: 0 });
    put("Price List", "DCE-Selling-SAR", { price_list_name: "قائمة أسعار تجريبية", currency: "SAR", selling: 1, enabled: 1 });
    for (let i = 0; i < 12; i++) {
      put("Item", N("ITEM", i), { item_code: N("ITEM", i), item_name: `خدمة ${sectors[i % 8]} ${i + 1}`, item_group: "DCE-Services", stock_uom: "Nos", is_stock_item: 0, is_sales_item: 1, disabled: 0, standard_rate: 1000 + i * 500 });
      put("CRM Product", N("ITEM", i), { product_code: N("ITEM", i), product_name: `خدمة ${sectors[i % 8]} ${i + 1}`, standard_rate: 1000 + i * 500, disabled: 0 });
      put("Item Price", N("PRICE", i), { item_code: N("ITEM", i), price_list: "DCE-Selling-SAR", price_list_rate: 1000 + i * 500, currency: "SAR", uom: "Nos" });
    }
    for (let i = 0; i < 2; i++) put("Company", demoCompany(i), { company_name: `شركة العرض ${i + 1}`, abbr: `DCE${i + 1}`, default_currency: "SAR", country: "Saudi Arabia" });
    for (let i = 0; i < 5; i++) put("Branch", N("BRANCH", i), { branch: `فرع ${cities[i]}`, custom_demo_company: demoCompany(i) });
    for (let i = 0; i < 8; i++) {
      put("Territory", N("TERR", i), { territory_name: cities[i], is_group: 0, parent_territory: "", custom_demo_company: demoCompany(i) });
      put("CRM Territory", N("TERR", i), { territory_name: cities[i], is_group: 0, parent_crm_territory: "", custom_demo_company: demoCompany(i) });
      put("Sales Person", N("TEAM", i), { sales_person_name: `فريق ${cities[i]}`, is_group: 1, enabled: 1, custom_demo_company: demoCompany(i) });
      put("CRM Industry", sectors[i] ?? "تقنية", { industry: sectors[i] });
    }
    for (const [status, data] of Object.entries(defaults.lead_statuses)) put("CRM Lead Status", status, { lead_status: status, ...data });
    for (const [status, data] of Object.entries(defaults.deal_statuses)) put("CRM Deal Status", status, { deal_status: status, ...data });
    for (const source of sources) put("CRM Lead Source", source, { source });
    for (const reason of reasons) put("CRM Lost Reason", reason, { lost_reason: reason });
    for (let year = Number(asOf.slice(0, 4)) - 2; year <= Number(asOf.slice(0, 4)) + 1; year++) put("Fiscal Year", String(year), { year: String(year), year_start_date: `${year}-01-01`, year_end_date: `${year}-12-31` });
    for (let i = 0; i < 32; i++) {
      const user = demoUser(i), company = companyOf(i), team = teamOf(i), manager = i % 4 === 0;
      put("User", user, { email: user, first_name: names[i % 8], full_name: `${names[i % 8]} ${i + 1} — ${manager ? "مدير" : "مبيعات"}`, enabled: 1, user_type: "System User", roles: [{ name: N("ROLE", i), doctype: "Has Role", parent: user, parenttype: "User", parentfield: "roles", idx: 1, role: manager ? "Sales Manager" : "Sales User" }], custom_demo_company: company });
      const employee = N("EMP", i);
      put("Employee", employee, { employee_name: `${names[i % 8]} ${i + 1}`, first_name: names[i % 8], company, user_id: user, status: "Active", gender: i % 2 ? "Female" : "Male", date_of_joining: at(asOf, -600).slice(0, 10), branch: N("BRANCH", Math.floor(i / 4) % 2) });
      const targets = Array.from({ length: 3 }, (_, y) => ({ name: N(`TARGET-CHILD-${i}`, y), doctype: "Target Detail", parent: N("SP", i), parenttype: "Sales Person", parentfield: "targets", idx: y + 1, fiscal_year: String(Number(asOf.slice(0, 4)) - y), target_amount: 800000 + i * 25000, target_qty: 0 }));
      put("Sales Person", N("SP", i), { sales_person_name: user, is_group: 0, parent_sales_person: team, employee, enabled: 1, commission_rate: 2, targets, custom_demo_company: company });
      put("CRM Sales Hierarchy", N("HIER", i), { user, full_name: `${names[i % 8]} ${i + 1}`, reports_to: manager ? "" : N("HIER", i - i % 4), is_group: manager ? 1 : 0 });
      put("User Permission", N("UP-COMP", i), { user, allow: "Company", for_value: company, apply_to_all_doctypes: 1 });
      for (const dt of ["CRM Lead", "CRM Deal", "CRM Task", "Communication"]) put("User Permission", `${N("UP-TEAM", i)}-${dt}`, { user, allow: "Sales Person", for_value: team, applicable_for: dt, apply_to_all_doctypes: 0 });
    }
    put("User", "denied@example.test", { email: "denied@example.test", full_name: "مستخدم بلا صلاحية", enabled: 1, roles: [] });
    for (let i = 0; i < 40; i++) put("Campaign", N("CAMP", i), { campaign_name: `حملة ${sectors[i % 8]} ${i + 1}`, description: "حملة تجريبية — لا إرسال فعلي", custom_demo_company: demoCompany(i) });
    for (let i = 0; i < 100; i++) put(DEMO_TYPES.spend, N("SPEND", i), { company: demoCompany(i), period: month(asOf, i % 18), campaign: N("CAMP", i % 40), spend_date: `${month(asOf, i % 18)}-01`, amount: 1500 + i * 75, channel: sources[i % 6], reference: `SIMULATED-${i + 1}` });
    for (let i = 0; i < 220; i++) put("CRM Organization", N("ORG", i), { organization_name: `مؤسسة ${sectors[i % 8]} ${i + 1}`, industry: sectors[i % 8], territory: N("TERR", i % 8), no_of_employees: ["11-50", "51-200", "201-500"][i % 3], annual_revenue: 500000 + i * 70000, currency: "SAR", exchange_rate: 1, website: `https://account${i + 1}.example.test`, custom_demo_company: demoCompany(i) });
    for (let i = 0; i < 480; i++) {
      const org = N("ORG", i % 220), email = `contact${i + 1}@example.test`;
      put("Contact", N("CONTACT", i), { first_name: names[i % 8], last_name: String(i + 1), full_name: `${names[i % 8]} ${i + 1}`, email_id: email, mobile_no: "", company_name: org, links: [{ name: N("LINK", i), doctype: "Dynamic Link", link_doctype: "CRM Organization", link_name: org, parent: N("CONTACT", i), parenttype: "Contact", parentfield: "links", idx: 1 }], email_ids: [{ name: N("EMAIL", i), doctype: "Contact Email", email_id: email, is_primary: 1, idx: 1 }], custom_demo_company: demoCompany(i) });
    }
    for (let i = 0; i < 1400; i++) {
      const person = i % 32, created = at(asOf, -(3 + i * 17 % 537)), converted = i < 700;
      const status = converted ? "Converted" : leadStatuses.filter(s => s !== "Converted")[i % 6] ?? "New";
      put("CRM Lead", N("LEAD", i), { first_name: names[i % 8], last_name: String(i + 1), lead_name: `${names[i % 8]} ${i + 1}`, email: `lead${i % 1390 + 1}@example.test`, mobile_no: "", organization: N("ORG", orgOf(i, person)), status, converted: converted ? 1 : 0, lead_owner: i % 19 === 0 ? "" : demoUser(person), owner: demoUser(person), territory: N("TERR", Math.floor(person / 4)), industry: sectors[i % 8], source: sources[i % 6], job_title: "مسؤول مشتريات", lead_score: i * 13 % 101, lead_temperature: ["Cold", "Warm", "Hot"][i % 3], custom_demo_company: companyOf(person), custom_demo_team: teamOf(person), custom_demo_campaign: N("CAMP", campOf(i, person)), response_by: at(created.slice(0, 10), 2), sla_status: "First Response Due", lost_reason: ["Unqualified", "Junk"].includes(status) ? reasons[i % 5] : "", lost_notes: "بيانات تجريبية" }, created);
    }
    for (let i = 0; i < 700; i++) {
      const person = i % 32, lead = adapter.get("CRM Lead", N("LEAD", i));
      const created = at(String(lead?.["creation"] ?? asOf), 2), s = i % 7, status = dealStatuses[s] ?? "Qualification";
      const openDays = Math.max(0, Math.floor((Date.parse(at(asOf, 0)) - Date.parse(created)) / 86400000)), closes = ["Won", "Lost"].includes(typeOf(status)), maxDays = closes ? Math.min(openDays, 40 + i % 80) : openDays;
      const history = Array.from({ length: s + 1 }, (_, j) => { const from = dealStatuses[j] ?? "Qualification", to = j < s ? dealStatuses[j + 1] ?? "" : "", fromDate = at(created, Math.floor(maxDays * j / (s + 1))), toDate = to ? at(created, Math.floor(maxDays * (j + 1) / (s + 1))) : ""; return { name: N(`STAGE-${i}`, j), doctype: "CRM Status Change Log", parent: N("DEAL", i), parenttype: "CRM Deal", parentfield: "status_change_log", idx: j + 1, from, to, from_type: typeOf(from), to_type: to ? typeOf(to) : "", from_date: fromDate, to_date: toDate, duration: toDate ? (Date.parse(toDate) - Date.parse(fromDate)) / 1000 : 0, log_owner: demoUser(person) }; });
      const product = i % 12, rate = 1000 + product * 500, qty = 4 + i % 15, total = rate * qty;
      const products = [{ name: N("PRODUCT-ROW", i), doctype: "CRM Products", parent: N("DEAL", i), parenttype: "CRM Deal", parentfield: "products", idx: 1, product_code: N("ITEM", product), product_name: `خدمة ${sectors[product % 8]} ${product + 1}`, qty, rate, amount: total, net_rate: rate, net_amount: total, discount_percentage: 0 }];
      put("CRM Deal", N("DEAL", i), { organization: N("ORG", orgOf(i, person)), lead: N("LEAD", i), deal_name: `فرصة ${sectors[i % 8]} ${i + 1}`, deal_owner: demoUser(person), owner: demoUser(person), status, probability: defaults.deal_statuses[status as keyof typeof defaults.deal_statuses]?.probability ?? 10, deal_value: total, expected_deal_value: total, total, net_total: total, products, contact: N("CONTACT", orgOf(i, person)), contacts: [{ name: N("DEAL-CONTACT", i), doctype: "CRM Contacts", contact: N("CONTACT", orgOf(i, person)), full_name: `${names[orgOf(i, person) % 8]} ${orgOf(i, person) + 1}`, email: `contact${orgOf(i, person) + 1}@example.test`, is_primary: 1, idx: 1 }], currency: "SAR", exchange_rate: 1, status_change_log: history, expected_closure_date: ["Won", "Lost"].includes(typeOf(status)) ? String(history.at(-1)?.from_date).slice(0, 10) : at(created, Math.floor(maxDays * 0.8) + i % 90).slice(0, 10), closed_date: ["Won", "Lost"].includes(typeOf(status)) ? history.at(-1)?.from_date.slice(0, 10) : "", lost_reason: s === 6 ? reasons[i % 5] : "", lost_notes: "ملاحظات خسارة تجريبية", territory: N("TERR", Math.floor(person / 4)), source: sources[i % 6], custom_demo_company: companyOf(person), custom_demo_team: teamOf(person), custom_demo_campaign: N("CAMP", campOf(i, person)), sales_team: [{ sales_person: N("SP", person), allocated_percentage: 100, allocated_amount: total }] }, created);
    }
    const reference = (i: number) => { const dt = i % 3 === 0 ? "CRM Deal" : "CRM Lead", count = dt === "CRM Deal" ? 700 : 1400, name = N(dt === "CRM Deal" ? "DEAL" : "LEAD", i % count); return { dt, name, doc: adapter.get(dt, name) }; };
    for (let i = 0; i < 6500; i++) {
      const ref = reference(i), person = Number(String(ref.doc?.["owner"] ?? "demo1").match(/demo(\d+)/)?.[1] ?? 1) - 1, created = String(ref.doc?.["creation"] ?? at(asOf, -540));
      const nowStart = at(asOf, 0), elapsed = Math.max(0, Math.floor((Date.parse(nowStart) - Date.parse(created)) / 86400000));
      const proposedDue = i % 5 === 0 ? at(asOf, i % 11) : i % 5 === 1 ? at(asOf, -(i % 45 + 1)) : at(created, Math.min(elapsed, i * 7 % 180));
      const due = proposedDue < created ? created : proposedDue;
      const status = i % 5 < 2 || i % 5 === 4 && i % 2 === 0 ? ["Todo", "In Progress"][i % 2] : i % 17 === 0 ? "Canceled" : "Done";
      put("CRM Task", N("TASK", i), { title: ["اتصال متابعة", "اجتماع تأهيل", "مراجعة عرض", "زيارة عميل", "اتصال موعود"][i % 5], description: "نشاط تجريبي مرتبط بسجل فعلي داخل العرض", reference_doctype: ref.dt, reference_docname: ref.name, assigned_to: demoUser(person), owner: demoUser(person), priority: ["Low", "Medium", "High"][i % 3], status, start_date: created.slice(0, 10), due_date: due.slice(0, 19).replace("T", " "), custom_demo_callback: i % 5 === 4 ? 1 : 0, custom_demo_company: companyOf(person), custom_demo_team: teamOf(person) }, created);
    }
    for (let i = 0; i < 3000; i++) {
      // Two of every three outbound demo emails answer the inbound email three rows earlier (same record, a few hours later),
      // so reply-rate metrics have both sides of a conversation; all other rows keep their own record.
      const reply = i % 6 === 3 && i % 18 !== 15, j = reply ? i - 3 : i;
      const ref = reference(j), person = Number(String(ref.doc?.["owner"] ?? "demo1").match(/demo(\d+)/)?.[1] ?? 1) - 1, created = String(ref.doc?.["creation"] ?? asOf), elapsed = Math.max(0, Math.floor((Date.parse(at(asOf, 0)) - Date.parse(created)) / 86400000));
      const prior = Date.parse(at(created, Math.min(elapsed, j * 11 % 400)));
      const when = reply ? new Date(Math.min(prior + (2 + i % 20) * 3600000, Math.max(prior, Date.parse(at(asOf, 0))))).toISOString() : at(created, Math.min(elapsed, i * 11 % 400)), whats = i % 3 !== 0;
      put("Communication", N("COMM", i), { subject: whats ? "محادثة واتساب تجريبية" : "بريد تجريبي", content: "محاكاة فقط — لا إرسال خارجي. متابعة العرض والموعد القادم.", communication_type: "Communication", communication_medium: whats ? "Chat" : "Email", sent_or_received: i % 2 ? "Sent" : "Received", status: "Linked", communication_date: when, reference_doctype: ref.dt, reference_name: ref.name, sender: i % 2 ? demoUser(person) : `lead${j % 1400 + 1}@example.test`, recipients: i % 2 ? `lead${j % 1400 + 1}@example.test` : demoUser(person), custom_demo_channel: whats ? "WhatsApp" : "Email", custom_demo_thread: N("THREAD", i % 350), custom_demo_assigned_to: i % 23 === 0 ? "" : demoUser(person), custom_demo_company: companyOf(person), custom_demo_team: teamOf(person) }, when);
    }
    for (let i = 0; i < 1200; i++) {
      const ref = reference(i), person = Number(String(ref.doc?.["owner"] ?? "demo1").match(/demo(\d+)/)?.[1] ?? 1) - 1, when = at(String(ref.doc?.["creation"] ?? asOf), 0);
      put("CRM Call Log", N("CALL", i), { from: "SIMULATED", to: "SIMULATED", type: i % 2 ? "Outgoing" : "Incoming", status: i % 4 === 0 ? "No Answer" : "Completed", duration: i % 4 === 0 ? 0 : 90 + i % 600, start_time: when, end_time: new Date(Date.parse(when) + (90 + i % 600) * 1000).toISOString(), reference_doctype: ref.dt, reference_docname: ref.name, caller: i % 2 ? demoUser(person) : "", receiver: i % 2 ? "" : demoUser(person), summary: "مكالمة محاكاة — لا اتصال فعلي", custom_demo_company: companyOf(person) }, when);
    }
    for (let i = 0; i < 500; i++) { const ref = reference(i); put("FCRM Note", N("NOTE", i), { title: "ملاحظة زيارة تجريبية", content: "تمت مراجعة الاحتياج وتحديد متابعة — بيانات محاكاة", reference_doctype: ref.dt, reference_docname: ref.name, custom_demo_company: ref.doc?.["custom_demo_company"] }, String(ref.doc?.["creation"] ?? asOf)); }
    const deals = adapter.list("CRM Deal");
    for (let person = 0; person < 32; person++) for (let m = 0; m < 18; m++) {
      const period = month(asOf, m), snapshot = `${period}-01`, candidates = deals.filter(d => d["deal_owner"] === demoUser(person) && String(d["creation"]).slice(0, 10) <= snapshot && String(d["expected_closure_date"]).slice(0, 7) === period);
      const contributions = candidates.map(d => { const h = (d["status_change_log"] as Doc[]).filter(r => String(r["from_date"]).slice(0, 10) <= snapshot).at(-1), stage = String(h?.["from"] ?? "Qualification"), p = Number(defaults.deal_statuses[stage as keyof typeof defaults.deal_statuses]?.probability ?? 10); return { deal: d.name, stage, probability: p, value: Number(d["deal_value"]), weighted: ["Won", "Lost"].includes(stage) ? 0 : Number(d["deal_value"]) * p / 100 }; });
      const system = contributions.reduce((sum, d) => sum + d.weighted, 0), adjustment = Math.round(system * ((person % 5 - 2) / 20));
      put(DEMO_TYPES.forecast, N(`FC-${person}`, m), { company: companyOf(person), salesperson: demoUser(person), period, snapshot_date: snapshot, system_forecast: system, adjustment, reason: "تعديل مدير تجريبي: مراجعة احتمالية الإغلاق", approved_by: demoUser(person - person % 4), contributions: JSON.stringify(contributions) }, `${snapshot}T12:00:00Z`);
    }
    seedDemoSales(asOf);
    put("FCRM Settings", "FCRM Settings", { currency: "SAR", default_currency: "SAR", custom_demo_as_of: asOf, custom_demo_version: DEMO_VERSION }, at(asOf, 0));
    adapter.flush();
  });
  return demoCounts();
}