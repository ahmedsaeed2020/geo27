// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { DevOnly } from "@/components/DevOnly";
import { useDevMode } from "@/lib/mode";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FormView } from "@/components/FormView";
import { Loading } from "@/components/Shell";
import { BaseLayout, HrFrame } from "./HrShell";
import { indexQuery, loadMeta, LAYOUT_TYPES, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { newDocDefaults } from "@/lib/sessionDefaults";
import { CURRENT_EMPLOYEE, CURRENT_EMPLOYEE_NAME, LIST_CONFIGS, SYN_COMPANY, type HrPath } from "@/lib/hrms";

/**
 * Reconstructs hrms/frontend/src/components/FormView.vue on top of the shared
 * desk FormView renderer (same metadata, same adapter records), inside the
 * mobile frame. Server-side scripts (leave balance API, approval workflow)
 * never run here — such behaviour is labelled server-dependent.
 */
export function HrFormScreen({ doctype, title, id, listPath }: { doctype: string; title: string; id?: string | undefined; listPath: HrPath }) {
  const idx = useQuery(indexQuery);
  const [meta, setMeta] = useState<DocTypeMeta | undefined>(undefined);
  useEffect(() => { if (idx.data) loadMeta(idx.data, doctype).then(setMeta); }, [idx.data, doctype]);
  return (
    <HrFrame>
      <BaseLayout title={title} back tabs>
        {!idx.data || !meta ? <Loading what="form fields" /> : <HrFormInner meta={meta} id={id} listPath={listPath} />}
      </BaseLayout>
    </HrFrame>
  );
}

function HrFormInner({ meta, id, listPath }: { meta: DocTypeMeta; id?: string | undefined; listPath: HrPath }) {
  useStoreVersion();
  const cfg = Object.values(LIST_CONFIGS).find((c) => c.doctype === meta.name);
  const stored = id ? adapter.get(meta.name, id) : undefined;
  const [draft, setDraft] = useState<Doc | null>(null);

  // New-document defaults: the source /new form hides session-employee fields
  // and fills them from the session; we prefill the same values locally.
  useEffect(() => {
    if (id || draft) return;
    const d: Doc = { name: "", doctype: meta.name, docstatus: 0, modified: "" };
    // frappe.model.get_new_doc defaults only (sessionDefaults.newDocDefaults) — a field without a default stays empty
    const defs = newDocDefaults(meta);
    for (const f of meta.fields) {
      if (!f.fieldname || LAYOUT_TYPES.has(f.fieldtype) || TABLE_TYPES.has(f.fieldtype)) continue;
      if (cfg?.excludeOnNew?.includes(f.fieldname)) continue;
      const v = defs[f.fieldname];
      if (v !== undefined && v !== "") d[f.fieldname] = v;
    }
    const prefill: Record<string, unknown> = { employee: CURRENT_EMPLOYEE, employee_name: CURRENT_EMPLOYEE_NAME, company: SYN_COMPANY, currency: "SAR" };
    for (const k of cfg?.employeePrefill ?? []) d[k] = prefill[k] ?? "";
    if (meta.name === "Leave Application") { d["posting_date"] = today(); d["status"] = "Open"; }
    if (meta.name === "Expense Claim") { d["expenses"] = []; d["posting_date"] = today(); d["approval_status"] = "Draft"; }
    if (meta.name === "Employee Advance") { d["posting_date"] = today(); }
    if (meta.name === "Attendance Request") d["reason"] = "Work From Home";
    setDraft(d);
  }, [id, cfg, meta, draft]);

  if (id && !stored) return <p className="text-sm text-muted-foreground"><span>Record</span> <span data-no-i18n>{id}</span> <span>not found in the shared store.</span></p>;
  if (!id && !draft) return <Loading what="form defaults" />;
  const doc = (id ? stored! : draft)!;
  const dirty = !!draft;

  const set = (p: Record<string, unknown>) => {
    const merged = { ...doc, ...p, ...fetchFrom(meta, p) } as Doc;
    simulate(meta, merged);
    setDraft(merged);
  };

  const save = () => {
    if (id) {
      adapter.update(meta.name, id, draft ?? {});
    } else if (draft) {
      adapter.insertDoc(meta.name, draft);
    }
    setDraft(null);
  };

  const fields = id ? meta.fields : meta.fields.filter((f) => !cfg?.excludeOnNew?.includes(f.fieldname!));
  const nFields = fields.filter((f) => f.fieldname && !LAYOUT_TYPES.has(f.fieldtype)).length;

  return (
    <div className="space-y-3">
      {meta.is_submittable ? (
        <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
          <span>Doc status: {["Draft", "Submitted", "Cancelled"][doc.docstatus ?? 0]}{dirty ? " · unsaved changes" : ""}</span>
          {(doc.docstatus ?? 0) === 0 && !dirty && <button className="btn-ghost" onClick={() => adapter.update(meta.name, String(doc.name), { docstatus: 1 })}>Submit (simulated)</button>}
          {(doc.docstatus ?? 0) === 1 && !dirty && <button className="btn-ghost" onClick={() => adapter.update(meta.name, String(doc.name), { docstatus: 2 })}>Cancel (simulated)</button>}
        </div>
      ) : null}
      {meta.name === "Leave Application" && <DevOnly>{(
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          Leave balance lookup and approve/reject actions are hrms.hr.doctype.leave_application server methods — server-dependent, not run in this preview. Total Leave Days below is a local day-difference simulation.
        </p>
      )}</DevOnly>}
      <div className="rounded-lg bg-card p-3">
        <FormView meta={{ ...meta, fields }} doc={doc} dev={false} onChange={set} />
      </div>
      <div className="sticky bottom-20 flex w-full gap-2">
        <button className="btn-primary flex-1 py-2.5" disabled={!dirty} onClick={save}>Save</button>
        <Link to={listPath} className="btn-ghost px-4 py-2.5">Back to list</Link>
      </div>
      <DevOnly><p className="text-center text-[10px] text-muted-foreground">{nFields} metadata fields rendered · saves to the shared synthetic store, same records as Desk.</p></DevOnly>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** fetch_from copy (same convention the desk form uses). */
function fetchFrom(meta: DocTypeMeta, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of meta.fields) {
    if (!f.fetch_from || !f.fieldname) continue;
    const [lf, src] = f.fetch_from.split(".");
    if (!lf || !src || !(lf in patch)) continue;
    const link = meta.fields.find((x) => x.fieldname === lf);
    if (link?.fieldtype !== "Link" || !link.options) continue;
    const target = adapter.get(link.options, String(patch[lf]));
    if (target && target[src] !== undefined) out[f.fieldname] = target[src];
  }
  return out;
}

/** Local client-side totals — the preview stand-in for server controllers. */
function simulate(meta: DocTypeMeta, doc: Doc) {
  if (meta.name === "Leave Application") {
    if (doc["from_date"] && doc["to_date"]) {
      const days = Math.max(0, Math.round((+new Date(String(doc["to_date"])) - +new Date(String(doc["from_date"]))) / 86400000)) + 1;
      doc["total_leave_days"] = doc["half_day"] ? 0.5 : days;
    }
  }
  if (meta.name === "Expense Claim" && Array.isArray(doc["expenses"])) {
    const sum = (doc["expenses"] as Doc[]).reduce((s, r) => s + (Number(r["amount"]) || 0), 0);
    doc["total_claimed_amount"] = sum;
    doc["grand_total"] = sum;
  }
  if (meta.name === "Employee Advance") {
    doc["pending_amount"] = Math.max(0, (Number(doc["advance_amount"]) || 0) - (Number(doc["paid_amount"]) || 0) - (Number(doc["claimed_amount"]) || 0));
  }
}
