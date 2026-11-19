/**
 * Work tabs strip above the content host (owner decision 2): opened pages and documents stay one click away.
 * Store: src/lib/workTabs.ts (per simulated user). Shown in DIGIT Enterprise shells only, so the Standard Desk is unchanged.
 */
import { publicHref } from "@/lib/appUrls";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSessionUser } from "@/lib/session";
import { translateTo, useLang } from "@/i18n";
import { closeOtherWorkTabs, closeWorkTab, moveWorkTab, openWorkTab, subscribeWorkTabs, tabCaption, tabKey, tabTitle, workTabs, workTabsVersion } from "@/lib/workTabs";

export function WorkTabs() {
  const user = useSessionUser();
  const ar = useLang() === "ar";
  const nav = useNavigate();
  const loc = useRouterState({ select: (r) => ({ pathname: r.location.pathname, search: r.location.searchStr ?? "", busy: r.status === "pending" }) });
  useSyncExternalStore(subscribeWorkTabs, workTabsVersion, () => 0);
  const tabs = workTabs(user);
  // an Arabic caption captured from an English value (e.g. a new Stock Entry titled by its type "Material Receipt") is translated too
  const cap = (t: (typeof tabs)[number]) => { const c = tabCaption(t, ar ? "ar" : "en"); return ar && (c === t.title || !/[\u0600-\u06FF]/.test(c)) ? translateTo(c, "ar") : c; };
  const current = tabKey(loc.pathname);
  // record the page once its own head() title is applied (after the route settles)
  useEffect(() => {
    if (loc.busy) return;
    // the visible page heading in the current language becomes the tab caption (Enterprise Home has a greeting, so it keeps its name)
    // pages that load their data first show the heading a moment later: keep looking for it (up to ~6 s) and rename the tab once it appears
    const lang = ar ? "ar" : "en"; let tries = 0; let id = 0;
    const run = () => {
      const text = (loc.pathname === "/enterprise" ? (ar ? "الرئيسية" : "Enterprise Home") : document.querySelector("[data-shell-main] h1")?.textContent ?? "").trim();
      if (tries === 0 || text) openWorkTab(user, loc.pathname, loc.search, tabTitle(document.title, loc.pathname), undefined, text ? { lang, text } : undefined);
      if (!text && tries < 12) { tries += 1; id = window.setTimeout(run, 500); }
    };
    id = window.setTimeout(run, 400);
    return () => window.clearTimeout(id);
  }, [user, loc.pathname, loc.search, loc.busy, ar]);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { strip.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [current, tabs.length]);
  // many open pages (owner 2026-11-12): the strip scrolls with arrow buttons instead of overflowing the header
  const [edge, setEdge] = useState({ start: false, end: false });
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const read = () => { const max = el.scrollWidth - el.clientWidth; const pos = Math.abs(el.scrollLeft); setEdge({ start: max > 2 && pos > 2, end: max > 2 && pos < max - 2 }); };
    read(); el.addEventListener("scroll", read, { passive: true }); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null; ro?.observe(el);
    return () => { el.removeEventListener("scroll", read); ro?.disconnect(); };
  }, [tabs.length]);
  const scrollBy = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * (ar ? -1 : 1) * 260, behavior: "smooth" });
  if (tabs.length === 0) return null;
  const go = (href: string) => nav({ href });
  const close = (key: string) => { const next = closeWorkTab(user, key, current); if (next) go(next); };
  return (
    <nav className="ent-wtabs" aria-label={ar ? "الصفحات المفتوحة" : "Open pages"} data-work-tabs={tabs.length}>
      {(edge.start || edge.end) && <button type="button" className="ent-wtabs-arrow" aria-label={ar ? "الصفحات السابقة" : "Earlier pages"} disabled={!edge.start} data-work-tabs-prev onClick={() => scrollBy(-1)}>{ar ? "›" : "‹"}</button>}
      <div ref={strip} className="ent-wtabs-strip" role="list">
        {tabs.map((t) => {
          const on = t.key === current;
          return (
            <div key={t.key} role="listitem" className="ent-wtab" data-on={on ? "" : undefined} data-work-tab={t.key}>
              <a href={publicHref(t.href)} aria-current={on ? "page" : undefined} className="ent-wtab-link" title={cap(t)}
                onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); go(t.href); }}
                onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); close(t.key); } }}
                onKeyDown={(e) => {
                  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); moveWorkTab(user, t.key, (e.key === "ArrowRight") !== ar ? 1 : -1); }
                  if (e.key === "Delete") { e.preventDefault(); close(t.key); }
                }}>
                <span className="ent-wtab-title" data-no-i18n>{cap(t)}</span>
              </a>
              <button type="button" className="ent-wtab-x" aria-label={`${ar ? "إغلاق" : "Close"} ${cap(t)}`} data-work-tab-close={t.key} onClick={() => close(t.key)}>×</button>
            </div>
          );
        })}
      </div>
      {(edge.start || edge.end) && <button type="button" className="ent-wtabs-arrow" aria-label={ar ? "الصفحات التالية" : "Later pages"} disabled={!edge.end} data-work-tabs-next onClick={() => scrollBy(1)}>{ar ? "‹" : "›"}</button>}
      {tabs.length > 1 && <button type="button" className="ent-wtabs-others" data-work-tabs-close-others onClick={() => closeOtherWorkTabs(user, current)}>{ar ? "إغلاق الأخرى" : "Close others"}</button>}
    </nav>
  );
}
