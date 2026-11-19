/**
 * «فتح الصفحة كاملة ↗» beside Save (owner correction 2026-11-18): every create panel / drawer links to the
 * document's designed full Create page, keeping what was already typed. A plain click runs `onOpen` (the host saves the typed values into
 * the same draft the full page opens); Ctrl / ⌘ / middle click opens `href` in a new tab. Core piece, app-agnostic.
 */
import type { MouseEvent } from "react";
import { ExternalLink } from "lucide-react";
import { useLang } from "@/i18n";
import { publicHref } from "@/lib/appUrls";

export function OpenFullLink({ href, onOpen, onBefore }: { href: string; onOpen: () => void; onBefore?: (() => void) | undefined }) {
  const ar = useLang() === "ar"; const label = ar ? "فتح الصفحة كاملة" : "Open full page";
  const click = (e: MouseEvent<HTMLAnchorElement>) => { onBefore?.(); if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; e.preventDefault(); onOpen(); };
  return <a href={publicHref(href)} className="ent-open-full" data-create-full data-open-full onClick={click} onAuxClick={() => onBefore?.()} title={label}>
    <span>{label}</span><ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>;
}
