/**
 * 07.2 read-only privacy review. Lists configured permission rules exactly as found in source metadata
 * (DocType JSON permissions or Custom DocPerm overrides) and User Permission restrictions. It never evaluates
 * effective Frappe server access and never mutates policy; missing metadata becomes NOT_EVALUATED, never allowed.
 */
import type { DocTypeMeta } from '@/lib/catalog';

export const REVIEW_DOCTYPES = ['Employee', 'Salary Slip', 'Salary Structure Assignment', 'Additional Salary', 'Payroll Entry', 'Employee Advance', 'Expense Claim', 'Leave Application', 'Attendance', 'Job Applicant', 'Job Offer', 'Appraisal', 'Employee Transfer', 'Employee Promotion', 'Employee Separation', 'Full and Final Statement'] as const;

export type Category = 'personal' | 'compensation' | 'payroll' | 'documents' | 'operational';
export const CATEGORY: Record<string, Category> = {
  Employee: 'personal', 'Job Applicant': 'personal', 'Job Offer': 'documents', 'Employee Separation': 'documents',
  'Salary Structure Assignment': 'compensation', 'Additional Salary': 'compensation', 'Employee Promotion': 'compensation',
  'Salary Slip': 'payroll', 'Payroll Entry': 'payroll', 'Full and Final Statement': 'payroll', 'Employee Advance': 'payroll', 'Expense Claim': 'payroll',
};
export const ACTIONS = ['read', 'write', 'create', 'delete', 'submit', 'cancel', 'export', 'print', 'share'] as const;

export type ReviewRow = {
  id: string; doctype: string; role: string; actions: string[]; permlevel: number; ifOwner: boolean;
  source: 'Custom DocPerm' | 'DocType permissions' | 'unavailable'; category: Category;
  status: 'CONFIGURED' | 'NOT_EVALUATED'; findings: string[];
};

type Perm = Record<string, unknown>;

/** Pure: build rows from metas (undefined = not loaded/unreadable) and Custom DocPerm records. */
export function reviewRows(metas: Record<string, DocTypeMeta | undefined>, custom: Perm[], overridesAvailable = true): ReviewRow[] {
  const out: ReviewRow[] = [];
  for (const dt of REVIEW_DOCTYPES) {
    const category = CATEGORY[dt] ?? 'operational';
    const meta = metas[dt];
    if (!meta || !overridesAvailable) { out.push({ id: `${dt}::—`, doctype: dt, role: '—', actions: [], permlevel: 0, ifOwner: false, source: 'unavailable', category, status: 'NOT_EVALUATED', findings: [!meta ? 'metadata-unavailable' : 'override-source-unavailable'] }); continue; }
    const over = custom.filter(p => p['parent'] === dt);
    const rules = over.length ? over : ((meta.permissions ?? []) as unknown as Perm[]);
    const source = over.length ? 'Custom DocPerm' : 'DocType permissions';
    if (!rules.length) { out.push({ id: `${dt}::none`, doctype: dt, role: '—', actions: [], permlevel: 0, ifOwner: false, source, category, status: 'NOT_EVALUATED', findings: ['no-rules'] }); continue; }
    rules.forEach((p, i) => {
      const actions = ACTIONS.filter(a => Number(p[a] ?? 0) === 1);
      const role = String(p['role'] ?? '—'); const level = Number(p['permlevel'] ?? 0);
      const findings: string[] = [];
      if (category !== 'operational' && (role === 'All' || role === 'Guest') && actions.length) findings.push('broad-role-on-sensitive');
      if (category !== 'operational' && actions.includes('export')) findings.push('export-on-sensitive');
      if (actions.includes('delete') && category !== 'operational') findings.push('delete-on-sensitive');
      out.push({ id: `${dt}::${role}::${level}::${i}`, doctype: dt, role, actions, permlevel: level, ifOwner: Number(p['if_owner'] ?? 0) === 1, source, category, status: 'CONFIGURED', findings });
    });
  }
  return out;
}

export function summary(rows: ReviewRow[]) {
  return {
    roles: new Set(rows.filter(r => r.status === 'CONFIGURED').map(r => r.role)).size,
    sources: new Set(rows.filter(r => r.status === 'CONFIGURED').map(r => r.doctype)).size,
    findings: rows.reduce((n, r) => n + (r.status === 'CONFIGURED' ? r.findings.length : 0), 0),
    unknown: rows.filter(r => r.status === 'NOT_EVALUATED').length,
  };
}

/** Distinct users whose readable User Permission records restrict them to specific Company values for `doctype`
 * (apply_to_all_doctypes, or applicable_for = doctype). Values are only counted from records the reviewer may read;
 * this is configured restriction evidence, not effective server access. */
export function companyRestrictions(ups: Perm[], doctype: string): { users: number; companies: string[] } {
  const hits = ups.filter(u => u['allow'] === 'Company' && (Number(u['apply_to_all_doctypes'] ?? 1) === 1 || u['applicable_for'] === doctype));
  return { users: new Set(hits.map(u => String(u['user'] ?? ''))).size, companies: [...new Set(hits.map(u => String(u['for_value'] ?? '')).filter(Boolean))].sort() };
}

/** Inspector view over the same configured rules: one DocType's roles, or one role's DocTypes (merged per pair). */
export type InspectorLine = { key: string; actions: Set<string>; permlevels: number[]; ifOwner: boolean; findings: string[]; source: ReviewRow['source'] };
export function inspectRules(rows: ReviewRow[], mode: 'doctype' | 'role', value: string): InspectorLine[] {
  const hit = rows.filter(r => r.status === 'CONFIGURED' && (mode === 'doctype' ? r.doctype === value : r.role === value));
  const by = new Map<string, InspectorLine>();
  for (const r of hit) {
    const key = mode === 'doctype' ? r.role : r.doctype;
    const cur = by.get(key) ?? { key, actions: new Set<string>(), permlevels: [], ifOwner: false, findings: [], source: r.source };
    r.actions.forEach(a => cur.actions.add(a));
    if (!cur.permlevels.includes(r.permlevel)) cur.permlevels.push(r.permlevel);
    cur.ifOwner = cur.ifOwner || r.ifOwner;
    for (const f of r.findings) if (!cur.findings.includes(f)) cur.findings.push(f);
    by.set(key, cur);
  }
  return [...by.values()].map(l => ({ ...l, permlevels: l.permlevels.sort((a, b) => a - b) })).sort((a, b) => b.actions.size - a.actions.size || a.key.localeCompare(b.key));
}
