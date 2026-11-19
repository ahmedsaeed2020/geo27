/**
 * Enterprise create drawer (CRM C4 B-01 / B-04, owner 2026-11-17): opens from the start side and keeps the list visible;
 * short form first with «إظهار كل الحقول», a field search box, sections with icons, required marks and the error under its
 * field, a banner slot (duplicate check), and a footer of the host's buttons (إلغاء · حفظ وإضافة آخر · حفظ وفتح · حفظ);
 * Ctrl+Enter runs the host's default save. Apps pass fields (their own inputs), errors and buttons; nothing here writes.
 */
import { useState, type ReactNode } from "react";
import { EntDrawer } from "../Surfaces";
import { OpenFullLink } from "../OpenFull";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
const SEC_HUES = ["emerald", "blue", "violet", "amber", "teal", "coral"] as const;
export interface FdField { key: string; label: string; required?: boolean | undefined; short?: boolean | undefined; error?: string | undefined; hint?: ReactNode; wide?: boolean | undefined; node: ReactNode }
export interface FdSection { key: string; label: string; icon?: ReactNode; note?: ReactNode; fields: FdField[] }
export interface FdButton { key: string; label: string; primary?: boolean | undefined; ghost?: boolean | undefined; run: () => void }
/** One editable section, shared by the short create panel and the designed full Create page. */
export function FdSectionView({ section: s, ar, index: si, fields: fs }: { section: FdSection; ar: boolean; index: number; fields: FdField[] }) {
  return <section className="ek-fd-s" data-fd-section={s.key} data-hue={SEC_HUES[si % SEC_HUES.length]}>
    <h3>{s.icon && <span aria-hidden className="ek-fd-ic">{s.icon}</span>}{s.label}</h3>{s.note && <p className="ek-fd-note">{s.note}</p>}
    <div className="ek-fd-grid">{fs.map((f) => <div key={f.key} className="ek-fd-f" data-wide={f.wide || undefined} data-fd-field={f.key} data-invalid={f.error ? "" : undefined}>
      <span className="ek-fd-l">{f.label}{f.required && <span className="ek-req" aria-label={tx(ar, "required", "مطلوب")}> *</span>}</span>
      {f.node}{f.hint && !f.error && <small className="ek-fd-hint">{f.hint}</small>}{f.error && <small className="ek-ff-err" role="alert" data-fd-error={f.key}>{f.error}</small>}
    </div>)}</div>
  </section>;
}
export function FormDrawer({ open, onOpenChange, title, kicker, ar, sections, banner, buttons, onShortcut, id, full }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; kicker?: ReactNode; ar: boolean; sections: FdSection[]; banner?: ReactNode; buttons: FdButton[]; onShortcut: () => void; id: string;
  /** «فتح الصفحة كاملة» beside Save: the host carries typed values to the designed full Create page */
  full?: { href: string; run: () => void } | undefined;
}) {
  const [all, setAll] = useState(false); const [q, setQ] = useState("");
  const vis = (f: FdField) => (all || f.short || f.required || !!f.error) && (!q || f.label.toLowerCase().includes(q.toLowerCase()));
  const total = sections.reduce((a, s) => a + s.fields.length, 0), shown = sections.reduce((a, s) => a + s.fields.filter(vis).length, 0);
  // owner notes A-04 / C-08: a centred wide panel under the green band; sections are coloured cards with icon tiles
  return <EntDrawer open={open} onOpenChange={onOpenChange} side="center" size="lg" title={title} kicker={kicker} id={id}
    footer={<div className="ek-fd-foot" data-fd-foot>{buttons.map((b) => <button key={b.key} type="button" className={b.primary ? "btn-primary" : b.ghost ? "btn-ghost" : "btn-secondary"} onClick={b.run} data-fd-btn={b.key}>{b.label}</button>)}{full && <OpenFullLink href={full.href} onOpen={full.run} />}<small className="ek-cmp-key">Ctrl+Enter</small></div>}>
    <div className="ek-fd" data-fd={id} data-fd-shown={shown} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); onShortcut(); } }}>
      <div className="ek-fd-tools">
        <input className="field-input min-h-9 flex-1 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx(ar, "Find a field", "ابحث عن حقل")} aria-label={tx(ar, "Find a field", "ابحث عن حقل")} data-fd-search />
        <label className="ek-fd-all"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} data-fd-all /> {tx(ar, `Show all fields (${total})`, `إظهار كل الحقول (${total})`)}</label>
      </div>
      {banner}
      {sections.map((s, si) => { const fs = s.fields.filter(vis); return fs.length ? <FdSectionView key={s.key} section={s} ar={ar} index={si} fields={fs} /> : null; })}
      {!shown && <p className="ek-tl-empty">{tx(ar, "No field matches this search.", "لا يوجد حقل يطابق البحث.")}</p>}
    </div>
  </EntDrawer>;
}
