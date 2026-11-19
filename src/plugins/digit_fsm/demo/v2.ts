import { VISIT_DT } from "@/plugins/digit_fsm/schema";
/**
 * DIGIT FSM + ITM demo v2 (owner round 2026-11-17 F1-04) — one deterministic, connected dataset placed RELATIVE TO TODAY:
 * 3 customers, 12 service sites (Riyadh / Jeddah / Dammam) with buildings → floors → zones, 6 systems per site (72),
 * ~600 devices, 20 agreements with 12 months of obligations, 8 technicians in 2 crews with skills, certificates and vans,
 * history jobs with visits, published inspection runs and report revisions, this week's jobs and visits in every state
 * (booked on the technicians' calendars, with one double booking and one skill mismatch the dispatch board must show),
 * runs with pass / fail / inaccessible results, 40 deficiencies (5 critical), 3 active impairments, native quotations,
 * sales orders, retests, timesheets, material requests and stock entries (posted by the native posting engine), charge
 * proposals and draft sales invoices, service requests with SLA dates, offline actions and portal grants.
 * Every record goes through `put` (insert-if-missing under an explicit name), so a record a user changed is never
 * overwritten. Pure function of `today`: rebuilt on every visit by the memory-only sample layer.
 */
import { rng, type Rng } from "@/lib/volume/kit";
import { addDays, addMonths, dueDates, obligationKey, technicalResult, type Row } from "../domain/rules";
import { ABBR, ACCESS_NOTES, AGREEMENTS, COMPANY, CUSTOMERS, DEVICE_TYPES, KIND_SYSTEMS, PARTS, REQUESTS, SITES, SLA_HOURS, STORES, SYSTEM_NAME, TECHS, TEMPLATES, WINDOW, activeTpl, frequencyOf, techName, vanOf, type CheckDef, type SiteDef, type TechDef } from "./catalog";

export type Put = (doctype: string, name: string, data: Record<string, unknown>) => unknown;
export type Voucher = (doctype: string, name: string) => void;
type Data = Record<string, unknown>;
const p2 = (n: number) => String(n).padStart(2, "0");
const p3 = (n: number) => String(n).padStart(3, "0");
const p4 = (n: number) => String(n).padStart(4, "0");
const hm = (h: number) => `${p2(Math.floor(h))}:${p2(Math.round((h % 1) * 60))}:00`;
// today's working slots follow the clock: when the demo opens before mid-morning, today's schedule moves earlier (at most
// 6.5 h) so the visit «on site» started shortly before now and the morning visit is really finished; other days unchanged
let SHIFT_DAY = ""; let SHIFT = 0;
const at = (d: string, h: number) => `${d} ${hm(Math.max(0, h + (d === SHIFT_DAY ? SHIFT : 0)))}`;
const child = (dt: string, parentfield: string, list: Data[], prefix: string) => list.map((r, i) => ({ name: `${prefix}-${i + 1}`, idx: i + 1, doctype: dt, parentfield, ...r }));
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 5 = Friday (weekend)

/** Everything the screens and tests may want to know about the generated set. */
export interface DemoStats { sites: number; systems: number; devices: number; agreements: number; obligations: number; technicians: number; jobs: number; visits: number; runs: number; deficiencies: number; critical: number; impairments: number; today: string }

export function buildFsmDemo(put: Put, voucher: Voucher = () => {}, T = new Date().toISOString().slice(0, 10)): DemoStats {
  const r: Rng = rng(20261117);
  const nowD = new Date(); SHIFT_DAY = T; SHIFT = T === nowD.toISOString().slice(0, 10) ? Math.max(-6.5, Math.min(0, nowD.getUTCHours() + nowD.getUTCMinutes() / 60 - 11.75)) : 0;
  const D = (k: number) => addDays(T, k);
  const st: DemoStats = { sites: 0, systems: 0, devices: 0, agreements: 0, obligations: 0, technicians: 0, jobs: 0, visits: 0, runs: 0, deficiencies: 0, critical: 0, impairments: 0, today: T };
  // records are collected first (later steps may still complete them, e.g. an impaired system) and put at the end
  const buf = new Map<string, [string, string, Data]>();
  const P = (dt: string, name: string, data: Data) => { buf.set(`${dt}\u0001${name}`, [dt, name, { company: COMPANY, ...data, __fsm_demo: 2 }]); };
  const upd = (dt: string, name: string, patch: Data) => { const x = buf.get(`${dt}\u0001${name}`); if (x) Object.assign(x[2], patch); };
  const vouchers: [string, string][] = [];
  const siteOf = (id: string) => SITES.find((s) => s.id === id)!;
  const custOf = (id: string) => CUSTOMERS.find((c) => c.id === id)!;

  // ------------------------------------------------------------------ settings, native masters
  P("FSM Settings", "FSM Settings", { default_company: COMPANY, generation_horizon_months: 12, retest_due_days: 14, require_review: 1, block_expired_certification: 1, default_severity: "Major" });
  for (const c of CUSTOMERS) P("Customer", c.id, { customer_name: c.name, customer_type: "Company", customer_group: "Commercial", territory: "Saudi Arabia", default_currency: "SAR", email_id: c.email, tax_id: `3${c.id.slice(-3)}0045678900003` });
  P("Supplier", "FSM-SUPP-001", { supplier_name: "Gulf Fire Pump Services", supplier_group: "Services", supplier_type: "Company", country: "Saudi Arabia" });
  for (const [code, name] of [["FSM-SVC-INSP", "Fire & life safety inspection visit"], ["FSM-SVC-REPAIR", "Corrective repair labour"]] as const)
    P("Item", code, { item_code: code, item_name: name, item_group: "Services", stock_uom: code === "FSM-SVC-REPAIR" ? "Hour" : "Nos", is_stock_item: 0, standard_rate: 450 });
  P("Item", "FSM-SVC-CALLOUT", { item_code: "FSM-SVC-CALLOUT", item_name: "Emergency call-out", item_group: "Services", stock_uom: "Nos", is_stock_item: 0, standard_rate: 350 });
  for (const [code, name, rate, uom] of PARTS) P("Item", code, { item_code: code, item_name: name, item_group: "Products", stock_uom: uom, is_stock_item: 1, standard_rate: rate, valuation_rate: Math.round(rate * 0.62) });
  const techMail = (t: (typeof TECHS)[number]) => `${t.first}.${t.last}`.toLowerCase().replace(/[^a-z.]+/g, "") + "@fsm.example.test";
  for (const t of TECHS) {
    P("Employee", t.emp, { first_name: t.first, last_name: t.last, employee_name: techName(t), gender: t.gender, status: "Active", date_of_birth: addDays(T, -(365 * 31 + Number(t.id.slice(-1)) * 211)), date_of_joining: addDays(T, -(400 + Number(t.id.slice(-1)) * 97)), designation: "Field Technician", cell_number: t.phone, user_id: techMail(t) });
    // owner HR-02: each technician signs in with the self-service account linked on the employee (role Employee + FSM Technician)
    P("User", techMail(t), { email: techMail(t), first_name: t.first, last_name: t.last, full_name: techName(t), enabled: 1, user_type: "System User", roles: [{ idx: 1, role: "Employee" }, { idx: 2, role: "FSM Technician" }] });
    P("Warehouse", vanOf(t), { warehouse_name: `FSM Van ${t.id.slice(-2)}`, is_group: 0, warehouse_type: "Transit" });
    P("FSM Technician", t.id, { employee: t.emp, technician_name: techName(t), crew: t.crew, territory: t.city, status: "Active", daily_hours: 8, phone: t.phone, van_warehouse: vanOf(t),
      skills: child("FSM Technician Skill", "skills", t.skills.map(([skill, cert, days]) => ({ skill, certificate_no: cert, valid_until: D(days) })), t.id) });
    st.technicians++;
  }
  // availability: leave, training and on-call relative to today
  const tech = (id: string) => TECHS.find((t) => t.id === id)!;
  P("FSM Calendar Exception", "FSM-CAL-D01", { technician: "FSM-TECH-003", exception_type: "Leave", from_time: at(D(2), 0), to_time: at(D(3), 23.98), reason: "Annual leave", status: "Approved" });
  P("FSM Calendar Exception", "FSM-CAL-D02", { technician: "FSM-TECH-008", exception_type: "Training", from_time: at(D(1), 8), to_time: at(D(1), 12), reason: "Work-at-height refresher", status: "Approved" });
  P("FSM Calendar Exception", "FSM-CAL-D03", { technician: "FSM-TECH-004", exception_type: "On-call", from_time: at(T, 17), to_time: at(D(1), 8), reason: "Weekday on-call rota", status: "Approved" });
  P("FSM Calendar Exception", "FSM-CAL-D04", { technician: "FSM-TECH-002", exception_type: "On-call", from_time: at(D(1), 17), to_time: at(D(2), 8), reason: "Weekday on-call rota", status: "Approved" });
  P("FSM Test Instrument", "FSM-INS-D01", { instrument_name: "Smoke detector tester (aerosol + pole)", serial_no: "SDT-4410", calibration_ref: "Functional tool", calibrated_on: D(-120), calibration_due: D(245), custodian: "FSM-TECH-001" });
  P("FSM Test Instrument", "FSM-INS-D02", { instrument_name: "Digital pressure gauge 0–16 bar", serial_no: "DPG-2208", calibration_ref: "CAL-0912", calibrated_on: D(-340), calibration_due: D(25), custodian: "FSM-TECH-002" });
  P("FSM Test Instrument", "FSM-INS-D03", { instrument_name: "Thermal imaging camera", serial_no: "TIC-5521", calibration_ref: "CAL-1180", calibrated_on: D(-380), calibration_due: D(-15), custodian: "FSM-TECH-007" });
  for (const t of TEMPLATES) P("FSM Inspection Template", t.id, { template_name: t.name, system_type: t.type, version: t.version, status: t.status, trade_pack: "Fire & Life Safety", standard_ref: t.std, supersedes: t.supersedes, published_on: t.status === "Draft" ? undefined : at(D(-300 + t.version * 60), 9),
    checks: child("FSM Template Check", "checks", t.checks.map((c) => ({ check_code: c.code, check_text: c.text, applies_to: c.applies, unit: c.unit, min_value: c.min, max_value: c.max, evidence_required: c.photo ? 1 : 0 })), t.id) });

  // ------------------------------------------------------------------ portfolio: sites → buildings → floors → zones → systems → devices
  const sysOfSite = new Map<string, { id: string; type: string }[]>();
  const devOfSys = new Map<string, { id: string; label: string; zone: string }[]>();
  const zonesOf = new Map<string, string[]>();
  SITES.forEach((s, si) => {
    const sn = p2(si + 1);
    const contact = `FSM-CON-${sn}`; const fm = ["Reem Al-Saleh", "Turki Al-Anazi", "Lama Al-Fahad"][si % 3]!;
    P("Contact", contact, { first_name: fm.split(" ")[0], last_name: fm.split(" ").slice(1).join(" "), full_name: fm, designation: "Facility Manager", mobile_no: `+966 50 33${p2(si + 10)} ${p4(1200 + si)}`, email_id: `fm.${s.code.toLowerCase()}@example.test`, links: [{ idx: 1, link_doctype: "Customer", link_name: s.customer }] });
    P("FSM Service Site", s.id, { site_name: s.name, site_code: s.code, customer: s.customer, city: s.city, branch: s.city, status: "Active", latitude: s.lat, longitude: s.lng,
      service_window: s.kind === "hospital" ? "Daily 07:00–19:00 (wards by appointment)" : "Sat–Thu 08:00–17:00", access_instructions: s.kind === "hospital" ? "Report to hospital security; infection-control briefing before wards." : "Report to the security desk; escort required in plant rooms.",
      requires_escort: s.kind !== "clinic" ? 1 : 0, requires_permit: s.kind === "industrial" ? 1 : 0,
      contacts: child("FSM Site Contact", "contacts", [{ contact, contact_role: "Facility Manager", phone: `+966 50 33${p2(si + 10)} ${p4(1200 + si)}`, notify: 1 },
        // F4-02: most sites name a gate / security contact for access; two sites still miss it (the readiness card shows «ناقص»)
        ...(si % 6 === 5 ? [] : [{ contact_role: "Site Access", phone: `+966 55 41${p2(si + 20)} ${p4(4400 + si)}`, notify: 0 }]), { contact_role: "Emergency", phone: `+966 9200 ${p4(3100 + si)}`, notify: 1 }], `${s.id}-c`) });
    st.sites++;
    let ln = 0; const zones: string[] = [];
    const node = (data: Data) => { const id = `FSM-LOC-${sn}-${p3(++ln)}`; P("FSM Location Node", id, { site: s.id, effective_from: D(-900), ...data }); return id; };
    for (let b = 0; b < s.buildings; b++) {
      const bid = node({ node_type: "Building", node_label: s.buildings > 1 ? (b ? "Building B" : "Building A") : "Main building" });
      for (const f of s.floors) {
        const fid = node({ node_type: "Floor", node_label: f, parent_node: bid });
        for (const z of ["Zone A", "Zone B", ...(s.kind === "mall" && f === "Ground floor" ? ["Zone C"] : [])]) zones.push(node({ node_type: "Zone", node_label: z, parent_node: fid }));
      }
    }
    zonesOf.set(s.id, zones);
    const systems: { id: string; type: string }[] = [];
    KIND_SYSTEMS[s.kind].forEach((type, k) => {
      const id = `FSM-SYS-${sn}-${k + 1}`; systems.push({ id, type });
      P("FSM Service System", id, { system_name: SYSTEM_NAME[type], site: s.id, system_type: type, identifier: `${s.code}-${type.split(" ").map((w) => w[0]).join("")}${k + 1}`, operating_status: "In Service", location: zones[0] ? `FSM-LOC-${sn}-001` : undefined });
      st.systems++;
      const def = DEVICE_TYPES[type]!; const n = r.int(def.range[0], def.range[1]); const counter = new Map<string, number>(); const devs: { id: string; label: string; zone: string }[] = [];
      for (let i = 0; i < n; i++) {
        const [code, label] = type === "Fire Pump" ? def.types[i % 3]! : (() => { const x = r.next(); let acc = 0; for (const t of def.types) { acc += t[2]; if (x <= acc) return t; } return def.types[0]!; })();
        const no = (counter.get(code) ?? 0) + 1; counter.set(code, no);
        const id = `FSM-DEV-${sn}${k + 1}-${p3(i + 1)}`; const zone = zones[(i + k * 3) % zones.length]!;
        const dl = `${code}-${p2(no)} ${label}`;
        P("FSM Device", id, { device_label: dl, device_type: label, system: `FSM-SYS-${sn}-${k + 1}`, site: s.id, location: zone, serial_no: `${s.code}${k + 1}${p4(1000 + i)}`, barcode: `TAG-${sn}${k + 1}${p3(i + 1)}`, lifecycle: i === n - 1 && type === "Extinguishers" && si % 4 === 0 ? "Removed" : "Active", install_date: D(-r.int(400, 2400)), item: def.item });
        devs.push({ id, label: dl, zone }); st.devices++;
      }
      devOfSys.set(id, devs);
    });
    sysOfSite.set(s.id, systems);
  });
  const typeOf = (sys: string) => [...sysOfSite.values()].flat().find((x) => x.id === sys)?.type ?? "";
  const siteOfSys = (sys: string) => SITES.find((s) => (sysOfSite.get(s.id) ?? []).some((x) => x.id === sys))!;

  // ------------------------------------------------------------------ agreements and 12 months of obligations
  interface Obl { name: string; agr: string; row: string; site: string; system: string; type: string; due: string; win: string; status: string; fulfilled_on?: string; job?: string; waiver?: string }
  const obls: Obl[] = [];
  const agrEnd = new Map<string, string>();
  let on = 0;
  for (const a of AGREEMENTS) {
    const s = siteOf(a.site); const start = addDays(addMonths(T, -a.months), a.offset); const end = addDays(addMonths(start, 12), -1); agrEnd.set(a.id, end);
    const types = (sysOfSite.get(s.id) ?? []).filter((x) => (a.covers ? a.covers.includes(x.type) : !(a.excludes ?? []).includes(x.type)));
    const cov = types.map((x) => { const f = frequencyOf(x.type, s.kind, a.kind === "specialist"); return { system: x.id, template: activeTpl(x.type).id, frequency: f, window_days: WINDOW[f]!, service_type: a.kind === "specialist" ? "Maintenance" : "Inspection", included: 1 }; });
    P("FSM Service Agreement", a.id, { agreement_title: a.title, customer: s.customer, site: s.id, start_date: start, end_date: end, workflow_state: a.state, revision: a.state === "Draft" ? 1 : 2, billing_basis: "Fixed Periodic", annual_value: a.value,
      coverage: child("FSM Coverage Line", "coverage", cov, a.id) });
    st.agreements++;
    if (a.state === "Draft") continue;
    const gen = `FSM-GEN-${a.id.slice(-3)}`; let made = 0;
    const suspendedFrom = a.state === "Suspended" ? D(-12) : "";
    cov.forEach((c, ci) => {
      const row = `${a.id}-${ci + 1}`;
      for (const due of dueDates(start, end, c.frequency, 12)) {
        const win = addDays(due, c.window_days); const name = `FSM-OBL-D${String(++on).padStart(5, "0")}`; made++;
        let status = win < D(-3) ? "Fulfilled" : "Due"; let fulfilled_on: string | undefined; let waiver: string | undefined;
        if (status === "Fulfilled") {
          const k = r.next();
          if (k < 0.045) status = "Missed";
          else fulfilled_on = k < 0.13 ? addDays(win, r.int(1, 6)) : addDays(due, r.int(0, Math.max(1, c.window_days - 2)));
          if (fulfilled_on && fulfilled_on > D(-4)) fulfilled_on = D(-4);
        }
        if (suspendedFrom && due >= suspendedFrom) { status = "Waived"; waiver = "Agreement suspended by the customer (kitchen refurbishment)"; fulfilled_on = undefined; }
        obls.push({ name, agr: a.id, row, site: s.id, system: c.system, type: typeOf(c.system), due, win, status, ...(fulfilled_on ? { fulfilled_on } : {}), ...(waiver ? { waiver } : {}) });
      }
    });
    P("FSM Generation Run", gen, { agreement: a.id, horizon_months: 12, run_on: at(start, 7), created_count: made, skipped_count: 0, outcome: "Success", message: `${made} created, 0 already existed` });
  }

  // ------------------------------------------------------------------ technician calendar (slot bookkeeping)
  const busy = new Map<string, [number, number][]>(); // tech|day → hour intervals
  const free = (t: string, d: string, a: number, b: number) => !(busy.get(`${t}|${d}`) ?? []).some(([x, y]) => a < y && x < b);
  const take = (t: string, d: string, a: number, b: number) => { const k = `${t}|${d}`; busy.set(k, [...(busy.get(k) ?? []), [a, b]]); };
  const onLeave = (t: string, d: string) => (t === "FSM-TECH-003" && (d === D(2) || d === D(3)));
  const skilled = (t: TechDef, type: string, d: string) => t.skills.some(([sk, , days]) => sk === type && D(days) >= d);
  const pickTech = (city: string, type: string, d: string, a: number, b: number, prefer?: string) => {
    const cands = TECHS.filter((t) => t.city === city && skilled(t, type, d) && !onLeave(t.id, d) && free(t.id, d, a, b));
    if (prefer) { const p = cands.find((t) => t.id === prefer); if (p) return p; }
    return cands.sort((x, y) => (busy.get(`${x.id}|${d}`)?.length ?? 0) - (busy.get(`${y.id}|${d}`)?.length ?? 0))[0];
  };

  // ------------------------------------------------------------------ result rows of a run
  let rn = 0, jn = 0, vn = 0, bn = 0, tsn = 0, rtsn = 0, defn = 0, evn = 0;
  interface Fail { run: string; check: CheckDef; device: string; deviceLabel: string; system: string; site: string; day: string; row: Data }
  const fails: Fail[] = [];
  const results = (runId: string, sys: string, mode: { recorded: number; failP: number; inaccP: number }, day: string, collect: boolean): Row[] => {
    const tpl = activeTpl(typeOf(sys)); const devs = (devOfSys.get(sys) ?? []); const out: Row[] = [];
    for (const c of tpl.checks) {
      const targets = c.applies === "Device" ? devs : [{ id: "", label: "", zone: "" }];
      for (const dv of targets) {
        const i = out.length; const recorded = r.next() < mode.recorded;
        let outcome = "Untested"; let measurement: number | undefined; let note: string | undefined;
        if (recorded) {
          const x = r.next();
          if (x < mode.failP) outcome = "Fail"; else if (x < mode.failP + mode.inaccP && c.applies === "Device") { outcome = "Inaccessible"; note = ACCESS_NOTES[r.int(0, ACCESS_NOTES.length - 1)]; } else if (x > 0.985 && c.applies === "Device") outcome = "Not Applicable"; else outcome = "Pass";
          if (c.unit && outcome !== "Inaccessible" && outcome !== "Not Applicable") {
            const lo = c.min ?? (c.max !== undefined ? c.max * 0.4 : 0), hi = c.max ?? lo * 1.6;
            measurement = outcome === "Fail" ? Math.round((c.min !== undefined ? lo * 0.82 : hi * 1.18) * 10) / 10 : Math.round((lo + (hi - lo) * (0.25 + r.next() * 0.5)) * 10) / 10;
          }
        }
        const row: Data = { name: `${runId}-${p3(i + 1)}`, idx: i + 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: c.code, check_text: c.text, device: dv.id || undefined, outcome, ...(measurement !== undefined ? { measurement } : {}), ...(note ? { note } : {}), evidence_required: c.photo ? 1 : 0 };
        out.push(row);
        if (collect && outcome === "Fail") fails.push({ run: runId, check: c, device: dv.id, deviceLabel: dv.label, system: sys, site: siteOfSys(sys).id, day, row });
      }
    }
    return out;
  };
  const putRun = (id: string, data: Data, res: Row[]) => { P("FSM Inspection Run", id, { ...data, template: activeTpl(typeOf(String(data["system"]))).id, template_version: activeTpl(typeOf(String(data["system"]))).version, expected_devices: new Set(res.map((x) => x["device"]).filter(Boolean)).size, technical_result: technicalResult(res), return_count: data["return_count"] ?? 0, results: res }); st.runs++; };
  const revision = (run: string, data: Data, res: Row[], day: string) => {
    const c = (o: string) => res.filter((x) => x["outcome"] === o).length;
    P("FSM Report Revision", `FSM-REV-${run.slice(-5)}`, { run, revision: 1, site: data["site"], system: data["system"], technical_result: technicalResult(res), published_on: at(day, 15), published_by: "Administrator", status: "Current",
      expected: new Set(res.map((x) => x["device"]).filter(Boolean)).size, passed: c("Pass"), failed: c("Fail"), inaccessible: c("Inaccessible"), not_applicable: c("Not Applicable"), untested: c("Untested"), snapshot: JSON.stringify(res.map((x) => ({ check: x["check_code"], device: x["device"] ?? null, outcome: x["outcome"] }))) });
  };
  const visitPut = (id: string, data: Data) => { P(VISIT_DT, id, data); st.visits++; };
  const booking = (visit: string, techId: string, d: string, a: number, b: number, role: "Lead" | "Assistant", site: string, status = "Reserved") => { P("FSM Booking", `FSM-BKG-D${p4(++bn)}`, { visit, technician: techId, booking_start: at(d, a), booking_end: at(d, b), booking_role: role, status, site }); };
  // F4-05: approved labour hours and parts used per job, so the seeded proposals / draft invoices follow the billing equation
  const labourH = new Map<string, number>(); const usedParts = new Map<string, Map<string, number>>();
  const timesheet = (techId: string, job: string, d: string, a: number, b: number, submitted: boolean, billable: boolean, id0?: string) => {
    const t = tech(techId); const hrs = Math.round((b - a) * 2) / 2; const id = id0 ?? `FSM-TS-D${p4(++tsn)}`;
    if (submitted) labourH.set(job, (labourH.get(job) ?? 0) + hrs);
    P("Timesheet", id, { employee: t.emp, employee_name: techName(t), start_date: d, end_date: d, digit_fsm_job: job, status: submitted ? "Submitted" : "Draft", docstatus: submitted ? 1 : 0, total_hours: hrs, total_billable_hours: billable ? hrs : 0, total_billable_amount: billable ? hrs * 250 : 0, total_costing_amount: hrs * 120,
      time_logs: [{ idx: 1, activity_type: "Field Service", from_time: at(d, a), to_time: at(d, b), hours: hrs, billable: billable ? 1 : 0, billing_hours: billable ? hrs : 0, billing_rate: 250, costing_rate: 120 }] });
  };

  // ------------------------------------------------------------------ history: fulfilled obligations grouped into jobs (last 90 days with visits + published runs)
  const hist = new Map<string, Obl[]>();
  for (const o of obls) if (o.status === "Fulfilled" && o.fulfilled_on) { const recent = o.fulfilled_on >= D(-90); const k = recent ? `${o.site}|${o.fulfilled_on}` : `${o.agr}|old`; hist.set(k, [...(hist.get(k) ?? []), o]); }
  for (const [k, os] of [...hist.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const o0 = os[0]!; const s = siteOf(o0.site); const old = k.endsWith("|old"); const jid = `FSM-JOB-H${p4(++jn)}`;
    for (const o of os) o.job = jid;
    const day = old ? os.map((o) => o.fulfilled_on!).sort().slice(-1)[0]! : o0.fulfilled_on!;
    P("FSM Job", jid, { job_title: old ? `Imported service history — ${s.name}` : `Planned inspection — ${s.name}`, customer: s.customer, site: s.id, job_type: "PM Inspection", priority: "Normal", agreement: o0.agr, planned_days: 1, workflow_state: "Closed", hold_reason: "None", completed_on: at(day, 16),
      scope: old ? "Inspections completed before the current reporting window (customer service history)." : `Planned ${os.map((o) => o.type).join(", ")} inspection.`, obligations: child("FSM Job Obligation", "obligations", os.map((o) => ({ obligation: o.name, system: o.system, outcome: "Fulfilled" })), jid) });
    st.jobs++;
    if (old) continue;
    const lead = TECHS.filter((t) => t.city === s.city && t.skills.some(([sk]) => sk === o0.type))[jn % 2] ?? TECHS.find((t) => t.city === s.city)!;
    const a = 8 + (jn % 2) * 5, b = a + Math.min(4, 1.5 + os.length);
    const vid = `FSM-VIS-H${p4(++vn)}`; const late = r.int(-8, 35) / 60; const over = r.int(-30, 40) / 60;
    visitPut(vid, { job: jid, site: s.id, technician: lead.id, visit_purpose: "Planned", scheduled_start: at(day, a), scheduled_end: at(day, b), workflow_state: "Completed", acknowledged_on: at(addDays(day, -1), 16), arrived_on: at(day, a + late), completed_on: at(day, b + over), access_outcome: "Accessed", block_reason: "None", signed_by: "Facility Manager", signed_on: at(day, b + over) });
    booking(vid, lead.id, day, a, b, "Lead", s.id);
    if (day >= D(-30)) timesheet(lead.id, jid, day, a + late, b + over, true, false);
    for (const o of os) {
      const rid = `FSM-RUN-H${p4(++rn)}`; const res = results(rid, o.system, { recorded: 1, failP: 0.035, inaccP: 0.012 }, day, true);
      const data = { job: jid, visit: vid, site: s.id, system: o.system, workflow_state: "Published", submitted_on: at(day, b + 0.5), reviewed_on: at(addDays(day, 1), 10), reviewed_by: "Administrator", published_on: at(addDays(day, 2), 9) };
      putRun(rid, data, res); revision(rid, data, res, addDays(day, 2));
    }
  }

  // ------------------------------------------------------------------ this week: PM jobs from obligations in window, repairs, retests, emergencies, corrective work
  const days = Array.from({ length: 8 }, (_, i) => D(i - 3)).filter((d) => dow(d) !== 5);
  const SLOTS: [number, number][] = [[8, 10.5], [11, 13.5], [14, 16.5]];
  interface Work { job: string; site: SiteDef; type: string; prefer: string; kind: "pm" | "repair" | "retest" | "emergency" | "corrective"; obls?: Obl[]; def?: string; slot?: number; tech?: string; hours?: number; noVisit?: boolean; unscheduled?: boolean; state?: string; fix?: string | undefined }
  const work: Work[] = [];
  // obligations in their window now or due within four weeks are worked this week (one visit per obligation; early visits are allowed)
  const cur = obls.filter((o) => o.status === "Due" && o.due <= D(28) && o.win >= D(-3)).sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
  const HOURS: Record<string, number> = { "Fire Alarm": 2.5, Sprinkler: 2, "Fire Pump": 1.5, Extinguishers: 2, "Emergency Lighting": 2, "Kitchen Suppression": 1.5, HVAC: 2.5, Electrical: 2 };
  const back = days.filter((d) => d <= T), ahead = days.filter((d) => d >= T);
  cur.forEach((o, i) => {
    const jid = `FSM-JOB-D${p4(++jn)}`; o.job = jid;
    const pref = o.due <= T ? back[i % back.length]! : ahead[i % ahead.length]!;
    work.push({ job: jid, site: siteOf(o.site), type: o.type, prefer: pref, kind: "pm", obls: [o], hours: HOURS[o.type] ?? 2 });
  });

  // deficiency plans from history fails (assigned below once all history runs exist)
  const flip = (row: Data, c: CheckDef) => { row["outcome"] = "Fail"; if (c.unit) row["measurement"] = Math.round(((c.min !== undefined ? c.min * 0.82 : (c.max ?? 10) * 1.18)) * 10) / 10; };
  const hf = fails.slice().sort((a, b) => a.day.localeCompare(b.day) || a.run.localeCompare(b.run));
  // keep at most one fail per device, prefer a spread over sites
  const seenDev = new Set<string>(); const pool = hf.filter((f) => { const k = f.device || `${f.system}|${f.check.code}`; if (seenDev.has(k)) return false; seenDev.add(k); return true; });
  // the plan needs 32 history findings: when the random draw gave fewer, further device checks of published runs failed
  if (pool.length < 32) {
    for (const [dt, name, data] of buf.values()) {
      if (pool.length >= 32) break;
      if (dt !== "FSM Inspection Run" || !name.startsWith("FSM-RUN-H")) continue;
      const sys = String(data["system"]); const tpl = activeTpl(typeOf(sys));
      const row = ((data["results"] as Data[]) ?? []).find((x) => x["outcome"] === "Pass" && x["device"] && !seenDev.has(String(x["device"])));
      if (!row) continue;
      const c = tpl.checks.find((x) => x.code === row["check_code"])!; flip(row, c); seenDev.add(String(row["device"]));
      pool.push({ run: name, check: c, device: String(row["device"]), deviceLabel: (devOfSys.get(sys) ?? []).find((dv) => dv.id === row["device"])?.label ?? "", system: sys, site: siteOfSys(sys).id, day: String(data["submitted_on"] ?? "").slice(0, 10), row });
    }
  }
  const PLAN: [state: string, n: number][] = [["Verified Closed", 7], ["Rejected", 2], ["Duplicate", 2], ["Retest Pending", 6], ["Approved for Repair", 5], ["Quoted", 6], ["Disputed", 2], ["Open", 2]];
  const histDefs: (Fail & { id: string; state: string; sev: string })[] = [];
  let pi = 0;
  for (const [state, n] of PLAN) for (let i = 0; i < n && pi < pool.length; i++, pi++) histDefs.push({ ...pool[pi]!, id: `FSM-DEF-D${p4(++defn)}`, state, sev: "" });
  // severity: the check's own class; three history findings are critical (one quoted, one approved for repair, one awaiting retest)
  for (const d of histDefs) d.sev = d.check.sev === "Critical" ? "Major" : d.check.sev;
  const crit = (state: string) => { const d = histDefs.find((x) => x.state === state && x.sev !== "Critical"); if (d) d.sev = "Critical"; };
  crit("Quoted"); crit("Approved for Repair"); crit("Retest Pending");

  // repair / retest work of this week from the history findings
  histDefs.filter((x) => x.state === "Approved for Repair").forEach((d, k) => {
    const jid = `FSM-JOB-D${p4(++jn)}`; (d as { repair?: string }).repair = jid;
    // the first approved repair waits for parts (job on hold, visit unscheduled); the rest are booked over the next days
    work.push({ job: jid, site: siteOf(d.site), type: typeOf(d.system), prefer: D(1 + (k % 3)), kind: "repair", def: d.id, hours: 2, unscheduled: k === 0 });
  });
  const retestDefs = histDefs.filter((x) => x.state === "Retest Pending");
  retestDefs.forEach((d, i) => {
    const rep = `FSM-JOB-D${p4(++jn)}`; (d as { repair?: string }).repair = rep;
    work.push({ job: rep, site: siteOf(d.site), type: typeOf(d.system), prefer: D(-9 + i), kind: "repair", def: d.id, hours: 2, state: "Completed" });
    if (i >= 2) { const rt = `FSM-JOB-D${p4(++jn)}`; (d as { retestJob?: string }).retestJob = rt; work.push({ job: rt, site: siteOf(d.site), type: typeOf(d.system), prefer: D(i - 1), kind: "retest", def: d.id, hours: 1.5, unscheduled: i >= 4 }); }
  });
  for (const d of histDefs.filter((x) => x.state === "Verified Closed")) (d as { repair?: string }).repair = `FSM-JOB-D${p4(++jn)}`;
  // emergencies and corrective requests
  const reqJob = new Map<string, string>(); const reqSys = new Map<string, string>();
  for (const q of REQUESTS) {
    if (q.type === "Certificate" || q.id === "FSM-REQ-D03" || q.id === "FSM-REQ-D06") continue;
    const jid = `FSM-JOB-D${p4(++jn)}`; reqJob.set(q.id, jid);
    const s = siteOf(q.site); const type = q.id === "FSM-REQ-D02" ? "Sprinkler" : q.id === "FSM-REQ-D04" ? "Kitchen Suppression" : q.id === "FSM-REQ-D05" ? "Fire Pump" : q.id === "FSM-REQ-D07" ? "Fire Alarm" : "Fire Alarm";
    const rs = (sysOfSite.get(s.id) ?? []).find((x) => x.type === type)?.id; if (rs) reqSys.set(q.id, rs);
    work.push({ job: jid, site: s, type, prefer: q.type === "Emergency" ? T : q.id === "FSM-REQ-D05" ? D(1) : D(2), kind: q.type === "Emergency" ? "emergency" : "corrective", hours: q.type === "Emergency" ? 3 : 2, noVisit: q.id === "FSM-REQ-D07", ...(q.id === "FSM-REQ-D04" ? { slot: 2 } : q.id === "FSM-REQ-D02" ? { slot: 1 } : {}) });
  }

  // slot the work onto the technicians' calendars
  for (const w of work.sort((a, b) => a.prefer.localeCompare(b.prefer) || a.job.localeCompare(b.job))) {
    if (w.noVisit || w.unscheduled) continue;
    const order = [w.prefer, ...days.filter((d) => d > w.prefer), ...days.filter((d) => d < w.prefer).reverse()];
    for (const d of w.state === "Completed" ? [w.prefer] : order) {
      const slots = w.slot !== undefined ? [w.slot] : [0, 1, 2];
      let hit = false;
      for (const si of slots) {
        const [a, b0] = SLOTS[si]!; const b = w.hours ? Math.min(b0, a + w.hours) : b0;
        // the fire-pump request is booked on Saud (no fire-pump skill) on purpose: the board must show the mismatch in red
        const t = w.job === reqJob.get("FSM-REQ-D05") ? (free("FSM-TECH-006", d, a, b) ? tech("FSM-TECH-006") : undefined) : w.state === "Completed" ? TECHS.find((x) => x.city === w.site.city && x.skills.some(([sk]) => sk === w.type)) : pickTech(w.site.city, w.type, d, a, b);
        if (!t) continue;
        take(t.id, d, a, b); w.tech = t.id; w.prefer = d; w.slot = si; w.hours = b - a; hit = true; break;
      }
      if (hit) break;
    }
    if (!w.tech) w.unscheduled = true;
  }

  // reactive work fills each technician's day to two or three visits (corrective, time & materials)
  const FIX: Record<string, string> = { "Fire Alarm": "Replace damaged detector head", Sprinkler: "Clear sprinkler head obstruction", "Fire Pump": "Check pump controller alarm", Extinguishers: "Re-pressurise extinguisher after use",
    "Emergency Lighting": "Replace exit sign battery", "Kitchen Suppression": "Clean kitchen hood nozzles", HVAC: "Replace damper actuator", Electrical: "Tighten loose terminals in distribution board" };
  days.forEach((d, di) => {
    for (const t of TECHS) {
      if (onLeave(t.id, d)) continue;
      const target = (Number(t.id.slice(-1)) + di) % 3 === 0 ? 3 : 2;
      const sites = SITES.filter((x) => x.city === t.city);
      for (let si = 0; si < 3 && (busy.get(`${t.id}|${d}`)?.length ?? 0) < target; si++) {
        const [a, b] = SLOTS[si]!; if (!free(t.id, d, a, b) || (t.id === "FSM-TECH-008" && d === D(1) && si === 0)) continue;
        const site = sites[(di * 3 + si + Number(t.id.slice(-1))) % sites.length]!;
        const kinds = (sysOfSite.get(site.id) ?? []).map((x) => x.type).filter((x) => skilled(t, x, d)); if (!kinds.length) continue;
        const ty = kinds[(di + si) % kinds.length]!;
        take(t.id, d, a, a + 2); work.push({ job: `FSM-JOB-D${p4(++jn)}`, site, type: ty, prefer: d, kind: "corrective", tech: t.id, slot: si, hours: 2, fix: FIX[ty] });
      }
    }
  });

  // visits, bookings, runs and job states of this week
  // today's actual times never lie in the future: an arrival / completion stamped later than the clock is pulled back to
  // `mins` minutes before now (the schedule stays), so «on site since» and «done at» read true whatever hour the demo opens
  const capNow = (d: string, ts: string, mins: number) => { if (d !== T) return ts; const c = new Date(Date.now() - mins * 60000).toISOString().slice(0, 19).replace("T", " "); return ts > c && c.slice(0, 10) === T ? c : ts; };
  const visitState = (d: string, slot: number) => d < T ? "Completed" : d > D(1) ? "Planned" : d === D(1) ? "Dispatched" : slot === 0 ? "Completed" : slot === 1 ? "On Site" : "Dispatched";
  const currentFails: Fail[] = [];
  let noAccessDone = false, partialDone = false, unack = 0, cancelled = false;
  const visitsOfJob = new Map<string, string[]>();
  for (const w of work) {
    const s = w.site; const q = [...reqJob.entries()].find(([, j]) => j === w.job)?.[0]; const req = q ? REQUESTS.find((x) => x.id === q) : undefined;
    const title = w.kind === "pm" ? `Planned inspection — ${s.name}` : w.kind === "repair" || w.kind === "retest" ? `${w.kind === "repair" ? "Repair" : "Retest"} — ${histDefs.find((x) => x.id === w.def)?.deviceLabel || SYSTEM_NAME[w.type]}` : `${w.kind === "emergency" ? "Emergency" : "Corrective"} — ${req?.subject ?? w.fix ?? SYSTEM_NAME[w.type]}`;
    const vids: string[] = [];
    let jobState = "Scheduled"; let hold = "None";
    if (w.noVisit) jobState = "Draft";
    if (!w.noVisit) {
      const vid = `FSM-VIS-D${p4(++vn)}`; vids.push(vid);
      if (w.unscheduled || !w.tech) {
        visitPut(vid, { job: w.job, site: s.id, visit_purpose: w.kind === "retest" ? "Planned" : "Planned", workflow_state: "Unscheduled", access_outcome: "Not Recorded", block_reason: w.kind === "retest" ? "None" : "Parts" });
        if (w.kind === "repair") { jobState = "On Hold"; hold = "Parts"; }
      } else {
        const d = w.prefer, [a] = SLOTS[w.slot!]!, b = a + (w.hours ?? 2.5); const state = w.state === "Completed" ? "Completed" : visitState(d, w.slot!);
        const late = state === "Completed" || state === "On Site" ? r.int(-10, 40) / 60 : 0; const over = state === "Completed" ? r.int(-25, 45) / 60 : 0;
        let access = state === "Completed" || state === "On Site" ? "Accessed" : "Not Recorded"; let block = "None"; let note: string | undefined;
        if (state === "Completed" && w.kind === "pm" && !noAccessDone && d < T) { noAccessDone = true; access = "No Access"; block = "Access"; note = ACCESS_NOTES[0]; }
        else if (state === "On Site" && w.kind === "pm" && !partialDone) { partialDone = true; access = "Partial Access"; block = "Access"; note = ACCESS_NOTES[1]; }
        let st2 = state; if (state === "Planned" && !cancelled && d >= D(2)) { cancelled = true; st2 = "Cancelled"; }
        const ack = st2 === "Dispatched" ? (unack++ === 1 ? undefined : at(addDays(d, -1), 17)) : st2 === "Completed" || st2 === "On Site" ? at(addDays(d, -1), 16.5) : undefined;
        visitPut(vid, { job: w.job, site: s.id, technician: w.tech, visit_purpose: w.kind === "emergency" ? "Emergency" : "Planned", scheduled_start: at(d, a), scheduled_end: at(d, b), workflow_state: st2, ...(ack ? { acknowledged_on: ack } : {}),
          ...(st2 === "Completed" || st2 === "On Site" ? { arrived_on: capNow(d, at(d, a + late), st2 === "On Site" ? 25 : 90) } : {}), ...(st2 === "Completed" ? { completed_on: capNow(d, at(d, b + over), 10), signed_by: "Facility Manager", signed_on: capNow(d, at(d, b + over), 10) } : {}),
          access_outcome: access, block_reason: block, ...(note ? { handover_note: note } : {}), ...(st2 === "Cancelled" ? { cancel_reason: "Customer asked to move the visit — mall event day" } : {}) });
        booking(vid, w.tech, d, a, b, "Lead", s.id, st2 === "Cancelled" ? "Cancelled" : "Reserved");
        if (st2 === "Completed") timesheet(w.tech, w.job, d, a + late, b + over, d <= D(-2), w.kind !== "pm");
        // an assistant on longer PM visits; Khalid's assistant booking today overlaps his own visit (double booking shown in red)
        if (w.kind === "pm" && (w.obls?.length ?? 0) > 1 && st2 !== "Cancelled") { const as = TECHS.find((t) => t.city === s.city && t.id !== w.tech && free(t.id, d, a, b) && !onLeave(t.id, d)); if (as) { take(as.id, d, a, b); booking(vid, as.id, d, a, b, "Assistant", s.id); } }
        if (st2 === "Completed" && access === "No Access") { const rv = `FSM-VIS-D${p4(++vn)}`; vids.push(rv); visitPut(rv, { job: w.job, site: s.id, visit_purpose: "Return Visit", predecessor_visit: vid, return_reason: "Access", workflow_state: "Unscheduled", access_outcome: "Not Recorded", block_reason: "Access" }); }
        jobState = st2 === "Completed" && vids.length === 1 ? (d <= D(-3) ? "Closed" : "Completed") : st2 === "On Site" || (st2 === "Completed" && vids.length > 1) ? "In Progress" : st2 === "Cancelled" ? "Scheduled" : "Scheduled";
        // inspection runs of PM visits
        if (w.kind === "pm" && (st2 === "Completed" || st2 === "On Site") && access !== "No Access") for (const o of w.obls ?? []) {
          const rid = `FSM-RUN-D${p4(++rn)}`; const onSite = st2 === "On Site";
          const res = results(rid, o.system, { recorded: onSite ? 0.6 : 1, failP: 0.05, inaccP: access === "Partial Access" ? 0.08 : 0.015 }, d, false);
          for (const x of res) if (x["outcome"] === "Fail") currentFails.push({ run: rid, check: activeTpl(o.type).checks.find((c) => c.code === x["check_code"])!, device: String(x["device"] ?? ""), deviceLabel: (devOfSys.get(o.system) ?? []).find((dv) => dv.id === x["device"])?.label ?? "", system: o.system, site: s.id, day: d, row: x });
          const wf = onSite ? "In Progress" : d <= D(-3) ? "Published" : d <= D(-2) ? "Reviewed" : "Submitted for Review";
          const data: Data = { job: w.job, visit: vid, site: s.id, system: o.system, workflow_state: wf, ...(onSite ? {} : { submitted_on: at(d, b + 0.4) }), ...(wf === "Reviewed" || wf === "Published" ? { reviewed_on: at(addDays(d, 1), 10), reviewed_by: "Administrator" } : {}), ...(wf === "Published" ? { published_on: at(addDays(d, 2), 9) } : {}), ...(rn % 7 === 3 && wf === "Submitted for Review" ? { return_count: 1, return_reason: "Attach the battery voltage photo for the panel." } : {}) };
          putRun(rid, data, res); if (wf === "Published") revision(rid, data, res, addDays(d, 2));
          if (wf === "Reviewed" || wf === "Published") { o.status = "Fulfilled"; o.fulfilled_on = d; } else o.status = "Scheduled";
          if (onSite && rn % 2 === 0) P("FSM Offline Action", `FSM-OFF-D${p3(++evn)}`, { technician: w.tech, device_id: `TAB-${w.tech!.slice(-3)}`, action: "Result", reference_doctype: "FSM Inspection Run", reference_name: rid, payload: JSON.stringify({ rows: 6 }), captured_on: at(T, a + 1.2), sync_state: "Pending", site: s.id });
        }
        if (w.kind === "pm" && (st2 === "Planned" || st2 === "Dispatched")) for (const o of w.obls ?? []) if (o.status === "Due") o.status = "Scheduled";
      }
    }
    if (w.kind === "repair" && w.state === "Completed") jobState = "Completed";
    if (req && req.id === "FSM-REQ-D01" && jobState === "Scheduled") jobState = "Scheduled";
    visitsOfJob.set(w.job, vids);
    const d0 = histDefs.find((x) => x.id === w.def);
    P("FSM Job", w.job, { job_title: title, customer: s.customer, site: s.id, job_type: w.kind === "pm" ? "PM Inspection" : w.kind === "repair" ? "Repair" : w.kind === "retest" ? "Retest" : w.kind === "emergency" ? "Emergency" : "Corrective",
      priority: w.kind === "emergency" ? "Urgent" : w.kind === "pm" ? "Normal" : "High", agreement: w.kind === "pm" ? w.obls?.[0]?.agr : AGREEMENTS.find((a) => a.site === s.id && a.state === "Active")?.id, planned_days: 1, workflow_state: jobState, hold_reason: hold,
      ...(jobState === "Completed" ? { completed_on: at(w.prefer, 16) } : {}), ...(req ? { issue: req.id } : {}), ...(d0 ? { deficiency: d0.id } : {}), scope: w.kind === "pm" ? `Planned ${(w.obls ?? []).map((o) => o.type).join(" + ")} inspection.` : req?.subject ?? (d0 ? `${d0.check.fail} — ${d0.deviceLabel}` : ""),
      obligations: child("FSM Job Obligation", "obligations", (w.obls ?? []).map((o) => ({ obligation: o.name, system: o.system, outcome: o.status === "Fulfilled" ? "Fulfilled" : "Pending" })), w.job) });
    st.jobs++;
  }
  // a Cancelled corrective job and a Draft job keep the full state range visible
  P("FSM Job", `FSM-JOB-D${p4(++jn)}`, { job_title: "Corrective — relocate exit sign after fit-out", customer: "FSM-CUST-001", site: "FSM-SITE-0003", job_type: "Corrective", priority: "Normal", planned_days: 1, workflow_state: "Cancelled", hold_reason: "None", scope: "Tenant cancelled the fit-out change." }); st.jobs++;
  // Khalid's double booking today: an assistant booking that overlaps his own visit
  {
    const riyadhToday = work.filter((w) => w.tech && w.prefer === T && w.site.city === "Riyadh");
    const dbl = riyadhToday.map((w) => w.tech!).find((t) => riyadhToday.some((o) => o.tech !== t)) ?? "FSM-TECH-001";
    const own = riyadhToday.find((w) => w.tech === dbl); const other = riyadhToday.find((w) => w.tech !== dbl);
    const v = other ? visitsOfJob.get(other.job)?.[0] : undefined;
    if (own && v) { const [a] = SLOTS[own.slot!]!; booking(v, dbl, T, a + 0.5, a + 2.5, "Assistant", other!.site.id); }
  }

  // ------------------------------------------------------------------ obligations (after this week's work set their state)
  for (const o of obls) { P("FSM Obligation", o.name, { agreement: o.agr, coverage_row: o.row, site: o.site, system: o.system, template: activeTpl(o.type).id, service_type: "Inspection", due_date: o.due, window_end: o.win, status: o.status, idempotency_key: obligationKey(o.agr, o.row, o.due), generation_run: `FSM-GEN-${o.agr.slice(-3)}`,
    ...(o.status === "Fulfilled" && o.job ? { fulfilled_by: o.job, fulfilled_on: o.fulfilled_on } : {}), ...(o.waiver ? { waiver_reason: o.waiver } : {}) }); st.obligations++; }

  // ------------------------------------------------------------------ deficiencies: 32 from history + 8 fresh from this week (5 critical in total)
  const freshPool = currentFails.filter((f, i, all) => all.findIndex((x) => x.device === f.device && x.system === f.system) === i);
  if (freshPool.length < 8) for (const [dt, name, data] of buf.values()) {
    if (freshPool.length >= 8) break;
    if (dt !== "FSM Inspection Run" || !name.startsWith("FSM-RUN-D") || !["Submitted for Review", "Reviewed", "In Progress"].includes(String(data["workflow_state"]))) continue;
    const sys = String(data["system"]); const row = ((data["results"] as Data[]) ?? []).find((x) => x["outcome"] === "Pass" && x["device"] && !freshPool.some((f) => f.device === x["device"]));
    if (!row) continue; const c = activeTpl(typeOf(sys)).checks.find((x) => x.code === row["check_code"])!; flip(row, c);
    freshPool.push({ run: name, check: c, device: String(row["device"]), deviceLabel: (devOfSys.get(sys) ?? []).find((dv) => dv.id === row["device"])?.label ?? "", system: sys, site: siteOfSys(sys).id, day: String(data["submitted_on"] ?? T).slice(0, 10) || T, row });
  }
  const fresh = freshPool.slice(0, 8).map((f, i) => ({ ...f, id: `FSM-DEF-D${p4(++defn)}`, state: "Open", sev: i < 2 ? "Critical" : f.check.sev === "Critical" ? "Major" : f.check.sev }));
  const allDefs = [...histDefs, ...fresh];
  let qn = 0, rtn = 0; const defQuote = new Map<string, string>();
  const dupOf = allDefs.find((x) => x.state === "Open")?.id ?? allDefs[0]?.id;
  for (const d of allDefs) {
    d.row["deficiency"] = d.id; const s = siteOf(d.site); const age = d.day;
    const repair = (d as { repair?: string }).repair; const retestJob = (d as { retestJob?: string }).retestJob;
    let quotation: string | undefined; let decision = "None";
    if (["Quoted", "Approved for Repair", "Retest Pending", "Verified Closed"].includes(d.state)) {
      quotation = `FSM-QTN-D${p3(++qn)}`; defQuote.set(d.id, quotation); const rate = d.sev === "Critical" ? 2400 : d.sev === "Major" ? 980 : 420;
      const part = DEVICE_TYPES[typeOf(d.system)]?.item; const pr = PARTS.find((x) => x[0] === part);
      const items = [{ name: `${quotation}-1`, idx: 1, doctype: "Quotation Item", parentfield: "items", item_code: "FSM-SVC-REPAIR", item_name: `${d.check.fail} — ${d.deviceLabel}`.slice(0, 140), description: `${d.check.fail} — ${d.deviceLabel}`, qty: 1, rate, amount: rate, uom: "Hour", digit_fsm_deficiency: d.id },
        ...(pr ? [{ name: `${quotation}-2`, idx: 2, doctype: "Quotation Item", parentfield: "items", item_code: pr[0], item_name: pr[1], description: pr[1], qty: 1, rate: pr[2], amount: pr[2], uom: pr[3], digit_fsm_deficiency: d.id }] : [])];
      const net = items.reduce((t, x) => t + x.amount, 0); const vat = Math.round(net * 15) / 100;
      const accepted = d.state !== "Quoted";
      P("Quotation", quotation, { quotation_to: "Customer", party_name: s.customer, customer_name: custOf(s.customer).name, transaction_date: addDays(age, 3), valid_till: addDays(age, 33), order_type: "Maintenance", currency: "SAR", status: accepted ? "Ordered" : "Open", docstatus: accepted ? 1 : 0, is_latest_revision: 1, items,
        total_qty: items.length, total: net, net_total: net, total_taxes_and_charges: vat, grand_total: net + vat, rounded_total: net + vat, taxes: [{ idx: 1, charge_type: "On Net Total", account_head: `VAT 15% Output - ${ABBR}`, description: "VAT 15%", rate: 15, tax_amount: vat }] });
      decision = accepted ? "Accepted" : "Quoted";
      if (accepted) P("Sales Order", `FSM-SO-D${p3(qn)}`, { customer: s.customer, customer_name: custOf(s.customer).name, transaction_date: addDays(age, 5), delivery_date: addDays(age, 12), order_type: "Maintenance", currency: "SAR", status: "Draft", docstatus: 0, items: items.map((x, i) => ({ ...x, name: `FSM-SO-D${p3(qn)}-${i + 1}`, doctype: "Sales Order Item", prevdoc_docname: quotation, delivery_date: addDays(age, 12) })), total: net, net_total: net, grand_total: net + vat, rounded_total: net + vat });
    }
    const title = `${d.check.fail} — ${d.deviceLabel || SYSTEM_NAME[typeOf(d.system)]}`;
    P("FSM Deficiency", d.id, { title, site: s.id, system: d.system, device: d.device || undefined, severity: d.sev, opened_on: d.day, source_run: d.run, source_check: d.check.code, source_key: `${d.run}|${d.check.code}|${d.device}`, workflow_state: d.state, commercial_decision: decision, quotation, repair_job: repair,
      ...(d.state === "Verified Closed" || d.state === "Rejected" ? { closed_on: addDays(age, 21) } : {}), ...(d.state === "Duplicate" ? { duplicate_of: dupOf } : {}), reopen_count: d.state === "Disputed" ? 1 : 0,
      observation: d.state === "Disputed" ? "Customer states the item is landlord scope." : `${d.check.text}: recorded as failed during the inspection.` });
    st.deficiencies++; if (d.sev === "Critical") st.critical++;
    // repair jobs that finished earlier (awaiting retest / verified closed)
    if (repair && (d.state === "Verified Closed")) {
      const day = addDays(age, 12); const t = TECHS.find((x) => x.city === s.city && x.skills.some(([sk]) => sk === typeOf(d.system))) ?? TECHS.find((x) => x.city === s.city)!;
      P("FSM Job", repair, { job_title: `Repair — ${d.deviceLabel || SYSTEM_NAME[typeOf(d.system)]}`, customer: s.customer, site: s.id, job_type: "Repair", priority: "High", deficiency: d.id, quotation, planned_days: 1, workflow_state: "Closed", hold_reason: "None", completed_on: at(day, 12), scope: title, obligations: [] }); st.jobs++;
      const vid = `FSM-VIS-D${p4(++vn)}`; visitPut(vid, { job: repair, site: s.id, technician: t.id, visit_purpose: "Planned", scheduled_start: at(day, 9), scheduled_end: at(day, 11), workflow_state: "Completed", acknowledged_on: at(addDays(day, -1), 16), arrived_on: at(day, 9.1), completed_on: at(day, 11.2), access_outcome: "Accessed", block_reason: "None", signed_by: "Facility Manager", signed_on: at(day, 11.2) });
      booking(vid, t.id, day, 9, 11, "Lead", s.id);
      timesheet(t.id, repair, day, 9.1, 11.2, true, true, `FSM-TS-R${p4(++rtsn)}`);
      const rr = `FSM-RUN-R${p4(++rn)}`; const res: Row[] = [{ name: `${rr}-001`, idx: 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: d.check.code, check_text: d.check.text, device: d.device || undefined, outcome: "Pass", evidence_required: d.check.photo ? 1 : 0 }];
      const data = { job: repair, visit: vid, site: s.id, system: d.system, retest_for: d.id, workflow_state: "Published", submitted_on: at(day, 11.5), reviewed_on: at(addDays(day, 1), 9), reviewed_by: "Administrator", published_on: at(addDays(day, 2), 9) };
      putRun(rr, data, res); revision(rr, data, res, addDays(day, 2));
      P("FSM Retest", `FSM-RT-D${p3(++rtn)}`, { deficiency: d.id, repair_job: repair, retest_run: rr, status: "Passed", due_date: addDays(day, 14), site: s.id });
    }
    if (d.state === "Retest Pending") {
      const passed = retestDefs.indexOf(d) < 2; const rt = `FSM-RT-D${p3(++rtn)}`;
      let run: string | undefined;
      if (passed) { run = `FSM-RUN-R${p4(++rn)}`; const res: Row[] = [{ name: `${run}-001`, idx: 1, doctype: "FSM Inspection Result", parentfield: "results", check_code: d.check.code, check_text: d.check.text, device: d.device || undefined, outcome: "Pass", evidence_required: d.check.photo ? 1 : 0 }];
        putRun(run, { job: repair, site: s.id, system: d.system, retest_for: d.id, workflow_state: "Reviewed", submitted_on: at(D(-2), 12), reviewed_on: at(D(-1), 10), reviewed_by: "Administrator" }, res); }
      P("FSM Retest", rt, { deficiency: d.id, repair_job: repair, retest_run: run, status: passed ? "Passed" : retestJob ? "Scheduled" : "Required", due_date: D(passed ? -1 : 4 + retestDefs.indexOf(d)), site: s.id });
    }
  }
  // the findings of this week sit on their (re-written) runs: refresh those runs' rows with the deficiency link
  // (runs were already put; the volume layer inserts once, so rows carried the reference by object identity)

  // ------------------------------------------------------------------ impairments (3 active, 2 restored) on the critical findings' systems
  const critSys = allDefs.filter((d) => d.sev === "Critical" && d.state !== "Verified Closed").map((d) => ({ sys: d.system, def: d.id, site: d.site })).filter((x, i, a) => a.findIndex((y) => y.sys === x.sys) === i).slice(0, 3);
  critSys.forEach((c, i) => { P("FSM Impairment", `FSM-IMP-D${p2(i + 1)}`, { system: c.sys, site: c.site, scope: i === 0 ? "Full System" : "Partial / Zone", started_on: at(D(-(2 + i * 2)), 9.5), status: "Active", authority_notified: 1, fire_watch: 1, deficiency: c.def, note: "Basement zone isolated pending repair" }); upd("FSM Service System", c.sys, { operating_status: i === 0 ? "Out of Service" : "Impaired" }); st.impairments++; });
  P("FSM Impairment", "FSM-IMP-D04", { system: "FSM-SYS-03-2", site: "FSM-SITE-0003", scope: "Partial / Zone", started_on: at(D(-41), 10), restored_on: at(D(-39), 15), status: "Restored", authority_notified: 1, fire_watch: 1, note: "Isolated during tenant fit-out." });
  P("FSM Impairment", "FSM-IMP-D05", { system: "FSM-SYS-10-3", site: "FSM-SITE-0010", scope: "Full System", started_on: at(D(-23), 7), restored_on: at(D(-22), 18), status: "Restored", authority_notified: 1, fire_watch: 1, note: "Pump controller replaced." });

  // ------------------------------------------------------------------ service requests (native Issue) with SLA dates
  for (const q of REQUESTS) {
    const [resp, resl] = SLA_HOURS[q.priority]!; const open = at(D(q.openDay), q.openH); const ms = Date.parse(open.replace(" ", "T"));
    const iso = (h: number) => new Date(ms + h * 3600000).toISOString().slice(0, 19).replace("T", " ");
    const job = reqJob.get(q.id);
    P("Issue", q.id, { subject: q.subject, customer: siteOf(q.site).customer, customer_name: custOf(siteOf(q.site).customer).name, status: q.status, priority: q.priority, issue_type: q.type, opening_date: D(q.openDay), opening_time: at(D(q.openDay), q.openH).slice(11), raised_by: custOf(siteOf(q.site).customer).email,
      description: `${q.subject}. Reported by the facility team.`, digit_fsm_site: q.site, ...(job ? { digit_fsm_job: job } : {}), ...(reqSys.get(q.id) ? { digit_fsm_system: reqSys.get(q.id) } : {}), response_by: iso(resp), resolution_by: iso(resl),
      ...(q.respondedH !== undefined ? { first_responded_on: at(D(q.openDay), q.respondedH) } : {}), ...(q.status === "Resolved" ? { resolution_date: iso(resl * 0.6) } : {}),
      agreement_status: q.status === "Resolved" ? "Fulfilled" : q.respondedH !== undefined ? "Resolution Due" : "First Response Due" });
  }

  // ------------------------------------------------------------------ parts: opening stock, van stock, job requests → issues → use → returns (native Stock Entry, posted by posting.ts)
  const seRow = (i: number, code: string, qty: number, x: Data) => { const p = PARTS.find((y) => y[0] === code)!; const rate = Math.round(p[2] * 0.62); return { idx: i + 1, item_code: code, item_name: p[1], qty, transfer_qty: qty, uom: p[3], stock_uom: p[3], conversion_factor: 1, basic_rate: rate, valuation_rate: rate, basic_amount: rate * qty, amount: rate * qty, ...x }; };
  let sen = 0;
  const se = (purpose: string, day: string, rows: Data[], extra: Data = {}) => { const id = `FSM-STE-D${p4(++sen)}`;
    if (purpose === "Material Issue" && extra["digit_fsm_job"]) { const jb = String(extra["digit_fsm_job"]); const m = usedParts.get(jb) ?? new Map<string, number>(); for (const r0 of rows) m.set(String(r0["item_code"]), (m.get(String(r0["item_code"])) ?? 0) + Number(r0["qty"] ?? 0)); usedParts.set(jb, m); } P("Stock Entry", id, { stock_entry_type: purpose, purpose, posting_date: day, posting_time: "09:00:00", items: rows, docstatus: 1, ...extra }); vouchers.push(["Stock Entry", id]); return id; };
  se("Material Receipt", D(-45), PARTS.map(([code], i) => seRow(i, code, 60, { t_warehouse: STORES })), { remarks: "Field-service spare parts opening stock" });
  for (const t of TECHS) se("Material Transfer", D(-30), PARTS.slice(0, 4).map(([code], i) => seRow(i, code, 3 + ((Number(t.id.slice(-1)) + i) % 3), { s_warehouse: STORES, t_warehouse: vanOf(t) })), { from_warehouse: STORES, to_warehouse: vanOf(t), remarks: `Van stock for ${techName(t)}` });
  let mrn = 0;
  for (const d of allDefs) {
    const repair = (d as { repair?: string }).repair; if (!repair) continue;
    const part = DEVICE_TYPES[typeOf(d.system)]?.item; if (!part) continue;
    const w = work.find((x) => x.job === repair); const t = tech(w?.tech ?? TECHS.find((x) => x.city === siteOf(d.site).city)!.id); const van = vanOf(t);
    const qty = d.sev === "Critical" ? 2 : 1; const day = w ? addDays(w.prefer, -2) : addDays(d.day, 9);
    const done = d.state === "Verified Closed" || d.state === "Retest Pending";
    P("Material Request", `FSM-MR-D${p3(++mrn)}`, { material_request_type: "Material Issue", title: `FSM ${repair}`, customer: siteOf(d.site).customer, transaction_date: day, schedule_date: addDays(day, 2), status: done || w?.state !== undefined ? "Issued" : "Pending", docstatus: 1, digit_fsm_job: repair,
      items: [{ name: `FSM-MR-D${p3(mrn)}-1`, idx: 1, doctype: "Material Request Item", parentfield: "items", item_code: part, item_name: PARTS.find((x) => x[0] === part)![1], qty: qty + (mrn % 5 === 0 ? 1 : 0), uom: "Nos", schedule_date: addDays(day, 2) }] });
    if (d.state === "Approved for Repair" && mrn % 2 === 1) continue; // still waiting for the issue from stores
    se("Material Transfer", addDays(day, 1), [seRow(0, part, qty + (mrn % 5 === 0 ? 1 : 0), { s_warehouse: STORES, t_warehouse: van })], { from_warehouse: STORES, to_warehouse: van, digit_fsm_job: repair, remarks: `Issue to ${techName(t)} for ${repair}` });
    if (done) {
      se("Material Issue", addDays(day, 2), [seRow(0, part, qty, { s_warehouse: van, expense_account: `Stock Adjustment - ${ABBR}` })], { from_warehouse: van, digit_fsm_job: repair, remarks: `Used on ${repair}` });
      if (mrn % 5 === 0 && mrn % 10 !== 0) se("Material Transfer", addDays(day, 3), [seRow(0, part, 1, { s_warehouse: van, t_warehouse: STORES })], { from_warehouse: van, to_warehouse: STORES, digit_fsm_job: repair, remarks: `Return of unused part from ${repair}` });
    }
  }

  // ------------------------------------------------------------------ commercial control: charge proposals and draft invoices (idempotent keys)
  let cpn = 0, sin = 0;
  const jobsDone: { job: string; site: SiteDef; chargeable: boolean; amount: number; quotation?: string | undefined }[] = [];
  for (const w of work) if (w.kind === "pm") { const vs = visitsOfJob.get(w.job) ?? []; if (vs.length === 1 && w.tech && w.prefer < T && !w.unscheduled) jobsDone.push({ job: w.job, site: w.site, chargeable: false, amount: 0 }); }
  for (const d of allDefs) { const rep = (d as { repair?: string }).repair; const q = defQuote.get(d.id); if (rep && (d.state === "Verified Closed" || d.state === "Retest Pending")) jobsDone.push({ job: rep, site: siteOf(d.site), chargeable: true, amount: d.sev === "Critical" ? 2760 : d.sev === "Major" ? 1127 : 483, quotation: q }); }
  jobsDone.forEach((j, i) => {
    const id = `FSM-CP-D${p3(++cpn)}`;
    const status = !j.chargeable ? "Approved" : i % 4 === 0 ? "Handed Off" : i % 4 === 1 ? "Approved" : i % 4 === 2 ? "Proposed" : "Approved";
    let invoice: string | undefined;
    // the billing equation (domain/billing.ts): approved labour × 250 + parts used × selling rate − covered, VAT 15 %
    const hrs = labourH.get(j.job) ?? 0; const used = [...(usedParts.get(j.job) ?? new Map<string, number>())];
    const eqLines = [...(hrs > 0 ? [{ item_code: "FSM-SVC-REPAIR", item_name: "Corrective repair labour", qty: hrs, rate: 250, amount: hrs * 250, uom: "Hour" }] : []),
      ...used.map(([code, q]) => { const pr = PARTS.find((x) => x[0] === code)!; return { item_code: code, item_name: pr[1], qty: q, rate: pr[2], amount: q * pr[2], uom: pr[3] }; })];
    const eqNet = Math.round(eqLines.reduce((a, l) => a + l.amount, 0) * 100) / 100;
    if (j.chargeable && eqNet > 0) j.amount = Math.round(eqNet * 1.15 * 100) / 100;
    if (status === "Handed Off") {
      invoice = `FSM-SINV-D${p3(++sin)}`; const net = eqNet > 0 ? eqNet : Math.round((j.amount / 1.15) * 100) / 100; const vat = Math.round((j.amount - net) * 100) / 100;
      P("Sales Invoice", invoice, { customer: j.site.customer, customer_name: custOf(j.site.customer).name, posting_date: D(-2), due_date: D(28), currency: "SAR", docstatus: 0, status: "Draft", digit_fsm_job: j.job,
        items: eqLines.length ? eqLines.map((l, k) => ({ idx: k + 1, ...l })) : [{ idx: 1, item_code: "FSM-SVC-REPAIR", item_name: "Corrective repair labour", qty: 1, rate: net, amount: net, uom: "Hour" }], total: net, net_total: net, total_taxes_and_charges: vat, grand_total: j.amount, rounded_total: j.amount, outstanding_amount: j.amount,
        taxes: [{ idx: 1, charge_type: "On Net Total", account_head: `VAT 15% Output - ${ABBR}`, description: "VAT 15%", rate: 15, tax_amount: vat }] });
    }
    P("FSM Charge Proposal", id, { job: j.job, customer: j.site.customer, site: j.site.id, coverage_decision: j.chargeable ? "Chargeable" : "Covered", amount: j.chargeable ? j.amount : 0, basis: j.chargeable ? `Quotation ${j.quotation ?? ""} accepted ‖ عرض السعر ${j.quotation ?? ""} مقبول` : "Covered by the service agreement ‖ مغطى باتفاقية الخدمة", status, idempotency_key: `charge|${j.job}`, ...(invoice ? { sales_invoice: invoice } : {}) });
  });

  // ------------------------------------------------------------------ renewals, exceptions, portal grants, offline queue, photos
  P("FSM Renewal Case", "FSM-REN-D01", { agreement: "FSM-AGR-D12", customer: "FSM-CUST-003", current_end: agrEnd.get("FSM-AGR-D12"), proposed_end: addMonths(agrEnd.get("FSM-AGR-D12")!, 12), proposed_value: 61000, status: "Proposed", risk_note: "Customer asked for monthly lighting tests in the renewal." });
  P("FSM Renewal Case", "FSM-REN-D02", { agreement: "FSM-AGR-D04", customer: "FSM-CUST-001", current_end: agrEnd.get("FSM-AGR-D04"), proposed_end: addMonths(agrEnd.get("FSM-AGR-D04")!, 12), proposed_value: 165000, status: "Open", risk_note: "Kitchen suppression contract suspended — bundle it into the renewal." });
  P("FSM Renewal Case", "FSM-REN-D03", { agreement: "FSM-AGR-D08", customer: "FSM-CUST-002", current_end: agrEnd.get("FSM-AGR-D08"), proposed_end: addMonths(agrEnd.get("FSM-AGR-D08")!, 12), proposed_value: 54000, status: "Lost", risk_note: "Store moved to a new building with another contractor." });
  P("FSM Integration Exception", "FSM-EXC-D01", { source: "Import", reference_doctype: "FSM Device", reference_name: "row 14", error: "Device import row 14: serial already belongs to a device on another system — skipped, not merged.", status: "Open", attempts: 1, last_attempt: at(D(-2), 10) });
  P("FSM Integration Exception", "FSM-EXC-D02", { source: "Offline Sync", reference_doctype: "FSM Offline Action", reference_name: "FSM-OFF-D901", error: "Result recorded offline for a check the reviewer already approved — kept as a conflict for the dispatcher.", status: "Open", attempts: 2, last_attempt: at(T, 7.5) });
  P("FSM Integration Exception", "FSM-EXC-D03", { source: "Notification", reference_doctype: VISIT_DT, reference_name: "SMS reminder", error: "Customer reminder bounced: mobile number not reachable (sandbox).", status: "Resolved", attempts: 1, last_attempt: at(D(-3), 18), resolution: "Number corrected on the site contact." });
  ["FSM-TECH-001", "FSM-TECH-004", "FSM-TECH-007"].forEach((t, i) => {
    for (let k = 0; k < 3; k++) P("FSM Offline Action", `FSM-OFF-D${p3(100 + i * 10 + k)}`, { technician: t, device_id: `TAB-${t.slice(-3)}`, action: ["Check-in", "Result", "Photo"][k], reference_doctype: VISIT_DT, reference_name: "", payload: "{}", captured_on: at(D(-1 - k), 9 + k), synced_on: at(D(-1 - k), 9.2 + k), sync_state: "Synced" });
  });
  P("FSM Offline Action", "FSM-OFF-D901", { technician: "FSM-TECH-007", device_id: "TAB-007", action: "Result", reference_doctype: "FSM Inspection Run", reference_name: "", payload: JSON.stringify({ outcome: "Fail" }), captured_on: at(D(-1), 15), sync_state: "Conflict", conflict_note: "The run was reviewed before this result reached the office. ‖ رُوجع الفحص قبل وصول هذه النتيجة للمكتب." });
  ([["FSM-CON-01", "FSM-CUST-001", ["FSM-SITE-0001", "FSM-SITE-0003", "FSM-SITE-0004", "FSM-SITE-0005"]], ["FSM-CON-05", "FSM-CUST-002", ["FSM-SITE-0002", "FSM-SITE-0006"]], ["FSM-CON-09", "FSM-CUST-003", ["FSM-SITE-0009", "FSM-SITE-0010", "FSM-SITE-0011"]]] as const).forEach(([contact, customer, sites], i) =>
    sites.forEach((site, k) => P("FSM Portal Grant", `FSM-PG-D${i + 1}${k + 1}`, { customer, contact, site, access_reports: 1, access_findings: 1, access_requests: k < 2 ? 1 : 0, status: i === 2 && k === 2 ? "Revoked" : "Active", granted_on: D(-60 + k) })));
  // every run's technical result follows its final rows; then everything is put in creation order
  for (const [dt, , data] of buf.values()) if (dt === "FSM Inspection Run") data["technical_result"] = technicalResult((data["results"] as Row[]) ?? []);
  for (const [dt, , data] of buf.values()) if (dt === "FSM Report Revision") {
    const res = (buf.get(`FSM Inspection Run\u0001${String(data["run"])}`)?.[2]["results"] as Row[]) ?? []; const c = (o: string) => res.filter((x) => x["outcome"] === o).length;
    Object.assign(data, { technical_result: technicalResult(res), passed: c("Pass"), failed: c("Fail"), inaccessible: c("Inaccessible"), not_applicable: c("Not Applicable"), untested: c("Untested"), snapshot: JSON.stringify(res.map((x) => ({ check: x["check_code"], device: x["device"] ?? null, outcome: x["outcome"] }))) });
  }
  for (const [dt, name, data] of buf.values()) {
    if (dt === VISIT_DT) {
      const job = [...buf.values()].find(([t, n]) => t === "FSM Job" && n === data["job"])?.[2];
      const stamp = String(data["arrived_on"] || data["scheduled_start"] || data["completed_on"] || T);
      put(dt, name, { ...data, customer: job?.["customer"], customer_name: [...buf.values()].find(([t, n]) => t === "Customer" && n === job?.["customer"])?.[2]["customer_name"], naming_series: "MAT-MVS-.YYYY.-", mntc_date: stamp.slice(0, 10), mntc_time: stamp.slice(11, 19), status: "Draft", completion_status: data["workflow_state"] === "Completed" ? "Fully Completed" : "Partially Completed", maintenance_type: data["visit_purpose"] === "Emergency" ? "Breakdown" : data["scheduled_start"] ? "Scheduled" : "Unscheduled" });
    } else put(dt, name, data);
  }
  for (const [dt, name] of vouchers) voucher(dt, name);
  return st;
}
