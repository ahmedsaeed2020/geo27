/**
 * Get Items From (owner OWN-52): the native draft button, rendered with the shared brand dialog. Choose the source type,
 * tick one or more submitted open documents of the same company and party, and their remaining rows are added to this
 * draft (src/lib/getItemsFrom.ts). Works on new unsaved drafts and saved drafts; nothing is saved until the user saves.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { indexQuery, loadMeta, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import type { Doc } from "@/lib/adapter";
import { formActions, formActionsQuery, type FormAction } from "@/lib/engines";
import { useFormActionRunner, visibleFormActions } from "@/components/FormActions";
import { gifCandidates, gifPatch, gifSources, percentDone, type GifSource } from "@/lib/getItemsFrom";
import { useSessionUser } from "@/lib/session";
import { formatValue } from "@/lib/format";
import { t, useLang } from "@/i18n";
import { EntDialog } from "./Surfaces";
import { EntGlyph } from "./DigitIcon";

export function useGetItemsSources(meta: DocTypeMeta): GifSource[] {
  const { data: all } = useQuery(formActionsQuery);
  const { data: index } = useQuery(indexQuery);
  return useMemo(() => gifSources(formActions(all?.[meta.name]), meta.name, (dt) => !!index?.some((e) => e.name === dt)), [all, index, meta.name]);
}

export function GetItemsFrom({ meta, doc, onPatch }: { meta: DocTypeMeta; doc: Doc; onPatch: (p: Record<string, unknown>) => void }) {
  const sources = useGetItemsSources(meta);
  const { data: index } = useQuery(indexQuery);
  const user = useSessionUser();
  const ar = useLang() === "ar";
  const [menu, setMenu] = useState(false);
  const [src, setSrc] = useState<GifSource | null>(null);
  const [srcMeta, setSrcMeta] = useState<DocTypeMeta | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  // owner FINAL WORK LIST (copy from with line selection): every line of the ticked documents, all ticked by default
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const { data: allActs } = useQuery(formActionsQuery);
  const { run } = useFormActionRunner(meta, doc, onPatch);
  // the source's other "Get Items From" entries (e.g. Timesheet) stay in the same one menu, so the button appears once
  const extra: FormAction[] = visibleFormActions(meta, doc, allActs, index).filter((a) => a.group === "Get Items From");
  if (!sources.length || Number(doc.docstatus ?? 0) !== 0) return null;
  const open = async (s: GifSource) => {
    setMenu(false); setPicked(new Set()); setSkip(new Set()); setQ(""); setSrc(s); setSrcMeta(null);
    const m = index ? await loadMeta(index, s.source) : undefined; setSrcMeta(m ?? null);
  };
  const cands = srcMeta ? gifCandidates(srcMeta, meta, doc, user) : [];
  const shown = cands.filter((d) => !q || [d.name, d["customer_name"], d["supplier_name"], d["customer"], d["supplier"], d["party_name"], d["title"]].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase())));
  const party = (d: Doc) => String(d["customer_name"] ?? d["supplier_name"] ?? d["customer"] ?? d["supplier"] ?? d["party_name"] ?? "");
  const date = (d: Doc) => String(d["transaction_date"] ?? d["posting_date"] ?? d["schedule_date"] ?? "");
  const apply = async () => {
    if (!src || !srcMeta || !index || !picked.size) return;
    setBusy(true);
    try {
      const childMetas: Record<string, DocTypeMeta> = {};
      for (const f of meta.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = await loadMeta(index, f.options!); if (m) childMetas[f.options!] = m; }
      const picks = cands.filter((d) => picked.has(d.name)).map((d) => ({ meta: srcMeta, doc: { ...d, items: ((d["items"] as Record<string, unknown>[] | undefined) ?? []).filter((r, i) => !skip.has(`${d.name}|${i}`)) }, fieldMap: src.fieldMap }))
        .filter((p) => (p.doc["items"] as unknown[]).length > 0);
      if (!picks.length) { setBusy(false); return; }
      const before = Array.isArray(doc["items"]) ? (doc["items"] as unknown[]).length : 0;
      const patch = gifPatch(doc, meta, picks, childMetas);
      const after = Array.isArray(patch["items"]) ? (patch["items"] as unknown[]).length : before;
      onPatch(patch); setSrc(null);
      toast.success(ar ? `أضيفت البنود من ${picks.length} مستند` : `Items added from ${picks.length} document${picks.length === 1 ? "" : "s"}${after > before ? ` (${after} rows)` : ""}`);
    } finally { setBusy(false); }
  };
  return (
    <div className="relative" data-get-items-from={sources.length}>
      <button type="button" className="btn-ghost" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu(!menu)} data-action-group="Get Items From">{t("Get Items From")} ▾</button>
      {menu && <div className="absolute end-0 top-full z-40 mt-1 min-w-48 rounded-md border border-border bg-popover py-1 shadow-lg" role="menu">
        {sources.map((s) => <button key={s.source} type="button" role="menuitem" className="block w-full px-3 py-1.5 text-start text-sm hover:bg-muted" data-gif-source={s.source} onClick={() => void open(s)}>{t(s.label)}</button>)}
        {extra.filter((a) => !sources.some((s) => s.label === a.label)).map((a) => <button key={`x-${a.label}`} type="button" role="menuitem" className="block w-full px-3 py-1.5 text-start text-sm hover:bg-muted" data-action-label={a.label} onClick={() => { setMenu(false); void run(a); }}>{t(a.label)}</button>)}
      </div>}
      <EntDialog open={!!src} onOpenChange={(o) => { if (!o) setSrc(null); }} size="lg" id="get-items-from"
        icon={<EntGlyph name="ui-download" fallback="≡" />} kicker={t("Get Items From")} title={src ? t(src.label) : ""}
        description={ar ? "مستندات معتمدة ومفتوحة لنفس الشركة والطرف. تُضاف الكميات المتبقية فقط." : "Submitted, open documents of the same company and party. Only the remaining quantities are added."}
        footer={<>
          <span className="me-auto text-xs text-muted-foreground" data-gif-count={picked.size}>{ar ? `محدد: ${picked.size}` : `${picked.size} selected`}</span>
          <button type="button" className="btn-ghost" onClick={() => setSrc(null)}>{ar ? "إلغاء" : "Cancel"}</button>
          <button type="button" className="btn-primary" disabled={!picked.size || busy} onClick={() => void apply()} data-gif-apply>{ar ? "جلب البنود" : "Get Items"}</button>
        </>}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "بحث بالرقم أو الطرف" : "Search by number or party"} aria-label={ar ? "بحث" : "Search"} className="ent-colfilter mb-3 h-9 text-sm" data-gif-search />
        {!srcMeta ? <p className="text-sm text-muted-foreground">{ar ? "جارٍ التحميل…" : "Loading…"}</p>
        : !shown.length ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground" data-gif-empty>{ar ? "لا توجد مستندات مفتوحة مطابقة." : "No open documents match this draft."}</p>
        : <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm" data-gif-list={shown.length}>
            <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" aria-label={ar ? "تحديد الكل" : "Select all"} checked={shown.every((d) => picked.has(d.name))} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((d) => d.name)) : new Set())} /></th>
              <th className="px-3 py-2 text-start">{ar ? "المستند" : "Document"}</th><th className="px-3 py-2 text-start">{ar ? "الطرف" : "Party"}</th>
              <th className="px-3 py-2 text-start">{ar ? "التاريخ" : "Date"}</th><th className="px-3 py-2 text-end">{ar ? "الإجمالي" : "Total"}</th><th className="px-3 py-2 text-end">{ar ? "منجز" : "Done"}</th>
            </tr></thead>
            <tbody>{shown.map((d) => <tr key={d.name} className="border-t border-border hover:bg-muted/50" data-gif-row={d.name}>
              <td className="px-3 py-2"><input type="checkbox" aria-label={d.name} checked={picked.has(d.name)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(d.name); else s.delete(d.name); setPicked(s); }} /></td>
              <td className="px-3 py-2 font-medium" data-no-i18n>{d.name}</td><td className="px-3 py-2" data-no-i18n>{party(d)}</td>
              <td className="px-3 py-2 tabular-nums" data-no-i18n>{formatValue("Date", date(d))}</td>
              <td className="px-3 py-2 text-end tabular-nums" data-no-i18n>{formatValue("Currency", d["grand_total"] ?? d["total"] ?? 0)}</td>
              <td className="px-3 py-2 text-end tabular-nums" data-no-i18n>{Math.round(percentDone(d, meta.name))}%</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {picked.size > 0 && <div className="mt-3 max-h-[32vh] overflow-auto rounded-lg border border-border" data-gif-lines>
          <p className="sticky top-0 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">{ar ? "اختر الأسطر المطلوب جلبها" : "Choose the lines to bring in"}</p>
          <table className="w-full text-sm"><tbody>{cands.filter((d) => picked.has(d.name)).flatMap((d) => ((d["items"] as Record<string, unknown>[] | undefined) ?? []).map((r, i) => {
            const k = `${d.name}|${i}`;
            return <tr key={k} className="border-t border-border" data-gif-line={k}>
              <td className="w-8 px-3 py-1.5"><input type="checkbox" aria-label={`${d.name} ${i + 1}`} checked={!skip.has(k)} onChange={(e) => { const x = new Set(skip); if (e.target.checked) x.delete(k); else x.add(k); setSkip(x); }} /></td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground" data-no-i18n>{d.name}</td>
              <td className="px-3 py-1.5" data-no-i18n>{String(r["item_name"] ?? r["item_code"] ?? "")}</td>
              <td className="px-3 py-1.5 text-end tabular-nums" data-no-i18n>{formatValue("Float", r["qty"] ?? 0)}</td>
              <td className="px-3 py-1.5 text-end tabular-nums" data-no-i18n>{formatValue("Currency", r["rate"] ?? 0)}</td>
            </tr>; }))}</tbody></table>
        </div>}
      </EntDialog>
    </div>
  );
}
