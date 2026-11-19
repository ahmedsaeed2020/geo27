/**
 * Brand guard (owner decision 3 / OWN-53): inside DIGIT no platform name (ERPNext, Frappe, HRMS) is shown and no vendor
 * documentation link is offered. One display-only observer over the page — stored values, field values being edited and
 * code samples are untouched; installed by the Shell while DIGIT Enterprise is on.
 */
import { brandSafe, isVendorDocLink } from "@/lib/saudiScope";

const RAW = "textarea,input,code,pre,script,style,[contenteditable],[data-brand-raw]";
const NAME = /ERPNext|Frappe|HRMS/;
const ATTRS = ["title", "aria-label", "placeholder", "alt"] as const;

function fixText(n: Node) {
  const v = n.nodeValue ?? ""; if (!NAME.test(v)) return;
  const p = n.parentElement; if (!p || p.closest(RAW)) return;
  const out = brandSafe(v); if (out !== v) n.nodeValue = out;
}
function fixEl(el: Element) {
  if (el.closest(RAW) && el.tagName !== "INPUT") return;
  if (el.tagName === "A") { const h = el.getAttribute("href") ?? ""; if (h && isVendorDocLink(h)) { (el as HTMLElement).hidden = true; el.setAttribute("data-brand-hidden", ""); } }
  for (const a of ATTRS) { const v = el.getAttribute(a); if (v && NAME.test(v)) { const out = brandSafe(v); if (out !== v) el.setAttribute(a, out); } }
}
export function brandPass(root: Node) {
  if (root.nodeType === 3) { fixText(root); return; }
  if (root.nodeType !== 1) return;
  const el = root as Element; fixEl(el);
  for (const a of el.querySelectorAll("a[href],[title],[aria-label],[placeholder],[alt]")) fixEl(a);
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n: Node | null;
  while ((n = w.nextNode())) fixText(n);
}
export function installBrandGuard(): () => void {
  if (typeof document === "undefined") return () => undefined;
  brandPass(document.body);
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") fixText(m.target);
      else if (m.type === "attributes") fixEl(m.target as Element);
      else m.addedNodes.forEach(brandPass);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, "href"] });
  return () => obs.disconnect();
}
