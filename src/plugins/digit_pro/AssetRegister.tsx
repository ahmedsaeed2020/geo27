// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * SC-A-07 Asset Register (All Assets): native Asset records with current carrying values, filters, and personal
 * Saved Views (shared ViewToolbar: views, columns, sort, density, export/print gated on Asset permissions).
 * URL is the effective state; `bucket` is the asset group (the `view` key belongs to Saved Views).
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { Open360 } from "@/components/enterprise/Open360";
import { useCallback } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtCurrency } from "@/lib/format";
import { financeContext, can, todayIso } from "./finance";
import { ProFrame, SourceState } from "./ProFrame";
import { ASSET_SOURCES, assetWorkspace } from "./assetWorkspace";
import { AssetDocLink, NewAssetDoc, useAssetLabels } from "./AssetUI";
import { SortTh, ViewToolbar, useRegister } from "./ViewToolbar";
import { ASSET_SPEC, ASSET_BUCKET_LABEL, sortRows } from "./viewSpecs";
import type { Search } from "./savedViews";
import { DateInput } from "@/components/form/DateInput";

const MONEY = new Set(["cost", "accumulated", "book"]);
const RETIRED = ["Sold", "Scrapped", "Capitalized", "In Maintenance", "Out of Order"];
type Bucket = "" | "active" | "fully" | "maintenance" | "draft";
const BUCKETS: Bucket[] = ["", "active", "fully", "maintenance"];

export function EnterpriseAssetRegister({ search }: { search: Search }) {
  const nav = useNavigate();
  const { label: l, display, lang } = useAssetLabels();
  const ar = lang === "ar";
  const set = (p: Search) => void nav({ to: "/pro/asset-register", search: ((prev: Search) => ({ ...prev, ...p })) as never, replace: true });
  const apply = useCallback((next: Search) => void nav({ to: "/pro/asset-register", search: ((prev: Search) => ({ ...prev, ...next })) as never, replace: true }), [nav]);
  const reg = useRegister(ASSET_SPEC, search);
  const heading = (k: string) => { const c = ASSET_SPEC.columns.find((x) => x.key === k); return c ? (ar ? c.ar : c.label) : k; };
  return <ProFrame title={l("All Assets", "كل الأصول")} subtitle={l("Asset register · acquisition, custody, carrying value and source documents", "سجل الأصول · الاقتناء والعهدة والقيمة الدفترية ومستندات المصدر")} tabs={false} doctypes={ASSET_SOURCES}>
    {({ user }) => {
      const ctx = financeContext(search["company"], user);
      const w = assetWorkspace({ company: ctx.company, asof: search["asof"] || todayIso(), book: search["book"] }, user);
      if (w.states["Asset"] !== "ok") return <SourceState status={w.states["Asset"] ?? "unavailable"} doctype="Asset" />;
      type A = (typeof w.all)[number];
      const q = (search["q"] ?? "").trim().toLowerCase();
      const filtered = w.all.filter((a) => (!q || `${a.name} ${a["asset_name"]} ${display(a["asset_name"])}`.toLowerCase().includes(q))
        && ["category", "status", "location", "custodian"].every((k) => !search[k] || String(a[k === "category" ? "asset_category" : k] || "Draft") === search[k])
        && (!search["from"] || String(a["purchase_date"] ?? "") >= search["from"]) && (!search["to"] || String(a["purchase_date"] ?? "") <= search["to"]));
      const inBucket = (a: A, b: string | undefined) => b === "active" ? Number(a.docstatus) === 1 && !RETIRED.includes(String(a["status"]))
        : b === "fully" ? a["status"] === "Fully Depreciated" || Number(a["is_fully_depreciated"]) === 1
        : b === "maintenance" ? a["status"] === "In Maintenance" : b === "draft" ? Number(a.docstatus) === 0 : true;
      const bucket = search["bucket"];
      const next = (name: string) => w.dep.filter((r) => r.asset?.name === name && !r.je).sort((x, y) => x.date.localeCompare(y.date))[0]?.date || "";
      const val = (a: A, k: string): string | number | undefined => k === "next" ? next(a.name) : MONEY.has(k) ? w.financial(a)[k as "cost" | "accumulated" | "book"] : String(a[k] ?? "");
      const rows = sortRows(filtered.filter((a) => inBucket(a, bucket)), reg.sort, (a, k) => { const v = val(a, k); return typeof v === "number" ? v : v === undefined ? -Infinity : String(v); });
      const money = (v: number | undefined) => (v === undefined ? "—" : fmtCurrency(v, ctx.currency));
      const total = rows.some((a) => w.financial(a).book === undefined) ? undefined : rows.reduce((t, a) => t + (w.financial(a).book ?? 0), 0);
      const nativeFilters: unknown[] = [["company", "=", ctx.company]];
      for (const k of ["category", "location", "custodian", "status"]) if (search[k]) nativeFilters.push([k === "category" ? "asset_category" : k, "=", search[k]]);
      if (q) nativeFilters.push(["name", "in", rows.map((a) => a.name)]);
      const exporter = { doctype: "Asset", filename: `assets_${ctx.company}`, build: () => ({ columns: reg.cols.map((k) => ({ fieldname: k, label: heading(k) })), rows: rows.map((a) => Object.fromEntries(reg.cols.map((k) => [k, val(a, k) ?? ""]))) }) };
      const select = (key: string, en: string, arl: string, options: string[]) => <label className="dp-ctx-item"><span>{l(en, arl)}</span>
        <select className="field-input" value={search[key] ?? ""} onChange={(e) => set({ [key]: e.target.value || undefined })}><option value="">{l("All", "الكل")}</option>{options.map((v) => <option key={v} value={v}>{display(v)}</option>)}</select></label>;
      const cell = (a: A, k: string) => {
        if (k === "name") return <AssetDocLink dt="Asset" name={a.name} />;
        if (MONEY.has(k)) return money(val(a, k) as number | undefined);
        if (k === "asset_category") return <AssetDocLink dt="Asset Category" name={String(a[k] ?? "")}>{display(a[k])}</AssetDocLink>;
        if (k === "custodian") return <AssetDocLink dt="Employee" name={String(a[k] ?? "")} />;
        if (["asset_name", "status", "location"].includes(k)) return display(val(a, k));
        return String(val(a, k) || "—");
      };
      return <div data-no-i18n data-dp-enterprise-register>
        <div className="flex flex-wrap items-center gap-2 py-3">
          <NewAssetDoc company={ctx.company} user={user} />
          <span className="text-sm text-muted-foreground" data-dp-asset-count={rows.length}>{rows.length} {l("matching assets", "أصل مطابق")} · {ctx.company}</span>
          <div className="ms-auto flex flex-wrap gap-1">
            <Button asChild size="sm" variant="outline"><Link to="/app/$app/$doctype" params={{ app: "erpnext", doctype: "asset" }} search={{ filters: JSON.stringify(nativeFilters) } as never}>{l("Native asset list", "قائمة الأصول الأصلية")}<ArrowUpRight /></Link></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 border-y border-border py-3 lg:grid-cols-5" role="group" aria-label={l("Asset group", "مجموعة الأصول")}>
          {BUCKETS.map((id) => <Button key={id || "all"} variant={(bucket ?? "") === id ? "secondary" : "ghost"} aria-pressed={(bucket ?? "") === id} className="h-auto flex-col items-start rounded-none text-start" onClick={() => set({ bucket: id || undefined })} data-dp-asset-bucket={id || "all"}>
            <span className="text-xs text-muted-foreground">{id ? (ASSET_BUCKET_LABEL[id]?.[ar ? 1 : 0] ?? id) : l("All", "الكل")}</span>
            <b className="text-lg">{filtered.filter((a) => inBucket(a, id || undefined)).length}</b></Button>)}
          <div className="p-2"><p className="text-xs text-muted-foreground">{l("Matching book value", "القيمة الدفترية المطابقة")}</p><b className="text-lg tabular-nums">{money(total)}</b></div>
        </div>
        <section className="dp-context mt-3 flex-wrap">
          <label className="dp-ctx-item"><span>{l("Search ID or name", "ابحث برقم الأصل أو اسمه")}</span><input className="field-input" value={search["q"] ?? ""} onChange={(e) => set({ q: e.target.value || undefined })} /></label>
          <label className="dp-ctx-item"><span>{l("Company", "الشركة")}</span><select className="field-input" value={ctx.company} onChange={(e) => set({ company: e.target.value })}>{ctx.companies.map((c) => <option key={c}>{c}</option>)}</select></label>
          {select("category", "Category", "الفئة", [...new Set(w.all.map((a) => String(a["asset_category"] ?? "")).filter(Boolean))])}
          {select("status", "Status", "الحالة", [...new Set(w.all.map((a) => String(a["status"] || "Draft")))])}
          {select("location", "Location", "الموقع", [...new Set(w.all.map((a) => String(a["location"] ?? "")).filter(Boolean))])}
          {select("custodian", "Custodian", "صاحب العهدة", [...new Set(w.all.map((a) => String(a["custodian"] ?? "")).filter(Boolean))])}
          {select("book", "Finance Book", "الدفتر المالي", (w.data["Finance Book"] ?? []).map((b) => b.name))}
          {(["from", "to"] as const).map((k) => <label key={k} className="dp-ctx-item"><span>{k === "from" ? l("Acquired from", "الاقتناء من") : l("Acquired to", "الاقتناء إلى")}</span><DateInput className="field-input" value={search[k] ?? ""} onChange={(e) => set({ [k]: e.target.value || undefined })} /></label>)}
        </section>
        <ViewToolbar spec={ASSET_SPEC} search={search} companies={ctx.companies} onApply={apply} exporter={exporter} />
        <div className="mt-3 overflow-x-auto border-y border-border" data-dp-asset-register>
          {!rows.length ? <SourceState status="empty" /> : <EntTable id="pro-asset-register" wrap views={false}><table className="w-full text-sm">
            <thead className="bg-muted"><tr className="text-xs text-muted-foreground">
              {reg.cols.map((k) => { const c = ASSET_SPEC.columns.find((x) => x.key === k)!; return <SortTh key={k} k={k} label={heading(k)} sort={reg.sort} sortable={ASSET_SPEC.sorts.includes(k)} align={c.align} onSort={(v) => apply({ ...search, sort: v })} />; })}
              <th className="p-2" scope="col">{l("Actions", "الإجراءات")}</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.name} className="border-b border-border hover:bg-muted/40" data-dp-asset-row={a.name}>
              {reg.cols.map((k) => <td key={k} className={`${reg.cell} whitespace-nowrap ${MONEY.has(k) ? "text-end tabular-nums" : ""}`}>{cell(a, k)}</td>)}
              <td className="p-2"><span className="inline-flex items-center gap-1.5"><Open360 doctype="Asset" name={a.name} compact /><Button asChild size="sm" variant="ghost"><Link to="/app/$app/$doctype/$name" params={{ app: "erpnext", doctype: "asset", name: a.name }}>{l("Open", "فتح")}<ArrowUpRight /></Link></Button></span></td></tr>)}</tbody>
          </table></EntTable>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{l("Current native values, not historical ledger balances. Missing values remain unavailable.", "القيم الأصلية الحالية وليست أرصدة تاريخية لدفتر الأستاذ. تبقى القيم المفقودة غير متاحة.")}</span>
          <Button asChild variant="link" size="sm"><Link to="/report/$name" params={{ name: "Fixed Asset Register" }} search={{ company: ctx.company } as never}>{l("Fixed Asset Register report", "تقرير سجل الأصول الثابتة")}</Link></Button>
        </div>
        {can("Asset", "import", undefined, user) && <Button asChild variant="outline" size="sm"><Link to="/app/data-import">{l("Import assets", "استيراد الأصول")}<ArrowUpRight /></Link></Button>}
      </div>;
    }}
  </ProFrame>;
}
