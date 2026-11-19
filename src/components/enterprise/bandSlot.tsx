/**
 * Band slot (owner 2026-11-13, Part B pages): a shared Core page's main controls — its company / filter selectors and its
 * primary action — belong IN the green band, not in a separate card under it. ServiceRoute opens a slot inside its band;
 * the page's shared filter row (FinanceDesk `Bar`) renders into that slot. Outside a ServiceRoute band (a panel reused on a
 * workspace, a dialog) there is no slot and the row stays a filter card, so embedded panels look exactly as before.
 */
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

const BandSlotCtx = createContext<HTMLElement | null>(null);
export function BandSlotProvider({ el, children }: { el: HTMLElement | null; children: ReactNode }) { return <BandSlotCtx.Provider value={el}>{children}</BandSlotCtx.Provider>; }
/** Content placed in the band's controls area when a band slot is open; `fallback` renders in place otherwise. */
export function InBand({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const el = useContext(BandSlotCtx);
  return el ? createPortal(children, el) : <>{fallback}</>;
}
/** The band slot is open (the page renders inside a ServiceRoute band). */
export const useInBand = () => !!useContext(BandSlotCtx);
