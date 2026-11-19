/**
 * Shared building blocks for the Position, Contract and Case 360 pages: option labels, a source gate that keeps
 * loading / denied / unavailable / error / not-found distinct, readable employee and position references, a facts grid,
 * review findings and a related-record table. Display only: every row is read through scoped reads by the caller.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { Native, arLabel, s, type SourceRead, stateText } from "@/components/digithr/workspaces/shared";
import { scopedGet } from "@/plugins/digit_hr/compat/scope";
import { adapter } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { t as tr } from "@/i18n";
import { changeEntries } from "@/plugins/digit_hr/changeLog";

type Tx = (ar: string, en: string) => string;

/** Arabic/English labels for the stored option values of the extension DocTypes (values themselves are never changed). */
const OPT: Record<string, [string, string]> = {
  "Fixed Term": ["محدد المدة", "Fixed term"], Unlimited: ["غير محدد المدة", "Unlimited"], "Part Time": ["دوام جزئي", "Part time"], Probation: ["تحت التجربة", "Probation"],
  Draft: ["مسودة", "Draft"], Active: ["ساري", "Active"], Expired: ["منتهٍ", "Expired"], Terminated: ["منهى", "Terminated"],
  Vacant: ["شاغر", "Vacant"], Filled: ["مشغول", "Filled"], Frozen: ["مجمّد", "Frozen"], Closed: ["مغلق", "Closed"],
  Open: ["مفتوحة", "Open"], Assigned: ["مسندة", "Assigned"], "In Progress": ["قيد المعالجة", "In progress"], Resolved: ["تم الحل", "Resolved"],
  Low: ["منخفضة", "Low"], Medium: ["متوسطة", "Medium"], High: ["عالية", "High"], Critical: ["حرجة", "Critical"],
  "HR Letter": ["خطاب موارد بشرية", "HR letter"], "Payroll Query": ["استفسار رواتب", "Payroll query"], "Leave Query": ["استفسار إجازات", "Leave query"], "Document Request": ["طلب مستند", "Document request"],
  Extension: ["تمديد", "Extension"], "Terms Change": ["تغيير الشروط", "Terms change"], "Role Change": ["تغيير الدور", "Role change"], Termination: ["إنهاء", "Termination"],
  Hire: ["تعيين", "Hire"], Transfer: ["نقل", "Transfer"], Promotion: ["ترقية", "Promotion"],
  "Ready Now": ["جاهز الآن", "Ready now"], "1-2 Years": ["خلال سنة إلى سنتين", "1–2 years"], "3+ Years": ["3 سنوات أو أكثر", "3+ years"],
  Approved: ["معتمد", "Approved"], Submitted: ["مُقدَّم", "Submitted"], Cancelled: ["ملغى", "Cancelled"],
};
export const optLabel = (tx: Tx, v: unknown) => { const k = s(v); if (!k) return "—"; const o = OPT[k]; return o ? tx(o[0], o[1]) : tx(arLabel(k), k); };
export const docState = (tx: Tx, d: Record<string, unknown>) => Number(d["docstatus"] ?? 0) === 2 ? tx("ملغى", "Cancelled") : Number(d["docstatus"] ?? 0) === 1 ? tx("مُقدَّم", "Submitted") : tx("مسودة", "Draft");

/** Today as YYYY-MM-DD (UTC) — the same basis the facts module uses. */
export const todayIso = () => new Date().toISOString().slice(0, 10);

/** Back link to the owning section register (keeps the section's URL state when the browser history has it). */
export function BackTo({ section, label, attr }: { section: string; label: string; attr: string }) {
  return <Link to="/digit-hr/s/$section" params={{ section }} className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline" {...{ [`data-${attr}-back`]: "" }}><ArrowLeft size={16} className="rtl:rotate-180" />{label}</Link>;
}

/**
 * Gate for the main record: shows the source state (loading/denied/unavailable/error) or "not found or no permission",
 * never an empty profile. Renders children only when the record itself was read through a scoped read.
 */
export function ProfileGate({ title, crumbs, back, read, found, missingAttr, children }: {
  title: string; crumbs: { label: string }[]; back: ReactNode; read: SourceRead; found: boolean; missingAttr: string; children: () => ReactNode;
}) {
  const { tx } = useTx();
  if (read.state !== "READY_WITH_DATA" && read.state !== "READY_EMPTY") {
    return <DigitHrLayout title={title} crumbs={crumbs}>{back}<p role="status" className="panel p-6 text-muted-foreground" data-source-state={read.state}>{stateText(read.state, tx)}</p></DigitHrLayout>;
  }
  if (!found) return <DigitHrLayout title={title} crumbs={crumbs}>{back}<p role="status" className="panel p-6 text-muted-foreground" {...{ [`data-${missingAttr}-missing`]: "" }}>{tx("السجل غير موجود أو لا تملك صلاحية عرضه.", "Record not found or you do not have permission to view it.")}</p></DigitHrLayout>;
  return <>{children()}</>;
}

/** Header strip: record code, state chips and the full-record edit link (native form). */
export function ProfileHeader({ code, chips, dt, module, attr, children }: { code: string; chips: ReactNode; dt: string; module: string; attr: string; children?: ReactNode }) {
  const { tx } = useTx();
  return (
    <section className="dhr-cmdband dhr-recordband mb-4" {...{ [`data-${attr}-overview`]: code }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2"><span className="dhr-code text-muted-foreground" data-no-i18n>{code}</span>{chips}</span>
        <Native dt={dt} name={code} module={module} className="dhr-btn inline-flex min-h-10 items-center gap-2"><Pencil size={16} />{tx("فتح السجل الكامل", "Open full record")}</Native>
      </div>
      {children}
    </section>
  );
}

export function Facts({ children }: { children: ReactNode }) { return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-4">{children}</dl>; }
export function Fact({ label, children, attr }: { label: string; children: ReactNode; attr?: string }) {
  return <div {...(attr ? { [`data-fact`]: attr } : {})}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium break-words">{children}</dd></div>;
}

/** Employee link: Employee 360 when readable; code + "outside your access" when the link exists but cannot be read. */
export function EmployeeRef({ id, tx }: { id: unknown; tx: Tx }) {
  const code = s(id); if (!code) return <span>—</span>;
  let row: Record<string, unknown> | undefined; try { row = scopedGet("Employee", code); } catch { row = undefined; }
  if (!row) return <span data-out-of-scope="Employee"><span data-no-i18n>{code}</span> <span className="text-xs text-muted-foreground">({tx("خارج نطاق صلاحيتك", "outside your access")})</span></span>;
  const nm = s(row["employee_name"]) || code;
  return <Link to="/digit-hr/employees/$name" params={{ name: code }} className="text-primary hover:underline" data-employee-ref={code}><span data-no-i18n>{tx(arLabel(nm), nm)}</span></Link>;
}

/** Position link to Position 360 when readable; code + note otherwise. */
export function PositionRef({ id, tx }: { id: unknown; tx: Tx }) {
  const code = s(id); if (!code) return <span>—</span>;
  let row: Record<string, unknown> | undefined; try { row = scopedGet("DIGIT Position", code); } catch { row = undefined; }
  if (!row) return <span data-out-of-scope="DIGIT Position"><span data-no-i18n>{code}</span> <span className="text-xs text-muted-foreground">({tx("خارج نطاق صلاحيتك", "outside your access")})</span></span>;
  const t = s(row["position_title"]) || code;
  return <Link to="/digit-hr/positions/$name" params={{ name: code }} className="text-primary hover:underline" data-position-ref={code}><span data-no-i18n>{tx(arLabel(t), t)}</span> <span className="dhr-code text-xs text-muted-foreground" data-no-i18n>{code}</span></Link>;
}

export type Finding = { key: string; tone: "warn" | "danger" | "neutral"; text: string };
/** Review findings: stored-data observations for a reviewer; never an automatic correction. */
export function Findings({ items, attr, tx }: { items: Finding[]; attr: string; tx: Tx }) {
  return (
    <section className="mb-4" {...{ [`data-${attr}-findings`]: items.length }}>
      <h2 className="mb-2 text-sm font-semibold">{tx("ملاحظات المراجعة", "Review notes")}</h2>
      {items.length === 0
        ? <p className="text-sm text-muted-foreground" data-findings-clear>{tx("لا توجد ملاحظات على البيانات المخزنة.", "No notes on the stored data.")}</p>
        : <ul className="space-y-2">{items.map((f) => <li key={f.key} data-finding={f.key} className="dhr-alert flex items-start gap-2 text-sm" data-tone={f.tone === "danger" ? "danger" : "warn"}><span aria-hidden className="mt-1.5 inline-block size-2 shrink-0 rounded-full" style={{ background: f.tone === "danger" ? "var(--dhr-danger)" : "var(--dhr-warn)" }} />{f.text}</li>)}</ul>}
      <p className="mt-2 text-[11px] text-muted-foreground">{tx("تُعرض الملاحظات من القيم المخزنة فقط ولا تُعدّل أي سجل.", "Notes are derived from stored values only and do not change any record.")}</p>
    </section>
  );
}

/** Compact related-records table with a heading, source state and optional list link. */
export function RelatedTable({ title, read, rows, head, row, attr, tx, list }: {
  title: string; read: SourceRead; rows: Record<string, unknown>[]; head: string[]; row: (r: Record<string, unknown>) => ReactNode; attr: string; tx: Tx; list?: ReactNode;
}) {
  const ready = read.state === "READY_WITH_DATA" || read.state === "READY_EMPTY";
  return (
    <section className="mb-4 min-w-0" {...{ [`data-${attr}`]: ready ? rows.length : read.state }}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{title} {ready && <span className="text-muted-foreground" data-no-i18n>({rows.length})</span>}</h2>{list}</div>
      {!ready ? <p role="status" data-source-state={read.state} className="text-sm text-muted-foreground">{stateText(read.state, tx)}</p>
        : rows.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا توجد سجلات مرتبطة.", "No linked records.")}</p>
        : <div className="overflow-x-auto rounded-[12px] border"><table className="w-full text-sm"><thead className="bg-[var(--dhr-canvas)]"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead><tbody>{rows.map(row)}</tbody></table></div>}
    </section>
  );
}

/** A date or em dash, isolated LTR so Arabic lines keep YYYY-MM-DD readable. */
export function D({ v }: { v: unknown }) { const t = s(v).slice(0, 16).replace("T", " "); return t ? <bdi dir="ltr" data-no-i18n className="whitespace-nowrap">{t}</bdi> : <span>—</span>; }

/**
 * NB-3 change log: field changes recorded for this record (Core Version rows), newest first. Rendered only inside a
 * profile that already passed the scoped read of the record itself. The preview does not record who made a change.
 */
export function ChangeLog({ dt, name, tx, limit = 12 }: { dt: string; name: string; tx: Tx; limit?: number }) {
  const entries = changeEntries(adapter.list("Version"), dt, name);
  const meta = cachedMeta(dt);
  const label = (f: string) => { const l = meta?.fields.find((x) => x.fieldname === f)?.label; return l ? tr(l) : f; };
  const val = (f: string, v: string) => (!v ? "—" : optLabel(tx, v));
  return (
    <section className="mb-4 min-w-0" data-change-log={entries.length}>
      <h2 className="mb-1 text-sm font-semibold">{tx("سجل التغييرات", "Change log")} <span className="text-muted-foreground" data-no-i18n>({entries.length})</span></h2>
      <p className="mb-2 text-[11px] text-muted-foreground">{tx("تغييرات الحقول المسجلة لهذا السجل. المعاينة لا تسجّل اسم من أجرى التغيير.", "Field changes recorded for this record. The preview does not record who made each change.")}</p>
      {entries.length === 0 ? <p className="text-sm text-muted-foreground">{tx("لا تغييرات مسجلة.", "No changes recorded.")}</p> : (
        <ol className="space-y-2 border-s ps-4 text-sm">{entries.slice(0, limit).map((e) => (
          <li key={e.version} data-change={e.version}>
            <div className="text-xs text-muted-foreground"><D v={e.at} /></div>
            {e.created && <div>{tx("أُنشئ السجل", "Record created")}</div>}
            {e.changes.map((c) => <div key={c.field} data-change-field={c.field}><span className="font-medium">{label(c.field)}</span>: <span data-no-i18n className="text-muted-foreground">{val(c.field, c.from)}</span> <span aria-hidden>→</span><span className="sr-only">{tx(" إلى ", " to ")}</span> <span data-no-i18n>{val(c.field, c.to)}</span></div>)}
          </li>))}</ol>
      )}
    </section>
  );
}

/** NB-3 attachments: File records attached to this record plus Attach-field values, read after the record's scoped read. */
export function Attachments({ dt, name, fields = [], doc, module, tx }: { dt: string; name: string; fields?: string[]; doc: Record<string, unknown>; module: string; tx: Tx }) {
  const files = adapter.list("File").filter((f) => f["attached_to_doctype"] === dt && f["attached_to_name"] === name);
  const meta = cachedMeta(dt);
  const fieldFiles = fields.map((f) => ({ f, url: s(doc[f]) })).filter((x) => x.url && !files.some((y) => s(y["file_url"]) === x.url));
  const total = files.length + fieldFiles.length;
  const fname = (u: string) => decodeURIComponent(u.split("/").pop() || u);
  return (
    <section className="mb-4 min-w-0" data-attachments={total}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{tx("المرفقات", "Attachments")} <span className="text-muted-foreground" data-no-i18n>({total})</span></h2>
        <Native dt={dt} name={name} module={module} className="text-xs text-primary hover:underline">{tx("إضافة من السجل الكامل", "Add in the full record")}</Native>
      </div>
      {total === 0 ? <p className="text-sm text-muted-foreground">{tx("لا توجد مرفقات.", "No attachments.")}</p> : (
        <ul className="divide-y rounded-[12px] border text-sm">
          {fieldFiles.map((x) => { const l = meta?.fields.find((m) => m.fieldname === x.f)?.label; return <li key={x.f} className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3 py-2" data-attachment-field={x.f}><a href={x.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline" data-no-i18n>📎 {fname(x.url)}</a><span className="text-xs text-muted-foreground">{l ? tr(l) : x.f}</span></li>; })}
          {files.map((f) => <li key={f.name} className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3 py-2" data-attachment-file={f.name}><a href={s(f["file_url"])} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline" data-no-i18n>📎 {s(f["file_name"]) || fname(s(f["file_url"]))}</a><span className="text-xs text-muted-foreground">{Number(f["is_private"] ?? 0) ? tx("خاص", "Private") : tx("عام", "Public")} · <D v={f["creation"]} /></span></li>)}
        </ul>
      )}
    </section>
  );
}
