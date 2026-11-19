import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { Button } from "@/components/ui/button";
import { Modal } from "./CrmShell";
import { useL } from "./crmI18n";
import { cachedMeta } from "@/lib/catalog";
import { moveKanban } from "@/lib/kanbanMove";

export function CrmLostReason({ doc, status, onClose }: { doc: Doc; status: string; onClose: () => void }) {
  const { L } = useL(); const [reason, setReason] = useState(String(doc["lost_reason"] ?? "")); const [notes, setNotes] = useState(String(doc["lost_notes"] ?? "")); const [error, setError] = useState("");
  const save = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (!reason.trim()) { setError(L("Lost Reason is required")); return; }
    if (reason === "Other" && !notes.trim()) { setError(L('Lost Notes are required when Lost Reason is "Other"')); return; }
    const meta = cachedMeta(doc.doctype);
    if (!meta) { setError(L("Not permitted")); return; }
    const result = moveKanban(meta, doc, "status", status, { lost_reason: reason, lost_notes: notes });
    if (result) { setError(L(result)); return; }
    onClose();
  };
  return <Modal title={L("Lost Reason")} onClose={onClose}><div className="space-y-3"><label className="block">{L("Lost Reason")}<input className="crm-input mt-1" aria-label={L("Lost Reason")} list="crm-lost-reasons" value={reason} onChange={e => setReason(e.target.value)} /><datalist id="crm-lost-reasons">{adapter.list("CRM Lost Reason").map(r => <option key={r.name} value={r.name} />)}<option value="Other" /></datalist></label><label className="block">{L("Lost Notes")}<textarea className="crm-input h-24" aria-label={L("Lost Notes")} value={notes} onChange={e => setNotes(e.target.value)} /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{L("Cancel")}</Button><Button type="button" onClick={save}>{L("Save")}</Button></div></div></Modal>;
}