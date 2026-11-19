import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { InsightsShell, ServerTag } from "@/components/insights/InsightsShell";

export const Route = createFileRoute("/insights/settings")({
  head: () => ({ meta: [{ title: "Settings — Insights · Digit Virtual Core" }, { name: "description", content: "Insights general, users, permissions and data store settings." }, { property: "og:title", content: "Settings — Insights" }, { property: "og:description", content: "Insights general, users, permissions and data store settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Settings,
});

const TABS = ["Profile", "General", "Users", "Permissions", "Data Store"] as const;
const GENERAL: [string, string, "check" | "int" | "select"][] = [
  ["auto_execute_query", "Auto execute query", "check"], ["query_result_limit", "Query result limit", "int"], ["query_result_expiry", "Query result expiry (minutes)", "int"],
  ["allow_subquery", "Allow subquery", "check"], ["allow_download", "Allow download", "check"], ["max_export_rows", "Max export rows", "int"],
  ["week_starts_on", "Week starts on", "select"], ["max_execution_time", "Max execution time (s)", "int"],
];
/** settings/Settings.vue (a dialog in source; tab groups Profile / General, Users, Permissions, Data Store) backed by the Insights Settings single. */
function Settings() {
  useStoreVersion();
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  const s = adapter.get("Insights Settings", "Insights Settings") ?? { name: "Insights Settings", doctype: "Insights Settings" };
  const up = (k: string, v: unknown) => adapter.update("Insights Settings", "Insights Settings", { [k]: v });
  const check = (k: string, l: string) => <label key={k} className="flex items-center justify-between py-1.5"><span>{l}</span><input type="checkbox" aria-label={l} checked={!!s[k]} onChange={(e) => up(k, e.target.checked ? 1 : 0)} /></label>;
  return (
    <InsightsShell header={<span className="text-lg font-semibold">Settings</span>}>
      <div className="flex">
        <nav className="w-44 space-y-0.5 border-e border-crm-line p-3 text-sm">{TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`block w-full rounded px-2 py-1 text-left ${tab === t ? "bg-crm-hover" : ""}`}>{t}</button>)}</nav>
        <div className="max-w-xl flex-1 divide-y divide-crm-line p-5 text-sm">
          {tab === "Profile" && <p>Administrator · <span className="text-crm-muted">profile changes are User records on the server</span></p>}
          {tab === "General" && GENERAL.map(([k, l, t]) => t === "check" ? check(k, l) : (
            <label key={k} className="flex items-center justify-between py-1.5"><span>{l}</span>
              {t === "int" ? <input type="number" aria-label={l} className="crm-input w-28" value={Number(s[k] ?? 0)} onChange={(e) => up(k, Number(e.target.value))} />
                : <select aria-label={l} className="crm-input w-32" value={String(s[k] ?? "Monday")} onChange={(e) => up(k, e.target.value)}>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => <option key={d} value={d}>{d}</option>)}</select>}</label>))}
          {tab === "Users" && <div className="space-y-2"><p>Administrator (Admin)</p><ServerTag title="Invitations send email via Insights User Invitation">Invite user</ServerTag></div>}
          {tab === "Permissions" && <>{check("enable_permissions", "Enable permissions")}<p className="pt-2 text-xs text-crm-muted">Team table restrictions (Insights Team / Insights Resource Permission) are enforced by the server query engine.</p></>}
          {tab === "Data Store" && <>{check("enable_data_store", "Enable data store")}<p className="pt-2 text-xs text-crm-muted">Shows Data Store in the sidebar. Syncing tables is server-dependent.</p></>}
        </div>
      </div>
    </InsightsShell>
  );
}
