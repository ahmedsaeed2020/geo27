/** Actions + Relationships tabs for DIGIT HR section pages — read only from generated catalog JSON (form_actions, reverse_links). */
import { useQuery } from "@tanstack/react-query";
import { deskUrl, frappeHost } from "@/plugins/digit_hr/compat/host";
import { Link, useNavigate } from "@tanstack/react-router";
import { cachedMeta, metaQuery } from "@/lib/catalog";
import { adapter } from "@/lib/adapter";
import { hasPerm, useSessionUser } from "@/plugins/digit_hr/compat/session";
import { toast } from "sonner";
import { formActionsQuery } from "@/lib/engines";
import { enterHrNative } from "@/components/digithr/HrNav";
import NATIVE from "@/plugins/digit_hr/nativeMap";
import { t as tr } from "@/i18n";
import { createDraft } from "@/lib/documentApi";
import { HR_DOC_SEARCH } from "@/plugins/digit_hr/product/urls";

type Doc = { doctype: string; app: string; slug: string };
type RL = { link_doctype: string; link_fieldname: string; child: string | null };
const reverseQuery = { queryKey: ["dhr-reverse-links"], queryFn: async () => ((await (await fetch("/catalog/reverse_links.json")).json()).doctypes ?? {}) as Record<string, RL[]>, staleTime: Infinity };
const ALL: Doc[] = Object.values(NATIVE).flat() as Doc[];
const find = (dt: string) => ALL.find((d) => d.doctype === dt);

/** Native "New" — same path as the list's "+ Add" (Core documentApi.createDraft: defaults, capability and permission) then open the form. Hidden for child tables or without create permission. */
export function NewButton({ d, section, tx }: { d: Doc; section: string; tx: (a: string, e: string) => string }) {
  useSessionUser();
  const { data: meta } = useQuery(metaQuery(d.app, d.slug));
  const nav = useNavigate();
  if (!meta || meta.istable || meta.issingle || !hasPerm(meta, "create")) return null;
  return <button type="button" data-new={d.doctype} className="dhr-btn text-xs" onClick={() => {
    // On a Frappe site the real Desk form creates the record (its own naming, defaults and validation).
    if (frappeHost()) { enterHrNative(section); window.location.assign(deskUrl(meta.name, "new")); return; }
    try { const r = createDraft(meta); if (!r.doc) { toast.error(r.errors.join(" · ")); return; } const doc = r.doc; enterHrNative(section); void nav({ to: "/app/$app/$doctype/$name", params: { app: d.app, doctype: d.slug, name: doc.name }, search: HR_DOC_SEARCH as never }); }
    catch (e) { toast.error(String((e as Error).message)); }
  }}>{tx("+ جديد", "+ New")}</button>;
}

export function ActionsTab({ docs, section, tx }: { docs: Doc[]; section: string; tx: (a: string, e: string) => string }) {
  const { data } = useQuery(formActionsQuery);
  if (!docs.length) return <p className="dhr-card p-4 text-sm text-muted-foreground">{tx("لا يوجد مستند أصلي مطابق.", "No matching native document.")}</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {docs.map((d) => { const acts = data?.[d.doctype] ?? []; return (
        <section key={d.doctype} className="dhr-card p-4" data-doc={d.doctype}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-semibold">{tr(d.doctype)}</h3>
            <span className="flex items-center gap-2"><Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: d.app, doctype: d.slug }} onClick={() => enterHrNative(section)} className="text-xs underline">{tx("القائمة", "List")}</Link><NewButton d={d} section={section} tx={tx} /></span>
          </div>
          {acts.length ? <ul className="divide-y text-sm">{acts.map((a, i) => { const t = a.target ? find(a.target) : undefined; const server = !!a.method || (!a.target && a.kind !== "route"); return (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <span>{tr(a.label)}{a.group && <span className="ms-1 text-xs text-muted-foreground">· {tr(a.group)}</span>}</span>
              <span className="flex items-center gap-2">
                {t && <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: t.app, doctype: t.slug }} onClick={() => enterHrNative(section)} className="text-xs underline">{tr(t.doctype)}</Link>}
                <span className="dhr-badge" data-tone={server ? "warn" : "success"}>{server ? tx("يحتاج خادم", "Server-dependent") : tx("يعمل في المعاينة", "Runs in preview")}</span>
              </span>
            </li>); })}</ul>
          : <p className="text-sm text-muted-foreground">{tx("لا توجد أزرار إجراءات في المصدر — الإجراءات المتاحة: حفظ واعتماد وإلغاء من النموذج.", "No source action buttons — standard save/submit/cancel from the form.")}</p>}
        </section>); })}
    </div>
  );
}

export function RelationsTab({ docs, section, tx }: { docs: Doc[]; section: string; tx: (a: string, e: string) => string }) {
  const { data } = useQuery(reverseQuery);
  if (!docs.length) return <p className="dhr-card p-4 text-sm text-muted-foreground">{tx("لا يوجد مستند أصلي مطابق.", "No matching native document.")}</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {docs.map((d) => { const rels = (data?.[d.doctype] ?? []).filter((r) => !r.child); const hr = rels.filter((r) => find(r.link_doctype)); const other = rels.length - hr.length; return (
        <section key={d.doctype} className="dhr-card p-4" data-doc={d.doctype}>
          <h3 className="mb-2 font-semibold">{tr(d.doctype)}</h3>
          {hr.length ? <ul className="divide-y text-sm">{hr.map((r) => { const t = find(r.link_doctype)!; return (
            <li key={r.link_doctype + r.link_fieldname} className="flex items-center justify-between gap-2 py-2">
              <Link to="/app/$app/$doctype" search={HR_DOC_SEARCH as never} params={{ app: t.app, doctype: t.slug }} onClick={() => enterHrNative(section)} className="font-medium hover:underline">{tr(r.link_doctype)}</Link>
              <span className="text-xs text-muted-foreground" data-rel-field={r.link_fieldname}>{tr(cachedMeta(r.link_doctype)?.fields.find((f) => f.fieldname === r.link_fieldname)?.label ?? r.link_fieldname.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))}</span>
            </li>); })}</ul>
          : <p className="text-sm text-muted-foreground">{tx("لا توجد مستندات موارد بشرية مرتبطة.", "No linked HR documents.")}</p>}
          {other > 0 && <p className="mt-2 text-xs text-muted-foreground">{tx(`و${other} مستند مرتبط من تطبيقات أخرى`, `+${other} linked documents in other apps`)}</p>}
        </section>); })}
    </div>
  );
}
