/**
 * Scheduled report e-mail (frappe/email/doctype/auto_email_report — research topic "Export Options": scheduled delivery of
 * a saved report, as NetSuite saved-search e-mail, D365 / Sage report scheduling). Ports get_report_content, the dynamic
 * date period (prepare_dynamic_filters), send_if_data, no_of_rows and get_html_table over the SAME local report runner the
 * report screen uses, with rows limited by the record user's permissions. "Download" builds the file in the chosen format;
 * "Send Now" hands the mail to the shared e-mail provider (Communication + integration log) — actual delivery needs the
 * outgoing mail server connected in Administration › Integrations. Nothing here posts or changes business records.
 */
import type { Doc } from "./adapter";
import { RUNNERS, runnerDefaults, type F, type Row } from "./reportRunner";
import { filterReportRows } from "./session";
import { enabledPlugins } from "@/plugins/runtime";
import { exportMatrix, toCsv, type WbColumn } from "./reportWorkbench";
import { queueEmail } from "./coreShared/providers";

export type AutoEmailFormat = "HTML" | "XLSX" | "CSV" | "PDF";
export interface AutoEmailContent { ok: true; columns: WbColumn[]; rows: Row[]; filters: F; total: number } 
export type AutoEmailResult = AutoEmailContent | { ok: false; reason: string };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** auto_email_report.py prepare_dynamic_filters: the period ends today and starts one period back (first day when asked). */
export function dynamicPeriod(period: string, today: string, firstDay = false): { from: string; to: string } | null {
  const t = new Date(`${today}T00:00:00Z`); const f = new Date(t);
  switch (period) {
    case "Daily": f.setUTCDate(f.getUTCDate() - 1); break;
    case "Weekly": f.setUTCDate(f.getUTCDate() - 7); break;
    case "Monthly": f.setUTCMonth(f.getUTCMonth() - 1); break;
    case "Quarterly": f.setUTCMonth(f.getUTCMonth() - 3); break;
    case "Half Yearly": f.setUTCMonth(f.getUTCMonth() - 6); break;
    case "Yearly": f.setUTCFullYear(f.getUTCFullYear() - 1); break;
    default: return null;
  }
  if (firstDay) {
    if (period === "Weekly") { const wd = (f.getUTCDay() + 6) % 7; f.setUTCDate(f.getUTCDate() - wd); }
    else if (period !== "Daily") f.setUTCDate(1);
    if (period === "Quarterly") f.setUTCMonth(Math.floor(f.getUTCMonth() / 3) * 3);
    if (period === "Half Yearly") f.setUTCMonth(Math.floor(f.getUTCMonth() / 6) * 6);
    if (period === "Yearly") f.setUTCMonth(0);
  }
  return { from: iso(f), to: iso(t) };
}

/** The record's stored report filters (JSON text) with the dynamic date period applied to its from / to date fields. */
export function autoEmailFilters(d: Doc, today = iso(new Date())): F {
  let stored: Record<string, unknown> = {};
  try { const raw = d["filters"]; stored = typeof raw === "string" && raw.trim() ? JSON.parse(raw) as Record<string, unknown> : raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; } catch { stored = {}; }
  const f: F = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  const p = dynamicPeriod(String(d["dynamic_date_period"] ?? ""), today, !!Number(d["use_first_day_of_period"]));
  if (p) { const fr = String(d["from_date_field"] ?? ""), to = String(d["to_date_field"] ?? ""); if (fr) f[fr] = p.from; if (to) f[to] = p.to; }
  return f;
}

/**
 * An enabled DIGIT app's Script Report (manifest `reports[].run`, the same function its report screen runs) as a runner,
 * so a saved Auto Email Report of an app report is sent with the rows the app's report page shows.
 */
function appReportRunner(name: string): (typeof RUNNERS)[string] | undefined {
  const rep = enabledPlugins().flatMap((p) => p.reports ?? []).find((x) => x.name === name && typeof x.run === "function");
  if (!rep) return undefined;
  const columns = rep.columns.map((c) => ({ ...c })) as unknown as ReturnType<(typeof RUNNERS)[string]["run"]>["columns"];
  return { src: `app report ${name}`, filters: [], run: (f: F) => { try { return { columns, rows: rep.run!(f) as Row[] }; } catch (e) { return { columns: [], rows: [], error: (e as Error).message }; } } } as unknown as (typeof RUNNERS)[string];
}

/** get_report_content: run the report for the record user, keep at most no_of_rows rows (100 when unset). */
export function autoEmailContent(d: Doc, today?: string): AutoEmailResult {
  const report = String(d["report"] ?? ""); const rn = RUNNERS[report] ?? appReportRunner(report);
  if (!rn) return { ok: false, reason: `The report "${report}" has no preview runner here.` };
  const filters = { ...(RUNNERS[report] ? runnerDefaults(report) : {}), ...autoEmailFilters(d, today) };
  const r = rn.run(filters); if (r.error) return { ok: false, reason: r.error };
  const user = String(d["user"] ?? "") || undefined;
  const kept = filterReportRows(r.rows as Row[], user).filter((x) => !x.is_total);
  const limit = Number(d["no_of_rows"]) > 0 ? Number(d["no_of_rows"]) : 100;
  const columns = r.columns.filter((c) => !c.hidden).map((c) => ({ fieldname: c.fieldname, label: c.label, fieldtype: c.fieldtype, options: c.options }));
  return { ok: true, columns, rows: kept.slice(0, limit), filters, total: kept.length };
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** get_html_table: the report title, the applied filters and the rows as an e-mail-safe table. */
export function autoEmailHtml(d: Doc, c: AutoEmailContent): string {
  const head = c.columns.map((x) => `<th style="text-align:start;border-bottom:1px solid #ccc;padding:4px 8px">${esc(x.label)}</th>`).join("");
  const body = c.rows.map((r) => `<tr>${c.columns.map((x) => `<td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(r[x.fieldname])}</td>`).join("")}</tr>`).join("");
  const filters = Object.entries(c.filters).filter(([, v]) => v).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ");
  return `<h3>${esc(d["report"])}</h3>${filters ? `<p style="color:#666">${filters}</p>` : ""}<table style="border-collapse:collapse;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${c.total > c.rows.length ? `<p style="color:#666">${c.rows.length} of ${c.total} rows</p>` : ""}`;
}

/** The attachment in the record's format (PDF prints the HTML table in the preview; a server renders the PDF itself). */
export function autoEmailFile(d: Doc, c: AutoEmailContent): { name: string; mime: string; data: string; format: AutoEmailFormat } {
  const fmt = (String(d["format"] ?? "HTML") as AutoEmailFormat); const base = String(d["report"] ?? "report").replace(/[^\w\u0600-\u06FF -]+/g, "").trim() || "report";
  if (fmt === "CSV" || fmt === "XLSX") return { name: `${base}.csv`, mime: "text/csv", data: toCsv(exportMatrix(c.columns, c.rows, { includeFilters: true, appliedFilters: c.filters })), format: fmt };
  return { name: `${base}.html`, mime: "text/html", data: `<!doctype html><meta charset="utf-8">${autoEmailHtml(d, c)}`, format: fmt };
}

/** send_now: e-mail the report to email_to through the shared e-mail provider; send_if_data skips an empty report. */
export function sendAutoEmail(d: Doc, today?: string): { ok: true; message: string; skipped?: boolean } | { ok: false; reason: string } {
  if (!Number(d["enabled"] ?? 1) && d["enabled"] !== undefined) return { ok: false, reason: "This auto e-mail report is disabled." };
  const c = autoEmailContent(d, today); if (!c.ok) return c;
  if (Number(d["send_if_data"]) && !c.rows.length) return { ok: true, skipped: true, message: "No data — nothing sent (Send only if there is any data)." };
  const to = String(d["email_to"] ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).join(", ");
  const r = queueEmail({ to, subject: `${String(d["report"] ?? "")} — ${today ?? iso(new Date())}`, body: autoEmailHtml(d, c), doctype: "Auto Email Report", name: d.name });
  if (!r.ok) return { ok: false, reason: r.reason[0] };
  return { ok: true, message: `${c.rows.length} rows e-mailed to ${to} (${r.log.status === "Sent" ? "sent" : "queued until the outgoing mail server is connected in Administration"})` };
}
