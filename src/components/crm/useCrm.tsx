import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { indexQuery, loadMeta, type DocField, type DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { arabizeSeed, CRM_MKEY } from "@/lib/seedNamesAr";
import { crmDefaultsQuery, crmLayoutsQuery, seedCrm, seedCrmDirectory, type CrmDefaults, type LayoutSection } from "@/lib/crm";
import { linkTitle } from "@/lib/linkTitle";
import { t } from "@/i18n";
import { evalDepends } from "@/lib/depends";
import { CRM_AR, dval, useL } from "./crmI18n";
import { CrmProducts } from "./CrmProducts";
import { CrmDuration, CrmImageUploader, CrmRating, CrmTableMultiSelect } from "./CrmControls";
import { DateInput } from "@/components/form/DateInput";

export interface CrmBundle {
  lead: DocTypeMeta; deal: DocTypeMeta; note: DocTypeMeta; task: DocTypeMeta;
  defaults: CrmDefaults; layouts: Record<string, { doctype: string; type: string; layout: LayoutSection[] }>;
}

export function useCrm(): CrmBundle | null {
  const idx = useQuery(indexQuery);
  const defaults = useQuery(crmDefaultsQuery);
  const layouts = useQuery(crmLayoutsQuery);
  const [metas, setMetas] = useState<DocTypeMeta[] | null>(null);
  const [seeded, setSeeded] = useState(false);
  useStoreVersion();
  useEffect(() => {
    if (!idx.data) return;
    Promise.all(["CRM Lead", "CRM Deal", "FCRM Note", "CRM Task"].map((n) => loadMeta(idx.data!, n))).then((m) => setMetas(m as DocTypeMeta[]));
  }, [idx.data]);
  useEffect(() => {
    if (metas && defaults.data && !seeded) { seedCrm(defaults.data, metas[0]!, metas[1]!); seedCrmDirectory(); arabizeSeed(CRM_MKEY); setSeeded(true); }
  }, [metas, defaults.data, seeded]);
  if (!metas || !defaults.data || !layouts.data || !seeded) return null;
  const effectiveLayouts = { ...layouts.data };
  for (const record of adapter.list("CRM Fields Layout")) {
    const key = `${String(record["dt"])}-${String(record["type"])}`;
    try {
      const layout = typeof record["layout"] === "string" ? JSON.parse(record["layout"]) : record["layout"];
      if (Array.isArray(layout)) effectiveLayouts[key] = { doctype: String(record["dt"]), type: String(record["type"]), layout };
    } catch { /* Keep the frozen source layout when a saved record is malformed. */ }
  }
  return { lead: metas[0]!, deal: metas[1]!, note: metas[2]!, task: metas[3]!, defaults: defaults.data, layouts: effectiveLayouts };
}

export function statusColor(b: CrmBundle, kind: "lead" | "deal", status: unknown) {
  const m = kind === "lead" ? b.defaults.lead_statuses : b.defaults.deal_statuses;
  return m[String(status)]?.color ?? "gray";
}

/** Link input that shows a display-only label while not focused — the linked record's title (linkTitle, e.g. the
 *  organization name) or an Arabic label (e.g. city); on focus it shows and edits the stored value, which never changes. */
function LinkInput({ value, doctype, placeholder, ...p }: { value: string; doctype: string | undefined; list: string; disabled: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string | undefined }) {
  const { lang } = useL();
  const [focus, setFocus] = useState(false);
  const title = linkTitle(doctype, value);
  const shown = focus ? value : lang === "ar" ? CRM_AR[value] ?? title : title;
  return <input {...p} data-no-i18n className="crm-input" value={shown} placeholder={placeholder ? phText(placeholder, lang) : undefined} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} />;
}

/** Single field rendered in the frappe-ui compact style used by CRM FieldLayout / SidePanelLayout. */
/** Placeholder text in the user's language (attributes are skipped by the DOM translation layer). */
const phText = (s: string, lang: string) => (lang === "ar" ? CRM_AR[s] ?? t(s) : s);

export function CrmField({ f, doc, onChange, b, inline }: { f: DocField | undefined; doc: Doc; onChange: (k: string, v: unknown) => void; b: CrmBundle; inline?: boolean | undefined }) {
  const { lang } = useL();
  if (!f || !f.fieldname) return null;
  const ph = typeof f["placeholder"] === "string" && f["placeholder"] ? phText(f["placeholder"], lang) : undefined;
  if (f.fieldtype === "Table" && f.fieldname === "products") return <CrmProducts doc={doc} />;
  if (f.depends_on && !evalDepends(f.depends_on, doc)) return null;
  const name = f.fieldname;
  const v = doc[name];
  const ro = !!f.read_only;
  let input;
  if (f.fieldtype === "Select") input = <select className="crm-input" disabled={ro} value={String(v ?? "")} onChange={(e) => onChange(name, e.target.value)}>{(f.options ?? "").split("\n").map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  else if (f.fieldtype === "Link" && (f.options === "CRM Lead Status" || f.options === "CRM Deal Status")) {
    const opts = Object.keys(f.options === "CRM Lead Status" ? b.defaults.lead_statuses : b.defaults.deal_statuses);
    input = <select className="crm-input" value={String(v ?? "")} onChange={(e) => onChange(name, e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  } else if (f.fieldtype === "Link") {
    const opts = adapter.list(f.options ?? "").map((d) => d.name);
    input = <><LinkInput list={`crm-${name}`} doctype={f.options} disabled={ro} value={String(v ?? "")} onChange={(e) => onChange(name, e.target.value)} placeholder={f.options} /><datalist id={`crm-${name}`}>{opts.map((o) => { const t = linkTitle(f.options, o); return <option key={o} value={o} label={t !== o ? t : undefined} />; })}</datalist></>;
  } else if (f.fieldtype === "Small Text" || f.fieldtype === "Text") input = <textarea className="crm-input h-16 py-1" disabled={ro} value={String(v ?? "")} placeholder={ph} onChange={(e) => onChange(name, e.target.value)} />;
  else if (/Currency|Int|Float|Percent/.test(f.fieldtype)) input = <input type="number" className="crm-input" disabled={ro} value={Number(v ?? 0)} onChange={(e) => onChange(name, Number(e.target.value))} />;
  else if (f.fieldtype === "Rating") input = <CrmRating label={f.label} value={v} disabled={ro} onChange={(x) => onChange(name, x)} />;
  else if (f.fieldtype === "Duration") input = <CrmDuration value={v} disabled={ro} hideDays={Boolean(f["hide_days"])} hideSeconds={Boolean(f["hide_seconds"])} onChange={(x) => onChange(name, x)} />;
  else if (f.fieldtype === "Attach Image") input = <CrmImageUploader label={f.label} value={v} disabled={ro} doctype={String(doc.doctype ?? "")} docname={String(doc.name ?? "")} onChange={(x) => onChange(name, x)} />;
  else if (f.fieldtype === "Table MultiSelect") input = <CrmTableMultiSelect label={f.label} value={v} disabled={ro} linkField={String(f["link_field"] ?? "user")} options={adapter.list(String(f["link_doctype"] ?? "User")).map((d) => d.name)} onChange={(x) => onChange(name, x)} />;
  else if (f.fieldtype === "Date") input = <DateInput className="crm-input" disabled={ro} value={String(v ?? "")} onChange={(e) => onChange(name, e.target.value)} />;
  else input = <input className="crm-input" disabled={ro} value={String(v ?? "")} placeholder={ph} onChange={(e) => onChange(name, e.target.value)} aria-label={f.label} />;
  const req = f.reqd ? <span className="text-destructive"> *</span> : null;
  if (inline) return <div className="flex items-center gap-2 py-0.5"><label className="w-36 shrink-0 truncate text-sm text-crm-muted" title={f.label}>{f.label}{req}</label><div className="min-w-0 flex-1">{input}{f.description && <p className="mt-1 text-xs text-crm-muted">{f.description}</p>}</div></div>;
  return <div><label className="mb-1 block text-xs text-crm-muted">{f.label}{req}</label>{input}{f.description && <p className="mt-1 text-xs text-crm-muted">{f.description}</p>}</div>;
}

export function LayoutRenderer({ layout, meta, doc, onChange, b, inline }: { layout: LayoutSection[]; meta: DocTypeMeta; doc: Doc; onChange: (k: string, v: unknown) => void; b: CrmBundle; inline?: boolean | undefined }) {
  const byName = new Map(meta.fields.map((f) => [f.fieldname, f]));
  const { L, lang } = useL();
  // Layouts may be tabbed ({sections:[...]}) or flat; a "contacts" section renders the deal's Contacts table.
  const flat = layout.flatMap((x) => ((x as { sections?: LayoutSection[] }).sections ?? [x]));
  return (
    <div className="space-y-4">
      {flat.filter((s) => !s.hidden).map((s) => "contacts" in s ? (
        <section key={s.name} className={inline ? "border-b border-crm-line pb-3" : ""}>
          <h3 className="mb-2 text-sm font-semibold">{s.label}</h3>
          {((doc["contacts"] as { contact: string; is_primary?: number }[]) ?? []).map((c) => {
            const ct = adapter.get("Contact", c.contact);
            return <div key={c.contact} className="text-sm"><span data-no-i18n>{dval(ct ? `${ct["first_name"] ?? ""} ${ct["last_name"] ?? ""}` : c.contact, lang)}</span> <span className="text-xs text-crm-muted">{c.is_primary ? `${L("primary")} · ` : ""}<span data-no-i18n>{String(ct?.["email_id"] ?? "")}</span></span></div>;
          })}
          {!(doc["contacts"] as unknown[] | undefined)?.length && <p className="text-xs text-crm-muted">{L("No Contacts Found")}</p>}
        </section>
      ) : (
        <section key={s.name} className={inline ? "border-b border-crm-line pb-3" : ""}>
          {s.label && <h3 className="mb-2 text-sm font-semibold">{s.label}</h3>}
          <div className={inline ? "space-y-0.5" : "grid gap-4"} style={inline ? undefined : { gridTemplateColumns: `repeat(${(s.columns ?? []).length || 1}, minmax(0,1fr))` }}>
            {(s.columns ?? []).map((c) => (
              <div key={c.name} className={inline ? "space-y-0.5" : "space-y-3"}>
                {c.fields.map((fn) => <CrmField key={fn} f={byName.get(fn)} doc={doc} onChange={onChange} b={b} inline={inline} />)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
