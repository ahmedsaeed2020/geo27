/**
 * DIGIT Enterprise document panel organizer (owner OWN-65): the extra panels apps and the Core add inside a document are
 * grouped into brand tabs above the form — Work · 360 & insight · Flow & related · Controls & compliance — instead of
 * being stacked. Nothing is removed: every panel stays mounted (inactive groups are hidden, so their working state and
 * unsaved guards are kept), and the last chosen group is remembered per DocType.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLang } from "@/i18n";

export type PanelGroup = "work" | "insight" | "flow" | "control";
export interface DocPanel { id: string; group: PanelGroup; node: ReactNode }
export const GROUP_LABEL: Record<PanelGroup, [string, string]> = {
  work: ["Work on this document", "العمل على المستند"], insight: ["360 & insight", "الرؤية الشاملة 360"],
  flow: ["Flow & related documents", "المسار والمستندات المرتبطة"], control: ["Controls & compliance", "الضوابط والامتثال"],
};
const ORDER: PanelGroup[] = ["work", "insight", "flow", "control"];
const KEY = (dt: string) => `digit-virtual-core:doc-panel-tab:${dt}`;

/** Groups present, in the fixed order. */
export function panelGroups(panels: DocPanel[]): PanelGroup[] { return ORDER.filter((g) => panels.some((p) => p.group === g)); }

export function DocPanelTabs({ doctype, panels }: { doctype: string; panels: DocPanel[] }) {
  const ar = useLang() === "ar";
  const groups = useMemo(() => panelGroups(panels), [panels]);
  const [active, setActive] = useState<PanelGroup | null>(null);
  useEffect(() => { try { const g = localStorage.getItem(KEY(doctype)) as PanelGroup | null; if (g) setActive(g); } catch { /* ignore */ } }, [doctype]);
  if (!groups.length) return null;
  const cur = active && groups.includes(active) ? active : groups[0]!;
  const pick = (g: PanelGroup) => { setActive(g); try { localStorage.setItem(KEY(doctype), g); } catch { /* ignore */ } };
  return <section className="ent-docpanels mt-3" data-ent-docpanels={groups.length}>
    {groups.length > 1 && <div role="tablist" aria-label={ar ? "لوحات المستند" : "Document panels"} className="ent-docpanels-tabs">
      {groups.map((g) => <button key={g} type="button" role="tab" id={`ent-dp-tab-${g}`} aria-controls={`ent-dp-panel-${g}`} aria-selected={g === cur} tabIndex={g === cur ? 0 : -1}
        className="ent-docpanels-tab" data-ent-docpanel-tab={g} onClick={() => pick(g)}
        onKeyDown={(e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; const i = groups.indexOf(cur); const fwd = (e.key === "ArrowRight") !== ar; const n = groups[(i + (fwd ? 1 : groups.length - 1)) % groups.length]!; pick(n); document.getElementById(`ent-dp-tab-${n}`)?.focus(); }}>
        {GROUP_LABEL[g][ar ? 1 : 0]}<span className="ent-docpanels-count" data-no-i18n>{panels.filter((p) => p.group === g).length}</span>
      </button>)}
    </div>}
    {groups.map((g) => <div key={g} role={groups.length > 1 ? "tabpanel" : undefined} id={`ent-dp-panel-${g}`} aria-labelledby={groups.length > 1 ? `ent-dp-tab-${g}` : undefined} hidden={g !== cur} data-ent-docpanel={g} className="ent-docpanels-body">
      {panels.filter((p) => p.group === g).map((p) => <div key={p.id} data-ent-docpanel-id={p.id}>{p.node}</div>)}
    </div>)}
  </section>;
}
