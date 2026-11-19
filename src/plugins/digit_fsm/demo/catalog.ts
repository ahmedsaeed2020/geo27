/**
 * Fixed reference data of the DIGIT FSM demo (owner round 2026-11-17 F1-04): customers, 12 sites in Riyadh / Jeddah /
 * Dammam, system mixes per site kind, device types, inspection templates with measured checks and the phrase a failed
 * check is recorded with, technicians with skills, crews and vans, and the 20 agreements. Dates are never stored here:
 * the generator (v2.ts) places everything relative to today.
 */
export const COMPANY = "Digit Synthetic Co";
export const ABBR = "DSC";
export const STORES = `Stores - ${ABBR}`;
export type City = "Riyadh" | "Jeddah" | "Dammam";
export const CUSTOMERS = [
  { id: "FSM-CUST-001", name: "Riyadh Gate Mall Management Co.", city: "Riyadh" as City, email: "fm@riyadhgate.example.test" },
  { id: "FSM-CUST-002", name: "Al Waha Hospital Group", city: "Jeddah" as City, email: "engineering@alwaha.example.test" },
  { id: "FSM-CUST-003", name: "Eastern Gulf Industrial Parks Co.", city: "Dammam" as City, email: "hse@easterngulf.example.test" },
];
export type SiteKind = "mall" | "hospital" | "clinic" | "industrial";
export interface SiteDef { id: string; name: string; code: string; customer: string; city: City; kind: SiteKind; lat: number; lng: number; buildings: number; floors: string[] }
export const SITES: SiteDef[] = [
  { id: "FSM-SITE-0001", name: "Riyadh Gate Mall", code: "RGM", customer: "FSM-CUST-001", city: "Riyadh", kind: "mall", lat: 24.7655, lng: 46.7302, buildings: 2, floors: ["Basement", "Ground floor", "Level 1"] },
  { id: "FSM-SITE-0003", name: "Al Nakheel Plaza", code: "NKP", customer: "FSM-CUST-001", city: "Riyadh", kind: "mall", lat: 24.7489, lng: 46.6602, buildings: 1, floors: ["Ground floor", "Level 1", "Level 2"] },
  { id: "FSM-SITE-0004", name: "Granada Center", code: "GRC", customer: "FSM-CUST-001", city: "Riyadh", kind: "clinic", lat: 24.7836, lng: 46.7279, buildings: 1, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0005", name: "Qurtuba Mall", code: "QTM", customer: "FSM-CUST-001", city: "Riyadh", kind: "mall", lat: 24.8102, lng: 46.7417, buildings: 1, floors: ["Basement", "Ground floor", "Level 1"] },
  { id: "FSM-SITE-0002", name: "Al Waha Hospital — North Tower", code: "AWN", customer: "FSM-CUST-002", city: "Jeddah", kind: "hospital", lat: 21.5810, lng: 39.1653, buildings: 1, floors: ["Basement", "Ground floor", "Level 1", "Level 2"] },
  { id: "FSM-SITE-0006", name: "Al Waha Hospital — South Tower", code: "AWS", customer: "FSM-CUST-002", city: "Jeddah", kind: "hospital", lat: 21.5768, lng: 39.1689, buildings: 1, floors: ["Ground floor", "Level 1", "Level 2"] },
  { id: "FSM-SITE-0007", name: "Al Waha Clinic — Al Rawdah", code: "AWR", customer: "FSM-CUST-002", city: "Jeddah", kind: "clinic", lat: 21.5596, lng: 39.1531, buildings: 1, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0008", name: "Al Waha Medical Store — Al Khumrah", code: "AWK", customer: "FSM-CUST-002", city: "Jeddah", kind: "industrial", lat: 21.3741, lng: 39.2256, buildings: 2, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0009", name: "Second Industrial City — Plant A", code: "SIA", customer: "FSM-CUST-003", city: "Dammam", kind: "industrial", lat: 26.3405, lng: 50.1312, buildings: 2, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0010", name: "Second Industrial City — Plant B", code: "SIB", customer: "FSM-CUST-003", city: "Dammam", kind: "industrial", lat: 26.3361, lng: 50.1408, buildings: 1, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0011", name: "Dammam Logistics Hub", code: "DLH", customer: "FSM-CUST-003", city: "Dammam", kind: "industrial", lat: 26.4012, lng: 50.0894, buildings: 2, floors: ["Ground floor", "Level 1"] },
  { id: "FSM-SITE-0012", name: "Al Khobar Admin Building", code: "KAB", customer: "FSM-CUST-003", city: "Dammam", kind: "clinic", lat: 26.2794, lng: 50.2083, buildings: 1, floors: ["Ground floor", "Level 1", "Level 2"] },
];
export const KIND_SYSTEMS: Record<SiteKind, string[]> = {
  mall: ["Fire Alarm", "Sprinkler", "Fire Pump", "Extinguishers", "Emergency Lighting", "Kitchen Suppression"],
  hospital: ["Fire Alarm", "Sprinkler", "Fire Pump", "Extinguishers", "Emergency Lighting", "HVAC"],
  clinic: ["Fire Alarm", "Sprinkler", "Extinguishers", "Emergency Lighting", "HVAC", "Electrical"],
  industrial: ["Fire Alarm", "Sprinkler", "Fire Pump", "Extinguishers", "Emergency Lighting", "Electrical"],
};
export const SYSTEM_NAME: Record<string, string> = {
  "Fire Alarm": "Addressable fire alarm system", Sprinkler: "Wet sprinkler system", "Fire Pump": "Fire pump set", Extinguishers: "Portable extinguishers",
  "Emergency Lighting": "Emergency & exit lighting", "Kitchen Suppression": "Kitchen hood suppression", HVAC: "Smoke control dampers", Electrical: "Electrical distribution boards",
};
/** Device types of a system type: [code, label, share]; and the device count range. */
export const DEVICE_TYPES: Record<string, { types: [string, string, number][]; range: [number, number]; item?: string }> = {
  "Fire Alarm": { types: [["SD", "Smoke detector", 0.7], ["HD", "Heat detector", 0.15], ["MCP", "Manual call point", 0.15]], range: [13, 18], item: "FSM-PART-SMOKE" },
  Sprinkler: { types: [["CV", "Control valve", 0.7], ["FS", "Flow switch", 0.3]], range: [6, 9], item: "FSM-PART-TAMPER" },
  "Fire Pump": { types: [["MP", "Main electric pump", 0.34], ["JP", "Jockey pump", 0.33], ["PC", "Pump controller", 0.33]], range: [3, 3] },
  Extinguishers: { types: [["EX", "CO2 extinguisher 6 kg", 0.5], ["DP", "Dry powder extinguisher 6 kg", 0.5]], range: [10, 14], item: "FSM-PART-EXT6" },
  "Emergency Lighting": { types: [["EL", "Emergency luminaire", 0.7], ["XS", "Exit sign", 0.3]], range: [8, 12], item: "FSM-PART-ELBAT" },
  "Kitchen Suppression": { types: [["KS", "Kitchen hood suppression unit", 1]], range: [2, 4] },
  HVAC: { types: [["SDM", "Smoke damper", 1]], range: [5, 7], item: "FSM-PART-ACT24" },
  Electrical: { types: [["DB", "Distribution board", 1]], range: [3, 5] },
};
export interface CheckDef { code: string; text: string; applies: "System" | "Device"; unit?: string; min?: number; max?: number; photo?: boolean; fail: string; sev: "Critical" | "Major" | "Minor" }
export interface TemplateDef { id: string; name: string; type: string; version: number; status: "Active" | "Superseded" | "Draft"; std: string; supersedes?: string; checks: CheckDef[] }
const FA_CHECKS: CheckDef[] = [
  { code: "FA-01", text: "Panel normal, no faults or disablements", applies: "System", fail: "Panel shows faults", sev: "Major" },
  { code: "FA-02", text: "Standby battery voltage", applies: "System", unit: "V", min: 24, max: 28.5, fail: "Battery voltage low", sev: "Major" },
  { code: "FA-03", text: "Detector functional test", applies: "Device", photo: true, fail: "No alarm on functional test", sev: "Major" },
  { code: "FA-04", text: "Device clean and unobstructed", applies: "Device", fail: "Detector dirty or obstructed", sev: "Minor" },
];
export const TEMPLATES: TemplateDef[] = [
  { id: "FSM-TPL-0001", name: "Fire alarm inspection & test", type: "Fire Alarm", version: 1, status: "Superseded", std: "NFPA 72 Ch.14 (reference)", checks: [FA_CHECKS[0]!, FA_CHECKS[2]!] },
  { id: "FSM-TPL-0002", name: "Fire alarm inspection & test", type: "Fire Alarm", version: 2, status: "Active", std: "NFPA 72 Ch.14 (reference)", supersedes: "FSM-TPL-0001", checks: FA_CHECKS },
  { id: "FSM-TPL-0003", name: "Sprinkler quarterly inspection", type: "Sprinkler", version: 1, status: "Active", std: "NFPA 25 Ch.5 (reference)", checks: [
    { code: "SP-01", text: "Main drain test pressure", applies: "System", unit: "bar", min: 4, max: 12, fail: "Main drain pressure low", sev: "Major" },
    { code: "SP-02", text: "Control valve supervised open and sealed", applies: "Device", fail: "Valve not supervised open", sev: "Critical" }] },
  { id: "FSM-TPL-0004", name: "Portable extinguisher inspection", type: "Extinguishers", version: 1, status: "Active", std: "NFPA 10 Ch.7 (reference)", checks: [
    { code: "EX-01", text: "Pressure gauge in operating range", applies: "Device", fail: "Gauge below operating range", sev: "Minor" },
    { code: "EX-02", text: "Seal and tamper indicator intact", applies: "Device", fail: "Seal or tamper indicator broken", sev: "Minor" },
    { code: "EX-03", text: "Gross weight within tolerance", applies: "Device", unit: "kg", min: 5.7, max: 6.3, fail: "Weight out of tolerance", sev: "Minor" }] },
  { id: "FSM-TPL-0005", name: "Emergency lighting duration test", type: "Emergency Lighting", version: 1, status: "Active", std: "NFPA 101 §7.9 (reference)", checks: [
    { code: "EL-01", text: "Luminaire lights on mains failure", applies: "Device", fail: "Luminaire failed on mains failure", sev: "Major" },
    { code: "EL-02", text: "Rated duration test (minutes)", applies: "Device", unit: "min", min: 90, fail: "Duration below 90 minutes", sev: "Minor" }] },
  { id: "FSM-TPL-0006", name: "Fire pump churn test", type: "Fire Pump", version: 1, status: "Active", std: "NFPA 25 Ch.8 (reference)", checks: [
    { code: "FP-01", text: "Churn discharge pressure", applies: "System", unit: "bar", min: 6, max: 10, fail: "Churn pressure out of range", sev: "Major" },
    { code: "FP-02", text: "Pump starts on pressure drop", applies: "Device", fail: "Pump failed to start on demand", sev: "Critical" },
    { code: "FP-03", text: "Running current", applies: "Device", unit: "A", min: 18, max: 42, fail: "Running current out of range", sev: "Major" }] },
  { id: "FSM-TPL-0007", name: "Kitchen suppression semi-annual service", type: "Kitchen Suppression", version: 1, status: "Active", std: "NFPA 17A (reference)", checks: [
    { code: "KS-01", text: "Agent cylinder pressure", applies: "Device", unit: "bar", min: 12, max: 16, fail: "Cylinder pressure low", sev: "Major" },
    { code: "KS-02", text: "Nozzles clean and capped", applies: "Device", photo: true, fail: "Nozzle blocked", sev: "Major" }] },
  { id: "FSM-TPL-0008", name: "Smoke damper functional test", type: "HVAC", version: 1, status: "Active", std: "NFPA 105 (reference)", checks: [
    { code: "SD-01", text: "Damper closes on alarm signal", applies: "Device", fail: "Damper did not close on alarm", sev: "Critical" },
    { code: "SD-02", text: "Closing time (seconds)", applies: "Device", unit: "s", max: 60, fail: "Closing time too long", sev: "Minor" }] },
  { id: "FSM-TPL-0009", name: "Distribution board thermographic survey", type: "Electrical", version: 1, status: "Active", std: "NFPA 70B (reference)", checks: [
    { code: "DB-01", text: "Hottest terminal temperature (°C)", applies: "Device", unit: "°C", max: 60, photo: true, fail: "Hot spot on thermal scan", sev: "Major" },
    { code: "DB-02", text: "Circuit breakers labelled", applies: "Device", fail: "Breakers not labelled", sev: "Minor" }] },
  { id: "FSM-TPL-0010", name: "Fire alarm inspection & test", type: "Fire Alarm", version: 3, status: "Draft", std: "NFPA 72 Ch.14 (reference)", supersedes: "FSM-TPL-0002", checks: [...FA_CHECKS, { code: "FA-05", text: "Sounder audible in every zone", applies: "System", fail: "Sounder not audible", sev: "Major" }] },
];
export const activeTpl = (type: string) => TEMPLATES.find((t) => t.type === type && t.status === "Active")!;
export interface TechDef { id: string; emp: string; first: string; last: string; gender: "Male" | "Female"; city: City; crew: "Crew A" | "Crew B"; skills: [skill: string, cert: string, validDays: number][]; phone: string }
/** validDays: certificate validity relative to today (negative = expired). */
export const TECHS: TechDef[] = [
  { id: "FSM-TECH-001", emp: "FSM-EMP-001", first: "Khalid", last: "Al-Harbi", gender: "Male", city: "Riyadh", crew: "Crew A", phone: "+966 55 410 1001", skills: [["Fire Alarm", "FA-2291", 420], ["Emergency Lighting", "EL-118", 300], ["Extinguishers", "EX-410", 380]] },
  { id: "FSM-TECH-002", emp: "FSM-EMP-002", first: "Faisal", last: "Al-Otaibi", gender: "Male", city: "Riyadh", crew: "Crew A", phone: "+966 55 410 1002", skills: [["Sprinkler", "SP-7712", 260], ["Fire Pump", "FP-310", 24], ["Kitchen Suppression", "KS-120", 410]] },
  { id: "FSM-TECH-005", emp: "FSM-EMP-005", first: "Majed", last: "Al-Shammari", gender: "Male", city: "Riyadh", crew: "Crew A", phone: "+966 55 410 1005", skills: [["Fire Alarm", "FA-3320", 510], ["Electrical", "EE-221", 350], ["HVAC", "HV-090", 280], ["Sprinkler", "SP-7750", 330]] },
  { id: "FSM-TECH-006", emp: "FSM-EMP-006", first: "Saud", last: "Al-Mutairi", gender: "Male", city: "Riyadh", crew: "Crew A", phone: "+966 55 410 1006", skills: [["Extinguishers", "EX-512", 450], ["Emergency Lighting", "EL-207", 190], ["Kitchen Suppression", "KS-141", 365]] },
  { id: "FSM-TECH-003", emp: "FSM-EMP-003", first: "Yousef", last: "Al-Qahtani", gender: "Male", city: "Jeddah", crew: "Crew B", phone: "+966 55 410 1003", skills: [["Extinguishers", "EX-554", 300], ["Fire Alarm", "FA-1950", -40], ["Sprinkler", "SP-6610", 220], ["Fire Pump", "FP-402", 410]] },
  { id: "FSM-TECH-004", emp: "FSM-EMP-004", first: "Huda", last: "Al-Shehri", gender: "Female", city: "Jeddah", crew: "Crew B", phone: "+966 55 410 1004", skills: [["Fire Alarm", "FA-3001", 560], ["Sprinkler", "SP-8001", 560], ["Extinguishers", "EX-801", 560], ["Emergency Lighting", "EL-802", 560], ["HVAC", "HV-140", 500], ["Electrical", "EE-310", 470]] },
  { id: "FSM-TECH-007", emp: "FSM-EMP-007", first: "Abdulaziz", last: "Al-Ghamdi", gender: "Male", city: "Dammam", crew: "Crew B", phone: "+966 55 410 1007", skills: [["Fire Alarm", "FA-4102", 390], ["Sprinkler", "SP-9120", 400], ["Fire Pump", "FP-511", 480], ["Electrical", "EE-415", 52], ["HVAC", "HV-201", 300]] },
  { id: "FSM-TECH-008", emp: "FSM-EMP-008", first: "Nasser", last: "Al-Zahrani", gender: "Male", city: "Dammam", crew: "Crew B", phone: "+966 55 410 1008", skills: [["Extinguishers", "EX-906", 330], ["Emergency Lighting", "EL-311", 260], ["Electrical", "EE-433", 280], ["Work at Height", "WH-77", 150], ["Fire Alarm", "FA-4180", 300]] },
];
export const techName = (t: TechDef) => `${t.first} ${t.last}`;
export const vanOf = (t: TechDef) => `FSM Van ${t.id.slice(-2)} - ${ABBR}`;
export interface AgreementDef { id: string; site: string; title: string; kind: "primary" | "specialist" | "draft"; covers?: string[]; excludes?: string[]; months: number; offset: number; state: "Active" | "Suspended" | "Expired" | "Draft"; value: number }
/** Start = today − `months` months + `offset` days; end = start + 12 months − 1 day. */
export const AGREEMENTS: AgreementDef[] = [
  { id: "FSM-AGR-D01", site: "FSM-SITE-0001", title: "Riyadh Gate Mall — annual maintenance contract", kind: "primary", excludes: ["Fire Pump", "Kitchen Suppression"], months: 7, offset: -3, state: "Active", value: 186000 },
  { id: "FSM-AGR-D02", site: "FSM-SITE-0003", title: "Al Nakheel Plaza — annual maintenance contract", kind: "primary", excludes: ["Fire Pump"], months: 5, offset: 2, state: "Active", value: 142000 },
  { id: "FSM-AGR-D03", site: "FSM-SITE-0004", title: "Granada Center — annual maintenance contract", kind: "primary", months: 9, offset: -6, state: "Active", value: 64000 },
  { id: "FSM-AGR-D04", site: "FSM-SITE-0005", title: "Qurtuba Mall — annual maintenance contract", kind: "primary", excludes: ["Kitchen Suppression"], months: 10, offset: 14, state: "Active", value: 158000 },
  { id: "FSM-AGR-D05", site: "FSM-SITE-0002", title: "Al Waha Hospital — North Tower — annual maintenance contract", kind: "primary", excludes: ["Emergency Lighting"], months: 8, offset: -1, state: "Active", value: 240000 },
  { id: "FSM-AGR-D06", site: "FSM-SITE-0006", title: "Al Waha Hospital — South Tower — annual maintenance contract", kind: "primary", months: 4, offset: 5, state: "Active", value: 212000 },
  { id: "FSM-AGR-D07", site: "FSM-SITE-0007", title: "Al Waha Clinic — Al Rawdah — annual maintenance contract", kind: "primary", months: 6, offset: -9, state: "Active", value: 48000 },
  { id: "FSM-AGR-D08", site: "FSM-SITE-0008", title: "Al Waha Medical Store — Al Khumrah — annual maintenance contract", kind: "primary", months: 12, offset: -18, state: "Expired", value: 52000 },
  { id: "FSM-AGR-D09", site: "FSM-SITE-0009", title: "Second Industrial City — Plant A — annual maintenance contract", kind: "primary", excludes: ["Fire Pump"], months: 3, offset: -4, state: "Active", value: 126000 },
  { id: "FSM-AGR-D10", site: "FSM-SITE-0010", title: "Second Industrial City — Plant B — annual maintenance contract", kind: "primary", months: 7, offset: 6, state: "Active", value: 98000 },
  { id: "FSM-AGR-D11", site: "FSM-SITE-0011", title: "Dammam Logistics Hub — annual maintenance contract", kind: "primary", excludes: ["Fire Pump"], months: 2, offset: -11, state: "Active", value: 118000 },
  { id: "FSM-AGR-D12", site: "FSM-SITE-0012", title: "Al Khobar Admin Building — annual maintenance contract", kind: "primary", months: 11, offset: -6, state: "Active", value: 56000 },
  { id: "FSM-AGR-D13", site: "FSM-SITE-0001", title: "Riyadh Gate Mall — fire pump maintenance", kind: "specialist", covers: ["Fire Pump"], months: 7, offset: -3, state: "Active", value: 36000 },
  { id: "FSM-AGR-D14", site: "FSM-SITE-0003", title: "Al Nakheel Plaza — fire pump maintenance", kind: "specialist", covers: ["Fire Pump"], months: 5, offset: 2, state: "Active", value: 30000 },
  { id: "FSM-AGR-D15", site: "FSM-SITE-0001", title: "Riyadh Gate Mall — kitchen suppression service", kind: "specialist", covers: ["Kitchen Suppression"], months: 7, offset: -3, state: "Active", value: 22000 },
  { id: "FSM-AGR-D16", site: "FSM-SITE-0005", title: "Qurtuba Mall — kitchen suppression service", kind: "specialist", covers: ["Kitchen Suppression"], months: 10, offset: 14, state: "Suspended", value: 18000 },
  { id: "FSM-AGR-D17", site: "FSM-SITE-0002", title: "Al Waha Hospital — North Tower — monthly life-safety testing", kind: "specialist", covers: ["Emergency Lighting"], months: 8, offset: -1, state: "Active", value: 44000 },
  { id: "FSM-AGR-D18", site: "FSM-SITE-0009", title: "Second Industrial City — Plant A — fire pump maintenance", kind: "specialist", covers: ["Fire Pump"], months: 3, offset: -4, state: "Active", value: 42000 },
  { id: "FSM-AGR-D19", site: "FSM-SITE-0011", title: "Dammam Logistics Hub — fire pump maintenance", kind: "specialist", covers: ["Fire Pump"], months: 2, offset: -11, state: "Active", value: 39000 },
  { id: "FSM-AGR-D20", site: "FSM-SITE-0012", title: "Al Khobar Admin Building — renewal proposal", kind: "draft", covers: ["Fire Alarm", "Extinguishers"], months: -1, offset: 2, state: "Draft", value: 61000 },
];
/** Frequency of a system type on a site kind (hospitals test fire alarm and lighting monthly). */
export function frequencyOf(type: string, kind: SiteKind, specialist: boolean): string {
  if (specialist && (type === "Fire Pump" || type === "Emergency Lighting")) return "Monthly";
  if (type === "Fire Pump") return "Monthly";
  if (kind === "hospital" && (type === "Fire Alarm" || type === "Emergency Lighting")) return "Monthly";
  if (type === "Fire Alarm" || type === "Sprinkler" || type === "Emergency Lighting") return "Quarterly";
  if (type === "Extinguishers" || type === "Kitchen Suppression" || type === "HVAC") return "Semi-Annual";
  return "Annual";
}
export const WINDOW: Record<string, number> = { Monthly: 10, Quarterly: 14, "Semi-Annual": 21, Annual: 30 };
export const PARTS: [code: string, name: string, rate: number, uom: string][] = [
  ["FSM-PART-SMOKE", "Optical smoke detector", 180, "Nos"], ["FSM-PART-EXT6", "CO2 extinguisher 6 kg", 240, "Nos"], ["FSM-PART-ELBAT", "Emergency luminaire battery pack", 95, "Nos"],
  ["FSM-PART-TAMPER", "Sprinkler control valve tamper switch", 310, "Nos"], ["FSM-PART-EXITLED", "Exit sign LED module", 140, "Nos"], ["FSM-PART-ACT24", "Damper actuator 24V", 620, "Nos"],
];
export const REQUESTS: { id: string; subject: string; site: string; priority: "Low" | "Medium" | "High" | "Urgent"; type: "Emergency" | "Corrective" | "Certificate"; openDay: number; openH: number; respondedH?: number; status: "Open" | "Replied" | "Resolved" }[] = [
  { id: "FSM-REQ-D01", subject: "Fire alarm panel shows earth fault", site: "FSM-SITE-0004", priority: "Medium", type: "Corrective", openDay: -1, openH: 9, respondedH: 10, status: "Open" },
  { id: "FSM-REQ-D02", subject: "Sprinkler pipe leaking in basement car park", site: "FSM-SITE-0002", priority: "Urgent", type: "Emergency", openDay: 0, openH: 7, respondedH: 7.5, status: "Open" },
  { id: "FSM-REQ-D03", subject: "Exit sign not lit at stair 3", site: "FSM-SITE-0010", priority: "Low", type: "Corrective", openDay: -4, openH: 11, status: "Open" },
  { id: "FSM-REQ-D04", subject: "Kitchen suppression discharged in food court", site: "FSM-SITE-0001", priority: "High", type: "Emergency", openDay: 0, openH: 8, respondedH: 8.3, status: "Open" },
  { id: "FSM-REQ-D05", subject: "Fire pump running continuously", site: "FSM-SITE-0005", priority: "High", type: "Corrective", openDay: -1, openH: 15, respondedH: 16, status: "Open" },
  { id: "FSM-REQ-D06", subject: "Smoke detector beeping in ward 4B", site: "FSM-SITE-0006", priority: "Medium", type: "Corrective", openDay: 0, openH: 9, status: "Open" },
  { id: "FSM-REQ-D07", subject: "Damaged manual call point at entrance", site: "FSM-SITE-0007", priority: "Medium", type: "Corrective", openDay: -2, openH: 10, respondedH: 12, status: "Replied" },
  { id: "FSM-REQ-D08", subject: "Annual inspection certificate requested by civil defence", site: "FSM-SITE-0012", priority: "Low", type: "Certificate", openDay: -9, openH: 10, respondedH: 13, status: "Resolved" },
];
/** Response / resolution hours by priority (SLA policy defaults, FSM Settings). */
export const SLA_HOURS: Record<string, [response: number, resolution: number]> = { Urgent: [1, 8], High: [2, 24], Medium: [4, 72], Low: [8, 120] };
export const ACCESS_NOTES = ["Plant room locked — key holder off site", "Ceiling void not accessible without a lift", "Patient room occupied — infection control", "Tenant shop closed"];
