// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { DevOnly } from "@/components/DevOnly";
import { useDevMode } from "@/lib/mode";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LIST_CONFIGS, rowsFor } from "@/lib/hrms";
import { useStoreVersion } from "@/lib/adapter";
import { BaseLayout, EmptyState, FilterPanel, Row, StatusChip, TabButtons } from "./HrShell";

/**
 * Reconstruction of hrms/frontend/src/components/ListView.vue with the
 * per-view constants (fields, tab buttons, filter config) from the Vue views.
 */
export function HrListView({ cfgKey }: { cfgKey: keyof typeof LIST_CONFIGS }) {
  const cfg = LIST_CONFIGS[cfgKey]!;
  useStoreVersion();
  const [tab, setTab] = useState(cfg.tabButtons?.[0] ?? "");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const all = rowsFor(cfg, tab);
  const rows = all.filter((d) =>
    cfg.filterConfig.every((f) => {
      const want = filters[f.fieldname];
      if (!want) return true;
      return String(d[f.fieldname] ?? "").slice(0, f.fieldtype === "Date" ? 10 : undefined) === want;
    }),
  );
  const fmt = (k: string, v: unknown) => {
    if (k === "docstatus") return ["Draft", "Submitted", "Cancelled"][Number(v) || 0];
    if (/amount|total/.test(k) && v != null) return `${Number(v).toLocaleString()} SAR`;
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : String(v ?? "");
  };
  const statusField = cfg.fields.find((f) => ["status", "approval_status", "log_type"].includes(f));
  const titleField = cfg.fields[1] === "employee" ? "employee_name" : cfg.fields[0] ?? "name";
  const subtitle = (d: Record<string, unknown>) =>
    cfg.fields.filter((f) => f !== titleField && !["status", "approval_status", "log_type"].includes(f))
      .map((f) => `${f.replace(/_/g, " ")}: ${fmt(f, d[f])}`).join(" · ");
  const amount = (d: Record<string, unknown>) =>
    /amount/.test(cfg.fields.join()) ? fmt("total", d["grand_total"] ?? d["advance_amount"] ?? d["total_claimed_amount"]) : undefined;

  return (
    <BaseLayout title={cfg.title} tabs>
      <DevOnly><p className="mb-3 text-[11px] text-muted-foreground">Reconstructed from {cfg.source} — list fields, tabs and filters in source order.</p></DevOnly>
      {cfg.tabButtons && <TabButtons buttons={cfg.tabButtons} value={tab} onChange={setTab} />}
      <FilterPanel filters={cfg.filterConfig} values={filters} onChange={setFilters} />
      {cfg.newPath && <Link to={cfg.newPath} className="btn-primary mb-3 block text-center">New {cfg.doctype}</Link>}
      <div className="rounded-lg bg-card">
        {rows.length ? rows.map((d) => (
          cfg.idPath ? (
            <Link key={String(d.name)} to={cfg.idPath} params={{ id: String(d.name) }}>
              <Row title={String(d[titleField] ?? d.name)} subtitle={subtitle(d)} status={statusField ? d[statusField] : undefined} amount={amount(d)} />
            </Link>
          ) : (
            <Row key={String(d.name)} title={String(d[titleField] ?? d.name)} subtitle={subtitle(d)} status={statusField ? d[statusField] : undefined} />
          )
        )) : <EmptyState message={`No ${cfg.doctype.toLowerCase()} records${tab ? ` (${tab.toLowerCase()})` : ""}`} />}
      </div>
      {cfg.doctype === "Employee Checkin" && (
        <DevOnly><p className="mt-2 text-[11px] text-muted-foreground">Check-ins are created from the Home tab check-in button (local simulation, no device sync).</p></DevOnly>
      )}
      {statusField === "docstatus" && <DevOnly><p className="mt-2 text-[11px] text-muted-foreground">Doc status shown from the record; submit happens on the form (simulated).</p></DevOnly>}
      <DevOnly><p className="mt-2 text-[11px] text-muted-foreground"><StatusChip value="" /> Filters apply to the same shared records as the Desk lists.</p></DevOnly>
    </BaseLayout>
  );
}
