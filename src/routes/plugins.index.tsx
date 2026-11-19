import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/Shell";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { allPlugins, liveManifest, isEnabled, removeImported, resetPluginData, saveImported, setEnabled, usePluginsVersion, importedPlugins } from "@/plugins/runtime";
import { downloadBytes, frappeAppZip } from "@/plugins/export";
import { filesFromFileList, manifestFromFiles } from "@/plugins/importApp";
import type { PluginManifest } from "@/plugins/types";
import { useLang } from "@/i18n";
import { useHydrated } from "@/components/hrms/HrShell";

export const Route = createFileRoute("/plugins/")({
  head: () => ({ meta: [
    { title: "Plugin Manager — Digit Virtual Core" },
    { name: "description", content: "Enable, disable, inspect, reset, import and export Digit apps built on the Plugin SDK." },
    { property: "og:title", content: "Plugin Manager — Digit Virtual Core" },
    { property: "og:description", content: "Manage Digit apps built on the Plugin SDK and export them as DIGIT apps." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PluginManager,
});

export function contents(p: PluginManifest): [string, number][] {
  return ([["DocTypes", p.doctypes?.length], ["Custom Fields", p.custom_fields?.length], ["Property Setters", p.property_setters?.length], ["Client Scripts", p.client_scripts?.length], ["Server Scripts", p.server_scripts?.length], ["Workspaces", p.workspaces?.length], ["Number Cards", p.number_cards?.length], ["Dashboard Charts", p.dashboard_charts?.length], ["Reports", p.reports?.length], ["Print Formats", p.print_formats?.length], ["Notifications", p.notifications?.length], ["Workflows", p.workflows?.length], ["Roles", p.roles?.length], ["Translations", Object.keys(p.translations ?? {}).length], ["Fixtures", p.fixtures?.length]] as [string, number | undefined][]).filter(([, n]) => n).map(([k, n]) => [k, n!]);
}

function PluginManager() {
  usePluginsVersion();
  const qc = useQueryClient(); const lang = useLang();
  const file = useRef<HTMLInputElement>(null); const dir = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const hydrated = useHydrated();
  const imported = new Set(hydrated ? importedPlugins().map((p) => p.name) : []);
  const toggle = (p: PluginManifest, on: boolean) => { try { setEnabled(p.name, on); void qc.invalidateQueries(); toast.success(on ? "Enabled" : "Disabled"); } catch (error) { toast.error(error instanceof Error ? error.message : 'Incompatible source ownership'); } };
  const onImport = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
    const r = manifestFromFiles(await filesFromFileList(list));
    if (!r.manifest) { toast.error(r.errors.join("; ")); return; }
    saveImported(r.manifest); toast.success(`${r.manifest.title}: ${Object.entries(r.counts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    if (r.errors.length) toast.warning(r.errors.slice(0, 3).join("; "));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Source package inspection failed'); }
  };
  return (
    <Shell crumbs={[{ label: "Plugin Manager" }]}>
      <ContextStrip icon={<img src="/icons/digit/ui/digit-ui-dashboard-dark.svg" alt="" />} eyebrow="DIGIT" title="Plugin Manager"
        sub="Apps are loaded additively. Disabling an app removes everything it adds; the core screens return to the original."
        actions={<>
          <button type="button" className="btn-primary" data-band-primary data-import-zip onClick={() => file.current?.click()}>Import app (zip)</button>
          <button type="button" className="btn-ghost" data-import-folder onClick={() => dir.current?.click()}>Import app (folder)</button>
          <input ref={file} type="file" accept=".zip" className="hidden" data-import-input onChange={(e) => { void onImport(e.target.files); e.target.value = ""; }} />
          <input ref={dir} type="file" className="hidden" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} multiple onChange={(e) => { void onImport(e.target.files); e.target.value = ""; }} />
        </>} />
      <div className="mt-4 grid gap-3">
        {hydrated && (() => { const live = liveManifest(); return live ? (
          <section className="rounded-lg border bg-card p-4" data-plugin="site_customizations">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h2 className="font-semibold">{lang === "ar" ? live.title_ar : live.title}</h2>
                <p className="text-sm text-muted-foreground">{([["Custom Fields", live.custom_fields?.length], ["Property Setters", live.property_setters?.length], ["DocTypes", live.doctypes?.length], ["Server Scripts", live.server_scripts?.length], ["Client Scripts", live.client_scripts?.length], ["Workflows", live.workflows?.length]] as [string, number | undefined][]).map(([l, n], i) => <span key={l}>{i ? " · " : ""}<span>{l}</span> <span data-no-i18n>{n ?? 0}</span></span>)}</p>
              </div>
              <button type="button" className="btn-ghost ms-auto" data-export-live onClick={() => downloadBytes(frappeAppZip(live), `site_customizations-${live.version}.zip`)}>Export as DIGIT app</button>
            </div>
          </section>) : null; })()}
        {!hydrated ? <p className="text-muted-foreground">Loading…</p> : allPlugins().map((p) => {
          const on = isEnabled(p.name);
          return (
            <section key={p.name} className="rounded-lg border bg-card p-4" data-plugin={p.name} data-enabled={on ? 1 : 0}>
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <h2 className="font-semibold">{lang === "ar" && p.title_ar ? p.title_ar : p.title} <span className="text-xs text-muted-foreground" data-no-i18n>v{p.version}</span></h2>
                  <p className="text-sm text-muted-foreground">{lang === "ar" && p.description_ar ? p.description_ar : p.description}</p>
                  <p className="text-xs text-muted-foreground"><span data-no-i18n>{p.name}</span> · {p.publisher} · {imported.has(p.name) ? "Imported" : "Built-in"}</p>
                </div>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} data-plugin-toggle onChange={(e) => toggle(p, e.target.checked)} /> {on ? "Enabled" : "Disabled"}</label>
                  {on && (p.workspaces?.length ?? 0) > 0 && <Link to="/plugins/$name" params={{ name: p.name }} className="btn-ghost" data-open-workspace>Open workspace</Link>}
                  <button type="button" className="btn-ghost" onClick={() => setOpen(open === p.name ? null : p.name)}>View contents</button>
                  <button type="button" className="btn-ghost" data-export onClick={() => downloadBytes(frappeAppZip(p), `${p.name}-${p.version}.zip`)}>Export as DIGIT app</button>
                  <button type="button" className="btn-ghost" data-reset onClick={() => { if (confirm("Reset data?")) { const n = resetPluginData(p.name); toast.success(`${n} records reset`); void qc.invalidateQueries(); } }}>Reset data</button>
                  {imported.has(p.name) && <button type="button" className="btn-ghost text-destructive" onClick={() => { if (confirm("Remove?")) { removeImported(p.name); void qc.invalidateQueries(); } }}>Remove</button>}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">{contents(p).map(([k, n]) => <span key={k} className="chip gap-1" data-content={k}><span>{k}</span> <bdi data-no-i18n>{n}</bdi></span>)}</div>
              {open === p.name && <PluginContents p={p} />}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}

function PluginContents({ p }: { p: PluginManifest }) {
  const rows: [string, string, string][] = [
    ...(p.doctypes ?? []).map((d) => ["DocType", d.name, `${d.fields.length} fields`] as [string, string, string]),
    ...(p.custom_fields ?? []).map((c) => ["Custom Field", `${c.dt} › ${c.label}`, `${c.fieldtype} after ${c.insert_after}`] as [string, string, string]),
    ...(p.property_setters ?? []).map((x) => ["Property Setter", `${x.doc_type} › ${x.field_name ?? ""}`, `${x.property} = ${x.value}`] as [string, string, string]),
    ...(p.client_scripts ?? []).map((c) => ["Client Script", c.name, `${c.dt} (${c.view})`] as [string, string, string]),
    ...(p.server_scripts ?? []).map((s) => ["Server Script", s.name, s.script_type === "API" ? `API ${s.api_method}` : `${s.reference_doctype} · ${s.doctype_event}`] as [string, string, string]),
    ...(p.reports ?? []).map((r) => ["Report", r.name, `${r.report_type} on ${r.ref_doctype}`] as [string, string, string]),
    ...(p.print_formats ?? []).map((r) => ["Print Format", r.name, r.doc_type] as [string, string, string]),
    ...(p.number_cards ?? []).map((r) => ["Number Card", r.label, `${r.function} ${r.document_type}`] as [string, string, string]),
    ...(p.dashboard_charts ?? []).map((r) => ["Dashboard Chart", r.chart_name, `${r.chart_type} ${r.document_type}`] as [string, string, string]),
    ...(p.workspaces ?? []).map((r) => ["Workspace", r.label, `${r.shortcuts.length} shortcuts`] as [string, string, string]),
    ...(p.notifications ?? []).map((r) => ["Notification", r.name, `${r.document_type} · ${r.event}`] as [string, string, string]),
    ...(p.roles ?? []).map((r) => ["Role", r, ""] as [string, string, string]),
  ];
  return (
    <table className="mt-3 w-full text-sm" data-plugin-contents>
      <tbody>{rows.map(([k, n, d], i) => <tr key={i} className="border-t"><td className="py-1 pe-3 text-muted-foreground">{k}</td><td className="py-1 pe-3">{n}</td><td className="py-1 text-muted-foreground">{d}</td></tr>)}</tbody>
    </table>
  );
}
