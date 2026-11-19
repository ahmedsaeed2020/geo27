/**
 * Enterprise accent colours (owner 2026-11-12, Part A add §2): every department, app and shared service has ONE colour
 * from the brand tokens (kit.css --ek-acc-*), used wherever its icon appears — Home tile, rail, header, cards, tabs.
 * BrandIcon draws the source icon as a white glyph on its accent chip (CSS mask), so the same file serves light and night
 * mode and no grey or mono-green placeholder remains. Status colours stay separate (good / attention / risk / neutral).
 */
import type { CSSProperties } from "react";

export const ACCENT_IDS = ["home", "executive", "accounting", "selling", "purchasing", "inventory", "assets", "reports", "compliance", "settings", "support", "search",
  "digit_pro", "digit_hr", "digit_construction", "digit_crm", "digit_fsm"] as const;
export type AccentId = (typeof ACCENT_IDS)[number];
const KNOWN = new Set<string>(ACCENT_IDS);
export const hasAccent = (id: string | undefined) => !!id && KNOWN.has(id);
/** CSS colour of an accent id (unknown ids get the neutral accent, never a status colour). */
export const accentOf = (id: string | undefined) => `var(--ek-acc-${id && KNOWN.has(id) ? id.replace(/_/g, "-") : "neutral"})`;

/** The official light-on-dark artwork (white ink + mint accent) of a DIGIT icon file: light-surface variants, the older
 *  digit_pro copies and the ink logo all map to the same artwork's dark variant (owner 2026-11-12 evening §2/§5). */
export const darkArt = (src: string) => src.replace(/^\/icons\/digit_pro\//, "/icons/digit/").replace(/-light\.svg$/, "-dark.svg").replace(/\/logo\/digit-icon(-app|-mono)?\.svg$/, "/logo/digit-icon-white.svg");
/**
 * The approved premium icon (the original set still used in Construction, owner 2026-11-12 evening §5): the official
 * artwork itself — white glyph with its mint accent — on the deep-green rounded tile; hover/active turn the tile darker.
 * One look for the rail, band, Home cards and tabs; no recoloured mask and no per-department colour tile.
 */
export function BrandIcon({ src, accent, size = 36, className, label }: { src: string; accent: string | undefined; size?: number; className?: string; label?: string }) {
  const style = { "--ek-bicon-size": `${size}px` } as CSSProperties;
  return <span className={`ek-bicon${className ? ` ${className}` : ""}`} style={style} data-ek-accent={accent ?? "neutral"} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}>
    <img className="ek-bicon-img" src={darkArt(src)} alt="" draggable={false} /></span>;
}
