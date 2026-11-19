import { DevOnly } from "@/components/DevOnly";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { indexQuery, loadMeta, type DocTypeMeta } from "@/lib/catalog";
import { CRM_DIR, timeAgo, type CrmDirKind } from "@/lib/crm";
import { CrmShell } from "./CrmShell";
import { useL } from "./crmI18n";
import { LayoutRenderer, useCrm } from "./useCrm";
import { hasPerm, useSessionUser } from "@/lib/session";
import { scopedList } from "@/lib/scope";

/**
 * Reconstructs pages/Contact.vue and pages/Organization.vue: editable detail from the
 * "<DocType>-Quick Entry" layout plus the related Deals list each source page shows.
 */
export function CrmDirRecord({ kind, id }: { kind: "contact" | "organization"; id: string }) {
  const { L } = useL();
  const b = useCrm();
  const cfg = CRM_DIR[kind];
  const user = useSessionUser();
  const idx = useQuery(indexQuery);
  const [meta, setMeta] = useState<DocTypeMeta | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [saved, setSaved] = useState(false);
  useStoreVersion();
  useEffect(() => {
    if (!idx.data) return;
    loadMeta(idx.data, cfg.doctype).then((m) => setMeta(m as DocTypeMeta));
  }, [idx.data, cfg.doctype]);
  useEffect(() => { setDoc(adapter.get(cfg.doctype, id) ?? null); }, [cfg.doctype, id]);
  const header = (
    <>
      <Link to={kind === "contact" ? "/digit-crm/contacts" : "/digit-crm/customers"} className="text-crm-muted hover:underline">{L(cfg.label)}</Link>
      <span className="text-crm-muted">/</span>
      <span className="text-lg font-semibold">{String(doc && meta && hasPerm(meta, "read", doc, user) ? doc[cfg.title] ?? id : id)}</span>
      {doc && meta && hasPerm(meta, "read", doc, user) && <div className="ms-auto flex items-center gap-2">
        {saved && <span className="text-xs text-crm-muted">Saved</span>}
        <button
          className="crm-btn-solid"
          disabled={!doc || !meta || !hasPerm(meta, "write", doc, user)}
          onClick={() => {
            if (!doc || !meta || !hasPerm(meta, "write", doc, user)) return;
            const { name, doctype, ...rest } = doc;
            adapter.update(cfg.doctype, name, rest);
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >Save</button>
      </div>}
    </>
  );
  if (!b || !meta) return <CrmShell header={header}><p className="p-6 text-crm-muted">Loading…</p></CrmShell>;
  if (!doc) return <CrmShell header={header}><p className="p-6 text-crm-muted">{cfg.single} not found.</p></CrmShell>;
  if (!hasPerm(meta, "read", doc, user)) return <CrmShell header={header}><div role="alert" className="space-y-2 p-6 text-crm-muted"><p>{L("Not permitted")}</p><Link to={kind === "contact" ? "/digit-crm/contacts" : "/digit-crm/customers"} className="text-sm text-crm-ink underline">{L(kind === "contact" ? "Back to Contacts" : "Back to Organizations")}</Link></div></CrmShell>;
  const layout = b.layouts[`${cfg.doctype}-Quick Entry`]?.layout ?? [];
  const deals = scopedList("CRM Deal", user).filter((d) =>
    kind === "organization"
      ? d["organization"] === doc.name || d["organization"] === doc["organization_name"]
      : ((d["contacts"] as { contact: string }[] | undefined) ?? []).some((c) => c.contact === doc.name) || d["contact"] === doc.name,
  );
  return (
    <CrmShell header={header}>
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]">
        <section>
          <h3 className="mb-3 text-sm font-semibold">Details</h3>
          <LayoutRenderer layout={layout} meta={meta} doc={doc} b={b} onChange={(k, v) => setDoc({ ...doc, [k]: v })} />
          <DevOnly><p className="mt-3 text-[11px] text-crm-muted">Layout: {cfg.doctype}-Quick Entry (crm/install.py). Saves locally to the shared preview store.</p></DevOnly>
        </section>
        <aside>
          <h3 className="mb-2 text-sm font-semibold">Deals</h3>
          <div className="space-y-2">
            {deals.map((d) => (
              <Link key={d.name} to="/digit-crm/deals/$dealId" params={{ dealId: d.name }} className="block rounded-md border border-crm-line p-2 text-sm hover:bg-crm-hover">
                <div className="font-medium">{String(d["organization"] ?? d.name)}</div>
                <div className="text-xs text-crm-muted">{String(d["status"] ?? "")} · {timeAgo(d["modified"])}</div>
              </Link>
            ))}
            {!deals.length && <p className="text-xs text-crm-muted">No deals linked to this {cfg.single.toLowerCase()}.</p>}
          </div>
        </aside>
      </div>
    </CrmShell>
  );
}
