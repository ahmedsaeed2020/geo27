import { useRef, useState } from "react";
import { EntTable } from "@/components/enterprise/kit/EntTable";
import { useUnsavedGuard } from "@/components/digithr/UnsavedGuard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { StatusBadge } from "@/components/digithr/ui";
import { Input } from "@/components/ui/input";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { scopedList, useScopeMetas } from "@/plugins/digit_hr/compat/scope";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import {cachedMeta} from '@/lib/catalog';
import {Button} from '@/components/ui/button';
import {arLabel} from '@/components/digithr/workspaces/shared';
import { DDR } from "@/plugins/digit_hr";
import { ERR, registry, saveRenewal, type RenewalInput } from "@/plugins/digit_hr/service";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

export const Route = createFileRoute("/digit-hr/documents")({
  validateSearch: (s: Record<string, unknown>): { employee?: string | undefined } => ({ employee: typeof s["employee"] === "string" ? s["employee"] : undefined }),
  head: () => ({ meta: [
    { title: "Document Renewal — DIGIT HR" },
    { name: "description", content: "Permission-scoped employee document registry with expiry tracking and renewal." },
    { property: "og:title", content: "Document Renewal — DIGIT HR" },
    { property: "og:description", content: "Track employee document expiry and record renewals." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Documents,
});

const blank = (employee = ""): RenewalInput => ({ employee, document_type: "", document_number: "", issue_date: "", expiry_date: "", is_private: 1, notes: "" });

function Documents() {
  const search = Route.useSearch();
  useStoreVersion(); useSessionUser(); useScopeMetas(["Employee", DDR]);
  const { tx, lang } = useTx();
  const [form, setFormState] = useState<RenewalInput | null>(search.employee ? blank(search.employee) : null);
  const [initial, setInitial] = useState(() => JSON.stringify(search.employee ? blank(search.employee) : null));
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  /** Opening a form records its starting values; only a genuine difference counts as unsaved. */
  const open = (f: RenewalInput | null) => { setFormState(f); setInitial(JSON.stringify(f)); setConfirmDiscard(false); };
  const setForm = (f: RenewalInput) => setFormState(f);
  const dirty = !!form && JSON.stringify(form) !== initial;
  const guard = useUnsavedGuard(dirty);
  const cancelForm = () => { if (dirty) { setConfirmDiscard(true); return; } open(null); setErr(""); };
  const rows = registry(); const emps = scopedList("Employee"); const types = adapter.list("Identification Document Type");
  const meta=cachedMeta(DDR);const canCreate=!!meta && hasPerm(meta,'create');
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (!form || busy || inFlight.current) return;
    inFlight.current = true; setBusy(true); setErr(""); setOk("");
    try { const d = saveRenewal(form); setOk(d.name); open(null); }
    catch (x) { const k = (x as Error).message; setErr(ERR[k] ? ERR[k][lang === "ar" ? "ar" : "en"] : (x as Error).message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const renew = (d: Doc) => { if (dirty) { setConfirmDiscard(true); return; } open({ ...blank(String(d["employee"])), document_type: String(d["document_type"]), document_number: String(d["document_number"]), renewal_of: d.name }); };
  const fld = (k: keyof RenewalInput, label: string, type = "text") => (
    <label className="text-xs text-muted-foreground">{label}
      <Input type={type} required value={String(form?.[k] ?? "")} onChange={(e) => {if(form)setForm({ ...form, [k]: e.target.value });}} className="mt-1 h-10 text-foreground" />
    </label>
  );
  return (
    <DigitHrLayout title={tx("الوثائق والتجديد", "Documents & Renewal")} crumbs={[{ label: tx("الوثائق", "Documents") }]}>
      {guard.dialog}
      {ok && <p role="status" className="dhr-alert mb-3" data-tone="success">{tx("تم الحفظ:", "Saved:")} <span data-no-i18n>{ok}</span></p>}
      <div className="mb-4 flex flex-wrap gap-2">
        {!form && canCreate && <Button type="button" onClick={() => { open(blank()); setOk(""); }} className="dhr-btn dhr-btn-primary">{tx("وثيقة جديدة", "New document")}</Button>}
        <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: "hrms", doctype: "digit_document_renewal" }} className="inline-flex h-10 items-center rounded-md border px-3 text-sm hover:bg-muted">{tx("القائمة القياسية", "Standard list")}</Link>
      </div>
      {form && <form onSubmit={submit} className="panel mb-6 grid gap-3 p-4 sm:grid-cols-2" aria-label={tx("نموذج الوثيقة", "Document form")}>
        {form.renewal_of && <p className="text-sm sm:col-span-2">{tx("تجديد للوثيقة", "Renewing")} <span data-no-i18n>{form.renewal_of}</span></p>}
        <label className="text-xs text-muted-foreground">{tx("الموظف", "Employee")}
          <select required value={form.employee} disabled={!!form.renewal_of} onChange={(e) => setForm({ ...form, employee: e.target.value })} className="mt-1 block h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="">—</option>{emps.map((x) => <option key={x.name} value={x.name} data-no-i18n>{tx(arLabel(String(x["employee_name"] || x.name)),String(x["employee_name"] || x.name))}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">{tx("نوع الوثيقة", "Document Type")}
          <select required value={form.document_type} disabled={!!form.renewal_of} onChange={(e) => setForm({ ...form, document_type: e.target.value })} className="mt-1 block h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="">—</option>{types.map((x) => <option key={x.name} value={x.name} data-no-i18n>{tx(arLabel(x.name),x.name)}</option>)}
          </select>
          {!types.length && <span className="mt-1 block text-destructive">{tx("لا توجد أنواع وثائق. أضفها من السجل الأصلي.", "No document types yet. Add one in the native list.")} <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: "hrms", doctype: "identification_document_type" }} className="underline">{tx("فتح", "Open")}</Link></span>}
        </label>
        {fld("document_number", tx("رقم الوثيقة", "Document Number"))}
        <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={!!form.is_private} onChange={(e) => setForm({ ...form, is_private: e.target.checked ? 1 : 0 })} className="h-5 w-5" />{tx("مرفق خاص", "Private attachment")}</label>
        {fld("issue_date", tx("تاريخ الإصدار", "Issue Date"), "date")}
        {fld("expiry_date", tx("تاريخ الانتهاء", "Expiry Date"), "date")}
        {err && <p role="alert" className="text-sm text-destructive sm:col-span-2">{err}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy} className="dhr-btn dhr-btn-primary disabled:opacity-50">{busy ? tx("جارٍ الحفظ…", "Saving…") : tx("حفظ", "Save")}</Button>
          <Button variant="outline" type="button" onClick={cancelForm} className="dhr-btn">{tx("إلغاء", "Cancel")}</Button>
        </div>
        {confirmDiscard && <div role="alertdialog" aria-label={tx("تغييرات غير محفوظة", "Unsaved changes")} data-unsaved-confirm className="space-y-2 rounded-md border border-border p-3 sm:col-span-2"><p className="text-sm">{tx("لديك تغييرات غير محفوظة في هذه الوثيقة. هل تريد تجاهلها؟", "You have unsaved changes to this document. Discard them?")}</p><div className="flex gap-2"><Button variant="outline" type="button" autoFocus onClick={() => setConfirmDiscard(false)}>{tx("متابعة التحرير", "Keep editing")}</Button><Button variant="destructive" type="button" onClick={() => { open(null); setErr(""); }}>{tx("تجاهل", "Discard")}</Button></div></div>}
      </form>}
      <div className="panel overflow-x-auto">
        <EntTable id="hr-documents" wrap><table className="w-full text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground">{[tx("المعرّف", "ID"), tx("الموظف", "Employee"), tx("النوع", "Type"), tx("الانتهاء", "Expiry"), tx("الحالة", "Status"), ""].map((h, i) => <th key={i} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((d) => <tr key={d.name} className="h-12 border-b last:border-0">
              <td className="px-3" data-no-i18n>{d.name}{Number(d["is_private"]) ? " 🔒" : ""}</td>
              <td className="px-3"><Link to="/digit-hr/employees/$name" params={{ name: String(d["employee"]) }} className="text-primary hover:underline" data-no-i18n>{tx(arLabel(String(d["employee_name"] || d["employee"])),String(d["employee_name"] || d["employee"]))}</Link></td>
              <td className="px-3" data-no-i18n>{tx(arLabel(String(d["document_type"])),String(d["document_type"]))}</td>
              <td className="px-3" data-no-i18n>{String(d["expiry_date"])}</td>
              <td><StatusBadge value={d["status"]} /></td>
              <td className="px-3">{d["status"] !== "Renewed" && canCreate && meta && hasPerm(meta,'write',d) && <Button variant="outline" type="button" onClick={() => renew(d)} className="dhr-btn dhr-btn-sm">{tx("تجديد", "Renew")}</Button>}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{tx("لا توجد وثائق بعد.", "No documents yet.")}</td></tr>}
          </tbody>
        </table></EntTable>
      </div>
    </DigitHrLayout>
  );
}
