// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * Item 360 (/pro/item-360) and Asset 360 (/pro/asset-360) as their own pages (owner gap list A08 / A09, Run11.1 A7):
 * a permission-scoped picker, then the same Item 360 / Asset 360 panels the native forms show (OpsPanels.Item360Panel,
 * Asset360.ConnectedAsset360) — one implementation, two places — plus the item's purchase and sales document trail with
 * the ledger lines each document posted (itemTrace.ts). Selection lives in the URL, so a profile is shareable.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Doc } from "@/lib/adapter";
import { scopedGet, scopedList, useScopeMetas } from "@/lib/scope";
import { fmtCurrency } from "@/lib/format";
import { ProFrame, SourceState } from "./ProFrame";
import { Item360Panel } from "./OpsPanels";
import { ConnectedAsset360 } from "./Asset360";
import { DocA } from "./OpsPro";
import { useBi } from "./Q2cUi";
import { itemTrace, type TraceChain } from "./itemTrace";

export const ITEM360_KEYS = ["item", "q"];
export const ASSET360_KEYS = ["asset", "q"];
export type Item360Search = { item?: string | undefined; q?: string | undefined };
export type Asset360Search = { asset?: string | undefined; q?: string | undefined };
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v) || 0;
const DT_AR: Record<string, string> = { "Purchase Order": "أمر شراء", "Purchase Receipt": "إيصال استلام", "Purchase Invoice": "فاتورة مشتريات", "Sales Order": "أمر بيع", "Delivery Note": "إذن تسليم", "Sales Invoice": "فاتورة مبيعات" };

function Picker({ rows, label, q, onQ, onPick, id, sub }: { rows: Doc[]; label: string; q: string; onQ: (q: string) => void; onPick: (name: string) => void; id: string; sub: (d: Doc) => string }) {
  const { t } = useBi(); const [shown, setShown] = useState(24);
  const k = q.trim().toLowerCase();
  const list = rows.filter((d) => !k || `${d.name} ${sub(d)}`.toLowerCase().includes(k));
  return <section className="dp-cc-panel" data-dp-360-picker={id}>
    <div className="dp-cc-panel-h"><h2>{label}</h2><input type="search" className="field-input ms-auto max-w-xs" value={q} onChange={(e) => { setShown(24); onQ(e.target.value); }} placeholder={t("Search by code or name", "ابحث بالرمز أو الاسم")} aria-label={label} data-dp-360-search /></div>
    {!list.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> : <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3" data-dp-360-list={list.length}>
      {list.slice(0, shown).map((d) => <li key={d.name}><button type="button" className="ent-frame flex w-full flex-col items-start p-3 text-start hover:border-primary" onClick={() => onPick(d.name)} data-dp-360-pick={d.name}>
        <span className="ent-title text-sm" data-no-i18n>{sub(d) || d.name}</span><span className="text-xs text-muted-foreground" data-no-i18n>{d.name}</span></button></li>)}
    </ul>}
    {list.length > shown && <div className="p-3 pt-0"><button type="button" className="btn-ghost text-xs" onClick={() => setShown((x) => x + 24)}>{t("Show more", "عرض المزيد")}</button></div>}
  </section>;
}

function Chains({ title, chains, partyLabel }: { title: string; chains: TraceChain[]; partyLabel: string }) {
  const { ar, t } = useBi();
  return <section className="dp-cc-panel" data-dp-item-trace={title}>
    <div className="dp-cc-panel-h"><h2>{title}</h2><span className="dp-cc-note">{t("Each row is one document chain; the number after a document is the ledger lines it posted.", "كل صف سلسلة مستندات واحدة؛ الرقم بعد المستند هو عدد قيود الأستاذ التي رحّلها.")}</span></div>
    {!chains.length ? <div className="dp-cc-panel-b"><SourceState status="empty" /></div> : <div className="overflow-x-auto"><table className="dp-cc-table min-w-[720px]" data-dp-item-trace-rows={chains.length}>
      <thead><tr><th>{partyLabel}</th><th>{t("Documents", "المستندات")}</th><th className="text-end">{t("Qty", "الكمية")}</th><th className="text-end">{t("Amount", "المبلغ")}</th></tr></thead>
      <tbody>{chains.map((c) => <tr key={c.key} data-dp-trace-chain={c.key} data-steps={c.steps.length}>
        <td data-no-i18n>{c.party}</td>
        <td><span className="flex flex-wrap items-center gap-1.5">{c.steps.map((st, i) => <span key={st.name} className="inline-flex items-center gap-1">{i > 0 && <span aria-hidden className="text-muted-foreground">{ar ? "←" : "→"}</span>}
          <span className="text-[11px] text-muted-foreground">{ar ? DT_AR[st.doctype] ?? st.doctype : st.doctype}</span><DocA dt={st.doctype} name={st.name} className="text-xs" />
          {st.gl > 0 && <Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "gl_entry" }} search={{ filters: JSON.stringify([["voucher_no", "=", st.name]]) } as never} className="chip bg-muted text-[11px]" data-dp-trace-gl={st.gl} title={t("Ledger lines", "قيود الأستاذ")}><bdi data-no-i18n>{st.gl}</bdi></Link>}</span>)}</span></td>
        <td className="text-end tabular-nums" data-no-i18n>{c.qty}</td><td className="text-end tabular-nums" data-no-i18n>{fmtCurrency(c.amount)}</td>
      </tr>)}</tbody></table></div>}
  </section>;
}

export function Item360Page({ search }: { search: Item360Search }) {
  const nav = useNavigate(); const { t } = useBi();
  const set = (p: Item360Search) => void nav({ to: "/pro/item-360", search: p as never, replace: !p.item });
  return <ProFrame band={!search.item} title={t("Item 360", "ملف الصنف 360")} subtitle={t("One item's stock by warehouse, reorder levels, batches, movements, purchase and sales documents and the ledger they posted.", "مخزون الصنف حسب المستودع ومستويات إعادة الطلب والدفعات والحركات ومستندات الشراء والبيع وقيودها.")} doctypes={["Item", "Bin", "Stock Ledger Entry", "Purchase Order", "Sales Order", "GL Entry"]}>
    {({ user }) => <ItemBody search={search} user={user} set={set} />}
  </ProFrame>;
}
function ItemBody({ search, user, set }: { search: Item360Search; user: string; set: (p: Item360Search) => void }) {
  useScopeMetas(["Item", "Purchase Order", "Purchase Receipt", "Purchase Invoice", "Sales Order", "Delivery Note", "Sales Invoice", "GL Entry"]);
  const { t } = useBi();
  const doc = search.item ? scopedGet("Item", search.item, user) : undefined;
  if (!search.item || !doc) {
    const items = scopedList("Item", user).filter((i) => !n(i["disabled"]) && !n(i["has_variants"])).sort((a, b) => a.name.localeCompare(b.name));
    return <>{search.item && <p className="dp-state" role="status" data-dp-360-missing>{t("This item is not available to you.", "هذا الصنف غير متاح لك.")}</p>}
      <Picker id="item" rows={items} label={t("Choose an item", "اختر صنفًا")} q={search.q ?? ""} onQ={(q) => set({ q: q || undefined })} onPick={(item) => set({ item })} sub={(d) => s(d["item_name"])} /></>;
  }
  const tr = itemTrace(doc.name, user);
  return <div className="space-y-4" data-dp-screen="I360" data-dp-item-360-page={doc.name}>
    <div className="flex flex-wrap items-center gap-2"><Link to="/pro/item-360" search={{} as never} className="btn-ghost text-xs" data-dp-360-back>{t("All items", "كل الأصناف")}</Link><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "item", name: doc.name }} className="btn-ghost text-xs" data-dp-360-form>{t("Open item form", "فتح نموذج الصنف")}</Link></div>
    <Item360Panel doc={doc} />
    <Chains title={t("Purchase trail", "مسار الشراء")} chains={tr.buying} partyLabel={t("Supplier", "المورد")} />
    <Chains title={t("Sales trail", "مسار البيع")} chains={tr.selling} partyLabel={t("Customer", "العميل")} />
  </div>;
}

export function Asset360Page({ search }: { search: Asset360Search }) {
  const nav = useNavigate(); const { t } = useBi();
  const set = (p: Asset360Search) => void nav({ to: "/pro/asset-360", search: p as never, replace: !p.asset });
  return <ProFrame band={!search.asset} title={t("Asset 360", "ملف الأصل 360")} subtitle={t("One asset's cost, depreciation, book value, location and custody, maintenance, repairs, value changes and ledger.", "تكلفة الأصل وإهلاكه وقيمته الدفترية وموقعه وعهدته وصيانته وإصلاحاته وتعديلات قيمته وقيوده.")} doctypes={["Asset", "Asset Depreciation Schedule", "Asset Movement", "GL Entry"]}>
    {({ user }) => <AssetBody search={search} user={user} set={set} />}
  </ProFrame>;
}
function AssetBody({ search, user, set }: { search: Asset360Search; user: string; set: (p: Asset360Search) => void }) {
  useScopeMetas(["Asset"]);
  const { t } = useBi();
  const doc = search.asset ? scopedGet("Asset", search.asset, user) : undefined;
  if (!search.asset || !doc) {
    const assets = scopedList("Asset", user).filter((a) => n(a.docstatus) !== 2).sort((a, b) => a.name.localeCompare(b.name));
    return <>{search.asset && <p className="dp-state" role="status" data-dp-360-missing>{t("This asset is not available to you.", "هذا الأصل غير متاح لك.")}</p>}
      <Picker id="asset" rows={assets} label={t("Choose an asset", "اختر أصلًا")} q={search.q ?? ""} onQ={(q) => set({ q: q || undefined })} onPick={(asset) => set({ asset })} sub={(d) => s(d["asset_name"])} /></>;
  }
  return <div className="space-y-2" data-dp-screen="A360" data-dp-asset-360-page={doc.name}>
    <div className="flex flex-wrap items-center gap-2"><Link to="/pro/asset-360" search={{} as never} className="btn-ghost text-xs" data-dp-360-back>{t("All assets", "كل الأصول")}</Link><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "asset", name: doc.name }} className="btn-ghost text-xs" data-dp-360-form>{t("Open asset form", "فتح نموذج الأصل")}</Link></div>
    <ConnectedAsset360 doc={doc} />
  </div>;
}
