/**
 * HR section "Documents & work" register (owner brief 2026-11-15 §2): the Core Document Hub over the section's native
 * documents (nativeMap), with quick tiles taken from the section's own figures (same filters as the cards), the
 * section reports, "Waiting on me" from the HR approval inbox and new drafts through the shared createDraft path.
 * Hub state lives in hub_* URL keys, so Back and reload restore the register, search and open document.
 */
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adapter } from "@/lib/adapter";
import { cachedMeta, indexQuery, loadMeta, reportsQuery } from "@/lib/catalog";
import { createDraft } from "@/lib/documentApi";
import { hasPerm } from "@/lib/session";
import { buildHub, makeHubIndex, treeViewsQuery, type HubEntry } from "@/lib/hub";
import { DocumentHub, type HubLink, type HubState, type QuickTile, type RegisterViewsSpec } from "@/components/hub/DocumentHub";
import { t as tr } from "@/i18n";
import { canReadType } from "@/plugins/digit_hr/compat/scope";
import { useSessionUser } from "@/plugins/digit_hr/compat/session";
import NATIVE from "@/plugins/digit_hr/nativeMap";
import { HR_DOC_SEARCH, hrSearch } from "@/plugins/digit_hr/product/urls";
import { approvalInbox } from "@/plugins/digit_hr/product/approvals";
import { reportsOfSection } from "@/plugins/digit_hr/product/reports";
import { sectionSpec } from "@/plugins/digit_hr/product/overview";
import type { Drill } from "@/plugins/digit_hr/product/overview/kit";

const LEDGERS = new Set(["GL Entry", "Stock Ledger Entry", "Payment Ledger Entry"]);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const today = () => new Date().toISOString().slice(0, 10);
const DUE = ["due_at", "due_date", "expiry_date", "to_date", "end_date", "closes_on"];
const CLOSED = new Set(["Closed", "Completed", "Resolved", "Cancelled", "Approved", "Rejected", "Renewed", "Accepted", "Explained", "Applied", "Revoked"]);

export function SectionHub({ section, ar, search, go, company, extraDoctypes = [] }: { section: string; ar: boolean; search: Record<string, unknown>; go: (p: Record<string, string | undefined>) => void; company?: string | undefined; extraDoctypes?: string[] }) {
  const user = useSessionUser();
  const idx = useQuery(indexQuery); const reps = useQuery(reportsQuery); const trees = useQuery(treeViewsQuery);
  const nav = useNavigate();
  if (!idx.data || !reps.data || !trees.data) return <p className="text-sm text-muted-foreground" role="status" data-hub-loading>{ar ? "جارٍ تحميل مستندات القسم…" : "Loading section documents…"}</p>;
  const index = idx.data;
  const docs = [...(NATIVE[section] ?? []).map((d) => d.doctype), ...extraDoctypes.filter((d) => !(NATIVE[section] ?? []).some((x) => x.doctype === d))];
  const route = (dt: string) => { const e = index.find((x) => x.name === dt); return e ? { app: e.app, slug: e.slug } : (NATIVE[section] ?? []).find((x) => x.doctype === dt) ?? undefined; };
  const installed = (dt: string) => !!index.find((e) => e.name === dt);
  const spec = sectionSpec(section);
  const ctx = { on: today(), ar, user, company };
  const quick: QuickTile[] = (spec?.kpis ?? []).flatMap((k) => { try { const f = k.value(ctx); const d = f.drill as Drill | undefined; if (!d || d.kind !== "list" || f.value === null || k.unit !== "count") return []; return [{ id: k.id, label: k.title, hint: k.meaning, doctype: d.doctype, status: canReadType(d.doctype) ? (f.value ? "ok" as const : "empty" as const) : "denied" as const, count: f.value, filters: d.filters ?? [], tone: k.better === "down" ? "risk" as const : "action" as const, canCreate: false }]; } catch { return []; } }).slice(0, 4);
  const entries: HubEntry[] = [
    ...docs.map((dt) => ({ label: dt, target: { kind: "doctype" as const, doctype: dt }, source: `HR ${section}` })),
    ...reportsOfSection(section).map((r) => ({ label: r.name, target: { kind: "report" as const, report: r.name }, group: "reports" as const, source: `HR ${r.id}` })),
  ];
  const ix = makeHubIndex(index, reps.data, trees.data, { app: () => true });
  const model = buildHub(entries, ix);
  const state: HubState = { dt: str(search["hub_dt"]), q: str(search["hub_q"]), st: str(search["hub_st"]), doc: str(search["hub_doc"]), v: str(search["hub_v"]), g: str(search["hub_g"]) };
  const onState = (p: Partial<HubState>) => go({ ...("dt" in p ? { hub_dt: p.dt } : {}), ...("q" in p ? { hub_q: p.q } : {}), ...("st" in p ? { hub_st: p.st } : {}), ...("doc" in p ? { hub_doc: p.doc } : {}), ...("v" in p ? { hub_v: p.v } : {}), ...("g" in p ? { hub_g: p.g } : {}) });
  const waiting = new Set(approvalInbox({ user, company }).map((a) => `${a.doctype}|${a.name}`));
  const views: RegisterViewsSpec = {
    waitingOnMe: (dt, d) => waiting.has(`${dt}|${d.name}`),
    overdue: (_dt, d) => { if (Number(d["docstatus"]) === 2) return false; const st = String(d["workflow_state"] ?? d["status"] ?? d["case_status"] ?? ""); if (CLOSED.has(st)) return false; const f = DUE.find((k) => typeof d[k] === "string" && d[k]); return !!f && String(d[f]).slice(0, 10) < today(); },
  };
  const newDoc = async (doctype: string) => {
    const meta = await loadMeta(index, doctype);
    if (!meta) { toast.error(`${doctype}: ${ar ? "التعريف غير متاح" : "metadata unavailable"}`); return; }
    const r = createDraft(meta); if (!r.doc) { toast.error(r.errors.join("\n")); return; }
    const defaults: Record<string, unknown> = {};
    if (company && meta.fields.some((f) => f.fieldname === "company") && !r.doc["company"]) defaults["company"] = company;
    adapter.insertDocQuiet(doctype, { ...r.doc, ...defaults }); adapter.flush();
    const where = route(doctype); if (where) void nav({ to: "/app/$app/$doctype/$name", params: { app: where.app, doctype: where.slug, name: r.doc.name }, search: HR_DOC_SEARCH as never });
  };
  const link = (to: HubLink, children: ReactNode, attrs: Record<string, string> = {}): ReactNode => {
    if (to.kind === "new") return <button type="button" onClick={() => void newDoc(to.doctype)} {...attrs} data-new-doc={to.doctype}>{children}</button>;
    if (to.kind === "list" || to.kind === "doc" || to.kind === "print") {
      const r = route(to.doctype); if (!r) return <span {...attrs}>{children}</span>;
      if (to.kind === "print") return <Link to="/printview" search={{ doctype: to.doctype, name: to.name } as never} {...attrs}>{children}</Link>;
      if (to.kind === "doc") return <Link to="/app/$app/$doctype/$name" params={{ app: r.app, doctype: r.slug, name: to.name }} search={HR_DOC_SEARCH as never} {...attrs}>{children}</Link>;
      return <Link to="/app/$app/$doctype" params={{ app: r.app, doctype: r.slug }} search={hrSearch({ ...(to.filters?.length ? { filters: JSON.stringify(to.filters) } : {}), ...(to.view ? { view: to.view } : {}) }) as never} {...attrs}>{children}</Link>;
    }
    if (to.kind === "report") return <Link to="/report/$name" params={{ name: to.report }} {...attrs}>{children}</Link>;
    if (to.kind === "page") return <Link to="/page/$name" params={{ name: to.page }} {...attrs}>{children}</Link>;
    try { const a = JSON.parse(to.key) as { to: string }; return <Link to={a.to as never} {...attrs}>{children}</Link>; } catch { return <span {...attrs}>{children}</span>; }
  };
  const access = (e: HubEntry) => (e.target.kind === "doctype" || e.target.kind === "tree" ? (canReadType(e.target.doctype) ? "ok" as const : "denied" as const) : "ok" as const);
  const canCreate = (dt: string) => { if (LEDGERS.has(dt) || !installed(dt)) return false; const m = cachedMeta(dt); return !!m && !m.istable && !m.issingle && hasPerm(m, "create", undefined, user); };
  const label = (text: string) => { const r = reportsOfSection(section).find((x) => x.name === text); return <span>{r ? (ar ? r.ar : r.name) : tr(text)}</span>; };
  return (
    <div data-hr-hub={section}>
      <DocumentHub ar={ar} model={model} quick={quick} registers={docs.filter((d) => installed(d) && !index.find((e) => e.name === d)?.istable)} company={company} user={user}
        state={state} onState={onState} link={link} access={access} canCreate={canCreate} label={label} views={views} />
    </div>
  );
}
