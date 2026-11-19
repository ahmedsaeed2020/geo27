/**
 * Owner notes B-04 — connected split on the finance pages: a plain click on a document link (voucher, account, party)
 * inside the work area of Receivables, Payables, Trial Balance, Financial Statements, Chart of Accounts, Finance Home
 * and the General Ledger opens that document in the shared side panel (QuickView: permission-checked, «فتح كامل»,
 * Esc) while the page keeps its filters and scroll. Modifier / middle clicks, new-document links, links inside a native
 * report (which has its own split view) and links inside panels keep their normal behaviour.
 */
import type { IndexEntry } from "@/lib/catalog";
import { internalPath } from "@/lib/appUrls";
import { openQuickView } from "./QuickView";

export const SPLIT_PAGES = /^\/pro\/(receivables|payables|trial-balance|statements|accounts|finance|general-ledger|finance-intelligence|accounting(\/|$))/;
let index: IndexEntry[] = [];
/** The Shell hands the DocType index over once loaded (slug → DocType name). */
export function setSplitIndex(x: IndexEntry[] | undefined) { if (x) index = x; }

/** «/app/<app>/<slug>/<name>» on a split page → the document, else null. */
export function splitTarget(href: string, page: string): { doctype: string; name: string } | null {
  if (!SPLIT_PAGES.test(page)) return null;
  const m = internalPath(href).split("?")[0]!.match(/^\/app\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m || m[3] === "new") return null;
  const hit = index.find((e) => e.app === decodeURIComponent(m[1]!) && e.slug === decodeURIComponent(m[2]!));
  return hit ? { doctype: hit.name, name: decodeURIComponent(m[3]!) } : null;
}

function onCapture(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !(e.target instanceof Element)) return;
  const a = e.target.closest<HTMLAnchorElement>("a[href]");
  if (!a || a.target === "_blank" || a.hasAttribute("download") || a.closest("[data-report-preview-scope], [data-split-full], .ent-qv, [role=dialog]")) return;
  if (!a.closest("html[data-enterprise] [data-shell-main]")) return;
  const tg = splitTarget(a.getAttribute("href") ?? "", location.pathname);
  if (!tg) return;
  e.preventDefault(); e.stopPropagation();
  openQuickView({ kind: "doc", doctype: tg.doctype, name: tg.name }, a);
}
let installed = 0;
export function installConnectedSplit(doc: Document = document): () => void {
  if (installed++ === 0) doc.addEventListener("click", onCapture, true);
  let done = false;
  return () => { if (done) return; done = true; if (--installed === 0) doc.removeEventListener("click", onCapture, true); };
}
