/**
 * HR section tools (round 2): the section's work tools in Documents & work — a tile per tool, the chosen tool opens in
 * place (`?tool=<id>`) with its inputs, a live preview for views and a Run button for actions, then the result: message,
 * reasons, the records written (same-screen Quick View), a fixed-height table with totals and a download when the tool
 * produces a file. All rules live in plugins/digit_hr/r10 (tools.ts → features/*); this component only renders.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, Play, Sparkles, Wrench, X } from "lucide-react";
import { useStoreVersion } from "@/lib/adapter";
import { fmtCurrency } from "@/lib/format";
import { DxPanel } from "@/components/digit/Experience";
import { QuickLink } from "@/components/enterprise/QuickView";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import { markNewSeen, seenNew } from "@/plugins/digit_hr/r10/features/closing";
import { initialValues, linkOptions, runTool, toolById, toolsOf, type Bi, type Cell, type HrTool, type ToolInput, type ToolOut, type Values } from "@/plugins/digit_hr/r10/tools";

const isBi = (c: unknown): c is Bi => Array.isArray(c) && c.length === 2 && typeof c[0] === "string";

export function SectionTools({ section, ar, tool, onTool }: { section: string; ar: boolean; tool?: string | undefined; onTool: (id: string | undefined) => void }) {
  const tools = toolsOf(section);
  const t = (en: string, a: string) => (ar ? a : en);
  if (!tools.length) return null;
  const open = tool ? toolById(tool) : undefined;
  // UX-18: a tool is "New" for each user until opened once; the optional tour opens the unseen tools one by one
  const user = useSessionUser(); const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => { setSeen(seenNew(user)); }, [user]);
  const unseen = seen ? tools.filter((x) => !seen.has(x.id)) : [];
  const see = (ids: string[]) => { markNewSeen(ids, user); setSeen(seenNew(user)); };
  const pick = (id: string | undefined) => { if (id) see([id]); onTool(id); };
  useEffect(() => { if (open && seen && !seen.has(open.id)) see([open.id]); }, [open?.id, seen]); // opened from a link counts as seen
  return (
    <DxPanel title={t("Section tools", "أدوات القسم")} subtitle={t("Work done right here: each tool checks your permissions and writes through the same documents.", "عمل يُنجز هنا مباشرة: كل أداة تتحقق من صلاحياتك وتكتب في المستندات نفسها.")} attrs={{ "data-hr-tools": section }}>
      {unseen.length > 0 && <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm" role="status" data-hr-whats-new={unseen.length}>
        <Sparkles className="h-4 w-4 text-primary" aria-hidden /><span className="min-w-0 flex-1">{t(`What's new: ${unseen.length} tool(s) added to this section.`, `ما الجديد: ${unseen.length === 1 ? "أُضيفت أداة واحدة" : unseen.length === 2 ? "أُضيفت أداتان" : unseen.length <= 10 ? `أُضيفت ${unseen.length} أدوات` : `أُضيفت ${unseen.length} أداة`} إلى هذا القسم.`)}</span>
        <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={() => pick(unseen[0]!.id)} data-hr-tour>{t("Show me", "أرني")}</button>
        <button type="button" className="btn-secondary h-8 px-3 text-xs" onClick={() => see(unseen.map((x) => x.id))} data-hr-seen-all>{t("Mark as seen", "تمت المشاهدة")}</button>
      </div>}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="list">
        {tools.map((x) => (
          <button key={x.id} type="button" role="listitem" onClick={() => pick(open?.id === x.id ? undefined : x.id)} aria-pressed={open?.id === x.id} data-hr-tool={x.id}
            className={`flex min-w-0 items-start gap-2 rounded-lg border p-3 text-start transition-colors ${open?.id === x.id ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted"}`}>
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0"><span className="block text-sm font-semibold">{t(...x.title)}{seen && !seen.has(x.id) ? <span className="dhr-pill ms-2 align-middle text-[11px] text-primary" data-hr-new={x.id}>{t("New", "جديد")}</span> : null}</span><span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{t(...x.summary)}</span></span>
          </button>
        ))}
      </div>
      {open && open.sections.includes(section) && <ToolRunner key={open.id} tool={open} ar={ar} onClose={() => onTool(undefined)} />}
    </DxPanel>
  );
}

function ToolRunner({ tool, ar, onClose }: { tool: HrTool; ar: boolean; onClose: () => void }) {
  const ver = useStoreVersion(); const user = useSessionUser();
  const t = (en: string, a: string) => (ar ? a : en);
  const [vals, setVals] = useState<Values>(() => initialValues(tool, user));
  const [out, setOut] = useState<ToolOut | undefined>(undefined);
  useEffect(() => { setVals(initialValues(tool, user)); setOut(undefined); }, [tool, user]);
  // views preview live as the inputs change (and when records change); actions run only on the button
  const live = useMemo(() => (tool.kind === "view" ? runTool(tool, vals, user) : undefined), [tool, vals, user, ver]);
  const shown = tool.kind === "view" ? live : out;
  const set = (k: string, v: string) => setVals((p) => ({ ...p, [k]: v }));
  const run = () => setOut(runTool(tool, vals, user));
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-4" aria-labelledby={`hr-tool-${tool.id}-h`} data-hr-tool-open={tool.id}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 id={`hr-tool-${tool.id}-h`} className="text-base font-semibold">{t(...tool.title)}</h3><p className="mt-0.5 text-xs text-muted-foreground">{t(...tool.summary)}</p></div>
        <button type="button" className="btn-secondary inline-flex h-8 w-8 shrink-0 items-center justify-center" onClick={onClose} aria-label={t("Close the tool", "إغلاق الأداة")}><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {tool.inputs.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tool.inputs.map((i) => <Field key={i.key} input={i} vals={vals} user={user} ar={ar} onChange={(v) => set(i.key, v)} />)}
      </div>}
      {tool.kind === "action" && <div className="mt-3 flex justify-end"><button type="button" className="btn-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm" onClick={run} data-hr-tool-run={tool.id}><Play className="h-4 w-4 rtl:-scale-x-100" aria-hidden />{tool.cta ? t(...tool.cta) : t("Run", "تشغيل")}</button></div>}
      {shown && <Result out={shown} ar={ar} />}
    </section>
  );
}

function Field({ input: i, vals, user, ar, onChange }: { input: ToolInput; vals: Values; user: string; ar: boolean; onChange: (v: string) => void }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const id = `hr-tool-in-${i.key}`; const v = vals[i.key] ?? "";
  const label = <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{t(...i.label)}{!i.optional && i.type !== "check" && <span className="text-destructive"> *</span>}</label>;
  const cls = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm";
  if (i.type === "check") return <label className="flex items-center gap-2 self-end pb-2 text-sm"><input id={id} type="checkbox" checked={v === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "")} />{t(...i.label)}</label>;
  if (i.type === "textarea") return <div className="sm:col-span-2 lg:col-span-3">{label}<textarea id={id} className="min-h-[96px] w-full rounded-md border border-border bg-card p-2 text-sm" value={v} onChange={(e) => onChange(e.target.value)} dir="auto" /></div>;
  if (i.type === "select") { const opts = typeof i.options === "function" ? i.options(vals) : i.options ?? [];
    return <div>{label}<select id={id} className={cls} value={v} onChange={(e) => onChange(e.target.value)}>{i.optional && !opts.some((o) => o[0] === "") && <option value="">—</option>}{opts.map((o) => <option key={o[0]} value={o[0]}>{ar ? o[2] : o[1]}</option>)}</select></div>; }
  if (i.type === "link") { const opts = linkOptions(i, vals, user);
    return <div>{label}<select id={id} className={cls} value={v} onChange={(e) => onChange(e.target.value)} data-no-i18n>{(i.optional || !v) && <option value="">{t("— choose —", "— اختر —")}</option>}{opts.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}</select></div>; }
  return <div>{label}<input id={id} className={cls} type={i.type === "number" ? "number" : i.type} value={v} onChange={(e) => onChange(e.target.value)} dir="auto" /></div>;
}

function Result({ out, ar }: { out: ToolOut; ar: boolean }) {
  const t = (en: string, a: string) => (ar ? a : en);
  const tb = out.table;
  const cell = (c: Cell | undefined, money?: boolean): React.ReactNode => {
    if (c === undefined || c === "") return "";
    if (isBi(c)) return ar ? c[1] : c[0];
    if (typeof c === "object" && "doc" in c) return <QuickLink doctype={c.doc[0]} name={c.doc[1]} className="text-primary hover:underline">{c.label ?? c.doc[1]}</QuickLink>;
    if (typeof c === "object" && "to" in c) return <Link to={c.to as "/digit-hr"} className="text-primary hover:underline">{ar ? c.label[1] : c.label[0]}</Link>;
    if (typeof c === "number") return money ? fmtCurrency(c, "SAR") : c.toLocaleString(ar ? "ar-SA" : "en-US", { maximumFractionDigits: 2 });
    return c;
  };
  const download = () => { if (!out.file || typeof document === "undefined") return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + out.file.text], { type: out.file.mime })); a.download = out.file.name; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <div className="mt-4 space-y-3" data-hr-tool-result={out.ok ? "ok" : "refused"} aria-live="polite">
      {out.message && <div className={`rounded-md border px-3 py-2 text-sm ${out.ok ? "border-primary/30 bg-accent" : "border-destructive/40 bg-destructive/5 text-destructive"}`} role={out.ok ? "status" : "alert"}>
        {t(...out.message)}
        {out.errors && out.errors.length > 0 && <ul className="mt-1 list-disc ps-5 text-xs">{out.errors.slice(0, 12).map((e, k) => <li key={k} dir="auto">{e}</li>)}</ul>}
      </div>}
      {out.warnings && out.warnings.length > 0 && <ul className="rounded-md border border-border bg-muted px-3 py-2 text-xs" data-hr-tool-warnings>{out.warnings.slice(0, 12).map((w, k) => <li key={k} dir="auto">{w}</li>)}</ul>}
      {out.created && out.created.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">{t("Written:", "المكتوب:")}</span>
        {out.created.slice(0, 20).map(([dt, nm]) => <QuickLink key={`${dt}|${nm}`} doctype={dt} name={nm} className="dhr-pill text-primary">{nm}</QuickLink>)}</div>}
      {out.file && <button type="button" className="btn-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs" onClick={download} data-hr-tool-download><Download className="h-3.5 w-3.5" aria-hidden />{t("Download", "تنزيل")} {out.file.name}</button>}
      {tb && tb.columns.length > 0 && (tb.rows.length ? <div className="max-h-[420px] overflow-auto rounded-md border border-border" data-hr-tool-table>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-muted"><tr>{tb.columns.map((c) => <th key={c.key} scope="col" className={`px-3 py-2 text-xs font-semibold ${c.numeric || c.money ? "text-end" : "text-start"}`}>{ar ? c.label[1] : c.label[0]}</th>)}</tr></thead>
          <tbody>{tb.rows.map((r, k) => <tr key={k} className="border-t border-border">{tb.columns.map((c) => <td key={c.key} className={`px-3 py-1.5 align-top ${c.numeric || c.money ? "text-end tabular-nums" : ""}`} data-no-i18n={typeof r[c.key] === "string" ? true : undefined}>{cell(r[c.key], c.money)}</td>)}</tr>)}</tbody>
          {tb.totals && Object.keys(tb.totals).length > 0 && <tfoot className="sticky bottom-0 bg-muted font-semibold"><tr className="border-t border-border">{tb.columns.map((c, k) => <td key={c.key} className={`px-3 py-2 ${c.numeric || c.money ? "text-end tabular-nums" : ""}`}>{k === 0 ? t("Total", "الإجمالي") : tb.totals![c.key] !== undefined ? cell(tb.totals![c.key], c.money) : ""}</td>)}</tr></tfoot>}
        </table>
      </div> : <p className="dhr-empty text-sm">{t("Nothing to show yet.", "لا يوجد ما يُعرض بعد.")}</p>)}
    </div>
  );
}
