// Port of FieldLayoutEditor.vue section/column/tab menu operations over the CRM Fields Layout JSON.
export type Col = { name: string; fields: string[] };
export type Sec = { name: string; label?: string | undefined; columns: Col[]; collapsible?: boolean; hideLabel?: boolean; hideBorder?: boolean; editable?: boolean; hidden?: boolean; sections?: Sec[] };
export type Tab = { name: string; label?: string | undefined; sections: Sec[] };

const clone = <T,>(v: T): T => structuredClone(v);
const newCol = (): Col => ({ name: `column_${Math.random().toString(36).slice(2, 7)}`, fields: [] });

export const SECTION_ACTIONS = ["Collapsible", "Hide Label", "Hide Border", "Remove Section", "Remove and move columns", "Move to Previous Tab", "Move to Next Tab", "Add Column", "Remove Last Column", "Remove Last Column (move fields to previous)", "Move Last Column to Next Section", "Move Last Column to Previous Section"] as const;
export type SectionAction = (typeof SECTION_ACTIONS)[number];

/** Applies one menu action to section `s` of tab `t`; returns the new tabs. */
export function sectionAction(tabs: Tab[], t: number, s: number, action: SectionAction): Tab[] {
  const out = clone(tabs); const tab = out[t]; const sec = tab?.sections[s]; if (!tab || !sec) return out;
  const secs = tab.sections;
  switch (action) {
    case "Collapsible": sec.collapsible = !sec.collapsible; break;
    case "Hide Label": sec.hideLabel = !sec.hideLabel; break;
    case "Hide Border": sec.hideBorder = !sec.hideBorder; break;
    case "Remove Section": secs.splice(s, 1); break;
    case "Remove and move columns": { const target = secs[s === 0 ? 1 : s - 1]; if (!target) break; target.columns.push(...sec.columns); secs.splice(s, 1); break; }
    case "Move to Previous Tab": { const p = out[t - 1]; if (!p) break; p.sections.push(sec); secs.splice(s, 1); break; }
    case "Move to Next Tab": { const n = out[t + 1]; if (!n) break; n.sections.push(sec); secs.splice(s, 1); break; }
    case "Add Column": sec.columns.push(newCol()); break;
    case "Remove Last Column": sec.columns.pop(); break;
    case "Remove Last Column (move fields to previous)": { if (sec.columns.length < 2) break; const last = sec.columns.pop()!; sec.columns[sec.columns.length - 1]!.fields.push(...last.fields); break; }
    case "Move Last Column to Next Section": { const n = secs[s + 1]; if (!n || !sec.columns.length) break; n.columns.push(sec.columns.pop()!); break; }
    case "Move Last Column to Previous Section": { const p = secs[s - 1]; if (!p || !sec.columns.length) break; p.columns.push(sec.columns.pop()!); break; }
  }
  return out;
}

/** Which menu actions the source offers for this section (FieldLayoutEditor sectionOptions visibility). */
export function availableActions(tabs: Tab[], t: number, s: number): SectionAction[] {
  const tab = tabs[t]; const sec = tab?.sections[s]; if (!tab || !sec || sec.editable === false) return [];
  const n = tab.sections.length; const cols = sec.columns.length;
  return SECTION_ACTIONS.filter(a => {
    if (a === "Remove and move columns") return n > 1;
    if (a === "Move to Previous Tab") return t > 0;
    if (a === "Move to Next Tab") return t < tabs.length - 1;
    if (a === "Remove Last Column") return cols > 1;
    if (a === "Remove Last Column (move fields to previous)") return cols > 1;
    if (a === "Move Last Column to Next Section") return s < n - 1 && cols > 0;
    if (a === "Move Last Column to Previous Section") return s > 0 && cols > 0;
    return true;
  });
}

/** Data Fields/Quick Entry are stored as tabs; Side Panel as bare sections. */
export const toTabs = (layout: Sec[]): Tab[] => layout.length && layout.every(x => Array.isArray(x.sections)) ? layout.map(x => ({ name: x.name, label: x.label, sections: x.sections || [] })) : [{ name: "tab_1", label: "", sections: layout }];
export const fromTabs = (tabs: Tab[], wasTabs: boolean): Sec[] => wasTabs ? tabs.map(t => ({ name: t.name, label: t.label, columns: [], sections: t.sections })) : (tabs[0]?.sections || []);
