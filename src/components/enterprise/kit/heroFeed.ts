/**
 * Band chip feed (visual round R3 §3.1 / §5): every section hero shows three live headline chips. A page that names its
 * chips passes them to ContextStrip; every other page gets the first three KPI cards of its one dashboard, published by
 * the shared Dashboard Designer (same figure, same drill), so Construction, Pro and Enterprise bands carry live figures
 * with no app code. Display only: nothing is stored, and the chips disappear with the dashboard.
 */
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import type { HeroChipItem } from "./templates";

export interface FeedChip extends HeroChipItem { order: number; sig: string }
const items = new Map<string, FeedChip>();
const subs = new Set<() => void>();
const claims: string[] = [];
let snap: FeedChip[] = [];
const EMPTY: FeedChip[] = [];
const emit = () => { snap = [...items.values()].sort((a, b) => a.order - b.order).slice(0, 3); subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Publish (or refresh) one headline figure; `sig` is the shown text, so an unchanged figure never re-renders the band. */
export function publishChip(key: string, chip: FeedChip) { const prev = items.get(key); if (prev && prev.sig === chip.sig && prev.order === chip.order) { items.set(key, { ...chip }); return; } items.set(key, chip); emit(); }
export function retractChip(key: string) { if (items.delete(key)) emit(); }
/** The page's first three headline figures (by dashboard order). */
export function useHeroFeed(): FeedChip[] { return useSyncExternalStore(subscribe, () => snap, () => EMPTY); }

/** Only the first brand band mounted on the page shows the feed (a band inside a side panel never repeats it). */
export function useFeedOwner(): boolean {
  const id = useId();
  useEffect(() => { claims.push(id); subs.forEach((f) => f()); return () => { const i = claims.indexOf(id); if (i >= 0) claims.splice(i, 1); subs.forEach((f) => f()); }; }, [id]);
  return useSyncExternalStore(subscribe, () => claims[0] === id, () => false);
}

/** Publishes one KPI card's figure while it is on screen (rendered by the Dashboard Designer frame). */
export function usePublishChip(key: string, chip: Omit<FeedChip, "sig"> | null, sig: string) {
  useEffect(() => { if (chip) publishChip(key, { ...chip, sig }); else retractChip(key); }, [key, sig, chip?.order]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => retractChip(key), [key]);
}
/** test helper */
export function _resetHeroFeed() { items.clear(); claims.splice(0); emit(); }

/**
 * Fallback for pages whose KPI cards are drawn by app tiles (Pro signal tiles, Construction tiles) rather than Designer
 * number widgets: the band mirrors the first three visible KPI cards of the page body (label, shown value, change), and a
 * chip opens exactly what its card opens (it clicks the card). Display only; a card inside a dialog or panel never feeds.
 */
export interface DomChip { id: string; label: string; html: string; delta: string; open: (() => void) | undefined; sig: string }
const TILE = ".ek-kpi, .ek-kpi-tile";
const LABEL = ".ek-kpi-label, .dp-cc-label, .ek-tile-label";
const VALUE = ".ek-kpi-value, .dp-cc-value, .ek-tile-value, [data-kpi-value]";
const DELTA = ".ek-delta, .dp-delta, [data-ek-delta]";
export function readDomChips(root: ParentNode): DomChip[] {
  const out: DomChip[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(TILE))) {
    if (out.length >= 3) break;
    if (el.closest("[role=dialog], [data-quickview], [data-ek-context], .ek-context, [data-ek-hero-chips]")) continue;
    if (el.parentElement?.closest(TILE)) continue;
    const st = el.getAttribute("data-status"); if (st && st !== "ok") continue;
    const v = el.querySelector<HTMLElement>(VALUE); const l = el.querySelector<HTMLElement>(LABEL);
    const label = (l?.textContent ?? "").trim(); const text = (v?.textContent ?? "").trim();
    if (!v || !label || !text || text === "—") continue;
    if (typeof el.getClientRects === "function" && !el.getClientRects().length) continue;
    const m = (el.querySelector(DELTA)?.textContent ?? "").match(/[▲▼↑↓+−-]?\s?[\d.,]+\s?%/);
    const target = el.matches("a, button") ? el : el.querySelector<HTMLElement>("a[href], button");
    const delta = m ? m[0].replace(/\s/g, "") : "";
    out.push({ id: `dom-${out.length}`, label, html: v.innerHTML, delta, open: target ? () => target.click() : undefined, sig: `${label}|${text}|${delta}|${!!target}` });
  }
  return out;
}
/** Mirrors the page body's first three KPI cards while `on` (re-read after DOM changes, debounced). */
export function useDomChips(on: boolean): DomChip[] {
  const [chips, setChips] = useState<DomChip[]>([]);
  useEffect(() => {
    if (!on || typeof document === "undefined") { setChips([]); return; }
    const root = document.querySelector("[data-shell-main]") ?? document.body;
    let timer: ReturnType<typeof setTimeout> | undefined; let last = "";
    const read = () => { timer = undefined; const next = readDomChips(root); const sig = next.map((c) => c.sig).join("§"); if (sig !== last) { last = sig; setChips(next); } };
    const later = () => { if (!timer) timer = setTimeout(read, 250); };
    read();
    const mo = new MutationObserver(later); mo.observe(root, { subtree: true, childList: true, characterData: true });
    return () => { mo.disconnect(); if (timer) clearTimeout(timer); };
  }, [on]);
  return chips;
}
