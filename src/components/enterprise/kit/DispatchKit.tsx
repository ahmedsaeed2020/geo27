/**
 * Enterprise dispatch pieces (owner FSM round F2, 2026-11-18) — app-agnostic, display + interaction only:
 *  - DayBoard: rows = resources (avatar, skills, van …), columns = hours; blocks coloured by the host's type hue with a status
 *    border, red outline + reason for a conflict (double booking, skill mismatch), hatched travel gaps, an optional actual
 *    bar under the plan (check-in → check-out) with a late / early mark, a now line, a drop target per row (drag a host item
 *    in: onDrop(row, hour, payload)) and a footer per row (booked hours, utilisation meter).
 *  - RouteMap: numbered pins in route order on a real map (OpenStreetMap tiles, attribution shown), one line per route,
 *    pins coloured by status; a click opens the host's quick view. Without tiles the pins stay on a plain grid.
 * The week view of the same board is the shared WeekBoard (ResourceBoard.tsx), so Construction, HR and FSM share one look.
 */
import { useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { LoadMeter, type BoardHue } from "./ResourceBoard";

export const DRAG_MIME = "text/x-ek-item";
export interface DayRow { key: string; head: ReactNode; sub?: ReactNode; tag?: ReactNode; booked: number; available: number | null; group?: string | undefined }
export interface DayBlock { key: string; row: string; start: number; end: number; hue: BoardHue; status?: "planned" | "dispatched" | "onsite" | "done" | "cancelled" | undefined;
  title: ReactNode; sub?: ReactNode; alert?: string | undefined; actual?: { start: number; end?: number | undefined; mark?: string | undefined; late?: boolean | undefined; title?: string | undefined } | undefined; onOpen?: ((el: HTMLElement) => void) | undefined; attrs?: Record<string, string> }
export interface DayGap { key: string; row: string; start: number; end: number; label: string }
const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
const pad = (n: number) => String(n).padStart(2, "0");
const hm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;

export function DayBoard({ rows, blocks, gaps = [], from = 7, to = 19, now, ar, onDrop, rowHead, groups, legend, empty, attrs }: {
  rows: DayRow[]; blocks: DayBlock[]; gaps?: DayGap[]; from?: number; to?: number; now?: number | undefined; ar: boolean;
  onDrop?: ((row: string, hour: number, payload: string) => void) | undefined; rowHead: ReactNode; groups?: Record<string, ReactNode> | undefined; legend?: ReactNode; empty?: ReactNode; attrs?: Record<string, string>;
}) {
  const [over, setOver] = useState<string | null>(null);
  const span = to - from; const pct = (h: number) => `${((Math.min(to, Math.max(from, h)) - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${Math.max(1.5, ((Math.min(to, b) - Math.max(from, a)) / span) * 100)}%`;
  const hourAt = (e: DragEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); const x = ar ? r.right - e.clientX : e.clientX - r.left; return Math.round((from + (x / r.width) * span) * 2) / 2; };
  let lastGroup: string | undefined;
  return <section className="ek-db" data-day-board={rows.length} {...attrs}>
    {legend && <div className="ek-db-legend">{legend}</div>}
    {!rows.length ? <p className="ek-wb-empty">{empty}</p> : <div className="ek-db-scroll"><div className="ek-db-grid" style={{ ["--ek-db-hours" as string]: span }}>
      <div className="ek-db-axis" aria-hidden><span className="ek-db-rh">{rowHead}</span><span className="ek-db-hours">{Array.from({ length: span + 1 }, (_, i) => <span key={i} style={{ insetInlineStart: pct(from + i) }} data-no-i18n>{pad(from + i)}</span>)}</span><span className="ek-db-ft">{tx(ar, "Booked · use", "المحجوز · الاستغلال")}</span></div>
      {rows.map((r) => {
        const showGroup = groups && r.group && r.group !== lastGroup; lastGroup = r.group;
        const bs = blocks.filter((b) => b.row === r.key); const gs = gaps.filter((g) => g.row === r.key);
        return <div key={r.key} className="contents">
          {showGroup && <div className="ek-db-group" data-db-group={r.group}>{groups[r.group!]}</div>}
          <div className="ek-db-row" data-db-row={r.key} data-over={over === r.key || undefined}>
            <div className="ek-db-rh"><div className="ek-db-rn">{r.head}</div>{r.sub && <div className="ek-db-rs">{r.sub}</div>}{r.tag && <div className="ek-db-rt">{r.tag}</div>}</div>
            <div className="ek-db-lane" onDragOver={onDrop ? (e) => { e.preventDefault(); setOver(r.key); } : undefined} onDragLeave={() => setOver(null)}
              onDrop={onDrop ? (e) => { e.preventDefault(); setOver(null); const p = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain"); if (p) onDrop(r.key, hourAt(e), p); } : undefined} data-db-lane={r.key}>
              {Array.from({ length: span }, (_, i) => <span key={i} className="ek-db-tick" style={{ insetInlineStart: pct(from + i) }} aria-hidden />)}
              {now !== undefined && now >= from && now <= to && <span className="ek-db-now" style={{ insetInlineStart: pct(now) }} aria-hidden />}
              {gs.map((g) => <span key={g.key} className="ek-db-gap" style={{ insetInlineStart: pct(g.start), width: width(g.start, g.end) }} title={g.label} data-db-gap={g.key}>{g.end - g.start >= 0.75 && <span>{g.label}</span>}</span>)}
              {bs.map((b) => <button key={b.key} type="button" className="ek-db-block" data-hue={b.hue} data-status={b.status} data-alert={b.alert ? "" : undefined} style={{ insetInlineStart: pct(b.start), width: width(b.start, b.end) }}
                title={`${hm(b.start)}–${hm(b.end)}${b.alert ? ` · ${b.alert}` : ""}`} onClick={(e) => b.onOpen?.(e.currentTarget)} data-db-block={b.key} {...b.attrs}>
                <span className="ek-db-bt">{b.title}</span>{b.sub && <span className="ek-db-bs">{b.sub}</span>}
                {b.alert && <span className="ek-db-alert" data-db-alert>{b.alert}</span>}
              </button>)}
              {bs.filter((b) => b.actual).map((b) => <span key={`a-${b.key}`} className="ek-db-actual" data-late={b.actual!.late ? "" : undefined} style={{ insetInlineStart: pct(b.actual!.start), width: width(b.actual!.start, b.actual!.end ?? now ?? b.end) }} title={b.actual!.title ?? tx(ar, "Actual time on site", "الوقت الفعلي في الموقع")} data-db-actual={b.key}>{b.actual!.mark && <i>{b.actual!.mark}</i>}</span>)}
            </div>
            <div className="ek-db-ft"><span className="tabular-nums" data-no-i18n data-db-booked={r.booked}>{Math.round(r.booked * 10) / 10} {tx(ar, "h", "س")}</span><LoadMeter used={r.booked} available={r.available} label={<>{tx(ar, "Utilisation", "الاستغلال")} <span data-no-i18n>{r.available ? Math.round((r.booked / r.available) * 100) : 0}%</span></>} na={tx(ar, "Off today", "غير متاح اليوم")} /></div>
          </div>
        </div>;
      })}
    </div></div>}
  </section>;
}

/* ------------------------------------------------------------------ route map ------------------------------------------------------------------ */
export interface MapPin { key: string; lat: number; lng: number; order: number; route: string; tone: "planned" | "dispatched" | "onsite" | "done" | "cancelled" | "alert"; title: string; sub?: string | undefined; onOpen?: ((el: HTMLElement) => void) | undefined }
export interface MapRoute { key: string; label: ReactNode; hue: string }
const TILE = 256;
const project = (lat: number, lng: number, z: number) => { const n = TILE * 2 ** z; const r = (lat * Math.PI) / 180; return { x: ((lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }; };

export function RouteMap({ pins, routes, ar, height = 360, title, empty }: { pins: MapPin[]; routes: MapRoute[]; ar: boolean; height?: number; title?: ReactNode; empty?: ReactNode }) {
  const [tiles, setTiles] = useState(true);
  const box = useRef<HTMLDivElement>(null); const [W, setW] = useState(560); const H = height;
  useLayoutEffect(() => { const el = box.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(([e]) => { const w = Math.round(e!.contentRect.width); if (w > 0) setW(w); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const view = useMemo(() => {
    if (!pins.length) return null;
    const lat = pins.map((p) => p.lat), lng = pins.map((p) => p.lng);
    let z = 15; for (; z > 3; z--) { const a = project(Math.max(...lat), Math.min(...lng), z), b = project(Math.min(...lat), Math.max(...lng), z); if (b.x - a.x < W - 80 && b.y - a.y < H - 80) break; }
    const a = project(Math.max(...lat), Math.min(...lng), z), b = project(Math.min(...lat), Math.max(...lng), z);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; const ox = cx - W / 2, oy = cy - H / 2;
    const t0x = Math.floor(ox / TILE), t0y = Math.floor(oy / TILE), t1x = Math.floor((ox + W) / TILE), t1y = Math.floor((oy + H) / TILE);
    const tl: { k: string; x: number; y: number; src: string }[] = [];
    for (let x = t0x; x <= t1x; x++) for (let y = t0y; y <= t1y; y++) tl.push({ k: `${z}/${x}/${y}`, x: x * TILE - ox, y: y * TILE - oy, src: `https://tile.openstreetmap.org/${z}/${x}/${y}.png` });
    const at = (p: MapPin) => { const q = project(p.lat, p.lng, z); return { x: q.x - ox, y: q.y - oy }; };
    return { tl, at };
  }, [pins, H, W]);
  return <section className="ek-map" data-route-map={pins.length}>
    {(title || routes.length > 0) && <header className="ek-map-head">{title ? <h3 className="ek-h3">{title}</h3> : <span />}<span className="ek-map-legend">{routes.map((r) => <span key={r.key}><i style={{ background: r.hue }} />{r.label}</span>)}</span></header>}
    <div ref={box} className="ek-map-box" style={{ height: view ? H : undefined }} dir="ltr">{!view ? <p className="ek-wb-empty">{empty}</p> : <>
      <div className="ek-map-canvas" style={{ width: W, height: H }}>
        {tiles && view.tl.map((t) => <img key={t.k} src={t.src} alt="" className="ek-map-tile" style={{ left: t.x, top: t.y }} draggable={false} onError={() => setTiles(false)} loading="lazy" />)}
        <svg className="ek-map-routes" width={W} height={H} aria-hidden>{routes.map((r) => { const ps = pins.filter((p) => p.route === r.key).sort((a, b) => a.order - b.order).map(view.at); return ps.length > 1 ? <polyline key={r.key} points={ps.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={r.hue} strokeWidth={3} strokeDasharray="6 4" strokeLinecap="round" opacity={0.85} /> : null; })}</svg>
        {pins.map((p) => { const q = view.at(p); const hue = routes.find((r) => r.key === p.route)?.hue; return <button key={p.key} type="button" className="ek-map-pin" data-tone={p.tone} style={{ left: q.x, top: q.y, ["--route" as string]: hue }} onClick={(e) => p.onOpen?.(e.currentTarget)} title={`${p.order}. ${p.title}${p.sub ? ` · ${p.sub}` : ""}`} aria-label={`${p.order}. ${p.title}`} data-map-pin={p.key}><span data-no-i18n>{p.order}</span></button>; })}
      </div>
      <span className="ek-map-attr">{tiles ? "© OpenStreetMap" : tx(ar, "Map tiles unavailable — positions to scale", "تعذر تحميل الخريطة — المواقع بمقياس الرسم")}</span>
    </>}</div>
  </section>;
}
