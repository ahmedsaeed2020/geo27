/**
 * WBS explorer read model (Phase 15 E). Read only: it composes the project's Digit WBS Version nodes (node_code /
 * parent_code tree), Digit Work Packages and native Tasks the session user may read; nothing is stored.
 * Each project Task is placed on exactly one node — the node that names it (node.task), else the node whose code equals
 * the Task's digit_wbs_code, else the deepest node carrying the Task's work package — so subtree counts never double
 * count. Tasks no node reaches are listed as unmapped instead of being hidden.
 * Without any WBS version the tree is derived from work packages (labelled `work_packages`).
 */
import type { Doc } from "@/lib/adapter";
import { num, r2 } from "./calc";
import { list, rows, tasksOf, today } from "./data";

export interface WbsNode {
  code: string; parent: string; title: string; type: string; idx: number; depth: number;
  work_package: string; task: string; boq_ref: string; budget_ref: string;
  children: WbsNode[]; tasks: Doc[];
  /** Rollup over the node and its descendants. */
  roll: { tasks: number; done: number; overdue: number; progress: number | null };
}
export interface WbsTree {
  source: "version" | "work_packages";
  version: Doc | undefined;
  versions: Doc[];
  roots: WbsNode[];
  byCode: Map<string, WbsNode>;
  unmappedTasks: Doc[];
  /** Work packages of the project that no node of the version references. */
  unmappedPackages: Doc[];
  /** Node codes whose parent_code is missing from the version (or forms a cycle); they are shown as roots. */
  orphans: string[];
}

const DONE = new Set(["Completed", "Cancelled"]);
export const isOverdue = (t: Doc, on = today()) => !DONE.has(String(t["status"] ?? "")) && num(t["progress"]) < 100 && !!t["exp_end_date"] && String(t["exp_end_date"]) < on;

/** WBS versions of a project, newest version first. */
export function wbsVersions(project: string): Doc[] {
  return list("Digit WBS Version", (v) => v["project"] === project).sort((a, b) => num(b["version"]) - num(a["version"]) || String(b.name).localeCompare(String(a.name)));
}
/** The version the explorer opens by default: the newest Approved one, else the newest of any state. */
export function defaultWbsVersion(project: string): Doc | undefined {
  const vs = wbsVersions(project);
  return vs.find((v) => v["workflow_state"] === "Approved") ?? vs[0];
}

function rollup(n: WbsNode, on: string): WbsNode["roll"] {
  const all: Doc[] = [];
  const walk = (x: WbsNode) => { all.push(...x.tasks); x.children.forEach(walk); };
  walk(n);
  const progress = all.length ? r2(all.reduce((s, t) => s + num(t["progress"]), 0) / all.length) : null;
  return { tasks: all.length, done: all.filter((t) => String(t["status"]) === "Completed" || num(t["progress"]) >= 100).length, overdue: all.filter((t) => isOverdue(t, on)).length, progress };
}

export function wbsTree(project: string, versionName?: string, on = today()): WbsTree {
  const versions = wbsVersions(project);
  const version = versionName ? versions.find((v) => v.name === versionName) : defaultWbsVersion(project);
  const tasks = tasksOf(project).slice().sort((a, b) => String(a["digit_wbs_code"] ?? "").localeCompare(String(b["digit_wbs_code"] ?? ""), undefined, { numeric: true }) || String(a.name).localeCompare(String(b.name)));
  const packages = list("Digit Work Package", (w) => w["project"] === project).sort((a, b) => String(a["code"] ?? "").localeCompare(String(b["code"] ?? ""), undefined, { numeric: true }));
  const byCode = new Map<string, WbsNode>();
  const mk = (p: Partial<WbsNode> & { code: string; title: string; type: string; idx: number }): WbsNode => ({ parent: "", depth: 0, work_package: "", task: "", boq_ref: "", budget_ref: "", children: [], tasks: [], roll: { tasks: 0, done: 0, overdue: 0, progress: null }, ...p });
  const roots: WbsNode[] = []; const orphans: string[] = [];

  if (version) {
    for (const r of rows(version, "nodes")) {
      const code = String(r["node_code"] ?? "").trim(); if (!code || byCode.has(code)) continue;
      byCode.set(code, mk({ code, parent: String(r["parent_code"] ?? "").trim(), title: String(r["title"] ?? code), type: String(r["node_type"] ?? ""), idx: num(r["idx"]) || byCode.size + 1,
        work_package: String(r["work_package"] ?? ""), task: String(r["task"] ?? ""), boq_ref: String(r["boq_item_ref"] ?? ""), budget_ref: String(r["budget_line_ref"] ?? "") }));
    }
    // link parents; a missing parent or a parent chain that loops makes the node a (flagged) root
    const loops = (n: WbsNode) => { const seen = new Set([n.code]); let p = byCode.get(n.parent); while (p) { if (seen.has(p.code)) return true; seen.add(p.code); p = byCode.get(p.parent); } return false; };
    for (const n of byCode.values()) {
      const parent = n.parent ? byCode.get(n.parent) : undefined;
      if (parent && !loops(n)) parent.children.push(n);
      else { roots.push(n); if (n.parent) orphans.push(n.code); }
    }
  } else {
    for (const [i, w] of packages.entries()) { const n = mk({ code: String(w["code"] ?? w.name), title: String(w["work_package_name"] ?? w.name), type: "Work Package", idx: i + 1, work_package: w.name }); byCode.set(n.code, n); roots.push(n); }
  }
  const order = (xs: WbsNode[], depth: number) => { xs.sort((a, b) => a.idx - b.idx); for (const x of xs) { x.depth = depth; order(x.children, depth + 1); } };
  order(roots, 0);

  // place each task on exactly one node
  const nodes = [...byCode.values()];
  const deepestWithPackage = (wp: string) => nodes.filter((n) => n.work_package === wp).sort((a, b) => b.depth - a.depth || a.idx - b.idx)[0];
  const unmappedTasks: Doc[] = [];
  for (const t of tasks) {
    const n = nodes.find((x) => x.task === t.name) ?? byCode.get(String(t["digit_wbs_code"] ?? "")) ?? (t["digit_work_package"] ? deepestWithPackage(String(t["digit_work_package"])) : undefined);
    if (n) n.tasks.push(t); else unmappedTasks.push(t);
  }
  for (const n of nodes) n.roll = rollup(n, on);
  const referenced = new Set(nodes.map((n) => n.work_package).filter(Boolean));
  return { source: version ? "version" : "work_packages", version, versions, roots, byCode, unmappedTasks, unmappedPackages: packages.filter((w) => !referenced.has(w.name)), orphans };
}

/** Visible node order (depth-first) for keyboard navigation, honouring collapsed nodes. */
export function visibleNodes(roots: WbsNode[], collapsed: Set<string>): WbsNode[] {
  const out: WbsNode[] = [];
  const walk = (xs: WbsNode[]) => { for (const x of xs) { out.push(x); if (!collapsed.has(x.code)) walk(x.children); } };
  walk(roots);
  return out;
}
