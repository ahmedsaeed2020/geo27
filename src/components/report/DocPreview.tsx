import { createContext, useCallback, useContext, useEffect, useRef, useState, type MouseEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { indexQuery, loadMeta, type DocTypeMeta, type IndexEntry } from "@/lib/catalog";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { hasPerm, levelAccess, useSessionUser } from "@/lib/session";
import { scopedGet, useScopeMetas } from "@/lib/scope";
import { useSettings } from "@/lib/userSettings";
import { useActiveApp } from "@/plugins/appShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { FormView } from "@/components/FormView";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { isPlainClick, type DocTarget } from "@/lib/reportLinks";
import { linkTitle } from "@/lib/linkTitle";
import { useLang } from "@/i18n";
import { DocumentSummaryHeader } from "@/components/enterprise/DocumentSummaryHeader";

/**
 * Linked-document preview for report rows (port of frappe/public/js/frappe/views/reports/link_side_panel.js +
 * frappe/ui/side_panel.js): a plain click on an eligible Link / Dynamic Link cell opens the document READ-ONLY in a
 * side panel while the report stays visible; another link swaps the panel; Close and "Open in full page" are offered;
 * Escape closes. Phones get a full-width bottom sheet instead of a squeezed 45% panel. With Settings › Reports ›
 * Split view off (or a modifier / middle click) the cell is an ordinary link to the full form. Full-form links keep
 * the active DIGIT app (`?app=`). Shared by every local report (RunnerView, SplitReport, plugin reports).
 */
const SPLIT_W_KEY = "digit-virtual-core:report-split-width";
type Ctx = { target: DocTarget | null; split: boolean; open: (t: DocTarget, trigger?: HTMLElement | null) => void; close: () => void };
const PreviewCtx = createContext<Ctx | null>(null);
export const useReportPreview = () => useContext(PreviewCtx);

/** Route of the full document form, keeping the active app context. */
function useFullDocRoute(entry: IndexEntry | undefined, name: string) {
  const app = useActiveApp();
  if (!entry) return null;
  return { to: "/app/$app/$doctype/$name" as const, params: { app: entry.app, doctype: entry.slug, name }, search: (app ? { app: app.name } : {}) as never };
}

export const reportPreviewSide = (arabic: boolean) => arabic ? "left" : "right";
export const reportPreviewWidth = (arabic: boolean, clientX: number, rect: { left: number; right: number; width: number }) => Math.round(Math.min(70, Math.max(25, ((arabic ? clientX - rect.left : rect.right - clientX) / rect.width) * 100)));

export function ReportPreviewScope({ children, doctypes = [] }: { children: ReactNode; doctypes?: string[] }) {
  const split = useSettings().report_split_view;
  const mobile = useIsMobile();
  const ar = useLang() === "ar";
  useScopeMetas(doctypes);
  const [target, setTarget] = useState<DocTarget | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  // owner notes B-03: the panel width is dragged by the user and remembered (percent of the report area)
  const [width, setWidth] = useState(45);
  useEffect(() => { try { const w = Number(localStorage.getItem(SPLIT_W_KEY)); if (w >= 25 && w <= 70) setWidth(w); } catch { /* storage disabled */ } }, []);
  const box = useRef<HTMLDivElement>(null);
  const startDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const el = box.current; if (!el) return; e.preventDefault();
    const rect = el.getBoundingClientRect();
    // Arabic: document on the physical left; English: physical right (owner correction 2026-11-18).
    const move = (ev: PointerEvent) => setWidth(reportPreviewWidth(ar, ev.clientX, rect));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setWidth((w) => { try { localStorage.setItem(SPLIT_W_KEY, String(w)); } catch { /* storage disabled */ } return w; }); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const close = useCallback(() => {
    setTarget(null);
    const t = trigger.current; trigger.current = null;
    // back to the same row: the opener is scrolled into view and focused, filters and scroll stay as they were
    if (t && t.isConnected) requestAnimationFrame(() => { t.scrollIntoView({ block: "nearest" }); t.focus({ preventScroll: true }); });
  }, []);
  const open = useCallback((t: DocTarget, el?: HTMLElement | null) => { if (el) trigger.current = el; setTarget(t); }, []);
  // turning Split view off applies immediately: an open panel closes and links navigate again
  useEffect(() => { if (!split) setTarget(null); }, [split]);
  // Escape closes the side panel unless a dialog sits on top of it (side_panel.js keydown handler)
  useEffect(() => {
    if (!target || mobile) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"][data-state="open"]')) { e.preventDefault(); close(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [target, mobile, close]);
  return (
    <PreviewCtx.Provider value={{ target, split, open, close }}>
      <div ref={box} className="flex min-w-0 items-start gap-3" data-report-preview-scope data-split-view={split ? "on" : "off"}>
        <div className="min-w-0 flex-1">{children}</div>
        {target && !mobile && (
          <aside className="panel sticky top-14 flex max-h-[calc(100vh-4.5rem)] shrink-0 flex-col overflow-hidden" style={{ width: `${width}%` }} data-split-panel={target.name} data-preview-doctype={target.doctype} data-preview-side={reportPreviewSide(ar)} aria-label={target.doctype}>
            <div role="separator" aria-orientation="vertical" aria-label="Resize" tabIndex={0} className="ent-split-handle" onPointerDown={startDrag}
              onKeyDown={(e) => { const step = e.key === "ArrowLeft" ? 5 : e.key === "ArrowRight" ? -5 : 0; if (step) { e.preventDefault(); setWidth((w) => { const n = Math.min(70, Math.max(25, w + step)); try { localStorage.setItem(SPLIT_W_KEY, String(n)); } catch { /* storage disabled */ } return n; }); } }} data-split-resize />
            <DocPreviewPanel target={target} onClose={close} onNavigate={(t) => setTarget(t)} />
          </aside>
        )}
      </div>
      {mobile && (
        <Sheet open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
          <SheetContent side="bottom" className="flex h-[100dvh] flex-col gap-0 p-0 [&>button.absolute]:hidden" data-split-sheet={target?.name}>
            <SheetTitle className="sr-only">{target?.doctype ?? ""}</SheetTitle>
            <SheetDescription className="sr-only">{target?.name ?? ""}</SheetDescription>
            {target && <DocPreviewPanel target={target} onClose={close} onNavigate={(t) => setTarget(t)} />}
          </SheetContent>
        </Sheet>
      )}
    </PreviewCtx.Provider>
  );
}

/** A document reference inside a report: preview on plain click when Split view is on, else a normal full-form link. */
export function ReportDocLink({ doctype, name, children, titled }: { doctype: string; name: string; children?: ReactNode; titled?: boolean }) {
  const ctx = useReportPreview();
  const idx = useQuery(indexQuery);
  useSessionUser();
  const entry = idx.data?.find((e) => e.name === doctype);
  const route = useFullDocRoute(entry, name);
  // unreadable or missing records render as text (side_panel.js render_static_field_value: !can_read → text)
  if (!entry || !route || !scopedGet(doctype, name)) return <span data-no-i18n>{children ?? name}</span>;
  // owner SH-06 / GL-09: a readable party / customer / employee shows its name; the code stays in the tooltip
  const title = titled ? linkTitle(doctype, name) : "";
  const label = title && title !== name ? title : (children ?? name);
  const active = ctx?.target?.doctype === doctype && ctx.target.name === name;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!ctx?.split || !isPlainClick(e)) return;
    e.preventDefault();
    ctx.open({ doctype, name }, e.currentTarget);
  };
  return (
    <Link {...route} onClick={onClick} data-preview-link={name} data-preview-doctype={doctype} aria-current={active ? "true" : undefined}
      aria-haspopup={ctx?.split ? "dialog" : undefined} className={`text-primary hover:underline ${active ? "font-semibold" : ""}`} data-no-i18n title={title && title !== name ? name : undefined}>
      {label}
    </Link>
  );
}

const STATUS_TONE: Record<string, string> = { Draft: "bg-muted", Submitted: "bg-primary/15 text-primary", Cancelled: "bg-destructive/15 text-destructive" };

/** Read-only document body + header actions (side panel and mobile sheet share it). */
export function DocPreviewPanel({ target, onClose, onNavigate }: { target: DocTarget; onClose: () => void; onNavigate: (t: DocTarget) => void }) {
  const idx = useQuery(indexQuery);
  useStoreVersion(); useSessionUser();
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [original, setOriginal] = useState(false);
  const ar = useLang() === "ar";
  const heading = useRef<HTMLHeadingElement>(null);
  const entry = idx.data?.find((e) => e.name === target.doctype);
  const route = useFullDocRoute(entry, target.name);
  useEffect(() => {
    let live = true; setMeta(null); setFailed(false);
    if (!idx.data) return;
    loadMeta(idx.data, target.doctype).then((m) => { if (!live) return; if (m) setMeta(m); else setFailed(true); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [idx.data, target.doctype]);
  useEffect(() => { heading.current?.focus(); }, [target.doctype, target.name]);
  const doc = adapter.get(target.doctype, target.name);
  const permitted = !!(meta && doc && hasPerm(meta, "read", doc));
  const ds = Number(doc?.docstatus ?? 0);
  const status = doc ? (typeof doc["status"] === "string" && doc["status"] ? String(doc["status"]) : meta?.is_submittable ? ["Draft", "Submitted", "Cancelled"][ds] : undefined) : undefined;
  const title = meta?.title_field && doc ? String(doc[meta.title_field] ?? "") : "";
  // every field read-only; permlevels the user cannot read are hidden (side_panel.js permlevels)
  const over: Record<string, { hidden?: boolean; ro?: boolean }> = {};
  if (meta) { const lv = levelAccess(meta); for (const f of meta.fields) if (f.fieldname) over[f.fieldname] = lv.read.has(Number(f["permlevel"] ?? 0)) ? { ro: true } : { hidden: true }; }
  // links inside the preview re-target the panel (side_panel.js delegated a[data-doctype] handler)
  const retarget = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!a || !isPlainClick(e)) return;
    const parts = new URL(a.href, location.origin).pathname.split("/").filter(Boolean);
    if (parts[0] !== "app" || parts.length < 4) return;
    const hit = idx.data?.find((x) => x.app === parts[1] && x.slug === parts[2]);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    onNavigate({ doctype: hit.name, name: decodeURIComponent(parts.slice(3).join("/")) });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-doc-preview={target.name}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 ref={heading} tabIndex={-1} className="flex min-w-0 flex-1 items-center gap-1.5 text-sm outline-none">
          <span className="shrink-0 text-muted-foreground">{target.doctype}</span>
          <span className="shrink-0 text-muted-foreground" aria-hidden>/</span>
          <b className="truncate" data-no-i18n title={title && title !== target.name ? `${target.name}: ${title}` : target.name}>{target.name}</b>
          {status && <span className={`chip shrink-0 ${STATUS_TONE[status] ?? "bg-muted"}`} data-preview-status={status}>{status}</span>}
        </h2>
        {permitted && <button type="button" className="btn-ghost shrink-0 px-2 text-xs" aria-pressed={original} onClick={() => setOriginal((x) => !x)} data-preview-original>{ar ? (original ? "عرض DIGIT" : "معاينة أصلية") : original ? "DIGIT view" : "Original preview"}</button>}
        {route && permitted && <Link {...route} className="btn-ghost shrink-0 px-2 text-xs" aria-label={ar ? "فتح كامل" : "Open in full"} title={ar ? "فتح كامل" : "Open in full"} data-preview-open-full>{ar ? "فتح كامل ↗" : "Open in full ↗"}</Link>}
        <button type="button" className="btn-ghost shrink-0 px-2" aria-label="Close" title="Close" onClick={onClose} data-preview-close>×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 [&_[role=tablist]]:hidden" onClickCapture={retarget}>
        {title && title !== target.name && <p className="mb-3 text-sm font-medium" data-no-i18n>{title}</p>}
        {!doc ? <p className="text-sm text-muted-foreground" data-preview-missing><span>Record</span> <span data-no-i18n>{target.name}</span> <span>not found.</span></p>
          : failed ? <p className="text-sm text-muted-foreground">Preview unavailable for this document type.</p>
          : !meta ? <p className="text-sm text-muted-foreground">Loading…</p>
          : !permitted ? <div data-not-permitted><p className="font-semibold">{ar ? "غير مسموح" : "Not permitted"}</p><p className="mt-1 text-sm text-muted-foreground">{ar ? "ليست لديك صلاحية قراءة هذا المستند، لذلك لا تُعرض أي بيانات منه." : "You may not read this document, so none of its data is shown."}</p></div>
          : original ? <div data-preview-readonly data-preview-mode="original"><FormView meta={meta} doc={doc} dev={false} over={over} allTabs onChange={() => {}} /></div>
          : <div data-preview-readonly data-preview-mode="digit"><DocumentSummaryHeader meta={meta} doc={doc} dirty={false} hideId /><div className="mt-3"><FormView meta={meta} doc={doc} dev={false} over={over} allTabs onChange={() => {}} /></div></div>}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">{ar ? "معاينة للقراءة فقط. افتح المستند كاملًا للتعديل." : "Read-only preview. Open the full document to edit."}</p>
    </div>
  );
}
