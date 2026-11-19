/**
 * «أضف عنصرًا +» — the last cell of a dashboard's first KPI row (owner UI rule). The Dashboard Designer provides the
 * widgets that are not on the layout and the add action (saved into the user's own layout); the first KPI row on the
 * page claims the slot, so it shows once. Display only: what can be added and how it is saved stay in the Designer.
 */
import { createContext, useContext, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface AddSlotItem { id: string; title: string; meaning?: string | undefined }
export interface AddSlotApi { items: AddSlotItem[]; add: (id: string) => void; customize: () => void; owner: { current: string | null } }
const Ctx = createContext<AddSlotApi | null>(null);
export const AddSlotProvider = Ctx.Provider;
/** The slot for the first KPI row that asks during a render pass (the Designer resets the owner every pass). */
export function useAddSlot(owner: string): AddSlotApi | null {
  const c = useContext(Ctx);
  if (!c) return null;
  if (c.owner.current === null) c.owner.current = owner;
  return c.owner.current === owner ? c : null;
}

export function AddSlotTile({ api, ar }: { api: AddSlotApi; ar: boolean }) {
  const [open, setOpen] = useState(false);
  const n = api.items.length;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="ek-add-slot" data-ek-add-slot={n} aria-haspopup="dialog" aria-expanded={open}>
        <span className="ek-add-slot-i" aria-hidden>+</span>
        <span className="ek-add-slot-t">{ar ? "أضف عنصرًا" : "Add a card"}</span>
        <span className="ek-add-slot-s">{n ? <><bdi data-no-i18n>{n}</bdi> {ar ? "متاح للإضافة" : "available to add"}</> : ar ? "كل العناصر معروضة" : "Everything is on the page"}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="ek-add-menu w-80 p-2" data-ek-add-menu>
      {n ? <ul className="grid gap-1">{api.items.map((it) => <li key={it.id}>
        <button type="button" className="ek-add-opt" onClick={() => { api.add(it.id); setOpen(false); }} data-ek-add-opt={it.id}>
          <b>{it.title}</b>{it.meaning && <span>{it.meaning}</span>}
        </button></li>)}</ul>
        : <p className="ek-muted px-2 py-1 text-sm">{ar ? "كل الأدوات المتاحة موجودة على اللوحة." : "Every available widget is already on this dashboard."}</p>}
      <button type="button" className="ek-add-custom" onClick={() => { setOpen(false); api.customize(); }} data-ek-add-customize>{ar ? "تخصيص اللوحة" : "Customise the dashboard"}</button>
    </PopoverContent>
  </Popover>;
}
