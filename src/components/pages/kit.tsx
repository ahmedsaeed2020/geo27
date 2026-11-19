import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";

/** Shared building blocks for reconstructed Frappe Desk Pages (frappe.ui.make_app_page). */
export const inputCls = "rounded-md border border-input bg-background px-2 py-1 text-sm";
export const btnCls = "rounded-md border border-input bg-background px-3 py-1 text-sm hover:bg-muted disabled:opacity-50";
export const primaryCls = "rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50";

export function Tag({ kind, children }: { kind: "native" | "simulated" | "server"; children?: ReactNode }) {
  const tone = kind === "server" ? "bg-destructive/10 text-destructive" : kind === "simulated" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground";
  const label = kind === "server" ? "server-dependent" : kind === "simulated" ? "local simulation" : "reconstructed page";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tone}`} title={typeof children === "string" ? children : undefined}>{label}{children ? ` · ${children}` : ""}</span>;
}

export function PageField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">{label}{children}</label>;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}

/** Link to any record's form using the catalog index for app + slug. */
export function DocLink({ doctype, name, children }: { doctype: string; name: string; children?: ReactNode }) {
  const idx = useQuery(indexQuery);
  const e = idx.data?.find((x) => x.name === doctype);
  if (!e) return <span>{children ?? name}</span>;
  return <Link to="/app/$app/$doctype/$name" params={{ app: e.app, doctype: e.slug, name }} className="text-primary hover:underline">{children ?? name}</Link>;
}

export function useMeta(doctype: string | undefined): DocTypeMeta | null {
  const idx = useQuery(indexQuery);
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  useEffect(() => {
    if (!idx.data || !doctype) { setMeta(null); return; }
    let on = true;
    loadMeta(idx.data, doctype).then((m) => { if (on) setMeta((m as DocTypeMeta) ?? null); });
    return () => { on = false; };
  }, [idx.data, doctype]);
  return meta;
}

export function DoctypeSelect({ value, onChange, filter }: { value: string; onChange: (v: string) => void; filter?: (e: { istable: number; issingle: number; is_submittable: number }) => boolean }) {
  const idx = useQuery(indexQuery);
  const opts = (idx.data ?? []).filter((e) => !e.istable && (!filter || filter(e))).map((e) => e.name).sort();
  return (
    <>
      <input list="dt-options" className={inputCls} value={value} placeholder="Document Type" onChange={(e) => onChange(e.target.value)} />
      <datalist id="dt-options">{opts.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}

export const money = (n: unknown) => Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
