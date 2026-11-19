/**
 * Test-only harness: proves each Construction Desk Script Report (frappe_apps/digit_construction/.../services/reports,
 * Python) returns the SAME rows as the Virtual Core report runner (`PluginReport.run`) on the connected demo corpus.
 * Never imported by the app. Writes only under the OS temp directory.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PluginReport } from "../types";

type Row = Record<string, unknown>;
export type DeskCase = { id: string; report: string; filters: Row };
export type DeskResult = { id: string; report: string; ok: boolean; detail?: string };

const APP_DIR = path.resolve(__dirname, "../../../frappe_apps/digit_construction/apps/digit_construction");
const CLI = path.join(APP_DIR, "digit_construction/services/reports/cli.py");
const SKIP_STORE = new Set(["Activity Log", "Error Log"]);

function installMemoryStorage() {
  const mem: Record<string, string> = {};
  const g = globalThis as unknown as Record<string, unknown>;
  g["window"] = globalThis;
  g["localStorage"] = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; }, clear: () => {}, key: () => null, length: 0 };
  g["sessionStorage"] = g["localStorage"];
}

let corpus: Promise<{ store: Record<string, Record<string, Row>>; today: string; user: string; roles: string[]; reports: PluginReport[] }> | null = null;

/** Demo store exactly as the screens see it (seeded Core + Construction demo), built once per test file. */
export function deskCorpus() {
  corpus ??= (async () => {
    installMemoryStorage();
    const { adapter } = await import("@/lib/adapter");
    await import("@/plugins/builtinBoot");
    const R = await import("@/plugins/runtime");
    const { seedErp } = await import("@/lib/seed");
    seedErp();
    if (!R.isEnabled("digit_construction")) R.setEnabled("digit_construction", true);
    (await import("./seed")).installConstructionDemo();
    const { today } = await import("./domain/data");
    const Ss = await import("@/lib/session");
    const { digitConstruction } = await import("./index");
    const store: Record<string, Record<string, Row>> = {};
    for (const dt of adapter.doctypes()) {
      if (SKIP_STORE.has(dt)) continue;
      const recs: Record<string, Row> = {};
      for (const d of adapter.list(dt)) { const { __synthetic: _s, ...rest } = d as Row & { name: string }; void _s; recs[d.name] = JSON.parse(JSON.stringify(rest)) as Row; }
      store[dt] = recs;
    }
    return { store, today: today(), user: Ss.currentUser(), roles: Ss.userRoles(), reports: digitConstruction.reports ?? [] };
  })();
  return corpus;
}

/** Unfiltered run, plus one run per company and per project (first 3) when the report declares those filters. */
export function defaultCases(report: PluginReport, store: Record<string, Record<string, Row>>): DeskCase[] {
  const out: DeskCase[] = [{ id: `${report.name}#all`, report: report.name, filters: {} }];
  const has = (f: string) => (report.filters ?? []).some((x) => (x as { fieldname?: string }).fieldname === f);
  if (has("company")) for (const c of Object.keys(store["Company"] ?? {}).slice(0, 2)) out.push({ id: `${report.name}#company=${c}`, report: report.name, filters: { company: c } });
  if (has("project")) {
    const ps = Object.values(store["Project"] ?? {}).filter((p) => p["digit_contract_type"] || p["digit_is_construction"]).map((p) => String(p["name"]));
    for (const p of (ps.length ? ps : Object.keys(store["Project"] ?? {})).slice(0, 3)) out.push({ id: `${report.name}#project=${p}`, report: report.name, filters: { project: p } });
  }
  return out;
}

const norm = (v: unknown): unknown => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Runs the TS runner and the Python port for every case; compares row count, order and every declared column. */
export async function deskParity(names: readonly string[], extra: DeskCase[] = []): Promise<DeskResult[]> {
  const c = await deskCorpus();
  const byName = new Map(c.reports.map((r) => [r.name, r]));
  const cases: DeskCase[] = [];
  for (const n of names) { const r = byName.get(n); if (!r) throw new Error(`Unknown Construction report: ${n}`); cases.push(...defaultCases(r, c.store)); }
  cases.push(...extra);
  const ts = new Map<string, Row[]>();
  for (const k of cases) ts.set(k.id, JSON.parse(JSON.stringify(byName.get(k.report)!.run?.(k.filters) ?? [])) as Row[]);
  const dir = mkdtempSync(path.join(tmpdir(), "desk-reports-"));
  const file = path.join(dir, "corpus.json");
  writeFileSync(file, JSON.stringify({ today: c.today, user: c.user, roles: c.roles, store: c.store, cases }));
  const py = JSON.parse(execFileSync("python3", [CLI, file], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, cwd: APP_DIR })) as Record<string, { rows?: Row[]; error?: string; missing?: boolean }>;
  return cases.map((k) => {
    const want = ts.get(k.id)!, got = py[k.id];
    const base = { id: k.id, report: k.report };
    if (!got || got.missing) return { ...base, ok: false, detail: "not ported" };
    if (got.error) return { ...base, ok: false, detail: got.error };
    const rows = got.rows ?? [];
    if (rows.length !== want.length) return { ...base, ok: false, detail: `rows ${rows.length} != ${want.length}` };
    const cols = (byName.get(k.report)!.columns ?? []).map((x) => String((x as { fieldname: string }).fieldname));
    for (let i = 0; i < want.length; i++) for (const f of cols) {
      const a = norm(want[i]![f]), b = norm(rows[i]![f]);
      if (a !== b) return { ...base, ok: false, detail: `row ${i} ${f}: python ${JSON.stringify(b)} != ts ${JSON.stringify(a)}` };
    }
    return { ...base, ok: true };
  });
}
