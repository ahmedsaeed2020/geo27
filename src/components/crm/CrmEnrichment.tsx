import { useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { enrichmentValues, type EnrichmentKind } from "@/lib/crmEnrichment";
import { Button } from "@/components/ui/button";
import { useL } from "./crmI18n";
import { CrmIcon } from "./icons/CrmIcon";
import { Trash2 } from "lucide-react";

export function CrmEnrichment() {
  const { L } = useL(); useStoreVersion();
  const [tab, setTab] = useState<"General" | "Social" | "Industry">("General");
  const [selected, setSelected] = useState<Doc>();
  const [target, setTarget] = useState(""); const [pattern, setPattern] = useState("");
  const [enabled, setEnabled] = useState(true); const [error, setError] = useState("");
  const settings = adapter.get("CRM Enrichment Settings", "CRM Enrichment Settings");
  const update = (values: Record<string, unknown>) => settings ? adapter.update(settings.doctype, settings.name, values) : adapter.insertDoc("CRM Enrichment Settings", { name: "CRM Enrichment Settings", max_pages: 5, ...values });
  const reset = () => { setSelected(undefined); setTarget(""); setPattern(""); setEnabled(true); setError(""); };
  const edit = (r: Doc) => {
    setSelected(r); setTarget(String(r[tab === "Social" ? "target_value" : "industry"] ?? ""));
    const patterns = (Array.isArray(r["patterns"]) ? r["patterns"] : []) as Record<string, unknown>[];
    setPattern(tab === "Social" ? String(patterns.find(p => Number(p["is_regex"]) === 1)?.["pattern"] ?? "") : patterns.filter(p => Number(p["is_regex"]) !== 1).map(p => p["pattern"]).join(", "));
    setEnabled(Boolean(r["enabled"])); setError("");
  };
  return <div className="space-y-4 text-sm">
    <div role="tablist" className="flex gap-2 border-b border-crm-line pb-2">{(["General", "Social", "Industry"] as const).map(t => <Button key={t} role="tab" aria-selected={tab === t} variant={tab === t ? "secondary" : "ghost"} onClick={() => { setTab(t); reset(); }}>{L(t)}</Button>)}</div>
    {tab === "General" ? <div className="space-y-4">
      <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings?.["enabled"])} onChange={e => update({ enabled: Number(e.target.checked) })} />{L("Enable enrichment")}</label>
      {Boolean(settings?.["enabled"]) && <><label className="block">{L("Maximum pages")}<input aria-label={L("Maximum pages")} type="number" min={1} className="crm-input mt-1" value={Number(settings?.["max_pages"] ?? 5)} onChange={e => update({ max_pages: Math.max(1, Number(e.target.value)) })} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(settings?.["auto_enrich"])} onChange={e => update({ auto_enrich: Number(e.target.checked) })} />{L("Auto enrich")}</label></>}
    </div> : <>
      <table className="w-full text-start"><thead><tr className="border-b border-crm-line"><th className="py-2 text-start">{L(tab === "Social" ? "Platform" : "Industry")}</th><th className="text-start">{L(tab === "Social" ? "Pattern" : "Keywords")}</th><th>{L("Enabled")}</th><th /></tr></thead><tbody>{adapter.list("CRM Enrichment Rule").filter(r => r["rule_type"] === tab).map(r => <tr key={r.name} className="border-b border-crm-line"><td className="py-2" data-no-i18n>{String(r[tab === "Social" ? "target_value" : "industry"] ?? "")}</td><td data-no-i18n>{(Array.isArray(r["patterns"]) ? r["patterns"] : []).map((p: Record<string, unknown>) => p["pattern"]).join(", ")}</td><td><input aria-label={L("Enabled") + " " + r.name} type="checkbox" checked={Boolean(r["enabled"])} onChange={e => adapter.update(r.doctype, r.name, { enabled: Number(e.target.checked) })} /></td><td><Button variant="ghost" size="icon" title={L("Edit")} aria-label={L("Edit") + " " + r.name} onClick={() => edit(r)}><CrmIcon name="EditIcon" /></Button><Button variant="ghost" size="icon" title={L("Delete")} aria-label={L("Delete") + " " + r.name} onClick={() => { if (window.confirm(L("Delete rule?"))) { adapter.remove(r.doctype, r.name); if (selected?.name === r.name) reset(); } }}><Trash2 className="h-4 w-4" /></Button></td></tr>)}</tbody></table>
      <div className="space-y-3"><label className="block">{L(tab === "Social" ? "Platform" : "Industry")}<input aria-label={L(tab === "Social" ? "Platform" : "Industry")} className="crm-input mt-1" value={target} onChange={e => setTarget(e.target.value)} /></label><label className="block">{L(tab === "Social" ? "Pattern" : "Keywords")}<input aria-label={L(tab === "Social" ? "Pattern" : "Keywords")} className="crm-input mt-1" value={pattern} onChange={e => setPattern(e.target.value)} /></label><label className="flex gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />{L("Enabled")}</label>{error && <p role="alert" className="text-destructive">{L(error)}</p>}<div className="flex gap-2"><Button onClick={() => { try { const values = { ...enrichmentValues(tab as EnrichmentKind, target, pattern, selected), enabled: Number(enabled) }; if (tab === "Industry" && !adapter.get("CRM Industry", target.trim())) adapter.insertDoc("CRM Industry", { name: target.trim(), industry: target.trim() }); if (selected) adapter.update(selected.doctype, selected.name, values); else adapter.insertDoc("CRM Enrichment Rule", values); reset(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}>{L("Save")}</Button><Button variant="outline" onClick={reset}>{L("Cancel")}</Button></div></div>
    </>}
  </div>;
}