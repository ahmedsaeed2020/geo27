import { useState } from "react";
import { adapter } from "@/lib/adapter";
import { Button } from "@/components/ui/button";
import { CrmIcon } from "./icons/CrmIcon";
import { useL } from "./crmI18n";

const general = [
  ["update_timestamp_on_new_communication", "Update timestamp on new communication"],
  ["auto_mark_replied_on_response", "Mark lead/deal as replied on response"],
  ["auto_reopen_on_new_communication", "Reopen lead/deal on new communication"],
] as const;
const defaults = [
  ["currency", "Currency", null],
  ["currency_precision", "Currency Precision", ["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]],
  ["number_format", "Number Format", ["#,###.##", "#.###,##", "# ###.##", "# ###,##", "#'###.##", "#, ###.##", "#,##,###.##", "#,###.###", "#.###", "#,###"]],
  ["float_precision", "Float Precision", ["", "2", "3", "4", "5", "6", "7", "8", "9"]],
  ["date_format", "Date Format", ["yyyy-mm-dd", "dd-mm-yyyy", "dd/mm/yyyy", "dd.mm.yyyy", "mm/dd/yyyy", "mm-dd-yyyy"]],
  ["time_format", "Time Format", ["HH:mm:ss", "HH:mm"]],
] as const;

/** General/Brand use FCRM Settings; Defaults uses System Settings, as in the source stores. */
export function CrmSystemSettings({ section, onSaved }: { section: "General" | "Brand" | "Defaults"; onSaved: () => void }) {
  const { L } = useL();
  const dt = section === "Defaults" ? "System Settings" : "FCRM Settings";
  const [original, setOriginal] = useState<Record<string, unknown>>(() => ({ ...adapter.get(dt, dt) }));
  const [draft, setDraft] = useState(original);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const persist = (values: Record<string, unknown>) => {
    if (adapter.get(dt, dt)) adapter.update(dt, dt, values); else adapter.insertDoc(dt, { name: dt, ...values });
    setOriginal({ ...values });
  };
  const change = (key: string, value: unknown) => {
    const values = { ...draft, [key]: value }; setDraft(values);
    if (section === "General") persist(values);
  };
  const field = (key: string, label: string, options?: readonly string[] | null) => <label key={key} className="flex flex-wrap items-center justify-between gap-3 border-b border-crm-line py-3 text-sm"><span>{L(label)}</span>{options ? <select aria-label={L(label)} className="crm-input w-44" data-no-i18n value={String(draft[key] ?? "")} onChange={e => change(key, e.target.value)}>{options.map(option => <option key={option} value={option}>{["Relative", "Exact", "Oldest First", "Newest First"].includes(option) ? L(option) : option || L("Default")}</option>)}</select> : <input aria-label={L(label)} className="crm-input w-44" data-no-i18n value={String(draft[key] ?? "")} list={key === "currency" ? "crm-default-currencies" : undefined} onChange={e => change(key, e.target.value)} />}</label>;
  const image = (key: string, label: string) => <div key={key} className="flex flex-wrap items-center gap-4 border-b border-crm-line py-4"><div className="flex h-20 w-20 items-center justify-center rounded border border-crm-line">{draft[key] ? <img alt={L(label)} src={String(draft[key])} className="h-8 w-8 object-contain" /> : <CrmIcon name="FileImageIcon" />}</div><span className="flex-1 text-sm">{L(label)}</span><label className="text-sm">{L("Upload")}<input aria-label={L(label)} className="block max-w-48 text-xs" type="file" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { const url = String(reader.result); adapter.insertDoc("File", { file_name: file.name, file_url: url, attached_to_doctype: dt, attached_to_name: dt, is_private: 0 }); change(key, url); }; reader.readAsDataURL(file); }} /></label>{draft[key] ? <Button size="icon" variant="ghost" aria-label={`${L("Remove")} ${L(label)}`} onClick={() => change(key, "")}>×</Button> : null}</div>;
  return <div className="space-y-3">
    {section !== "General" && dirty && <div className="flex justify-end"><Button onClick={() => { persist(draft); onSaved(); }}>{L(section === "Brand" ? "Update" : "Save")}</Button></div>}
    {section === "General" && <>{general.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-4 border-b border-crm-line py-3 text-sm"><span>{L(label)}</span><input role="switch" type="checkbox" aria-label={L(label)} checked={Boolean(Number(draft[key]))} onChange={e => change(key, Number(e.target.checked))} /></label>)}{field("crm_timeline_timestamp_format", "Timeline timestamp format", ["Relative", "Exact"])}{field("crm_timeline_sort_order", "Timeline sort order", ["Oldest First", "Newest First"])}</>}
    {section === "Brand" && <>{field("brand_name", "Brand Name")}{image("brand_logo", "Brand Logo")}{image("favicon", "Favicon")}</>}
    {section === "Defaults" && <>{defaults.map(([key, label, options]) => field(key, label, options))}<datalist id="crm-default-currencies">{adapter.list("Currency").map(currency => <option key={currency.name} value={currency.name} />)}</datalist></>}
  </div>;
}