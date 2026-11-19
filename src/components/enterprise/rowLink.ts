/**
 * Whole-row / whole-card navigation (owner Final UI Fix Pass §1, 2026-10-19).
 *
 * One delegated listener serves every DIGIT Enterprise work area (`html[data-enterprise] [data-shell-main]`): a click
 * anywhere on a register / worklist / queue / exception / "recent" row, or on a KPI / app card, opens that row's own real
 * link. Nothing is rebuilt per screen and no route changes: the destination is the row's existing `<a href>` (its router
 * Link), so Tab focuses it, Enter opens it, and Ctrl/Cmd/Shift-click or middle-click open it in a new tab.
 *
 * Rules (kept in this one module so the CSS affordance in enterprise.css and the scan agree with the behaviour):
 *  - Row = `tbody > tr`, `[role=row]`, `li`, `[data-row-link]` or a card marked `[data-dx-card]`; the NEAREST one wins
 *    and a row that contains other rows (a tree or nested list) is a container, never a row.
 *  - Destination = the row's `a[href][data-row-primary]`, else its first real link (not `#…`, `javascript:`, a download
 *    or `[data-row-secondary]`). A row without one is not clickable.
 *  - Inner controls keep their own action: clicks on links, buttons, inputs, labels, menus, tabs, checkboxes or anything
 *    marked `[data-row-ignore]` are never turned into row navigation, so Approve / Reject never open the row.
 *  - Rows that already handle their own click (e.g. "select row → inspector") keep it: if the click passed through an
 *    element with its own click handler between the target and the row's table/list, the listener stays out.
 *  - Static scopes never navigate: form child grids, the report workbench grid, menus/listboxes, `nav` and
 *    `[data-row-static]`.
 *  - A click that ends a text selection inside the row does not navigate.
 */

export const ROW_SCOPE = "html[data-enterprise] [data-shell-main]";
export const ROW_SELECTOR = "tbody > tr, [role=row], li, [data-row-link], [data-dx-card]";
export const STATIC_SCOPE = "[data-child-grid], [data-report-table], [data-row-static], [role=menu], [role=listbox], [role=tree], nav, [contenteditable=true]";
export const INTERACTIVE =
  "a[href], button, input, select, textarea, label, summary, [role=button], [role=checkbox], [role=radio], [role=menuitem], [role=tab], [role=switch], [role=option], [role=combobox], [role=slider], [role=link], [contenteditable=true], [data-row-ignore]";

const LIST_CONTAINER = "table, ul, ol, [role=table], [role=grid], [role=list], [role=rowgroup]";
const HANDLERS = ["onClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp", "onDoubleClick"] as const;

/** A link that can be a row destination. */
export function isRowDestination(a: Element): a is HTMLAnchorElement {
  if (!(a instanceof HTMLAnchorElement)) return false;
  const href = a.getAttribute("href") ?? "";
  if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return false;
  return !a.hasAttribute("download") && !a.hasAttribute("data-row-secondary") && !a.closest("[data-row-secondary]");
}

/** The row's destination link: the explicitly marked primary link, else its first real link. */
export function primaryLink(row: Element): HTMLAnchorElement | null {
  const marked = row.querySelector("a[href][data-row-primary]");
  if (marked && isRowDestination(marked)) return marked;
  for (const a of row.querySelectorAll("a[href]")) if (isRowDestination(a)) return a;
  return null;
}

const isHeaderRow = (el: Element) => el.matches("thead tr, tfoot tr") || !!el.querySelector(":scope > th:only-child, [role=columnheader]");
const isContainer = (el: Element) => !el.hasAttribute("data-dx-card") && !el.hasAttribute("data-row-link") && !!el.querySelector("li, tr, [role=row]");

/** The row/card the click belongs to (nearest candidate), or null when it is a header, a container or in a static scope. */
export function rowOf(target: Element, scope = ROW_SCOPE): Element | null {
  const row = target.closest(ROW_SELECTOR);
  if (!row || !row.closest(scope)) return null;
  if (row.closest(STATIC_SCOPE) || isHeaderRow(row) || isContainer(row)) return null;
  return row;
}

function reactProps(el: Element): Record<string, unknown> | undefined {
  for (const k in el) if (k.startsWith("__reactProps$")) return (el as unknown as Record<string, Record<string, unknown>>)[k];
  return undefined;
}
/** True when the element handles clicks itself (React handler or DOM onclick). */
export function hasOwnClick(el: Element): boolean {
  if (typeof (el as HTMLElement).onclick === "function") return true;
  const p = reactProps(el);
  return !!p && HANDLERS.some((h) => typeof p[h] === "function");
}
/** True when something between the click target and the row's table/list already handles the click. */
export function clickHandledBetween(target: Element, row: Element): boolean {
  const stop = row.matches("[data-dx-card], [data-row-link]") ? row : row.parentElement?.closest(LIST_CONTAINER) ?? row;
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (hasOwnClick(el)) return true;
    if (el === stop) break;
  }
  return false;
}

/** Where a click on `target` should go, or null when the row/card keeps its normal behaviour. */
export function rowLinkTarget(target: Element, scope = ROW_SCOPE): HTMLAnchorElement | null {
  if (target.closest(INTERACTIVE)) return null;
  const row = rowOf(target, scope);
  if (!row || clickHandledBetween(target, row)) return null;
  return primaryLink(row);
}

function selectionInside(row: Element) {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  return !!sel && !sel.isCollapsed && !!sel.anchorNode && row.contains(sel.anchorNode) && sel.toString().trim().length > 0;
}

const openInNewTab = (a: HTMLAnchorElement) => { window.open(a.href, "_blank", "noopener"); };

function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || !(e.target instanceof Element)) return;
  const a = rowLinkTarget(e.target);
  if (!a) return;
  const row = rowOf(e.target);
  if (row && selectionInside(row)) return;
  if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); openInNewTab(a); return; }
  a.click(); // the row's own router Link performs the navigation (same route, search and context as the link)
}
function onAux(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 1 || !(e.target instanceof Element)) return;
  const a = rowLinkTarget(e.target);
  if (a) { e.preventDefault(); openInNewTab(a); }
}
// middle button: stop the browser's autoscroll on a clickable row so the auxclick reaches us
function onDown(e: MouseEvent) { if (e.button === 1 && e.target instanceof Element && rowLinkTarget(e.target)) e.preventDefault(); }

/** Installs the delegated listeners once per document (ref-counted; returns the cleanup). Safe on every Shell mount. */
const users = new WeakMap<Document, number>();
export function installRowLinks(doc: Document = document): () => void {
  const n = users.get(doc) ?? 0;
  users.set(doc, n + 1);
  if (n === 0) {
    doc.addEventListener("click", onClick);
    doc.addEventListener("auxclick", onAux);
    doc.addEventListener("mousedown", onDown);
  }
  let done = false;
  return () => {
    if (done) return; done = true;
    const left = (users.get(doc) ?? 1) - 1;
    users.set(doc, left);
    if (left > 0) return;
    doc.removeEventListener("click", onClick);
    doc.removeEventListener("auxclick", onAux);
    doc.removeEventListener("mousedown", onDown);
  };
}
