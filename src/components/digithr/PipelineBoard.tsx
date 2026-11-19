import { Button } from "@/components/ui/button";
import { arLabel, useSources } from "@/components/digithr/workspaces/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTx } from "@/components/digithr/DigitHrLayout";
import { enterHrNative } from "@/components/digithr/HrNav";
import { placeDoc } from "@/plugins/digit_hr/v6/nav";
import { t as tr } from "@/i18n";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type R = any;
/** Days since the record last changed (Frappe `modified`, falling back to `creation`) — a proxy for days in the current stage. */
export const daysIn = (r: R): number | null => { const d = Date.parse(s(r?.modified || r?.creation)); return Number.isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d) / 86400000)); };
export const s = (v: unknown) => (v == null ? "" : String(v));

export function NativeLink({ dt, name, module, children }: { dt: string; name?: string; module?: string; children: React.ReactNode }) {
  const p = placeDoc(dt, module);
  if (!p) return <span>{children}</span>;
  return name
    ? <Link to="/app/$app/$doctype/$name" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug, name }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>
    : <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: p.app, doctype: p.slug }} onClick={() => enterHrNative(p.sub)} className="hover:underline">{children}</Link>;
}

/** One lifecycle stage: a source DocType, its status field and the rows read through the permission scope. */
export type Stage = { key: string; ar: string; en: string; dt: string; statusField: string; label: (r: R) => string; note?: { ar: string; en: string } };

/** Shared lifecycle pipeline: stage cards with per-status counts; clicking a status shows the exact rows behind the number, each opening its native document. */
export function PipelineBoard({ stages, module }: { stages: Stage[]; module: string }) {
  const { tx } = useTx();
  const [sel, setSel] = useState<{ stage: string; status: string } | null>(null);
  const src = useSources(tx);
  const data = stages.map((st) => ({ st, rows: src.rows(st.dt).filter((r) => Number(r.docstatus) !== 2) }));
  const active = sel ? data.find((d) => d.st.key === sel.stage) : undefined;
  const rows = active ? active.rows.filter((r) => sel?.status === "*" || (s(r[active.st.statusField]) || "—") === sel?.status) : [];
  return (
    <>
      <ol className="mb-6 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {data.map(({ st, rows: rs }, i) => {
          const counts: Record<string, number> = {};
          rs.forEach((r) => { const k = s(r[st.statusField]) || "—"; counts[k] = (counts[k] || 0) + 1; });
          return (
            <li key={st.key} className="dhr-card rounded-[18px] p-4">
              <div className="text-xs opacity-60" data-no-i18n>{String(i + 1).padStart(2, "0")}</div>
              <div className="font-semibold"><NativeLink dt={st.dt} module={module}>{tx(st.ar, st.en)}</NativeLink></div>
              <Button variant="ghost" type="button" onClick={() => setSel({ stage: st.key, status: "*" })} className="mt-1 min-h-11 text-2xl font-semibold hover:underline" data-no-i18n>{src.v(rs.length, st.dt)}</Button>
              <div className="flex flex-wrap gap-1">
                {Object.entries(counts).map(([k, n]) => (
                  <Button variant="ghost" key={k} type="button" onClick={() => setSel({ stage: st.key, status: k })} data-active={(sel?.stage === st.key && sel.status === k) || undefined} className="dhr-chip min-h-8 text-xs data-[active]:font-semibold"><span>{k === "—" ? k : tr(k)}</span> · <span data-no-i18n>{n}</span></Button>
                ))}
              </div>
              {(() => { const ds = rs.map(daysIn).filter((x): x is number => x != null); return ds.length ? <p className="mt-1 text-xs opacity-70">{tx("متوسط الأيام منذ آخر تعديل (تقديري)", "Average days since last update (proxy)")}: <span data-no-i18n>{Math.round(ds.reduce((a, b) => a + b, 0) / ds.length)}</span></p> : null; })()}
              {st.note && <p className="mt-2 text-xs opacity-70">{tx(st.note.ar, st.note.en)}</p>}
            </li>
          );
        })}
      </ol>
      {active && (
        <section className="dhr-card mb-6 rounded-[18px] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold">{tx(active.st.ar, active.st.en)} · <span data-no-i18n>{sel?.status === "*" ? "" : sel?.status} ({rows.length})</span></h2>
            <Button variant="ghost" type="button" onClick={() => setSel(null)} className="dhr-chip min-h-9">{tx("إغلاق", "Close")}</Button>
          </div>
          {rows.length === 0 ? src.empty(active.st.dt) : (
            <ul className="divide-y">
              {rows.slice(0, 50).map((r) => (
                <li key={s(r.name)} className="flex min-h-11 items-center justify-between gap-2" data-no-i18n>
                  <NativeLink dt={active.st.dt} name={s(r.name)} module={module}>{tx(arLabel(active.st.label(r) || s(r.name)),active.st.label(r) || s(r.name))}</NativeLink>
                  <span className="text-xs opacity-60">{s(r.name)} · {tx(arLabel(s(r[active.st.statusField])),s(r[active.st.statusField])) || "—"}{daysIn(r) != null && <> · {daysIn(r)} {tx("يوم", "d")}</>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
