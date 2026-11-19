import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Shell } from "@/components/Shell";
import { indexQuery, loadMeta, LAYOUT_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { formRulesQuery } from "@/lib/formRules";
import { API_EXAMPLES, virtualApi, type ApiResult } from "@/plugins/api";
import { clientScripts, enabledPlugins, eventLog, useEventLog, usePluginsVersion } from "@/plugins/runtime";
import { downloadBytes } from "@/plugins/export";
import { strToU8 } from "fflate";
import { CapabilityExplorer } from '@/components/plugins/CapabilityExplorer';
import { Button } from '@/components/ui/button';
import { useLang } from '@/i18n';

export const Route = createFileRoute("/developer/sdk")({
  head: () => ({ meta: [
    { title: "Source Capability Explorer — DIGIT Virtual Core SDK" },
    { name: "description", content: "Source ownership, schema relationships, actions, workflows, reports, customization and app-building capability handoff." },
    { property: "og:title", content: "Source Capability Explorer — DIGIT Virtual Core SDK" },
    { property: "og:description", content: "Inspect native source capabilities and build additive DIGIT applications without duplicating Core." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DevSdk,
});

function DevSdk() {
  const [tab, setTab] = useState<"api" | "meta" | "events" | 'capabilities'>("api");
  const ar = useLang() === 'ar';
  return (
    <Shell crumbs={[{ label: "Developer" }]}>
      <h1 className="text-xl font-semibold">Developer</h1>
      <div className="mt-3 flex flex-wrap gap-2 border-b" role="tablist">
        {([["api", "API Explorer", 'مستكشف الواجهات'], ["meta", "Meta Viewer", 'البيانات الوصفية'], ["events", "Event Log", 'سجل الأحداث'], ['capabilities', 'Source Capabilities', 'قدرات المصادر']] as const).map(([k, l, arabic]) => <Button key={k} variant="ghost" type="button" role="tab" aria-selected={tab === k} data-dev-tab={k} className={`px-3 py-2 text-sm ${tab === k ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`} onClick={() => setTab(k)}>{ar ? arabic : l}</Button>)}
      </div>
      <div className="mt-4">{tab === "api" ? <ApiExplorer /> : tab === "meta" ? <MetaViewer /> : tab === 'events' ? <Events /> : <CapabilityExplorer />}</div>
    </Shell>
  );
}

function ApiExplorer() {
  const [m, setM] = useState("GET"); const [path, setPath] = useState(API_EXAMPLES[0]![1]); const [body, setBody] = useState("");
  const [res, setRes] = useState<ApiResult | null>(null);
  const send = () => { let b: Record<string, unknown> = {}; try { b = body.trim() ? JSON.parse(body) : {}; } catch { setRes({ status: 400, body: { message: "Body is not valid JSON" } }); return; } setRes(virtualApi(m, path, b)); };
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">{API_EXAMPLES.map(([em, ep, eb]) => <button key={ep} type="button" className="chip" data-no-i18n onClick={() => { setM(em); setPath(ep); setBody(eb); }}>{em} {ep.split("?")[0]}</button>)}</div>
      <div className="flex gap-2" data-no-i18n>
        <select className="field-input w-28" value={m} onChange={(e) => setM(e.target.value)} data-api-method>{["GET", "POST", "PUT", "DELETE"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <input className="field-input flex-1 font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} data-api-path />
        <button type="button" className="btn-primary" data-api-send onClick={send}>Send</button>
      </div>
      <textarea className="field-input h-24 font-mono text-xs" placeholder="JSON body" value={body} onChange={(e) => setBody(e.target.value)} data-api-body />
      {res && <pre className="max-h-[480px] overflow-auto rounded border bg-muted/40 p-3 text-xs" data-api-result data-status={res.status}>{`HTTP ${res.status}\n${JSON.stringify(res.body, null, 1)}`}</pre>}
    </div>
  );
}

function specOf(meta: DocTypeMeta, rules: number) {
  const fields = meta.fields.filter((f) => f.fieldname);
  const scripts = clientScripts(meta.name).map((c) => c.name);
  const server = enabledPlugins().flatMap((p) => (p.server_scripts ?? []).filter((s) => s.reference_doctype === meta.name).map((s) => `${s.doctype_event}: ${s.name} (${p.name})`));
  const md = [`# ${meta.name}`, "", `- App: ${meta.app} · Module: ${meta.module} · Source: ${meta.source}`, `- Submittable: ${meta.is_submittable ? "yes" : "no"} · Single: ${meta.issingle ? "yes" : "no"} · Tree: ${meta.is_tree ? "yes" : "no"}`, `- Ported form rules: ${rules}`, "",
    "## Screens", `- List: /app/${meta.app}/${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, `- Form: /app/${meta.app}/${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}/<name>`, "",
    "## Fields", "| Fieldname | Type | Label | Options | Reqd | Custom |", "|---|---|---|---|---|---|",
    ...fields.map((f) => `| ${f.fieldname} | ${f.fieldtype} | ${f.label ?? ""} | ${String(f.options ?? "").replace(/\n/g, " / ")} | ${f.reqd ? "✓" : ""} | ${f["is_custom_field"] ? "✓" : ""} |`), "",
    "## Permissions", ...meta.permissions.map((p) => `- ${String(p["role"])}: ${["read", "write", "create", "delete", "submit", "cancel"].filter((k) => p[k]).join(", ")}`), "",
    "## Behaviors", `- Client Scripts (plugins): ${scripts.join(", ") || "none"}`, `- Server Scripts (plugins): ${server.join(", ") || "none"}`, `- Connections: ${meta.links.map((l) => l.link_doctype).join(", ") || "none"}`, ""].join("\n");
  return { md, json: { name: meta.name, app: meta.app, module: meta.module, fields, permissions: meta.permissions, links: meta.links, client_scripts: scripts, server_scripts: server, form_rules: rules } };
}

function MetaViewer() {
  usePluginsVersion();
  const idx = useQuery(indexQuery); const rulesQ = useQuery(formRulesQuery);
  const [dt, setDt] = useState("Customer"); const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const load = async (n: string) => { setDt(n); if (idx.data) setMeta((await loadMeta(idx.data, n)) ?? null); };
  if (!idx.data) return <p className="text-muted-foreground">Loading…</p>;
  if (!meta && dt) void load(dt);
  const rules = meta ? Object.values(rulesQ.data?.[meta.name] ?? {}).flat().length : 0;
  const spec = meta ? specOf(meta, rules) : null;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <input className="field-input w-72" list="dt-list" value={dt} data-no-i18n data-meta-doctype onChange={(e) => { setDt(e.target.value); if (idx.data!.some((i) => i.name === e.target.value)) void load(e.target.value); }} />
        <datalist id="dt-list">{idx.data.map((i) => <option key={i.name} value={i.name} />)}</datalist>
        {spec && <><button type="button" className="btn-ghost" data-spec-md onClick={() => downloadBytes(strToU8(spec.md), `${meta!.name}.spec.md`, "text/markdown")}>Spec export (Markdown)</button>
          <button type="button" className="btn-ghost" data-spec-json onClick={() => downloadBytes(strToU8(JSON.stringify(spec.json, null, 1)), `${meta!.name}.spec.json`, "application/json")}>Spec export (JSON)</button></>}
      </div>
      {meta && (
        <>
          <p className="text-sm text-muted-foreground" data-no-i18n>{meta.app} · {meta.module} · {meta.source}</p>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs" data-meta-fields>
              <thead className="bg-muted/50"><tr>{["Fieldname", "Type", "Label", "Options", "Reqd", "Custom"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
              <tbody>{meta.fields.filter((f) => f.fieldname).map((f) => <tr key={f.fieldname} className={`border-t ${LAYOUT_TYPES.has(f.fieldtype) ? "text-muted-foreground" : ""}`} data-custom={f["is_custom_field"] ? 1 : 0}><td className="px-2 py-1 font-mono">{f.fieldname}</td><td className="px-2 py-1">{f.fieldtype}</td><td className="px-2 py-1">{f.label}</td><td className="px-2 py-1 font-mono" data-no-i18n>{String(f.options ?? "").slice(0, 40)}</td><td className="px-2 py-1">{f.reqd ? "✓" : ""}</td><td className="px-2 py-1">{f["is_custom_field"] ? "✓" : ""}</td></tr>)}</tbody>
            </table>
          </div>
          <pre className="rounded border bg-muted/40 p-3 text-xs" data-no-i18n>{spec!.md.split("## Permissions")[1]}</pre>
        </>
      )}
    </div>
  );
}

function Events() {
  useEventLog();
  const rows = eventLog();
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs" data-event-log>
        <thead className="bg-muted/50"><tr>{["Time", "Kind", "DocType", "Name", "Event", "Detail"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map((r, i) => <tr key={i} className="border-t"><td className="px-2 py-1 tabular-nums" data-no-i18n>{r.at.slice(11, 19)}</td><td className="px-2 py-1">{r.kind}</td><td className="px-2 py-1">{r.doctype}</td><td className="px-2 py-1" data-no-i18n>{r.name}</td><td className="px-2 py-1" data-no-i18n>{r.event}</td><td className="px-2 py-1" data-no-i18n>{r.detail}</td></tr>) : <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">No events yet</td></tr>}</tbody>
      </table>
    </div>
  );
}
