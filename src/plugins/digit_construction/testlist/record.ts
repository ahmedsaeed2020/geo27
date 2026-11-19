/**
 * Per-row evidence recorder for the owner test list. Each test-list test records what it checked for its row
 * (present, where, result, how, evidence, fix) and the suite's afterAll writes one JSON file per suite under
 * a temporary directory (CON_TESTRUN_OUT overrides; DIGIT_WRITE_EVIDENCE=1 writes docs/construction/testrun/), which scripts/construction-test-results.py merges into
 * docs/construction/TEST_RESULTS.csv. A row is PASS only when the assertions of its own test passed.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { REPO, type TRow } from "./rows";

export type Present = "YES" | "PARTIAL" | "NO";
export type Result = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTABLE";
export interface Ev {
  present: Present; where: string; result: Result; evidence: string;
  /** what was added / changed in this run so the row passes (FAIL → fixed) */
  fix?: string | undefined;
  /** BLOCKED / NOT_TESTABLE: exact reason and the owner of the next action */
  reason?: string | undefined; owner?: string | undefined;
}
export interface Recorded extends Ev { tid: string; test: string; file: string }

const defaultOutput = mkdtempSync(path.join(tmpdir(), "construction-testrun-"));
const store = new Map<string, Recorded>();
export function record(file: string, row: TRow, testName: string, ev: Ev): Ev {
  store.set(row.tid, { tid: row.tid, test: testName, file, ...ev });
  return ev;
}
export const testName = (row: TRow, label?: string) => `[${row.tid}] ${row.id}${label ? " " + label : ""}`.slice(0, 180);
export function flush(suite: string) {
  const dir = process.env["CON_TESTRUN_OUT"] ?? (process.env["DIGIT_WRITE_EVIDENCE"] === "1" ? path.join(REPO, "docs/construction/testrun") : defaultOutput);
  mkdirSync(dir, { recursive: true });
  const rows = [...store.values()].sort((a, b) => a.tid.localeCompare(b.tid));
  writeFileSync(path.join(dir, `${suite}.json`), JSON.stringify(rows, null, 0).replace(/\},\{/g, "},\n{") + "\n");
}
