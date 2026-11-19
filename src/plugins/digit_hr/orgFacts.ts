/**
 * Module 01 organization facts over PRE-SCOPED rows (presentation only; never writes).
 * Department hierarchy follows the ERPNext Department tree (parent_department, company, disabled).
 * Exceptions are factual link/data checks: a value that cannot be verified against a readable record is
 * reported as "not evaluated", never as an exception and never as healthy.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? '' : String(v));

export type DeptNode = { name: string; parent: string; company: string; disabled: boolean; isGroup: boolean; direct: number; total: number; children: DeptNode[]; missing?: boolean };

/** Tree of readable departments with direct and rolled-up active headcount. Employee department values with no Department
 * record are returned as flagged `missing` roots so they stay visible instead of silently disappearing. */
export function departmentTree(depts: Row[], emps: Row[], exists: (name: string) => boolean = () => false): { roots: DeptNode[]; unassigned: number } {
  const nodes = new Map<string, DeptNode>();
  for (const d of depts) nodes.set(s(d['name']), { name: s(d['name']), parent: s(d['parent_department']), company: s(d['company']), disabled: !!Number(d['disabled'] ?? 0), isGroup: !!Number(d['is_group'] ?? 0), direct: 0, total: 0, children: [] });
  let unassigned = 0;
  for (const e of emps) {
    const dep = s(e['department']);
    if (!dep) { unassigned++; continue; }
    let node = nodes.get(dep);
    if (!node) {
      // Department exists but is outside the reader's scope: do not invent a node; count it under no visible branch.
      if (exists(dep)) continue;
      node = { name: dep, parent: '', company: s(e['company']), disabled: false, isGroup: false, direct: 0, total: 0, children: [], missing: true };
      nodes.set(dep, node);
    }
    node.direct++;
  }
  const roots: DeptNode[] = [];
  for (const n of nodes.values()) {
    const p = n.parent && n.parent !== n.name ? nodes.get(n.parent) : undefined;
    if (p) p.children.push(n); else roots.push(n);
  }
  const roll = (n: DeptNode, seen: Set<string>): number => {
    if (seen.has(n.name)) return 0; seen.add(n.name);
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.total = n.direct + n.children.reduce((t, c) => t + roll(c, seen), 0);
    return n.total;
  };
  for (const r of roots) roll(r, new Set());
  roots.sort((a, b) => Number(!!a.missing) - Number(!!b.missing) || b.total - a.total || a.name.localeCompare(b.name));
  return { roots, unassigned };
}

/** All department names at or below `name` (inclusive), for filtering the directory by a branch. */
export function branchOf(roots: DeptNode[], name: string): Set<string> {
  const out = new Set<string>();
  const find = (ns: DeptNode[]): DeptNode | undefined => { for (const n of ns) { if (n.name === name) return n; const f = find(n.children); if (f) return f; } return undefined; };
  const walk = (n: DeptNode) => { if (out.has(n.name)) return; out.add(n.name); n.children.forEach(walk); };
  const hit = find(roots); if (hit) walk(hit); else if (name) out.add(name);
  return out;
}

export type OrgExceptionKind = 'dept-missing' | 'dept-company' | 'dept-disabled' | 'manager-missing' | 'manager-inactive' | 'reporting-loop' | 'incomplete';
export type OrgException = { employee: string; employeeName: string; kind: OrgExceptionKind; detail: string; ref?: { doctype: string; name: string } };
export const ORG_EXCEPTION_KINDS: OrgExceptionKind[] = ['dept-missing', 'dept-company', 'dept-disabled', 'manager-missing', 'manager-inactive', 'reporting-loop', 'incomplete'];

/**
 * Exceptions for ACTIVE employees (optionally only those matching `only`, while managers/departments are looked up across all rows).
 * - `exists(doctype, name)` is an existence-only probe used to tell "record missing" from "record not readable";
 *   a linked record that exists but is unreadable is counted in `notEvaluated`, never shown as an exception.
 */
export function orgExceptions(emps: Row[], depts: Row[], exists: (doctype: string, name: string) => boolean, only: (e: Row) => boolean = () => true): { rows: OrgException[]; notEvaluated: number; employees: string[] } {
  const deptBy = new Map(depts.map((d) => [s(d['name']), d]));
  const empBy = new Map(emps.map((e) => [s(e['name']), e]));
  const rows: OrgException[] = [];
  let notEvaluated = 0;
  for (const e of emps) {
    if (s(e['status'] || 'Active') !== 'Active' || !only(e)) continue;
    const id = s(e['name']); const nm = s(e['employee_name']) || id;
    const push = (kind: OrgExceptionKind, detail: string, ref?: OrgException['ref']) => rows.push({ employee: id, employeeName: nm, kind, detail, ...(ref ? { ref } : {}) });
    const dep = s(e['department']);
    if (dep) {
      const d = deptBy.get(dep);
      if (!d) { if (exists('Department', dep)) notEvaluated++; else push('dept-missing', dep); }
      else {
        if (s(d['company']) && s(e['company']) && s(d['company']) !== s(e['company'])) push('dept-company', `${dep} ≠ ${s(e['company'])}`, { doctype: 'Department', name: dep });
        if (Number(d['disabled'] ?? 0)) push('dept-disabled', dep, { doctype: 'Department', name: dep });
      }
    }
    const mgr = s(e['reports_to']);
    if (mgr) {
      const m = empBy.get(mgr);
      if (!m) { if (exists('Employee', mgr)) notEvaluated++; else push('manager-missing', mgr); }
      else if (s(m['status'] || 'Active') !== 'Active') push('manager-inactive', `${s(m['employee_name']) || mgr} · ${s(m['status'])}`, { doctype: 'Employee', name: mgr });
      // reporting loop: following reports_to from this employee returns to it
      const seen = new Set<string>([id]); let cur = mgr; let loop = false;
      while (cur) { if (seen.has(cur)) { loop = cur === id; break; } seen.add(cur); cur = s(empBy.get(cur)?.['reports_to']); }
      if (loop) push('reporting-loop', mgr, { doctype: 'Employee', name: mgr });
    }
    if (!dep || !s(e['designation']) || !s(e['date_of_joining'])) push('incomplete', [!dep && 'department', !s(e['designation']) && 'designation', !s(e['date_of_joining']) && 'date_of_joining'].filter(Boolean).join(', '));
  }
  return { rows, notEvaluated, employees: [...new Set(rows.map((r) => r.employee))] };
}

/** Company level above the department tree: roots grouped by Department.company ("" = company not recorded), largest first. */
export function rootsByCompany(roots: DeptNode[]): { company: string; nodes: DeptNode[]; total: number }[] {
  const by = new Map<string, DeptNode[]>();
  for (const r of roots) by.set(r.company, [...(by.get(r.company) ?? []), r]);
  return [...by.entries()].map(([company, nodes]) => ({ company, nodes, total: nodes.reduce((t, n) => t + n.total, 0) }))
    .sort((a, b) => Number(!a.company) - Number(!b.company) || b.total - a.total || a.company.localeCompare(b.company));
}

/**
 * Facts for the selected organization unit over its ACTIVE members (pre-scoped rows; display only):
 * managers = members with at least one active direct report anywhere in `active`; designations = distinct non-empty values;
 * recentJoiners = joined within `days` up to `today` (null when today is unknown); withFindings = members listed in `flagged`.
 */
export function unitFacts(members: Row[], active: Row[], flagged: string[], today: string, days = 90): { headcount: number; managers: number; designations: number; recentJoiners: number | null; withFindings: number } {
  const reportsTo = new Set(active.map((e) => s(e['reports_to'])).filter(Boolean));
  const flaggedSet = new Set(flagged);
  let recent: number | null = null;
  const t = Date.parse(today);
  if (today && !Number.isNaN(t)) {
    recent = members.filter((e) => { const j = Date.parse(s(e['date_of_joining']).slice(0, 10)); return !Number.isNaN(j) && j <= t && t - j <= days * 864e5; }).length;
  }
  return {
    headcount: members.length,
    managers: members.filter((e) => reportsTo.has(s(e['name']))).length,
    designations: new Set(members.map((e) => s(e['designation'])).filter(Boolean)).size,
    recentJoiners: recent,
    withFindings: members.filter((e) => flaggedSet.has(s(e['name']))).length,
  };
}
