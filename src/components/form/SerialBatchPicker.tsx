import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import { batchQty, hasBatch, hasSerial, parseSerials } from "@/lib/serialBatch";

/** Row-level "Add Serial / Batch No" dialog (erpnext serial_no_batch_selector.js, legacy serial_no/batch_no fields). */
export const needsSerialBatch = (r: Doc) => !!r["item_code"] && (hasSerial(String(r["item_code"])) || hasBatch(String(r["item_code"])));

export function SerialBatchPicker({ row, onClose, onApply }: { row: Doc; onClose: () => void; onApply: (p: Record<string, unknown>) => void }) {
  const item = String(row["item_code"]); const wh = String(row["s_warehouse"] || row["warehouse"] || "");
  const serial = hasSerial(item), batch = hasBatch(item);
  const [b, setB] = useState(String(row["batch_no"] ?? ""));
  const [picked, setPicked] = useState<Set<string>>(new Set(parseSerials(row["serial_no"])));
  const [typed, setTyped] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const batches = batch ? adapter.list("Batch").filter((x) => x["item"] === item && !Number(x["disabled"] ?? 0)).map((x) => ({ name: x.name, qty: wh ? batchQty(x.name, wh) : 0, expiry: String(x["expiry_date"] ?? "") })) : [];
  const serials = serial ? adapter.list("Serial No").filter((s) => s["item_code"] === item && s["status"] === "Active" && (!wh || s["warehouse"] === wh) && (!b || !s["batch_no"] || s["batch_no"] === b)).map((s) => s.name) : [];
  const all = [...picked, ...parseSerials(typed).filter((s) => !picked.has(s))];
  const apply = () => onApply({ ...(serial ? { serial_no: all.join("\n"), ...(all.length ? { qty: all.length } : {}) } : {}), ...(batch ? { batch_no: b } : {}) });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-label="Add Serial / Batch No" data-sb-picker>
      <div className="w-full max-w-lg space-y-3 rounded-lg bg-card p-4 shadow-xl">
        <div className="flex items-center"><h3 className="font-semibold">Add Serial / Batch No</h3><span className="ms-2 text-xs text-muted-foreground" data-no-i18n>{item}{wh ? ` · ${wh}` : ""}</span><button type="button" className="btn-ghost ms-auto" aria-label="Close" onClick={onClose}>✕</button></div>
        {batch && (
          <label className="block text-sm"><span>Batch No</span>
            <select className="field-input mt-1" aria-label="Batch No" value={b} onChange={(e) => setB(e.target.value)}>
              <option value="" />
              {batches.map((x) => <option key={x.name} value={x.name} disabled={!!x.expiry && x.expiry < today}>{`${x.name} (${x.qty}${x.expiry ? ` · ${x.expiry}` : ""})`}</option>)}
            </select>
            <input className="field-input mt-1" aria-label="Batch No" placeholder="Batch No" value={b} onChange={(e) => setB(e.target.value)} />
          </label>
        )}
        {serial && (
          <div className="text-sm">
            <span>Serial No</span>
            {serials.length > 0 && <div className="mt-1 grid max-h-40 grid-cols-3 gap-1 overflow-auto rounded border border-border p-2 text-xs" data-sb-serials>{serials.map((s) => (
              <label key={s} className="flex items-center gap-1" data-no-i18n><input type="checkbox" checked={picked.has(s)} onChange={(e) => { const p = new Set(picked); if (e.target.checked) p.add(s); else p.delete(s); setPicked(p); }} />{s}</label>))}</div>}
            <textarea className="field-input mt-1 h-20" aria-label="Serial No" placeholder="Serial No" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <div className="text-xs text-muted-foreground"><span>Qty</span>: <span data-no-i18n>{all.length}</span></div>
          </div>
        )}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button type="button" className="btn-primary" data-sb-apply onClick={apply}>Add</button></div>
      </div>
    </div>
  );
}
