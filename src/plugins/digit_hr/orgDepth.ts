/**
 * NB-2 Organization section depth (01.2 job architecture, 01.5 employment changes, 01.6 contracts). Pure functions over
 * already-scoped rows: no reads, no writes, no new rules. Every figure is a count of source rows the caller can open.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = any;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => Number(v || 0);
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/* ---------------------------------------------------------------- 01.2 job architecture */

export type ProfileNode = { name: string; title: string; designation: string; grade: string; incumbents: string[] };
export type FamilyNode = { name: string; title: string; parent: string; missingParent: boolean; profiles: ProfileNode[]; children: FamilyNode[]; incumbents: number };
export type JobArchitecture = {
  families: FamilyNode[];
  /** profiles whose family link is empty or points to a family the caller cannot read */
  unfiled: ProfileNode[];
  /** designations held by active employees that no job profile describes */
  uncoveredDesignations: { designation: string; incumbents: string[] }[];
  /** profiles with no designation link (cannot be matched to incumbents) */
  profilesWithoutDesignation: string[];
  coverage: { designationsInUse: number; covered: number };
};

/**
 * Family → profiles → designation → active incumbents. Incumbents are matched on Employee.designation (the only native
 * link between a person and a job); a designation shared by two profiles counts its incumbents under both.
 */
export function jobArchitecture(families: Row[], profiles: Row[], employees: Row[]): JobArchitecture {
  const active = employees.filter((e) => s(e.status || "Active") === "Active");
  const byDesig = new Map<string, string[]>();
  for (const e of active) { const d = s(e.designation); if (!d) continue; byDesig.set(d, [...(byDesig.get(d) ?? []), s(e.name)]); }
  const famNames = new Set(families.map((f) => s(f.name)));
  const node = (p: Row): ProfileNode => ({ name: s(p.name), title: s(p.profile_name) || s(p.name), designation: s(p.designation), grade: s(p.grade_band), incumbents: byDesig.get(s(p.designation)) ?? [] });
  const nodes = new Map<string, FamilyNode>(families.map((f) => [s(f.name), { name: s(f.name), title: s(f.family_name) || s(f.name), parent: s(f.parent_family), missingParent: !!s(f.parent_family) && !famNames.has(s(f.parent_family)), profiles: [], children: [], incumbents: 0 }]));
  const unfiled: ProfileNode[] = [];
  for (const p of profiles) { const f = nodes.get(s(p.job_family)); if (f) f.profiles.push(node(p)); else unfiled.push(node(p)); }
  const roots: FamilyNode[] = [];
  for (const f of nodes.values()) { const parent = f.parent && f.parent !== f.name ? nodes.get(f.parent) : undefined; if (parent && !isAncestor(f, parent, nodes)) parent.children.push(f); else roots.push(f); }
  const total = (f: FamilyNode): number => { const own = new Set(f.profiles.flatMap((p) => p.incumbents)); for (const c of f.children) { total(c); for (const p of allProfiles(c)) for (const i of p.incumbents) own.add(i); } f.incumbents = own.size; return f.incumbents; };
  const sort = (list: FamilyNode[]) => { list.sort((a, b) => a.title.localeCompare(b.title)); for (const f of list) { f.profiles.sort((a, b) => a.title.localeCompare(b.title)); sort(f.children); } };
  roots.forEach(total); sort(roots);
  const described = new Set(profiles.map((p) => s(p.designation)).filter(Boolean));
  const uncovered = [...byDesig.entries()].filter(([d]) => !described.has(d)).map(([designation, incumbents]) => ({ designation, incumbents })).sort((a, b) => b.incumbents.length - a.incumbents.length || a.designation.localeCompare(b.designation));
  return {
    families: roots, unfiled,
    uncoveredDesignations: uncovered,
    profilesWithoutDesignation: profiles.filter((p) => !s(p.designation)).map((p) => s(p.name)),
    coverage: { designationsInUse: byDesig.size, covered: [...byDesig.keys()].filter((d) => described.has(d)).length },
  };
}
function isAncestor(f: FamilyNode, candidate: FamilyNode, nodes: Map<string, FamilyNode>): boolean {
  // guard against parent cycles: a family is never placed under one of its own descendants
  let cur: FamilyNode | undefined = candidate; const seen = new Set<string>();
  while (cur && !seen.has(cur.name)) { if (cur.name === f.name) return true; seen.add(cur.name); cur = cur.parent ? nodes.get(cur.parent) : undefined; }
  return false;
}
export function allProfiles(f: FamilyNode): ProfileNode[] { return [...f.profiles, ...f.children.flatMap(allProfiles)]; }
export function findProfile(arch: JobArchitecture, name: string): ProfileNode | undefined {
  const walk = (list: FamilyNode[]): ProfileNode | undefined => { for (const f of list) { const p = f.profiles.find((x) => x.name === name) ?? walk(f.children); if (p) return p; } return undefined; };
  return walk(arch.families) ?? arch.unfiled.find((p) => p.name === name);
}

/* ---------------------------------------------------------------- 01.5 employment changes */

export type MovementStage = "draft-ready" | "draft-scheduled" | "effective" | "cancelled";
export type Change = { property: string; fieldname: string; from: string; to: string };
export type Movement = { doctype: "Employee Transfer" | "Employee Promotion"; name: string; employee: string; employeeName: string; date: string; stage: MovementStage; changes: Change[] };

const details = (d: Row): Change[] => {
  const rows = (Array.isArray(d.transfer_details) ? d.transfer_details : Array.isArray(d.promotion_details) ? d.promotion_details : []) as Row[];
  return rows.map((r) => ({ property: s(r.property), fieldname: s(r.fieldname), from: s(r.current), to: s(r.new) }));
};

/**
 * Pipeline stage from native docstatus and the movement date. A draft dated in the future cannot be submitted yet
 * (movementErrors rejects future dates), so it is "scheduled"; a draft dated today or earlier is ready for review.
 */
export function movementStage(docstatus: unknown, date: string, today: string): MovementStage {
  const ds = n(docstatus);
  if (ds === 2) return "cancelled";
  if (ds === 1) return "effective";
  return isDate(date) && date > today ? "draft-scheduled" : "draft-ready";
}

export function movements(transfers: Row[], promotions: Row[], today: string): Movement[] {
  const one = (doctype: Movement["doctype"], dateField: string) => (d: Row): Movement => ({ doctype, name: s(d.name), employee: s(d.employee), employeeName: s(d.employee_name) || s(d.employee), date: s(d[dateField]), stage: movementStage(d.docstatus, s(d[dateField]), today), changes: details(d) });
  return [...transfers.map(one("Employee Transfer", "transfer_date")), ...promotions.map(one("Employee Promotion", "promotion_date"))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

export type TimelineEvent = { date: string; to?: string; kind: "joined" | "history" | "transfer" | "promotion" | "assignment" | "relieved"; source: string; name?: string; changes: Change[]; label: string; pending?: boolean };

/**
 * One employee's effective-dated history from native sources only: date of joining, Employee.internal_work_history
 * rows (written when a movement is submitted), submitted or draft transfers/promotions and DIGIT Assignment History
 * position rows. Drafts are flagged pending; cancelled movements are left out. Newest first.
 */
export function employeeTimeline(employee: Row, transfers: Row[], promotions: Row[], assignments: Row[]): TimelineEvent[] {
  const id = s(employee.name); const out: TimelineEvent[] = [];
  if (isDate(s(employee.date_of_joining))) out.push({ date: s(employee.date_of_joining), kind: "joined", source: "Employee", changes: [], label: [s(employee.designation), s(employee.department)].filter(Boolean).join(" · ") });
  const hist = Array.isArray(employee.internal_work_history) ? (employee.internal_work_history as Row[]) : [];
  for (const h of hist) if (isDate(s(h.from_date))) out.push({ date: s(h.from_date), ...(s(h.to_date) ? { to: s(h.to_date) } : {}), kind: "history", source: "Employee Internal Work History", changes: [], label: [s(h.designation), s(h.department), s(h.branch)].filter(Boolean).join(" · ") });
  for (const [rows, kind, field, dt] of [[transfers, "transfer", "transfer_date", "Employee Transfer"], [promotions, "promotion", "promotion_date", "Employee Promotion"]] as const) {
    for (const d of rows) { if (s(d.employee) !== id || n(d.docstatus) === 2 || !isDate(s(d[field]))) continue; out.push({ date: s(d[field]), kind, source: dt, name: s(d.name), changes: details(d), label: "", ...(n(d.docstatus) === 0 ? { pending: true } : {}) }); }
  }
  for (const a of assignments) { if (s(a.employee) !== id || !isDate(s(a.from_date))) continue; out.push({ date: s(a.from_date), ...(s(a.to_date) ? { to: s(a.to_date) } : {}), kind: "assignment", source: "DIGIT Assignment History", name: s(a.name), changes: [], label: [s(a.position), s(a.designation), s(a.change_reason)].filter(Boolean).join(" · ") }); }
  if (isDate(s(employee.relieving_date))) out.push({ date: s(employee.relieving_date), kind: "relieved", source: "Employee", changes: [], label: "" });
  const rank: Record<TimelineEvent["kind"], number> = { relieved: 0, promotion: 1, transfer: 2, assignment: 3, history: 4, joined: 5 };
  return out.sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind]);
}

/* ---------------------------------------------------------------- 01.6 contracts */

/** Each indicator lists contract names (so it can filter the contract register); `reviews` = contracts with an unfinished amendment review. */
export type ContractFilter = "active" | "ending90" | "expired" | "probation30" | "reviews" | "extension-pending";
export type ContractIndicators = Record<ContractFilter, string[]> & {
  /** active employees in scope with no active, non-cancelled contract record */
  withoutContract: string[];
  /** next contract end dates (active contracts with an end date), soonest first */
  renewals: { name: string; employee: string; end: string; days: number }[];
};

/**
 * Contract indicators from DIGIT Employment Contract / DIGIT Contract Amendment rows. "Expired" = end date passed (or
 * status Expired) with no later active contract for the same employee. "Extension pending" = a submitted Extension
 * review whose new end date is later than the contract's own end date: owner decision D-01 keeps reviews from changing
 * the contract, so the contract still shows its original date. No legal notice periods are computed.
 */
export function contractIndicators(contracts: Row[], amendments: Row[], employees: Row[], today: string): ContractIndicators {
  const live = contracts.filter((c) => n(c.docstatus) !== 2);
  const isActive = (c: Row) => s(c.contract_status || "Active") === "Active" && (!s(c.end_date) || s(c.end_date) >= today) && s(c.start_date) <= today;
  const active = live.filter(isActive);
  const activeBy = new Set(active.map((c) => s(c.employee)));
  const horizon = addDays(today, 90), probationHorizon = addDays(today, 30);
  const ending = active.filter((c) => isDate(s(c.end_date)) && s(c.end_date) <= horizon);
  const expired = live.filter((c) => !isActive(c) && (s(c.contract_status) === "Expired" || (isDate(s(c.end_date)) && s(c.end_date) < today)) && !activeBy.has(s(c.employee)));
  const probation = active.filter((c) => { const st = s(c.start_date), days = n(c.probation_days); if (!isDate(st) || days <= 0) return false; const end = addDays(st, days); return end >= today && end <= probationHorizon; });
  const byName = new Map(live.map((c) => [s(c.name), c]));
  const reviews = [...new Set(amendments.filter((a) => n(a.docstatus) === 0 && byName.has(s(a.contract))).map((a) => s(a.contract)))];
  const extPending = amendments.filter((a) => { if (n(a.docstatus) !== 1 || s(a.amendment_type) !== "Extension") return false; const c = byName.get(s(a.contract)); return !!c && isDate(s(a.new_end_date)) && (!s(c.end_date) || s(a.new_end_date) > s(c.end_date)) && isActive(c); }).map((a) => s(a.contract));
  const withoutContract = employees.filter((e) => s(e.status || "Active") === "Active" && !activeBy.has(s(e.name))).map((e) => s(e.name));
  const renewals = active.filter((c) => isDate(s(c.end_date))).map((c) => ({ name: s(c.name), employee: s(c.employee), end: s(c.end_date), days: Math.round((Date.parse(s(c.end_date)) - Date.parse(today)) / 86400000) })).sort((a, b) => a.end.localeCompare(b.end));
  return { active: active.map((c) => s(c.name)), ending90: ending.map((c) => s(c.name)), expired: expired.map((c) => s(c.name)), probation30: probation.map((c) => s(c.name)), reviews, "extension-pending": [...new Set(extPending)], withoutContract, renewals };
}
