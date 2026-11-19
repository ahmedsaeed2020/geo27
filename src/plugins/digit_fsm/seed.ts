import { migrateFsmVisits } from "./visitNative";
import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM connected demo (virtual only, never exported). Insert-if-missing with explicit document names, so a
 * record the user created or changed is never overwritten and re-running the installer adds nothing twice. It follows
 * the real flow end to end — customer → site → location → system → device → agreement → obligations → job → visit →
 * booking → inspection run → results → deficiency → native Quotation (bridge line) → decision → repair job → retest →
 * reviewed closure — so every queue, 360 page and report starts with records that actually link up.
 * Runs inside adapter.batch (one store write). No GL / Stock Ledger rows are written.
 */
import { adapter } from "@/lib/adapter";
import { addSampleNameResolver } from "@/i18n";

/* Owner notes A-08: Arabic screens show the field-service demo masters by Arabic names (display only; stored values stay). */
const FSM_NAMES_AR: Record<string, string> = {
  "Riyadh Gate Mall Management Co.": "شركة إدارة مجمع بوابة الرياض", "Al Waha Hospital Group": "مجموعة مستشفيات الواحة", "Gulf Fire Pump Services": "خدمات مضخات الحريق الخليجية",
  "Riyadh Gate Mall": "مجمع بوابة الرياض", "Al Waha Hospital — North Tower": "مستشفى الواحة — البرج الشمالي", "Atlas Trading HQ": "المقر الرئيسي لأطلس للتجارة", "Noor Clinic — Olaya": "عيادة نور — العليا",
  "Fire & life safety inspection visit": "زيارة فحص السلامة من الحريق", "Corrective repair labour": "أجور إصلاح تصحيحي", "Optical smoke detector": "كاشف دخان بصري",
  "Khalid Al-Harbi": "خالد الحربي", "Faisal Al-Otaibi": "فيصل العتيبي", "Yousef Al-Qahtani": "يوسف القحطاني", "Huda Al-Shehri": "هدى الشهري", "Field Technician": "فني ميداني",
};
addSampleNameResolver((v) => FSM_NAMES_AR[v]);
import { addDays, technicalResult, type Row } from "./domain/rules";

const COMPANY = "Digit Synthetic Co";
type Data = Record<string, unknown>;
let added = 0;
const put = (dt: string, name: string, data: Data) => { if (adapter.get(dt, name)) return; adapter.insertDoc(dt, { name, ...data }); added++; };
const child = (dt: string, parentfield: string, list: Data[], prefix: string) => list.map((r, i) => ({ name: `${prefix}-${i + 1}`, idx: i + 1, doctype: dt, parentfield, ...r }));

// ---------------------------------------------------------------- reference data
const SITES = [
  { id: "FSM-SITE-0001", name: "Riyadh Gate Mall", code: "RGM", customer: "FSM-CUST-001", city: "Riyadh", branch: "Riyadh" },
  { id: "FSM-SITE-0002", name: "Al Waha Hospital — North Tower", code: "AWH-N", customer: "FSM-CUST-002", city: "Jeddah", branch: "Jeddah" },
  { id: "FSM-SITE-0003", name: "Atlas Trading HQ", code: "ATL-HQ", customer: "SYN-CUST-001", city: "Riyadh", branch: "Riyadh" },
  { id: "FSM-SITE-0004", name: "Noor Clinic — Olaya", code: "NC-OLY", customer: "SYN-CUST-002", city: "Riyadh", branch: "Riyadh" },
];
// system id, site, type, name, device prefix/count/type
const SYSTEMS: [string, string, string, string, string, number, string][] = [
  ["FSM-SYS-00001", "FSM-SITE-0001", "Fire Alarm", "Main fire alarm panel (Notifier NFS2)", "SD", 8, "Smoke detector"],
  ["FSM-SYS-00002", "FSM-SITE-0001", "Sprinkler", "Wet sprinkler riser A", "SV", 3, "Control valve"],
  ["FSM-SYS-00003", "FSM-SITE-0001", "Extinguishers", "Portable extinguishers — retail level", "EX", 6, "CO2 extinguisher 6 kg"],
  ["FSM-SYS-00004", "FSM-SITE-0002", "Fire Alarm", "North tower addressable system", "SD", 8, "Smoke detector"],
  ["FSM-SYS-00005", "FSM-SITE-0002", "Emergency Lighting", "Escape route lighting", "EL", 6, "Emergency luminaire"],
  ["FSM-SYS-00006", "FSM-SITE-0002", "Sprinkler", "Basement sprinkler zone", "SV", 2, "Control valve"],
  ["FSM-SYS-00007", "FSM-SITE-0003", "Fire Alarm", "HQ conventional panel", "SD", 4, "Smoke detector"],
  ["FSM-SYS-00008", "FSM-SITE-0003", "Extinguishers", "HQ extinguishers", "EX", 4, "Dry powder extinguisher"],
  ["FSM-SYS-00009", "FSM-SITE-0004", "Fire Alarm", "Clinic fire alarm", "SD", 4, "Smoke detector"],
  ["FSM-SYS-00010", "FSM-SITE-0004", "Emergency Lighting", "Clinic emergency lighting", "EL", 3, "Emergency luminaire"],
];
const TEMPLATES: [string, string, string, number, string, Data[]][] = [
  ["FSM-TPL-0001", "Fire alarm inspection & test", "Fire Alarm", 1, "Superseded", [
    { check_code: "FA-01", check_text: "Panel normal, no faults or disablements", applies_to: "System" },
    { check_code: "FA-03", check_text: "Detector functional test", applies_to: "Device" }]],
  ["FSM-TPL-0002", "Fire alarm inspection & test", "Fire Alarm", 2, "Active", [
    { check_code: "FA-01", check_text: "Panel normal, no faults or disablements", applies_to: "System" },
    { check_code: "FA-02", check_text: "Standby battery voltage", applies_to: "System", unit: "V", min_value: 24, max_value: 28.5 },
    { check_code: "FA-03", check_text: "Detector functional test", applies_to: "Device", evidence_required: 1 },
    { check_code: "FA-04", check_text: "Device clean and unobstructed", applies_to: "Device" }]],
  ["FSM-TPL-0003", "Sprinkler quarterly inspection", "Sprinkler", 1, "Active", [
    { check_code: "SP-01", check_text: "Main drain test pressure", applies_to: "System", unit: "bar", min_value: 4, max_value: 12 },
    { check_code: "SP-02", check_text: "Control valve supervised open and sealed", applies_to: "Device" }]],
  ["FSM-TPL-0004", "Portable extinguisher inspection", "Extinguishers", 1, "Active", [
    { check_code: "EX-01", check_text: "Pressure gauge in operating range", applies_to: "Device" },
    { check_code: "EX-02", check_text: "Seal and tamper indicator intact", applies_to: "Device" },
    { check_code: "EX-03", check_text: "Gross weight within tolerance", applies_to: "Device", unit: "kg", min_value: 5.7, max_value: 6.3 }]],
  ["FSM-TPL-0005", "Emergency lighting duration test", "Emergency Lighting", 1, "Active", [
    { check_code: "EL-01", check_text: "Luminaire lights on mains failure", applies_to: "Device" },
    { check_code: "EL-02", check_text: "Rated duration test (minutes)", applies_to: "Device", unit: "min", min_value: 90 }]],
];
const tplFor = (type: string) => TEMPLATES.find((t) => t[2] === type && t[4] === "Active")!;
const devicesOf = (sys: string) => { const s = SYSTEMS.find((x) => x[0] === sys)!; return Array.from({ length: s[5] }, (_, i) => `${s[0].replace("FSM-SYS-", "FSM-DEV-")}-${String(i + 1).padStart(2, "0")}`); };

/** Frozen result rows of a run (template current version × system devices) with chosen outcomes per (check, device index). */
function results(runId: string, sys: string, pick: (check: string, devIdx: number) => string | [string, number]): Row[] {
  const type = SYSTEMS.find((x) => x[0] === sys)![2];
  const tpl = tplFor(type); const devs = devicesOf(sys); const out: Row[] = [];
  for (const c of tpl[5]) {
    const targets = c["applies_to"] === "Device" ? devs.map((d, i) => [d, i] as const) : [["", -1] as const];
    for (const [dev, i] of targets) {
      const p = pick(String(c["check_code"]), i); const [outcome, measurement] = Array.isArray(p) ? p : [p, undefined];
      out.push({ name: `${runId}-${String(out.length + 1).padStart(3, "0")}`, idx: out.length + 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: c["check_code"], check_text: c["check_text"], device: dev || undefined, outcome, ...(measurement !== undefined ? { measurement } : {}), evidence_required: c["evidence_required"] ? 1 : 0 });
    }
  }
  return out;
}

export function installFsmDemo(): number {
  migrateFsmVisits();
  added = 0;
  adapter.batch(() => {
    put("FSM Settings", "FSM Settings", { default_company: COMPANY, generation_horizon_months: 12, retest_due_days: 14, require_review: 1, block_expired_certification: 1, default_severity: "Major" });
    // native masters (reused, never cloned)
    put("Customer", "FSM-CUST-001", { customer_name: "Riyadh Gate Mall Management Co.", customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" });
    put("Customer", "FSM-CUST-002", { customer_name: "Al Waha Hospital Group", customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR" });
    put("Supplier", "FSM-SUPP-001", { supplier_name: "Gulf Fire Pump Services", supplier_group: "Services", supplier_type: "Company", country: "Saudi Arabia" });
    for (const [code, name, stock, uom] of [["FSM-SVC-INSP", "Fire & life safety inspection visit", 0, "Nos"], ["FSM-SVC-REPAIR", "Corrective repair labour", 0, "Hour"], ["FSM-PART-SMOKE", "Optical smoke detector", 1, "Nos"], ["FSM-PART-EXT6", "CO2 extinguisher 6 kg", 1, "Nos"], ["FSM-PART-ELBAT", "Emergency luminaire battery pack", 1, "Nos"]] as const)
      put("Item", code, { item_code: code, item_name: name, item_group: stock ? "Products" : "Services", stock_uom: uom, is_stock_item: stock, standard_rate: stock ? 180 : 450 });
    const EMP: [string, string, string, string][] = [["FSM-EMP-001", "Khalid", "Al-Harbi", "Male"], ["FSM-EMP-002", "Faisal", "Al-Otaibi", "Male"], ["FSM-EMP-003", "Yousef", "Al-Qahtani", "Male"], ["FSM-EMP-004", "Huda", "Al-Shehri", "Female"]];
    for (const [id, f, l, g] of EMP) put("Employee", id, { first_name: f, last_name: l, employee_name: `${f} ${l}`, gender: g, company: COMPANY, status: "Active", date_of_birth: "1990-01-01", date_of_joining: "2023-01-15", designation: "Field Technician" });
    put("Issue", "FSM-REQ-0001", { subject: "Fire alarm panel shows earth fault — Atlas HQ", customer: "SYN-CUST-001", customer_name: "Synthetic Atlas Trading", status: "Open", priority: "Medium", opening_date: "2026-10-19", company: COMPANY, raised_by: "facilities@atlas.example.test", description: "Panel in reception reports an earth fault since this morning.", digit_fsm_site: "FSM-SITE-0003" });
    put("Issue", "FSM-REQ-0002", { subject: "Sprinkler pipe leaking in basement car park", customer: "FSM-CUST-002", customer_name: "Al Waha Hospital Group", status: "Open", priority: "High", opening_date: "2026-10-20", company: COMPANY, raised_by: "engineering@alwaha.example.test", description: "Water leaking from a sprinkler branch line above bay B12.", digit_fsm_site: "FSM-SITE-0002", first_responded_on: "2026-10-20 09:40:00" });

    // portfolio
    for (const s of SITES) put("FSM Service Site", s.id, { site_name: s.name, site_code: s.code, customer: s.customer, company: COMPANY, city: s.city, branch: s.branch, status: "Active", service_window: "Sun–Thu 08:00–17:00", access_instructions: "Report to security; escort required in plant rooms.", requires_escort: 1,
      contacts: child("FSM Site Contact", "contacts", [{ contact_role: "Facility Manager", phone: "+966 11 000 1000", notify: 1 }, { contact_role: "Emergency", phone: "+966 50 000 2000", notify: 1 }], `${s.id}-c`) });
    SITES.forEach((s, si) => {
      const b = `FSM-LOC-${String(si * 3 + 1).padStart(5, "0")}`;
      put("FSM Location Node", b, { site: s.id, node_type: "Building", node_label: `${s.code} main building`, company: COMPANY });
      put("FSM Location Node", `FSM-LOC-${String(si * 3 + 2).padStart(5, "0")}`, { site: s.id, node_type: "Floor", node_label: "Ground floor", parent_node: b, company: COMPANY });
      put("FSM Location Node", `FSM-LOC-${String(si * 3 + 3).padStart(5, "0")}`, { site: s.id, node_type: "Floor", node_label: "Level 1", parent_node: b, company: COMPANY });
    });
    for (const [id, site, type, name, prefix, n, dtype] of SYSTEMS) {
      const si = SITES.findIndex((x) => x.id === site);
      put("FSM Service System", id, { system_name: name, site, system_type: type, identifier: `${prefix}-${id.slice(-2)}`, operating_status: "In Service", location: `FSM-LOC-${String(si * 3 + 1).padStart(5, "0")}`, company: COMPANY });
      devicesOf(id).forEach((d, i) => put("FSM Device", d, { device_label: `${prefix}-${String(i + 1).padStart(2, "0")} ${dtype}`, device_type: dtype, system: id, site, serial_no: `${prefix}${id.slice(-2)}${String(1000 + i)}`, barcode: `TAG-${d.slice(-6)}`, lifecycle: "Active",
        location: `FSM-LOC-${String(si * 3 + (i % 2 ? 3 : 2)).padStart(5, "0")}`, install_date: "2022-05-01", item: type === "Fire Alarm" ? "FSM-PART-SMOKE" : type === "Extinguishers" ? "FSM-PART-EXT6" : undefined, company: COMPANY }));
    }
    for (const [id, name, type, v, st, checks] of TEMPLATES) put("FSM Inspection Template", id, { template_name: name, system_type: type, version: v, status: st, trade_pack: "Fire & Life Safety", standard_ref: type === "Fire Alarm" ? "NFPA 72 Ch.14 (reference)" : type === "Sprinkler" ? "NFPA 25 Ch.5 (reference)" : type === "Extinguishers" ? "NFPA 10 Ch.7 (reference)" : "NFPA 101 §7.9 (reference)",
      supersedes: id === "FSM-TPL-0002" ? "FSM-TPL-0001" : undefined, published_on: "2026-01-05 09:00:00", checks: child("FSM Template Check", "checks", checks, id) });

    // workforce
    const TECH: [string, string, string, string, Data[]][] = [
      ["FSM-TECH-001", "FSM-EMP-001", "Khalid Al-Harbi", "Crew A", [{ skill: "Fire Alarm", certificate_no: "FA-2291", valid_until: "2027-06-30" }, { skill: "Emergency Lighting", certificate_no: "EL-118", valid_until: "2027-03-31" }]],
      ["FSM-TECH-002", "FSM-EMP-002", "Faisal Al-Otaibi", "Crew A", [{ skill: "Sprinkler", certificate_no: "SP-7712", valid_until: "2027-01-31" }, { skill: "Fire Pump", certificate_no: "FP-310", valid_until: "2026-12-31" }]],
      ["FSM-TECH-003", "FSM-EMP-003", "Yousef Al-Qahtani", "Crew B", [{ skill: "Extinguishers", certificate_no: "EX-554", valid_until: "2027-09-30" }, { skill: "Fire Alarm", certificate_no: "FA-1950", valid_until: "2026-08-31" }]],
      ["FSM-TECH-004", "FSM-EMP-004", "Huda Al-Shehri", "Crew B", [{ skill: "Fire Alarm", certificate_no: "FA-3001", valid_until: "2027-12-31" }, { skill: "Sprinkler", certificate_no: "SP-8001", valid_until: "2027-12-31" }, { skill: "Extinguishers", certificate_no: "EX-801", valid_until: "2027-12-31" }, { skill: "Emergency Lighting", certificate_no: "EL-802", valid_until: "2027-12-31" }]],
    ];
    for (const [id, emp, nm, crew, skills] of TECH) put("FSM Technician", id, { employee: emp, technician_name: nm, crew, territory: crew === "Crew A" ? "Riyadh" : "Jeddah", status: "Active", daily_hours: 8, company: COMPANY, skills: child("FSM Technician Skill", "skills", skills, id) });
    put("FSM Calendar Exception", "FSM-CAL-00001", { technician: "FSM-TECH-002", exception_type: "Leave", from_time: "2026-10-25 00:00:00", to_time: "2026-10-27 23:59:00", reason: "Annual leave", status: "Approved", company: COMPANY });
    put("FSM Calendar Exception", "FSM-CAL-00002", { technician: "FSM-TECH-004", exception_type: "On-call", from_time: "2026-10-21 17:00:00", to_time: "2026-10-22 08:00:00", reason: "Weekday on-call rota", status: "Approved", company: COMPANY });
    put("FSM Test Instrument", "FSM-INS-001", { instrument_name: "Smoke detector tester (aerosol + pole)", serial_no: "SDT-4410", calibration_ref: "N/A — functional tool", calibrated_on: "2026-01-10", calibration_due: "2027-01-10", custodian: "FSM-TECH-001", company: COMPANY });
    put("FSM Test Instrument", "FSM-INS-002", { instrument_name: "Digital pressure gauge 0–16 bar", serial_no: "DPG-2208", calibration_ref: "CAL-2025-0912", calibrated_on: "2025-09-12", calibration_due: "2026-09-12", custodian: "FSM-TECH-002", company: COMPANY });

    // agreements (coverage rows have stable names → obligation keys)
    const AGR: [string, string, string, string, string, string, string, number, [string, string, string, number][]][] = [
      ["FSM-AGR-2026-001", "Riyadh Gate Mall — fire & life safety AMC 2026", "FSM-CUST-001", "FSM-SITE-0001", "2026-01-01", "2026-12-31", "Active", 96000, [["FSM-SYS-00001", "FSM-TPL-0002", "Quarterly", 14], ["FSM-SYS-00002", "FSM-TPL-0003", "Quarterly", 14], ["FSM-SYS-00003", "FSM-TPL-0004", "Semi-Annual", 21]]],
      ["FSM-AGR-2026-002", "Al Waha North Tower — monthly fire alarm & lighting", "FSM-CUST-002", "FSM-SITE-0002", "2026-03-01", "2027-02-28", "Active", 132000, [["FSM-SYS-00004", "FSM-TPL-0002", "Monthly", 10], ["FSM-SYS-00005", "FSM-TPL-0005", "Quarterly", 14]]],
      ["FSM-AGR-2026-003", "Atlas HQ — annual inspection (draft proposal)", "SYN-CUST-001", "FSM-SITE-0003", "2026-11-01", "2027-10-31", "Draft", 18000, [["FSM-SYS-00007", "FSM-TPL-0002", "Semi-Annual", 21], ["FSM-SYS-00008", "FSM-TPL-0004", "Annual", 30]]],
      ["FSM-AGR-2025-004", "Noor Clinic Olaya — quarterly maintenance", "SYN-CUST-002", "FSM-SITE-0004", "2025-11-15", "2026-11-14", "Active", 24000, [["FSM-SYS-00009", "FSM-TPL-0002", "Quarterly", 14], ["FSM-SYS-00010", "FSM-TPL-0005", "Semi-Annual", 21]]],
    ];
    for (const [id, title, cust, site, start, end, st, val, cov] of AGR) put("FSM Service Agreement", id, { agreement_title: title, customer: cust, site, company: COMPANY, start_date: start, end_date: end, workflow_state: st, revision: 1, billing_basis: "Fixed Periodic", annual_value: val,
      coverage: child("FSM Coverage Line", "coverage", cov.map(([system, template, frequency, window_days]) => ({ system, template, frequency, window_days, service_type: "Inspection", included: 1 })), id) });

    // obligations: generated exactly as the W02 service would (same key), with explicit names
    const STEP: Record<string, number> = { Monthly: 1, Quarterly: 3, "Semi-Annual": 6, Annual: 12 };
    const addM = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number) as [number, number, number]; const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };
    let on = 0; const OBL: Record<string, string> = {};
    const J1 = "FSM-JOB-2026-00001";
    const HISTORY: Record<string, { job: string; site: string; customer: string; title: string; bridge: Data[] }> = {};
    AGR.forEach(([agr, title, cust, site, start, end, st, , cov], ai) => {
      if (st !== "Active") return;
      const gen = `FSM-GEN-${agr.slice(-3)}`; let made = 0;
      put("FSM Generation Run", gen, { agreement: agr, horizon_months: 12, run_on: `${start} 07:00:00`, created_count: 0, skipped_count: 0, outcome: "Success", message: "Initial generation", company: COMPANY });
      const hist = { job: `FSM-JOB-2026-H0${ai + 1}`, site, customer: cust, title: `Imported service history before go-live — ${title.split(" — ")[0]}`, bridge: [] as Data[] };
      cov.forEach(([system, template, frequency, win], ci) => {
        const limit = [end, addM(start, 12)].sort()[0]!;
        for (let k = 1; k < 30; k++) {
          const due = addM(start, STEP[frequency]! * k); if (due > limit) break;
          const name = `FSM-OBL-${String(++on).padStart(5, "0")}`; const row = `${agr}-${ci + 1}`; made++;
          OBL[`${system}|${due}`] = name;
          const windowEnd = addDays(due, win);
          // history: windows that ended before October are fulfilled (Mall Q3 by job 1, earlier ones by the imported history job),
          // except one deliberately missed hospital month; the hospital September test was fulfilled late
          let status = windowEnd < "2026-10-01" ? "Fulfilled" : "Due";
          if (system === "FSM-SYS-00004" && due === "2026-08-01") status = "Missed";
          const by = site === "FSM-SITE-0001" && due === "2026-07-01" ? J1 : hist.job;
          if (status === "Fulfilled" && by === hist.job) hist.bridge.push({ obligation: name, system, outcome: "Fulfilled" });
          put("FSM Obligation", name, { agreement: agr, coverage_row: row, site, system, template, service_type: "Inspection", due_date: due, window_end: windowEnd, status, idempotency_key: `${agr}|${row}|${due}`, generation_run: gen,
            ...(status === "Fulfilled" ? { fulfilled_by: by, fulfilled_on: addDays(due, system === "FSM-SYS-00004" && due === "2026-09-01" ? 12 : 3) } : {}), company: COMPANY });
        }
      });
      if (adapter.get("FSM Generation Run", gen)?.["created_count"] === 0) adapter.update("FSM Generation Run", gen, { created_count: made, message: `${made} created, 0 already existed` });
      HISTORY[agr] = hist;
    });
    for (const h of Object.values(HISTORY)) if (h.bridge.length)
      put("FSM Job", h.job, { job_title: h.title, customer: h.customer, site: h.site, job_type: "PM Inspection", priority: "Normal", planned_days: 1, workflow_state: "Closed", hold_reason: "None", completed_on: "2026-09-30 17:00:00", scope: "Migrated record of inspections completed before DIGIT FSM go-live (source: customer service history).", company: COMPANY,
        obligations: child("FSM Job Obligation", "obligations", h.bridge, h.job) });

    // ---- JOB 1: Mall Q3 PM (closed; runs published; findings raised)
    const V1 = "FSM-VIS-2026-00001";
    put("FSM Job", J1, { job_title: "PM — Riyadh Gate Mall — Q3 2026", customer: "FSM-CUST-001", site: "FSM-SITE-0001", job_type: "PM Inspection", priority: "Normal", agreement: "FSM-AGR-2026-001", planned_days: 2, workflow_state: "Closed", hold_reason: "None", completed_on: "2026-07-03 15:30:00", company: COMPANY,
      obligations: child("FSM Job Obligation", "obligations", [{ obligation: OBL["FSM-SYS-00001|2026-07-01"], system: "FSM-SYS-00001", outcome: "Fulfilled" }, { obligation: OBL["FSM-SYS-00002|2026-07-01"], system: "FSM-SYS-00002", outcome: "Fulfilled" }, { obligation: OBL["FSM-SYS-00003|2026-07-01"], system: "FSM-SYS-00003", outcome: "Fulfilled" }], J1) });
    put(VISIT_DT, V1, { job: J1, site: "FSM-SITE-0001", technician: "FSM-TECH-004", visit_purpose: "Planned", scheduled_start: "2026-07-02 08:00:00", scheduled_end: "2026-07-02 16:00:00", workflow_state: "Completed", acknowledged_on: "2026-07-01 18:10:00", arrived_on: "2026-07-02 08:12:00", completed_on: "2026-07-02 15:40:00", access_outcome: "Accessed", block_reason: "None", handover_note: "Day 1 of 2 complete; extinguishers continue tomorrow.", company: COMPANY });
    put(VISIT_DT, "FSM-VIS-2026-00002", { job: J1, site: "FSM-SITE-0001", technician: "FSM-TECH-003", visit_purpose: "Return Visit", predecessor_visit: V1, return_reason: "Planned Continuation", scheduled_start: "2026-07-03 08:00:00", scheduled_end: "2026-07-03 13:00:00", workflow_state: "Completed", acknowledged_on: "2026-07-02 17:00:00", arrived_on: "2026-07-03 08:05:00", completed_on: "2026-07-03 12:50:00", access_outcome: "Accessed", block_reason: "None", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00001", { visit: V1, technician: "FSM-TECH-004", booking_start: "2026-07-02 08:00:00", booking_end: "2026-07-02 16:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00002", { visit: "FSM-VIS-2026-00002", technician: "FSM-TECH-003", booking_start: "2026-07-03 08:00:00", booking_end: "2026-07-03 13:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    const runPub = (id: string, job: string, visit: string, sys: string, res: Row[], extra: Data = {}) => put("FSM Inspection Run", id, { job, visit, system: sys, template: tplFor(SYSTEMS.find((x) => x[0] === sys)![2])[0], template_version: tplFor(SYSTEMS.find((x) => x[0] === sys)![2])[3], expected_devices: devicesOf(sys).length,
      workflow_state: "Published", technical_result: technicalResult(res), submitted_on: "2026-07-03 16:00:00", reviewed_on: "2026-07-05 10:00:00", reviewed_by: "Administrator", published_on: "2026-07-06 09:00:00", return_count: 0, company: COMPANY, results: res, ...extra });
    const R1 = "FSM-RUN-2026-00001", R2 = "FSM-RUN-2026-00002", R3 = "FSM-RUN-2026-00003";
    const r1 = results(R1, "FSM-SYS-00001", (c, i) => (c === "FA-02" ? ["Pass", 27.1] : c === "FA-03" && i === 5 ? "Fail" : "Pass"));
    const r2 = results(R2, "FSM-SYS-00002", (c, i) => (c === "SP-01" ? ["Pass", 6.8] : i === 2 ? "Fail" : "Pass"));
    const r3 = results(R3, "FSM-SYS-00003", (c, i) => (c === "EX-01" && i === 3 ? "Fail" : i === 5 ? "Not Applicable" : c === "EX-03" ? ["Pass", 6.0] : "Pass"));
    // stable deficiency per failed (run, check, device)
    const DEF = (id: string, run: string, res: Row[], check: string, dev: string, title: string, d: Data) => {
      const row = res.find((x) => x["check_code"] === check && x["device"] === dev); if (row) row["deficiency"] = id;
      put("FSM Deficiency", id, { title, site: "FSM-SITE-0001", system: SYSTEMS.find((x) => devicesOf(x[0]).includes(dev))?.[0], device: dev, opened_on: "2026-07-03", source_run: run, source_check: check, source_key: `${run}|${check}|${dev}`, reopen_count: 0, company: COMPANY, ...d });
    };
    DEF("FSM-DEF-2026-00001", R1, r1, "FA-03", "FSM-DEV-00001-06", "Detector functional test failed — SD-06 Smoke detector", { severity: "Major", workflow_state: "Retest Pending", commercial_decision: "Accepted", quotation: "FSM-QTN-0001", repair_job: "FSM-JOB-2026-00005", observation: "No alarm on aerosol test after 3 attempts." });
    DEF("FSM-DEF-2026-00002", R3, r3, "EX-01", "FSM-DEV-00003-04", "Pressure gauge below range — EX-04 CO2 extinguisher 6 kg", { severity: "Minor", workflow_state: "Retest Pending", commercial_decision: "Accepted", quotation: "FSM-QTN-0002", repair_job: "FSM-JOB-2026-00006" });
    DEF("FSM-DEF-2026-00003", R2, r2, "SP-02", "FSM-DEV-00002-03", "Control valve not supervised — SV-03 Control valve", { severity: "Critical", workflow_state: "Open", commercial_decision: "None", observation: "Tamper switch disconnected; valve found 3/4 open." });
    runPub(R1, J1, V1, "FSM-SYS-00001", r1); runPub(R2, J1, V1, "FSM-SYS-00002", r2); runPub(R3, J1, "FSM-VIS-2026-00002", "FSM-SYS-00003", r3);
    put("FSM Deficiency", "FSM-DEF-2026-00004", { title: "Valve SV-03 tamper switch fault (duplicate report)", site: "FSM-SITE-0001", system: "FSM-SYS-00002", device: "FSM-DEV-00002-03", severity: "Major", opened_on: "2026-07-04", workflow_state: "Duplicate", duplicate_of: "FSM-DEF-2026-00003", commercial_decision: "None", reopen_count: 0, company: COMPANY });
    for (const [id, run, rev] of [[R1, "FSM-REV-00001", r1], [R2, "FSM-REV-00002", r2], [R3, "FSM-REV-00003", r3]] as const) {
      const c = { passed: rev.filter((x) => x["outcome"] === "Pass").length, failed: rev.filter((x) => x["outcome"] === "Fail").length, na: rev.filter((x) => x["outcome"] === "Not Applicable").length };
      put("FSM Report Revision", run, { run: id, revision: 1, site: "FSM-SITE-0001", system: adapter.get("FSM Inspection Run", id)?.["system"], technical_result: technicalResult(rev), published_on: "2026-07-06 09:00:00", published_by: "Administrator", status: "Current",
        expected: new Set(rev.map((x) => x["device"]).filter(Boolean)).size, passed: c.passed, failed: c.failed, inaccessible: 0, not_applicable: c.na, untested: 0, snapshot: JSON.stringify(rev.map((x) => ({ check: x["check_code"], device: x["device"] ?? null, outcome: x["outcome"] }))), company: COMPANY });
    }
    put("FSM Result Event", "FSM-EVT-000001", { run: R1, result_row: `${R1}-008`, check_code: "FA-03", device: "FSM-DEV-00001-06", previous_outcome: "Untested", new_outcome: "Fail", recorded_by: "Administrator", recorded_on: "2026-07-02 11:20:00", site: "FSM-SITE-0001", company: COMPANY });

    // ---- native quotations with the deficiency bridge (Quotation Item.digit_fsm_deficiency)
    const QTN = (id: string, cust: string, lines: [string, string, number][], status: string) => {
      const items = lines.map(([def, title, rate], i) => ({ name: `${id}-${i + 1}`, idx: i + 1, doctype: "Quotation Item", parentfield: "items", item_code: "FSM-SVC-REPAIR", item_name: title.slice(0, 140), description: title, qty: 1, rate, amount: rate, uom: "Hour", digit_fsm_deficiency: def }));
      const total = items.reduce((t, x) => t + x.amount, 0);
      put("Quotation", id, { quotation_to: "Customer", party_name: cust, customer_name: cust, company: COMPANY, transaction_date: "2026-07-08", valid_till: "2026-08-08", order_type: "Maintenance", currency: "SAR", status, docstatus: 0, is_latest_revision: 1, items, total_qty: items.length, total, net_total: total, grand_total: total, rounded_total: total });
    };
    QTN("FSM-QTN-0001", "FSM-CUST-001", [["FSM-DEF-2026-00001", "Replace failed smoke detector SD-06", 850]], "Draft");
    QTN("FSM-QTN-0002", "FSM-CUST-001", [["FSM-DEF-2026-00002", "Recharge / replace CO2 extinguisher EX-04", 420]], "Draft");

    // ---- repair jobs, retests (DEF-1 repaired + passing reviewed retest → closure review; DEF-2 awaiting its visit)
    put("FSM Job", "FSM-JOB-2026-00005", { job_title: "Repair — replace smoke detector SD-06", customer: "FSM-CUST-001", site: "FSM-SITE-0001", job_type: "Repair", priority: "High", deficiency: "FSM-DEF-2026-00001", quotation: "FSM-QTN-0001", planned_days: 1, workflow_state: "Completed", hold_reason: "None", completed_on: "2026-07-20 12:00:00", scope: "Replace detector SD-06 and retest.", company: COMPANY, obligations: [] });
    put(VISIT_DT, "FSM-VIS-2026-00005", { job: "FSM-JOB-2026-00005", site: "FSM-SITE-0001", technician: "FSM-TECH-001", visit_purpose: "Planned", scheduled_start: "2026-07-20 09:00:00", scheduled_end: "2026-07-20 12:00:00", workflow_state: "Completed", acknowledged_on: "2026-07-19 16:00:00", arrived_on: "2026-07-20 09:05:00", completed_on: "2026-07-20 11:45:00", access_outcome: "Accessed", block_reason: "None", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00005", { visit: "FSM-VIS-2026-00005", technician: "FSM-TECH-001", booking_start: "2026-07-20 09:00:00", booking_end: "2026-07-20 12:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    const RR = "FSM-RUN-2026-00005";
    const rr: Row[] = [{ name: `${RR}-001`, idx: 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: "FA-03", check_text: "Detector functional test", device: "FSM-DEV-00001-06", outcome: "Pass", evidence_required: 1 }];
    put("FSM Inspection Run", RR, { job: "FSM-JOB-2026-00005", visit: "FSM-VIS-2026-00005", system: "FSM-SYS-00001", template: "FSM-TPL-0002", template_version: 2, expected_devices: 1, retest_for: "FSM-DEF-2026-00001", workflow_state: "Reviewed", technical_result: "Pass", submitted_on: "2026-07-20 12:10:00", reviewed_on: "2026-07-21 09:30:00", reviewed_by: "Administrator", return_count: 0, company: COMPANY, results: rr });
    put("FSM Retest", "FSM-RT-00001", { deficiency: "FSM-DEF-2026-00001", repair_job: "FSM-JOB-2026-00005", retest_run: RR, status: "Passed", due_date: "2026-08-03", company: COMPANY });
    put("FSM Job", "FSM-JOB-2026-00006", { job_title: "Repair — recharge CO2 extinguisher EX-04", customer: "FSM-CUST-001", site: "FSM-SITE-0001", job_type: "Repair", priority: "High", deficiency: "FSM-DEF-2026-00002", quotation: "FSM-QTN-0002", planned_days: 1, workflow_state: "Scheduled", hold_reason: "None", scope: "Recharge or replace EX-04.", company: COMPANY, obligations: [] });
    put(VISIT_DT, "FSM-VIS-2026-00006", { job: "FSM-JOB-2026-00006", site: "FSM-SITE-0001", visit_purpose: "Planned", workflow_state: "Unscheduled", access_outcome: "Not Recorded", block_reason: "Parts", company: COMPANY });
    put("FSM Retest", "FSM-RT-00002", { deficiency: "FSM-DEF-2026-00002", repair_job: "FSM-JOB-2026-00006", status: "Required", due_date: "2026-10-30", company: COMPANY });
    put("Material Request", "FSM-MR-0001", { material_request_type: "Material Issue", title: "FSM FSM-JOB-2026-00006", company: COMPANY, customer: "FSM-CUST-001", transaction_date: "2026-10-18", schedule_date: "2026-10-22", status: "Draft", docstatus: 0, digit_fsm_job: "FSM-JOB-2026-00006",
      items: [{ name: "FSM-MR-0001-1", idx: 1, doctype: "Material Request Item", parentfield: "items", item_code: "FSM-PART-EXT6", item_name: "CO2 extinguisher 6 kg", qty: 1, uom: "Nos", schedule_date: "2026-10-22" }] });

    // ---- JOB 2: Mall Q4 PM in progress today (one Pass, one Fail, one Inaccessible, rest untested)
    const J2 = "FSM-JOB-2026-00002", V2 = "FSM-VIS-2026-00003", R4 = "FSM-RUN-2026-00004";
    put("FSM Job", J2, { job_title: "PM — Riyadh Gate Mall — Q4 2026", customer: "FSM-CUST-001", site: "FSM-SITE-0001", job_type: "PM Inspection", priority: "Normal", agreement: "FSM-AGR-2026-001", planned_days: 1, workflow_state: "In Progress", hold_reason: "None", company: COMPANY,
      obligations: child("FSM Job Obligation", "obligations", [{ obligation: OBL["FSM-SYS-00001|2026-10-01"], system: "FSM-SYS-00001", outcome: "Pending" }, { obligation: OBL["FSM-SYS-00002|2026-10-01"], system: "FSM-SYS-00002", outcome: "Pending" }], J2) });
    for (const k of ["FSM-SYS-00001|2026-10-01", "FSM-SYS-00002|2026-10-01"]) if (OBL[k] && adapter.get("FSM Obligation", OBL[k]!)?.["status"] === "Due") adapter.update("FSM Obligation", OBL[k]!, { status: "Scheduled" });
    put(VISIT_DT, V2, { job: J2, site: "FSM-SITE-0001", technician: "FSM-TECH-001", visit_purpose: "Planned", scheduled_start: "2026-10-21 08:00:00", scheduled_end: "2026-10-21 16:00:00", workflow_state: "On Site", acknowledged_on: "2026-10-20 17:30:00", arrived_on: "2026-10-21 08:10:00", access_outcome: "Partial Access", block_reason: "Access", handover_note: "Plant room B locked — security key holder off site.", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00003", { visit: V2, technician: "FSM-TECH-001", booking_start: "2026-10-21 08:00:00", booking_end: "2026-10-21 16:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00004", { visit: V2, technician: "FSM-TECH-004", booking_start: "2026-10-21 08:00:00", booking_end: "2026-10-21 12:00:00", booking_role: "Assistant", status: "Reserved", company: COMPANY });
    const r4 = results(R4, "FSM-SYS-00001", (c, i) => (c === "FA-01" ? "Pass" : c === "FA-02" ? ["Pass", 26.9] : c === "FA-03" && i === 0 ? "Pass" : c === "FA-03" && i === 1 ? "Fail" : c === "FA-03" && i === 2 ? "Inaccessible" : "Untested"));
    put("FSM Inspection Run", R4, { job: J2, visit: V2, system: "FSM-SYS-00001", template: "FSM-TPL-0002", template_version: 2, expected_devices: 8, workflow_state: "In Progress", technical_result: technicalResult(r4), return_count: 0, company: COMPANY, results: r4 });
    put("FSM Asset Change", "FSM-CHG-00001", { device: "FSM-DEV-00001-08", change_type: "Moved", effective_date: "2026-10-21", old_location: "FSM-LOC-00002", new_location: "FSM-LOC-00003", source_run: R4, status: "Proposed", note: "Detector relocated to level 1 corridor during fit-out.", site: "FSM-SITE-0001", company: COMPANY });

    // ---- JOB 3: hospital September PM — run submitted, waiting for technical review
    const J3 = "FSM-JOB-2026-00003", V3 = "FSM-VIS-2026-00004", R6 = "FSM-RUN-2026-00006";
    put("FSM Job", J3, { job_title: "PM — Al Waha North Tower — Oct 2026", customer: "FSM-CUST-002", site: "FSM-SITE-0002", job_type: "PM Inspection", priority: "Normal", agreement: "FSM-AGR-2026-002", planned_days: 1, workflow_state: "Completed", hold_reason: "None", completed_on: "2026-10-12 15:00:00", company: COMPANY,
      obligations: child("FSM Job Obligation", "obligations", [{ obligation: OBL["FSM-SYS-00004|2026-10-01"], system: "FSM-SYS-00004", outcome: "Pending" }], J3) });
    for (const k of ["FSM-SYS-00004|2026-10-01"]) if (OBL[k] && adapter.get("FSM Obligation", OBL[k]!)?.["status"] !== "Fulfilled") adapter.update("FSM Obligation", OBL[k]!, { status: "Scheduled" });
    put(VISIT_DT, V3, { job: J3, site: "FSM-SITE-0002", technician: "FSM-TECH-004", visit_purpose: "Planned", scheduled_start: "2026-10-12 08:00:00", scheduled_end: "2026-10-12 15:00:00", workflow_state: "Completed", acknowledged_on: "2026-10-11 15:00:00", arrived_on: "2026-10-12 08:20:00", completed_on: "2026-10-12 14:40:00", access_outcome: "Accessed", block_reason: "None", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00006", { visit: V3, technician: "FSM-TECH-004", booking_start: "2026-10-12 08:00:00", booking_end: "2026-10-12 15:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    const r6 = results(R6, "FSM-SYS-00004", (c, i) => (c === "FA-02" ? ["Pass", 27.4] : "Pass"));
    put("FSM Inspection Run", R6, { job: J3, visit: V3, system: "FSM-SYS-00004", template: "FSM-TPL-0002", template_version: 2, expected_devices: 8, workflow_state: "Submitted for Review", technical_result: technicalResult(r6), submitted_on: "2026-10-12 15:10:00", return_count: 0, company: COMPANY, results: r6 });
    const R7 = "FSM-RUN-2026-00007";
    const r7 = results(R7, "FSM-SYS-00005", (c, i) => (c === "EL-02" && i === 4 ? ["Fail", 55] : c === "EL-02" ? ["Pass", 120] : "Pass"));
    r7.forEach((x) => { if (x["outcome"] === "Fail") x["deficiency"] = "FSM-DEF-2026-00005"; });
    put("FSM Inspection Run", R7, { job: J3, visit: V3, system: "FSM-SYS-00005", template: "FSM-TPL-0005", template_version: 1, expected_devices: 6, workflow_state: "Reviewed", technical_result: technicalResult(r7), submitted_on: "2026-10-12 15:20:00", reviewed_on: "2026-10-14 10:00:00", reviewed_by: "Administrator", return_count: 1, return_reason: "Attach duration readings for EL-05 and EL-06.", company: COMPANY, results: r7 });
    put("FSM Deficiency", "FSM-DEF-2026-00005", { title: "Emergency luminaire failed 90-minute duration — EL-05", site: "FSM-SITE-0002", system: "FSM-SYS-00005", device: "FSM-DEV-00005-05", severity: "Major", opened_on: "2026-10-12", source_run: R7, source_check: "EL-02", source_key: `${R7}|EL-02|FSM-DEV-00005-05`, workflow_state: "Quoted", commercial_decision: "Quoted", quotation: "FSM-QTN-0003", reopen_count: 0, company: COMPANY });
    QTN("FSM-QTN-0003", "FSM-CUST-002", [["FSM-DEF-2026-00005", "Replace battery pack in emergency luminaire EL-05", 380]], "Draft");
    put("FSM Deficiency", "FSM-DEF-2026-00006", { title: "Customer disputes missing signage finding — stair core 2", site: "FSM-SITE-0002", system: "FSM-SYS-00005", severity: "Minor", opened_on: "2026-09-04", workflow_state: "Disputed", commercial_decision: "None", reopen_count: 0, observation: "Customer states signage is landlord scope.", company: COMPANY });

    // ---- JOB 4: hospital emergency from the sprinkler leak request (dispatched, not yet acknowledged) + active impairment
    const J4 = "FSM-JOB-2026-00004", V4 = "FSM-VIS-2026-00007";
    put("FSM Job", J4, { job_title: "Sprinkler pipe leaking in basement car park", customer: "FSM-CUST-002", site: "FSM-SITE-0002", job_type: "Emergency", priority: "Urgent", issue: "FSM-REQ-0002", planned_days: 1, workflow_state: "Scheduled", hold_reason: "None", scope: "Isolate branch, stop leak, assess pipe.", company: COMPANY, obligations: [] });
    if (!adapter.get("Issue", "FSM-REQ-0002")?.["digit_fsm_job"]) adapter.update("Issue", "FSM-REQ-0002", { digit_fsm_job: J4 });
    put(VISIT_DT, V4, { job: J4, site: "FSM-SITE-0002", technician: "FSM-TECH-002", visit_purpose: "Emergency", scheduled_start: "2026-10-21 10:00:00", scheduled_end: "2026-10-21 14:00:00", workflow_state: "Dispatched", access_outcome: "Not Recorded", block_reason: "None", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00007", { visit: V4, technician: "FSM-TECH-002", booking_start: "2026-10-21 10:00:00", booking_end: "2026-10-21 14:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    put("FSM Impairment", "FSM-IMP-00001", { system: "FSM-SYS-00006", site: "FSM-SITE-0002", scope: "Partial / Zone", started_on: "2026-10-20 09:30:00", status: "Active", authority_notified: 1, fire_watch: 1, note: "Basement zone isolated pending repair.", company: COMPANY });
    if (adapter.get("FSM Service System", "FSM-SYS-00006")?.["operating_status"] === "In Service") adapter.update("FSM Service System", "FSM-SYS-00006", { operating_status: "Impaired" });

    // ---- planned upcoming corrective visit (Noor clinic) for the dispatch board, and a subcontract assignment
    const J7 = "FSM-JOB-2026-00007";
    put("FSM Job", J7, { job_title: "Corrective — replace damaged manual call point, Noor Clinic", customer: "SYN-CUST-002", site: "FSM-SITE-0004", job_type: "Corrective", priority: "High", agreement: "FSM-AGR-2025-004", planned_days: 1, workflow_state: "Scheduled", hold_reason: "None", scope: "Call point glass broken at clinic entrance; replace and test.", company: COMPANY, obligations: [] });
    put(VISIT_DT, "FSM-VIS-2026-00008", { job: J7, site: "FSM-SITE-0004", technician: "FSM-TECH-003", visit_purpose: "Planned", scheduled_start: "2026-10-22 09:00:00", scheduled_end: "2026-10-22 13:00:00", workflow_state: "Planned", access_outcome: "Not Recorded", block_reason: "None", company: COMPANY });
    put("FSM Booking", "FSM-BKG-00008", { visit: "FSM-VIS-2026-00008", technician: "FSM-TECH-003", booking_start: "2026-10-22 09:00:00", booking_end: "2026-10-22 13:00:00", booking_role: "Lead", status: "Reserved", company: COMPANY });
    put("FSM Subcontract Assignment", "FSM-SUB-0001", { job: J4, supplier: "FSM-SUPP-001", scope: "Replace corroded branch line section above bay B12 (licensed sprinkler contractor).", agreed_cost: 3200, status: "Proposed", company: COMPANY });

    // ---- commercial control
    put("FSM Charge Proposal", "FSM-CP-00001", { job: J1, customer: "FSM-CUST-001", coverage_decision: "Covered", amount: 0, basis: "Covered by agreement FSM-AGR-2026-001", status: "Approved", idempotency_key: `charge|${J1}`, company: COMPANY });
    put("FSM Charge Proposal", "FSM-CP-00002", { job: "FSM-JOB-2026-00005", customer: "FSM-CUST-001", coverage_decision: "Chargeable", amount: 850, basis: "Quotation FSM-QTN-0001 (Draft)", status: "Approved", idempotency_key: "charge|FSM-JOB-2026-00005", company: COMPANY });
    put("FSM Integration Exception", "FSM-EXC-00001", { source: "Import", reference_doctype: "FSM Device", reference_name: "row 14", error: "Device import row 14: serial SD011014 already belongs to FSM-DEV-00001-15 on another system — skipped, not merged.", status: "Open", attempts: 1, last_attempt: "2026-10-18 10:00:00", company: COMPANY });
    put("FSM Renewal Case", "FSM-REN-0001", { agreement: "FSM-AGR-2025-004", customer: "SYN-CUST-002", current_end: "2026-11-14", proposed_end: "2027-11-14", proposed_value: 25200, status: "Open", risk_note: "One open critical finding history; customer asked for monthly lighting tests.", company: COMPANY });
  });
  return added;
}
