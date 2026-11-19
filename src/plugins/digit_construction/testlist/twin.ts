/**
 * Server-twin harness for the department suites: runs the same save cases through the browser rules (company rule +
 * domain/hooks.ts computeDoc / computeNative) and the Python twin (tests/parity_runner.py over the same store, in the
 * virtual and the Frappe record shape), so a department rule is only PASS when both hosts give the same messages and
 * document.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { REPO } from "./rows";
import type { boot } from "./env";

type Env = Awaited<ReturnType<typeof boot>>;
type R = Record<string, unknown>;
export interface TwinCase { id: string; dt: string; doc: R; before?: R | undefined; native?: boolean }
export interface TwinResult { errors: string[]; doc: R; writes?: Record<string, Record<string, R>> | null }
export interface TwinMode { mode: string; mismatches: { id: string; kind: string; detail: unknown }[]; cases: number; passed: number }
const APP_DIR = path.join(REPO, "frappe_apps/digit_construction/apps/digit_construction");
const SKIP = new Set(["Version", "Comment", "Activity Log", "Error Log"]);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export async function twin(env: Env, cases: TwinCase[]): Promise<{ ts: Map<string, TwinResult>; py: TwinMode[] }> {
  const [H, CS, D] = await Promise.all([import("../domain/hooks"), import("../domain/companyScope"), import("../domain/data")]);
  const ts = new Map<string, TwinResult>();
  for (const c of cases) {
    const errors: string[] = []; let d = clone({ doctype: c.dt, ...c.doc }) as R;
    if (CS.PROJECT_COMPANY_TYPES[c.dt]) { const r = CS.companyRule(c.dt, d as never); d = r.doc as R; errors.push(...r.errors); }
    const b = c.before ? (clone({ doctype: c.dt, ...c.before }) as never) : undefined;
    const r = c.native ? H.computeNative(c.dt, d as never, b) : H.computeDoc(c.dt, d as never, b);
    const all = [...errors, ...(r.errors ?? [])];
    ts.set(c.id, { errors: all, doc: r.doc as R, writes: r.after && !all.length ? cascadeWrites(env, c.dt, String(r.doc["name"] ?? ""), () => r.after!(r.doc)) : null });
  }
  const store: Record<string, Record<string, R>> = {};
  for (const dt of env.adapter.doctypes()) { if (SKIP.has(dt)) continue; store[dt] = {}; for (const x of env.adapter.list(dt)) { const { __synthetic: _s, ...rest } = x as R; void _s; store[dt]![String(x.name)] = rest; } }
  const corpus = path.join(mkdtempSync(path.join(tmpdir(), "digit-twin-")), "corpus.json");
  writeFileSync(corpus, JSON.stringify({ today: D.today(), user: env.S.currentUser(), roles: env.S.userRoles(), store,
    cases: cases.map((c) => ({ id: c.id, doctype: c.dt, doc: { doctype: c.dt, ...c.doc }, before: c.before ? { doctype: c.dt, ...c.before } : null, ts: { doc: ts.get(c.id)!.doc, errors: ts.get(c.id)!.errors, writes: ts.get(c.id)!.writes ?? null } })) }));
  const run = (extra: string[]) => JSON.parse(execFileSync("python3", [path.join(APP_DIR, "digit_construction/tests/parity_runner.py"), corpus, ...extra], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, cwd: APP_DIR })) as TwinMode;
  return { ts, py: [run([]), run(["--frappe-shape"])] };
}
const STAMPS = new Set(["modified", "modified_by", "creation"]);
const key = (x: R) => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !STAMPS.has(k) && !k.startsWith("__")).sort(([a], [b]) => a.localeCompare(b))));
/**
 * The cascades a successful save runs (the hook's after), applied to the live store and read back as the records they
 * created or changed (the saved document itself excluded, as on the server), then undone so the next case starts from
 * the same store. Compared with the Python cascades by tests/parity_runner.py.
 */
function cascadeWrites(env: Env, dt: string, self: string, run: () => void): Record<string, Record<string, R>> {
  const snap = new Map<string, Map<string, { raw: R; key: string }>>();
  for (const t of env.adapter.doctypes()) { if (SKIP.has(t)) continue; const m = new Map<string, { raw: R; key: string }>(); for (const x of env.adapter.list(t)) m.set(String(x.name), { raw: clone(x as R), key: key(x as R) }); snap.set(t, m); }
  try { run(); } catch (e) { return { __error: { message: { text: String((e as Error).message) } } } as never; }
  const out: Record<string, Record<string, R>> = {};
  for (const t of env.adapter.doctypes()) {
    if (SKIP.has(t)) continue; const was = snap.get(t) ?? new Map();
    for (const x of env.adapter.list(t)) {
      const n = String(x.name); const old = was.get(n);
      if (old && old.key === key(x as R)) continue;
      if (!(t === dt && n === self)) { const { __synthetic: _s, ...rest } = x as R; void _s; (out[t] ??= {})[n] = clone(rest); }
      if (old) env.adapter.insertDocQuiet(t, old.raw as never); else env.adapter.remove(t, n);
    }
  }
  return out;
}
/** Evidence line for one case: no mismatch in either record shape. */
export function twinOk(py: TwinMode[], id: string): boolean { return py.every((m) => !m.mismatches.some((x) => x.id === id)); }
export const twinModes = (py: TwinMode[]) => py.map((m) => m.mode).join(" + ");
