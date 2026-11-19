/**
 * Read-only preview of the full DIGIT CRM sample dataset (gap CRM-G1, owner directive 2026-10-19).
 *
 * The source generator builds its ~15k-record corpus (1,400 leads, 700 deals, 6,500 tasks, …) inside a background worker
 * (demoPreview.worker.ts) on explicit request. The page receives one page of 25 rows at a time; nothing is written to the
 * shared records or to browser storage, and closing the preview (or leaving the page) discards the corpus.
 */
import { useEffect, useRef, useState } from "react";
import { Database, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang, t } from "@/i18n";
import { PREVIEW_TYPES, previewType, type PreviewPage, type PreviewRecord, type PreviewTypeId, type PreviewColumn } from "./demoPreviewIndex";
import { DateInput } from "@/components/form/DateInput";

type Ready = { counts: Record<string, number>; total: number; ms: number; version: string; asOf: string };
type State = { status: "idle" } | { status: "generating" } | ({ status: "ready" } & Ready) | { status: "error"; error: string };
type Reply = { type: "ready" } & Ready | { type: "error"; message: string } | { type: "page"; id: number; page: PreviewPage } | { type: "record"; id: number; record: PreviewRecord | null };

const nf = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");
/** ISO timestamps read as "YYYY-MM-DD HH:mm"; every other value as stored. */
const showValue = (v: unknown) => { const x = String(v); const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(x); return m ? `${m[1]} ${m[2]}` : x; };
/** option fields whose stored English value has an Arabic display label */
const OPTION_KEYS = new Set(["status", "lead_temperature", "priority", "type", "sla_status", "source", "communication_medium", "sent_or_received", "gender", "user_type"]);
const human = (k: string) => k.replace(/^custom_demo_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Cell({ c, v, ar }: { c: PreviewColumn; v: unknown; ar: boolean }) {
  const s = String(v ?? "");
  if (!s) return <span className="text-muted-foreground">—</span>;
  if (c.kind === "money") return <span dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{nf(v)} {ar ? "ر.س" : "SAR"}</span>;
  if (c.kind === "date") return <span dir="ltr" className="whitespace-nowrap tabular-nums" data-no-i18n>{s.slice(0, 10)}</span>;
  if (c.kind === "status") return <span className="chip whitespace-nowrap bg-muted" data-no-i18n data-status={s}>{ar ? t(s) : s}</span>;
  if (c.kind === "code") return <bdi className="whitespace-nowrap font-mono text-xs" data-no-i18n>{s}</bdi>;
  return <span data-no-i18n>{s}</span>;
}

export function SamplePreview() {
  const ar = useLang() === "ar";
  const tx = (a: string, e: string) => (ar ? a : e);
  const [state, setState] = useState<State>({ status: "idle" });
  const [asOf, setAsOf] = useState("");
  const [type, setType] = useState<PreviewTypeId>("leads");
  const [q, setQ] = useState(""); const [facet, setFacet] = useState(""); const [page, setPage] = useState(1);
  const [result, setResult] = useState<PreviewPage | null>(null);
  const [rec, setRec] = useState<PreviewRecord | null>(null);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const waiting = useRef(new Map<number, (v: PreviewPage | PreviewRecord | null) => void>());

  useEffect(() => { setAsOf(new Date().toISOString().slice(0, 10)); return () => { worker.current?.terminate(); worker.current = null; }; }, []);

  const call = (msg: Record<string, unknown>) => new Promise<PreviewPage | PreviewRecord | null>((resolve) => {
    const id = ++seq.current; waiting.current.set(id, resolve); worker.current?.postMessage({ ...msg, id });
  });
  const open = () => {
    worker.current?.terminate();
    const w = new Worker(new URL("./demoPreview.worker.ts", import.meta.url), { type: "module" });
    worker.current = w; setState({ status: "generating" }); setResult(null); setRec(null);
    w.onmessage = (e: MessageEvent<Reply>) => {
      const m = e.data;
      if (m.type === "ready") setState({ status: "ready", counts: m.counts, total: m.total, ms: m.ms, version: m.version, asOf: m.asOf });
      else if (m.type === "error") setState({ status: "error", error: m.message });
      else { const f = waiting.current.get(m.id); waiting.current.delete(m.id); f?.(m.type === "page" ? m.page : m.record); }
    };
    w.onerror = (e) => { e.preventDefault(); setState({ status: "error", error: e.message || "Worker failed" }); };
    w.postMessage({ type: "generate", asOf });
  };
  const close = () => { worker.current?.terminate(); worker.current = null; waiting.current.clear(); setState({ status: "idle" }); setResult(null); setRec(null); };

  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const timer = window.setTimeout(() => { void call({ type: "query", query: { type, q, facet, page, pageSize: 25 } }).then((p) => { if (live) setResult(p as PreviewPage); }); }, q ? 200 : 0);
    return () => { live = false; window.clearTimeout(timer); };
  }, [ready, type, q, facet, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id: PreviewTypeId) => { setType(id); setQ(""); setFacet(""); setPage(1); setRec(null); };
  const openRecord = (name: string) => { void call({ type: "record", preview: type, name }).then((r) => setRec(r as PreviewRecord | null)); };
  const pt = previewType(type);

  return (
    <section className="space-y-3 border-t border-border pt-4" data-sample-preview data-state={state.status} aria-busy={state.status === "generating"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl space-y-1">
          <h2 className="text-base font-semibold">{tx("معاينة بيانات العرض الكاملة", "Full sample dataset preview")}</h2>
          <p className="text-sm text-muted-foreground">{tx(
            "يُنشئ سجل المبيعات السعودي التجريبي لمدة 18 شهرًا من مولّد المصدر (1,400 عميل محتمل، 700 صفقة، 6,500 مهمة…) في الخلفية داخل هذه الصفحة فقط. للقراءة فقط: لا يُحفظ في المتصفح ولا يختلط بسجلاتك، ويُحذف عند إغلاق المعاينة. في موقع DIGIT الفعلي تُحمَّل البيانات التجريبية عبر واجهات الخادم المعتمدة.",
            "Generates the source's 18-month synthetic Saudi sales history (1,400 leads, 700 deals, 6,500 tasks, …) in the background, in this page only. Read-only: never saved in this browser and never mixed with your records; closing the preview discards it. A live DIGIT site loads demo data through authorized server APIs instead.")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {state.status !== "ready" && <label className="flex flex-col gap-1 text-xs text-muted-foreground">{tx("تاريخ العرض", "As-of date")}
            <DateInput className="field-input" value={asOf} onChange={(e) => setAsOf(e.target.value)} disabled={state.status === "generating"} data-sample-preview-asof />
          </label>}
          {state.status === "ready"
            ? <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={close} data-sample-preview-close><X className="h-4 w-4" aria-hidden />{tx("إغلاق المعاينة", "Close preview")}</button>
            : <button type="button" className="btn-primary inline-flex items-center gap-1.5" onClick={open} disabled={state.status === "generating" || !asOf} data-sample-preview-open><Database className="h-4 w-4" aria-hidden />{state.status === "generating" ? tx("جارٍ الإنشاء…", "Generating…") : tx("فتح المعاينة", "Open preview")}</button>}
        </div>
      </div>

      {state.status === "generating" && <p role="status" className="rounded-md border border-border bg-muted px-3 py-2 text-sm">{tx("جارٍ إنشاء نحو 15,000 سجل تجريبي في الخلفية… يمكنك متابعة العمل في الصفحة.", "Generating about 15,000 sample records in the background… the page stays usable.")}</p>}
      {state.status === "error" && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-no-i18n>{tx("تعذّر إنشاء المعاينة: ", "The preview could not be generated: ")}{state.error}</p>}

      {state.status === "ready" && <>
        <p role="status" className="text-xs text-muted-foreground" data-sample-preview-summary>
          <span className="chip me-2 bg-primary/15 text-primary">{tx("معاينة · للقراءة فقط", "Preview · read-only")}</span>
          <span dir="ltr" data-no-i18n>{nf(state.total)}</span> {tx("سجل", "records")} · {tx("أُنشئت خلال", "generated in")} <span dir="ltr" data-no-i18n>{(state.ms / 1000).toFixed(1)}s</span> · {tx("إصدار المولّد", "generator")} <span dir="ltr" data-no-i18n>{state.version}</span> · {tx("بتاريخ", "as of")} <span dir="ltr" data-no-i18n>{state.asOf}</span>
        </p>
        <div role="tablist" aria-label={tx("سجلات المعاينة", "Preview registers")} className="flex flex-wrap gap-1 border-b border-border">
          {PREVIEW_TYPES.map((p) => <button key={p.id} type="button" role="tab" aria-selected={type === p.id} onClick={() => pick(p.id)} data-sample-preview-tab={p.id}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${type === p.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tx(p.ar, p.en)}<span className="chip bg-muted" dir="ltr" data-no-i18n>{nf(state.counts[p.doctype])}</span></button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[16rem] flex-1 sm:max-w-sm">
            <span className="sr-only">{tx("بحث", "Search")}</span>
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" className="field-input w-full ps-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={tx(`بحث في ${pt.ar}`, `Search ${pt.en.toLowerCase()}`)} data-sample-preview-search />
          </label>
          {pt.facet && result && result.facets.length > 0 && <div className="flex flex-wrap gap-1" role="group" aria-label={tx("تصفية", "Filter")}>
            <button type="button" aria-pressed={!facet} onClick={() => { setFacet(""); setPage(1); }} className={`chip inline-flex items-center gap-1 ${!facet ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{tx("الكل", "All")}</button>
            {result.facets.slice(0, 8).map(([v, n]) => <button key={v} type="button" aria-pressed={facet === v} onClick={() => { setFacet(facet === v ? "" : v); setPage(1); }} className={`chip inline-flex items-center gap-1 ${facet === v ? "bg-primary text-primary-foreground" : "bg-muted"}`} data-sample-preview-facet={v}><span data-no-i18n>{v ? (ar ? t(v) : v) : tx("بدون", "None")}</span> <span dir="ltr" data-no-i18n>{nf(n)}</span></button>)}
          </div>}
        </div>
        {!rec && <p className="text-xs text-muted-foreground">{tx("اختر سجلًا لعرض تفاصيله ونشاطه المرتبط.", "Pick a record to see its details and linked activity.")}</p>}
        <div className={`grid gap-3 ${rec ? "2xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
          <div className="panel overflow-x-auto p-0" data-sample-preview-table>
            <table className="w-full text-sm">
              <thead><tr>{pt.columns.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 text-start text-xs font-semibold">{tx(c.ar, c.en)}</th>)}</tr></thead>
              <tbody>
                {!result && <tr><td colSpan={pt.columns.length} className="px-3 py-6 text-center text-muted-foreground">{tx("جارٍ التحميل…", "Loading…")}</td></tr>}
                {result && !result.rows.length && <tr><td colSpan={pt.columns.length} className="px-3 py-6 text-center text-muted-foreground">{tx("لا توجد سجلات مطابقة.", "No matching records.")}</td></tr>}
                {result?.rows.map((r) => <tr key={String(r["name"])} className="cursor-pointer border-t border-border" onClick={() => openRecord(String(r["name"]))} data-sample-preview-row={String(r["name"])}>
                  {pt.columns.map((c, i) => <td key={c.key} className="px-3 py-2">{i === 0
                    ? <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); openRecord(String(r["name"])); }}><Cell c={c} v={r[c.key]} ar={ar} /></button>
                    : <Cell c={c} v={r[c.key]} ar={ar} />}</td>)}
                </tr>)}
              </tbody>
            </table>
            {result && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground" data-sample-preview-pager>
              <span>{tx("الصفحة", "Page")} <span dir="ltr" data-no-i18n>{result.page} / {result.pages}</span> · <span dir="ltr" data-no-i18n>{nf(result.total)}</span> {tx("سجل", "records")}</span>
              <span className="flex gap-1">
                <button type="button" className="btn-ghost inline-flex items-center px-2" disabled={result.page <= 1} onClick={() => setPage(result.page - 1)} aria-label={tx("الصفحة السابقة", "Previous page")}>{ar ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronLeft className="h-4 w-4" aria-hidden />}</button>
                <button type="button" className="btn-ghost inline-flex items-center px-2" disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)} aria-label={tx("الصفحة التالية", "Next page")}>{ar ? <ChevronLeft className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}</button>
              </span>
            </div>}
          </div>
          {rec && <aside className="panel space-y-2 p-3 text-sm" aria-label={tx("السجل المحدد", "Selected record")} data-sample-preview-record>
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><div className="text-xs text-muted-foreground">{ar ? t(rec.doctype) : rec.doctype}</div><bdi className="font-mono text-xs" data-no-i18n>{rec.name}</bdi></div>
                <button type="button" className="btn-ghost px-1.5" onClick={() => setRec(null)} aria-label={tx("إغلاق", "Close")}><X className="h-4 w-4" aria-hidden /></button>
              </div>
              {Object.keys(rec.activity).length > 0 && <div className="flex flex-wrap gap-1">{Object.entries(rec.activity).map(([dt, n]) => <span key={dt} className="chip inline-flex items-center gap-1 bg-accent"><bdi>{ar ? t(dt) : dt}</bdi><bdi className="tabular-nums" data-no-i18n>{n}</bdi></span>)}</div>}
              <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
                {rec.fields.slice(0, 28).map(([k, v]) => <div key={k} className="contents"><dt className="truncate text-muted-foreground" title={k}>{ar ? t(human(k)) : human(k)}</dt><dd className="break-words" data-no-i18n><bdi>{ar && OPTION_KEYS.has(k) ? t(String(v)) : showValue(v)}</bdi></dd></div>)}
              </dl>
              <p className="text-[11px] text-muted-foreground">{tx("سجل تجريبي للقراءة فقط — لا يُحفظ ولا يمكن تعديله.", "Read-only sample record — not saved and cannot be edited.")}</p>
            </>
          </aside>}
        </div>
      </>}
    </section>
  );
}
