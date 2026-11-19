/**
 * E5-b — KPI cards from saved queries: every Insights Query v3 the user can read is offered in the workspace widget
 * catalog (not in the default layout), so a user adds it to their personal dashboard and saves it. The value is the
 * query's own result (src/lib/insights.ts runQuery, permission-scoped site tables): a one-row result shows its first
 * numeric column, any other result shows its row count. Nothing is stored besides the user's layout.
 */
import { adapter, type Doc } from "@/lib/adapter";
import type { WidgetData, WidgetDef } from "@/lib/dashboards/registry";
import type { Bi } from "@/lib/dashboards/views";
import { parseJSON, runQuery, type Operation } from "@/lib/insights";
import { can } from "./finance";

export const SAVED_QUERY_GROUP: Bi = ["Saved queries", "الاستعلامات المحفوظة"];
export interface SavedQueryValue { status: "ok" | "empty" | "unavailable"; value: number; basis: "value" | "rows"; column?: string | undefined; server: string[] }

export function savedQueryValue(q: Doc): SavedQueryValue {
  const r = runQuery(parseJSON<Operation[]>(q["operations"], []));
  if (r.server.length) return { status: "unavailable", value: 0, basis: "rows", server: r.server };
  if (r.rows.length === 1) {
    const row = r.rows[0]!; const col = r.columns.find((c) => typeof row[c.name] === "number" && Number.isFinite(row[c.name] as number));
    if (col) return { status: "ok", value: row[col.name] as number, basis: "value", column: col.name, server: [] };
  }
  return { status: r.rows.length ? "ok" : "empty", value: r.rows.length, basis: "rows", server: [] };
}

export const savedQueries = (user: string): Doc[] => (can("Insights Query v3", "read", undefined, user) ? adapter.list("Insights Query v3") : []);
/** Cache key part: the dashboard contract is rebuilt when saved queries are added, renamed or removed. */
export const savedQuerySignature = () => adapter.list("Insights Query v3").map((q) => `${q.name}:${String(q["title"] ?? "")}`).join("|");

export function savedQueryWidgets<C extends { pane: { user: string } }>(): WidgetDef<C>[] {
  return adapter.list("Insights Query v3").map((q): WidgetDef<C> => {
    const title = String(q["title"] || q.name);
    return {
      id: `query:${q.name}`, version: 1, title: [title, title], group: SAVED_QUERY_GROUP, inDefault: false,
      meaning: [`Saved query "${title}": the first number of a one-row result, otherwise the number of rows.`, `الاستعلام المحفوظ "${title}": أول رقم في نتيجة من صف واحد، وإلا عدد الصفوف.`],
      sources: ["Insights Query v3"], shape: "number", defaultView: "kpi", size: { w: 3 },
      readable: (c) => can("Insights Query v3", "read", undefined, c.pane.user),
      data: (): WidgetData => {
        const cur = adapter.get("Insights Query v3", q.name);
        if (!cur) return { kind: "number", status: "unavailable", value: 0, reason: ["This saved query was removed.", "حُذف هذا الاستعلام المحفوظ."] };
        const v = savedQueryValue(cur);
        if (v.status === "unavailable") return { kind: "number", status: "unavailable", value: 0, reason: ["Part of this query needs the Insights server.", "جزء من هذا الاستعلام يحتاج خادم Insights."] };
        return { kind: "number", status: v.status, value: v.value, sub: [v.basis === "value" ? String(v.column) : "rows"] };
      },
    };
  });
}
