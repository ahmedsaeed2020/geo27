/**
 * Project 360 → "Reports & activity" (source group 8: documents, registers, links, files, activity).
 * Everything is read at render time from canonical records: the document register lists every construction and native
 * document linked to the project (header `project` or a child row `project`), files/comments/communications come from
 * the shared form-sidebar records, and history from the adapter's Version log. Nothing is stored here.
 */
import { adapter, type Doc } from "@/lib/adapter";
import { CONSTRUCTION_REPORTS } from "../reports";
import { CONSTRUCTION_DOCTYPES } from "../schema";
import { list, rows } from "../domain/data";
import { AppLink, DataTable, DocRef, Empty, ListRef, Section, useCx, type Col } from "./kit";
import { UI_AR } from "../i18n";

type R = Record<string, unknown>;
/** Native DocTypes a construction project links to (header project or child-row project), in workflow order. */
const NATIVE = ["Task", "Timesheet", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Stock Entry", "Purchase Invoice", "Sales Invoice", "Payment Entry", "Journal Entry"];
const OWN_LINKED = CONSTRUCTION_DOCTYPES.filter((d) => !d.istable && !d.issingle && d.fields.some((f) => f.fieldname === "project" && f.fieldtype === "Link")).map((d) => d.name);
const SUBMITTABLE = new Set([...CONSTRUCTION_DOCTYPES.filter((d) => d.is_submittable).map((d) => d.name), "Timesheet", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Stock Entry", "Purchase Invoice", "Sales Invoice", "Payment Entry", "Journal Entry"]);
const CHILD_ROWS: Record<string, string> = { "Material Request": "items", "Request for Quotation": "items", "Supplier Quotation": "items", "Purchase Order": "items", "Purchase Receipt": "items", "Stock Entry": "items", "Purchase Invoice": "items", "Sales Invoice": "items", "Journal Entry": "accounts" };

export function projectDocuments(project: string): { doctype: string; docs: Doc[] }[] {
  const linked = (dt: string) => list(dt, (d) => d["project"] === project || (CHILD_ROWS[dt] ? rows(d, CHILD_ROWS[dt]!).some((r) => r["project"] === project) : false));
  return [...OWN_LINKED, ...NATIVE].map((doctype) => ({ doctype, docs: linked(doctype) })).filter((g) => g.docs.length);
}

interface Ev { name: string; when: string; doctype: string; docname: string; kind: string; detail: string; by: string }
/** Timeline events: Version history, comments and communications; a record without a creation Version shows its own creation/owner (as the Frappe form timeline does). */
function events(docs: { doctype: string; name: string; creation?: unknown; owner?: unknown }[]): Ev[] {
  const keys = new Set(docs.map((d) => `${d.doctype}\u0000${d.name}`));
  const has = (dt: unknown, n: unknown) => keys.has(`${String(dt)}\u0000${String(n)}`);
  const out: Ev[] = [];
  const createdLogged = new Set(adapter.list("Version").filter((v) => String(v["data"] ?? "").includes('"created"')).map((v) => `${String(v["ref_doctype"])}\u0000${String(v["docname"])}`));
  for (const d of docs) if (d.creation && !createdLogged.has(`${d.doctype}\u0000${d.name}`)) out.push({ name: `c:${d.doctype}:${d.name}`, when: String(d.creation), doctype: d.doctype, docname: d.name, kind: "Created", detail: "", by: String(d.owner ?? "") });
  for (const v of adapter.list("Version")) if (has(v["ref_doctype"], v["docname"])) {
    let data: { created?: boolean; changed?: unknown[][] } = {};
    try { data = JSON.parse(String(v["data"] ?? "{}")); } catch { /* malformed history row: shown without detail */ }
    out.push({ name: v.name, when: String(v["creation"] ?? ""), doctype: String(v["ref_doctype"]), docname: String(v["docname"]), kind: data.created ? "Created" : "Changed", detail: data.changed?.map((c) => String(c[0])).join(", ") ?? "", by: String(v["owner"] ?? "") });
  }
  for (const c of adapter.list("Comment")) if (has(c["reference_doctype"], c["reference_name"]))
    out.push({ name: c.name, when: String(c["creation"] ?? ""), doctype: String(c["reference_doctype"]), docname: String(c["reference_name"]), kind: String(c["comment_type"] ?? "Comment"), detail: String(c["content"] ?? "").replace(/<[^>]+>/g, "").slice(0, 140), by: String(c["comment_email"] ?? c["owner"] ?? "") });
  for (const c of adapter.list("Communication")) if (has(c["reference_doctype"], c["reference_name"]))
    out.push({ name: c.name, when: String(c["creation"] ?? c["communication_date"] ?? ""), doctype: String(c["reference_doctype"]), docname: String(c["reference_name"]), kind: "Communication", detail: String(c["subject"] ?? ""), by: String(c["sender"] ?? c["owner"] ?? "") });
  return out.sort((a, b) => b.when.localeCompare(a.when));
}

const KIND_AR: Record<string, string> = { Created: "إنشاء", Changed: "تعديل", Comment: "تعليق", Communication: "مراسلة", Assigned: "إسناد", Attachment: "مرفق", Shared: "مشاركة", Tag: "وسم", Info: "معلومة", Like: "إعجاب" };

export function ReportsActivity({ p }: { p: Doc }) {
  const { t, ar } = useCx();
  const groups = projectDocuments(p.name);
  const all = [{ doctype: "Project", name: p.name, creation: p["creation"], owner: p["owner"] }, ...groups.flatMap((g) => g.docs.map((d) => ({ doctype: g.doctype, name: d.name, creation: d["creation"], owner: d["owner"] })))];
  const keys = new Set(all.map((d) => `${d.doctype}\u0000${d.name}`));
  const files = adapter.list("File").filter((f) => keys.has(`${String(f["attached_to_doctype"])}\u0000${String(f["attached_to_name"])}`));
  const ev = events(all);
  const reports = CONSTRUCTION_REPORTS.filter((r) => (r.filters ?? []).some((f) => f.fieldname === "project"));
  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <Section title={t("Project reports", "تقارير المشروع")} actions={<AppLink to="reports">{t("Report centre", "مركز التقارير")}</AppLink>}>
          {reports.length ? <ul className="space-y-1.5 text-sm" role="list">{reports.map((r) => <li key={r.name}><AppLink to={`reports/${encodeURIComponent(r.name)}?project=${encodeURIComponent(p.name)}`}>{ar ? UI_AR[r.name] ?? r.name : r.name}</AppLink></li>)}</ul> : <Empty>{t("No project-filtered reports", "لا تقارير مفلترة بالمشروع")}</Empty>}
        </Section>
        <div className="min-w-0 lg:col-span-2">
          <Section title={<span>{t("Document register", "سجل المستندات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({all.length - 1})</span></span>}>
            <DataTable rows={groups.map((g) => ({ name: g.doctype, doctype: g.doctype, count: g.docs.length, ...(SUBMITTABLE.has(g.doctype) ? { drafts: g.docs.filter((d) => Number(d.docstatus ?? 0) === 0).length, submitted: g.docs.filter((d) => Number(d.docstatus ?? 0) === 1).length, cancelled: g.docs.filter((d) => Number(d.docstatus ?? 0) === 2).length } : { drafts: null, submitted: null, cancelled: null }) })) as R[]}
              empty={t("No documents are linked to this project yet", "لا مستندات مرتبطة بهذا المشروع بعد")} cols={[
                { key: "doctype", label: t("Document type", "نوع المستند"), render: (r) => <span>{String(r["doctype"])}</span> },
                { key: "count", label: t("Records", "السجلات"), kind: "num" }, { key: "drafts", label: t("Draft", "مسودة"), kind: "num" }, { key: "submitted", label: t("Submitted", "مرسل"), kind: "num" }, { key: "cancelled", label: t("Cancelled", "ملغى"), kind: "num" },
                { key: "open", label: "", render: (r) => <ListRef doctype={String(r["doctype"])} filters={CHILD_ROWS[String(r["doctype"])] ? undefined : [["project", "=", p.name]]}>{t("Open list", "فتح القائمة")}</ListRef> },
              ] as Col<R>[]} />
            <p className="mt-2 text-xs text-muted-foreground">{t("Documents whose project is set on the header or on a line; draft/submitted/cancelled apply to submittable documents only (— otherwise). Lists of line-linked documents open unfiltered; the register above is the project-scoped count.", "المستندات المرتبطة بالمشروع في الرأس أو في أحد البنود؛ تنطبق المسودة/المرسل/الملغى على المستندات القابلة للإرسال فقط (— لغيرها). قوائم المستندات المرتبطة عبر البنود تُفتح دون فلتر؛ السجل أعلاه هو العدد الخاص بالمشروع.")}</p>
          </Section>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <Section title={<span>{t("Attachments", "المرفقات")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({files.length})</span></span>}>
          <DataTable rows={files as R[]} pageSize={10} empty={t("No files attached to project documents", "لا ملفات مرفقة بمستندات المشروع")} cols={[
            { key: "file_name", label: t("File", "الملف"), render: (r) => <span data-no-i18n>{String(r["file_name"] ?? r["name"])}</span> },
            { key: "attached_to_name", label: t("Document", "المستند"), render: (r) => <DocRef doctype={String(r["attached_to_doctype"])} name={r["attached_to_name"]} /> },
          ] as Col<R>[]} />
        </Section>
        <div className="min-w-0 lg:col-span-2">
          <Section title={<span>{t("Activity", "النشاط")} <span className="text-xs font-normal text-muted-foreground" data-no-i18n>({ev.length})</span></span>}>
            <DataTable rows={ev as unknown as R[]} pageSize={15} empty={t("No recorded activity", "لا نشاط مسجل")} cols={[
              { key: "when", label: t("When", "الوقت"), render: (r) => <span className="whitespace-nowrap" data-no-i18n>{String(r["when"]).slice(0, 16).replace("T", " ") || "—"}</span> },
              { key: "kind", label: t("Event", "الحدث"), render: (r) => <span>{ar ? KIND_AR[String(r["kind"])] ?? String(r["kind"]) : String(r["kind"])}</span> },
              { key: "docname", label: t("Document", "المستند"), render: (r) => <DocRef doctype={String(r["doctype"])} name={r["docname"]} /> },
              { key: "detail", label: t("Detail", "التفاصيل"), render: (r) => <span className="text-muted-foreground" data-no-i18n>{String(r["detail"])}</span> },
              { key: "by", label: t("By", "بواسطة"), render: (r) => <span data-no-i18n>{String(r["by"])}</span> },
            ] as Col<R>[]} />
          </Section>
        </div>
      </div>
    </>
  );
}
