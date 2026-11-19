import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { Button } from "@/components/ui/button";
import { useL } from "./crmI18n";

const LINK_KEYS = ["reference_name", "reference_docname", "attached_to_name", "lead"];
/** Records that point at any of `names` (DeleteLinkedDocModal's get_linked_docs). */
export function linkedDocs(dt: string, names: string[]): Doc[] {
  return adapter.doctypes().flatMap(type => adapter.list(type)).filter(d => d.doctype !== dt && names.some(n => LINK_KEYS.some(k => d[k] === n)));
}
/** Unlink clears the pointing fields; delete removes the record (source unlink/delete actions). */
export function unlinkDoc(d: Doc, names: string[]) { adapter.update(d.doctype, d.name, Object.fromEntries(LINK_KEYS.filter(k => names.includes(String(d[k]))).map(k => [k, ""]))); }

/** Port of LinkedDocsListView.vue: selectable linked-document table with Unlink / Delete actions. */
export function CrmLinkedDocs({ dt, names }: { dt: string; names: string[] }) {
  const { L } = useL(); const [sel, setSel] = useState<string[]>([]); const [, bump] = useState(0);
  const docs = linkedDocs(dt, names); const key = (d: Doc) => `${d.doctype}:${d.name}`;
  const act = (del: boolean) => { docs.filter(d => sel.includes(key(d))).forEach(d => del ? adapter.remove(d.doctype, d.name) : unlinkDoc(d, names)); setSel([]); bump(x => x + 1); };
  return <section aria-label={L("Linked documents")} className="space-y-2">
    <h4 className="font-medium">{L("Linked documents")} ({docs.length})</h4>
    {docs.length ? <table className="w-full text-xs"><thead><tr className="text-crm-muted"><th><input type="checkbox" aria-label={L("Select all")} checked={docs.length > 0 && sel.length === docs.length} onChange={e => setSel(e.target.checked ? docs.map(key) : [])} /></th><th className="text-start">{L("Document type")}</th><th className="text-start">{L("Name")}</th></tr></thead><tbody>{docs.map(d => <tr key={key(d)} className="border-t border-crm-line"><td><input type="checkbox" aria-label={`${L("Select")} ${d.name}`} checked={sel.includes(key(d))} onChange={e => setSel(e.target.checked ? [...sel, key(d)] : sel.filter(x => x !== key(d)))} /></td><td>{L(d.doctype)}</td><td data-no-i18n>{d.name}</td></tr>)}</tbody></table> : <p className="text-xs text-crm-muted">{L("No linked documents")}</p>}
    {sel.length > 0 && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => act(false)}>{L("Unlink")} ({sel.length})</Button><Button size="sm" variant="destructive" onClick={() => act(true)}>{L("Delete")} ({sel.length})</Button></div>}
  </section>;
}
