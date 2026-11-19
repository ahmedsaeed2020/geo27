/**
 * Owner test list (docs/construction/source/DIGIT_CON_TEST_LIST.csv, 4,381 rows) — loaded by the test-list suites
 * (testlist/*.test.ts) so every row is checked by a real automated test and gets its own recorded result.
 * Node-only (tests and scripts); never imported by screens.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface TRow {
  tid: string; scope: "OLD" | "NEW"; sheet: number; sheetName: string; id: string; dept: string;
  features: string; where: string; idea: string; must: string;
}

export const REPO = path.resolve(__dirname, "../../../..");
export const LIST_CSV = path.join(REPO, "docs/construction/source/DIGIT_CON_TEST_LIST.csv");

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x !== ""));
}

let cache: TRow[] | null = null;
const clean = (s: string | undefined) => { const v = (s ?? "").trim(); return v === "nan" ? "" : v; };
/** Department "01".."09" from the messy Dept column ("02 المشاريع…", "Dept01", "05 09"), else from the feature id. */
export function deptOf(dept: string, features: string, id: string): string {
  const m = /(?:^|Dept)(0[1-9])/.exec(dept) ?? /F[TF]?-?(0[1-9])/.exec(features) ?? /-(0[1-9])-/.exec(id) ?? /^[A-Z]+-?(0[1-9])/.exec(id);
  return m ? m[1]! : "00";
}
export function allRows(): TRow[] {
  if (cache) return cache;
  const [head, ...body] = parseCsv(readFileSync(LIST_CSV, "utf8").replace(/^\uFEFF/, ""));
  const ix = (n: string) => head!.findIndex((h) => h.startsWith(n));
  const I = { tid: ix("Test_ID"), scope: ix("Scope"), sheet: ix("Sheet"), id: ix("ID"), dept: ix("Dept"), features: ix("Features"), where: ix("Where"), idea: ix("Idea"), must: ix("Must_be_true") };
  cache = body.map((r) => {
    const sheetName = clean(r[I.sheet]); const features = clean(r[I.features]); const id = clean(r[I.id]);
    return {
      tid: clean(r[I.tid]), scope: clean(r[I.scope]).startsWith("OLD") ? "OLD" : "NEW", sheet: Number(/^\d+/.exec(sheetName)?.[0] ?? -1), sheetName,
      id, dept: deptOf(clean(r[I.dept]), features, id), features, where: clean(r[I.where]), idea: clean(r[I.idea]), must: clean(r[I.must]),
    } as TRow;
  });
  return cache;
}
export const rowsOf = (sheet: number, scope?: "OLD" | "NEW") => allRows().filter((r) => r.sheet === sheet && (!scope || r.scope === scope));
/** Split "k: v | k2: v2" must-be-true text into a map (keys trimmed). */
export function kv(s: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const part of s.split("|")) { const m = /^\s*([^:]{1,40}):\s*([\s\S]*)$/.exec(part); if (m) o[m[1]!.trim()] = m[2]!.trim(); }
  return o;
}
