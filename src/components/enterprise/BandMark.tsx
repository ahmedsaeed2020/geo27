/**
 * Band watermark (owner 2026-11-13 FINAL WORK LIST, Part 0 / G-02 / G-03): every green command band shows the DIGIT icon
 * mark only — the brand SVG artwork (white bars + mint bar), no word, no ring, no CSS tint — at 50% opacity, absolutely
 * positioned 20px from the band's physical left edge, vertically centred, at ONE fixed size (72px high, width by the mark's
 * aspect ratio) on every screen and band height. It never moves, resizes or hides for controls: the band reserves an empty
 * zone of 20px + mark width + 20px on the left, and selectors / actions wrap in a row under the title on the right.
 * A company logo or word mark from Admin → Print branding is never used in the band (it stays on printed documents).
 */
import { useEffect } from "react";

/** Clears a word-mark value an earlier build set on <html>; renders nothing. */
export function BandMark() {
  useEffect(() => { document.documentElement.style.removeProperty("--ek-band-mark"); }, []);
  return null;
}

/** Brand mark geometry: the artwork of /icons/digit/logo/digit-icon-white.svg cropped to its bars (64 × 55 units). */
export const BAND_MARK = { left: 20, height: 72, width: Math.round((72 * 64) / 55 * 10) / 10, opacity: 0.5 } as const;

/** The one band watermark: drawn by every shared band (ContextStrip, list band, report band). */
export function BandWatermark() {
  return <span className="ek-band-mark" aria-hidden data-ek-band-mark>
    <svg className="ek-band-wm" viewBox="18 22.5 64 55" width="84" height="72" focusable="false" data-ek-band-wm>
      <rect x="18" y="22.5" width="40" height="13" rx="6.5" fill="#FFFFFF" />
      <rect x="63" y="22.5" width="19" height="13" rx="5" fill="#34D399" />
      <rect x="18" y="43.5" width="64" height="13" rx="6.5" fill="#FFFFFF" />
      <rect x="18" y="64.5" width="50" height="13" rx="6.5" fill="#FFFFFF" />
    </svg>
  </span>;
}
