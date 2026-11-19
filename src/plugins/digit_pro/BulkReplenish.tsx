/**
 * IN7 / INV-010 — below-reorder list → Material Request drafts in one action (Inventory Control Center, reorder tab).
 * Rows already on an open draft request show that request instead of a checkbox, so demand is never duplicated; the rest
 * can be picked (or all at once) and become one native draft per request type through bulkReplenishmentDrafts().
 * Nothing is submitted or ordered here; the native Material Request form stays the place to review and submit.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLang } from "@/i18n";
import { can } from "./finance";
import { bulkReplenishmentDrafts, openRequestFor } from "./replenishment";
import type { InvItem } from "./inventoryCommand";

export interface Picks {
  eligible: InvItem[]; covered: Map<string, string>; picked: Set<string>; allowed: boolean;
  toggle: (key: string) => void; setAll: (on: boolean) => void; clear: () => void;
  box: (i: InvItem) => ReactNode; chip: (key: string) => ReactNode;
}

export function usePicks(rows: InvItem[], company: string, user: string): Picks {
  const ar = useLang() === "ar";
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const allowed = rows.length > 0 && can("Material Request", "create", { name: "new", doctype: "Material Request", company }, user);
  const covered = new Map<string, string>();
  for (const i of rows) if (i.replenish) { const mr = openRequestFor(company, i.item, i.warehouse, i.replenish.requestType, user); if (mr) covered.set(i.key, mr.name); }
  const eligible = rows.filter((i) => i.replenish && !covered.has(i.key));
  const live = new Set([...picked].filter((k) => eligible.some((i) => i.key === k)));
  const toggle = (key: string) => setPicked((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return {
    eligible, covered, picked: live, allowed, toggle,
    setAll: (on) => setPicked(on ? new Set(eligible.map((i) => i.key)) : new Set()),
    clear: () => setPicked(new Set()),
    box: (i) => allowed && i.replenish && !covered.has(i.key)
      ? <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={live.has(i.key)} onChange={() => toggle(i.key)} aria-label={`${ar ? "اختيار" : "Select"} ${i.itemName} · ${i.warehouse}`} data-dp-bulk-pick={i.key} />
      : null,
    chip: (key) => { const mr = covered.get(key); return mr ? <Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "material_request", name: mr }} className="chip whitespace-nowrap bg-muted text-[11px] text-primary hover:underline" data-dp-bulk-covered={mr}>{ar ? "طلب مسودة" : "Draft request"} <bdi data-no-i18n>{mr}</bdi></Link> : null; },
  };
}

export function BulkReplenish({ picks, company, user }: { picks: Picks; company: string; user: string }) {
  const ar = useLang() === "ar"; const t = (en: string, a: string) => (ar ? a : en);
  const nav = useNavigate();
  const [last, setLast] = useState<string[]>([]);
  const n = picks.picked.size;
  const all = picks.eligible.length > 0 && n === picks.eligible.length;
  const summary = useMemo(() => `${picks.eligible.length} / ${picks.eligible.length + picks.covered.size}`, [picks.eligible.length, picks.covered.size]);
  if (!picks.eligible.length && !picks.covered.size) return null;
  const run = () => {
    const sel = picks.eligible.filter((i) => picks.picked.has(i.key)).map((i) => ({ item: i.item, warehouse: i.warehouse }));
    try {
      const r = bulkReplenishmentDrafts(company, sel, user);
      const lines = r.created.reduce((a, d) => a + (Array.isArray(d["items"]) ? (d["items"] as unknown[]).length : 0), 0);
      picks.clear(); setLast(r.created.map((d) => d.name));
      toast.success(ar ? `أُعدّ ${r.created.length} طلب مواد مسودة (${lines} بند)${r.reused.length ? `؛ ${r.reused.length} مطلوب مسبقًا` : ""}${r.skipped.length ? `؛ ${r.skipped.length} تُرك لمراجعة الإعداد` : ""}.`
        : `${r.created.length} draft material request(s) prepared (${lines} line(s))${r.reused.length ? `; ${r.reused.length} already requested` : ""}${r.skipped.length ? `; ${r.skipped.length} left for setup review` : ""}.`);
      if (r.created.length === 1) void nav({ to: "/app/$app/$doctype/$name", params: { app: "erpnext", doctype: "material_request", name: r.created[0]!.name } });
    } catch {
      toast.error(t("Unable to prepare requests; review permissions and reorder settings.", "تعذّر إعداد الطلبات؛ راجع الصلاحيات وإعدادات إعادة الطلب."));
    }
  };
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-xs" data-dp-bulk-replenish={summary}>
    {picks.allowed && picks.eligible.length > 0 && <label className="inline-flex items-center gap-1.5"><input type="checkbox" className="h-4 w-4 accent-primary" checked={all} onChange={(e) => picks.setAll(e.target.checked)} data-dp-bulk-all />{t("Select all to request", "اختيار كل ما يُطلب")} (<bdi data-no-i18n>{picks.eligible.length}</bdi>)</label>}
    {picks.covered.size > 0 && <span className="text-muted-foreground" data-dp-bulk-covered-count={picks.covered.size}>{t("Already on a draft request", "مدرج في طلب مسودة")}: <bdi data-no-i18n>{picks.covered.size}</bdi></span>}
    {last.length > 1 && <span className="inline-flex flex-wrap gap-1" data-dp-bulk-created>{last.map((m) => <Link key={m} to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "material_request", name: m }} className="text-primary hover:underline"><bdi data-no-i18n>{m}</bdi></Link>)}</span>}
    {picks.allowed ? <button type="button" className="btn-primary ms-auto min-h-8 text-xs disabled:opacity-50" disabled={!n} onClick={run} data-dp-bulk-run={n}>
      {t("Prepare material requests", "إعداد طلبات المواد")} (<bdi data-no-i18n>{n}</bdi>)</button>
      : <span className="ms-auto text-muted-foreground" data-dp-bulk-denied>{t("Your role cannot create Material Requests.", "لا يسمح دورك بإنشاء طلبات المواد.")}</span>}
    <span className="basis-full text-[11px] text-muted-foreground">{t("Drafts only, one per request type; review and submit them in the native form. The list clears on DIGIT once submitted requests raise the projected quantity.", "مسودات فقط، طلب لكل نوع؛ راجعها وأرسلها من النموذج الأصلي. تُزال الأسطر في النظام بعد أن ترفع الطلبات المرسلة الكمية المتوقعة.")}</span>
  </div>;
}
