import { leadCrumbs } from "@/components/desk/AppCrumb";
import { createFileRoute, Link, useNavigate, useHydrated } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shell, Loading } from "@/components/Shell";
import { metaQuery } from "@/lib/catalog";
import { adapter, useStoreVersion, type Doc } from "@/lib/adapter";
import { treeParentField, treeViewsQuery } from "@/lib/engines";
import { t as tr, useLang } from "@/i18n";
import { DevOnly } from "@/components/DevOnly";
import { ContextStrip } from "@/components/enterprise/kit/templates";
import { accountTreeBalances } from "@/lib/coreShared/docInsight";
import { useSessionUser } from "@/lib/session";
import { useScopeMetas } from "@/lib/scope";
import { fmtCurrency } from "@/lib/format";
import { openQuickView } from "@/components/enterprise/QuickView";

export const Route = createFileRoute("/app/$app/$doctype/view/tree")({
  head: ({ params }) => {
    const t = params.doctype.replace(/_/g, " ");
    return { meta: [
      { title: `${t} tree — Digit Desk` },
      { name: "description", content: `Tree view of ${t} records: expand, add child, open.` },
      { property: "og:title", content: `${t} tree — Digit Desk` },
      { property: "og:description", content: `Tree view of ${t} records: expand, add child, open.` },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ] };
  },
  component: TreePage,
});

/** Tree engine (frappe/public/js/frappe/views/treeview.js): nested set by parent field; drag disabled. */
function TreePage() {
  const { app, doctype } = Route.useParams();
  const ar = useLang() === "ar";
  const { data: meta } = useQuery(metaQuery(app, doctype));
  const { data: trees } = useQuery(treeViewsQuery);
  const hydrated = useHydrated();
  const user = useSessionUser();
  useStoreVersion(); useScopeMetas(["GL Entry"]);
  useEffect(() => { if (meta) adapter.ensureSeed(meta); }, [meta]);
  if (!meta || !hydrated) return <Shell><Loading what="tree" /></Shell>;
  const cfg = trees?.[meta.name];
  const pf = treeParentField(meta);
  const rows = adapter.list(meta.name);
  const names = new Set(rows.map((r) => r.name));
  const kids = (p: string | null) => rows.filter((r) => { const v = pf ? String(r[pf] ?? "") : ""; return p === null ? !v || !names.has(v) : v === p; }).sort((a, b) => a.name.localeCompare(b.name));
  const rootLabel = cfg?.root_label ?? `All ${meta.name}s`;
  const rootAr = `كل ${tr(meta.name)}`;
  // Chart of Accounts: every node shows its ledger balance (groups roll up their children), as the source account tree does
  const bal = meta.name === "Account" ? accountTreeBalances(user) ?? undefined : undefined;
  return (
    <Shell crumbs={[...leadCrumbs(meta, app), { label: "", to: <Link to="/app/$app/$doctype" params={{ app, doctype }} className="hover:underline" data-crumb-doctype>{meta.name}</Link> }]}>
      <ContextStrip icon={<img src="/icons/digit/feat/digit-feat-documents-dark.svg" alt="" />} eyebrow={tr(String(meta.module ?? "Documents"))}
        title={<span data-tree-title>{ar ? `شجرة ${tr(meta.name)}` : `${meta.name} Tree`}</span>}
        sub={ar ? "افتح أي فرع لرؤية ما تحته، وأضف فرعًا أو حسابًا من المكان نفسه." : "Expand a branch to see what sits under it; add a child in place."}
        actions={<Link to="/app/$app/$doctype" params={{ app, doctype }} className="ek-context-btn">{ar ? "القائمة" : "List"}</Link>} />
      {cfg?.server_dependent && <DevOnly><p className="mt-1 text-xs text-muted-foreground">Source loads nodes from {cfg.get_tree_nodes ?? "the server"}; this preview builds the tree from local records.</p></DevOnly>}
      <div className="ek-card mt-4 p-4 text-sm" data-tree-root={rootLabel}>
        <Node label={ar ? rootAr : rootLabel} isRoot items={kids(null)} kids={kids} meta={{ app, doctype, name: meta.name, pf, bal, ar }} />
      </div>
    </Shell>
  );
}

type Ctx = { app: string; doctype: string; name: string; pf: string | undefined; bal?: Map<string, number> | undefined; ar?: boolean };
/** A node's balance: amount with Dr / Cr; opens the account's side panel (balance, latest rows, General Ledger link). */
function Balance({ name, meta }: { name: string; meta: Ctx }) {
  const v = meta.bal?.get(name); if (v === undefined || v === 0) return meta.bal ? <span className="ms-auto text-xs text-muted-foreground" data-tree-balance="0" data-no-i18n>—</span> : null;
  const side = v >= 0 ? (meta.ar ? "مدين" : "Dr") : (meta.ar ? "دائن" : "Cr");
  return <button type="button" className="ms-auto tabular-nums text-xs hover:underline" data-tree-balance={v} onClick={(e) => openQuickView({ kind: "doc", doctype: "Account", name }, e.currentTarget)}>
    <bdi data-no-i18n>{fmtCurrency(Math.abs(v), "SAR")}</bdi> <span className="text-muted-foreground">{side}</span></button>;
}
function Node({ label, items, kids, meta, isRoot, doc }: { label: string; items: Doc[]; kids: (p: string) => Doc[]; meta: Ctx; isRoot?: boolean; doc?: Doc }) {
  const [open, setOpen] = useState(!!isRoot);
  const nav = useNavigate();
  const group = isRoot || !!doc?.["is_group"] || items.length > 0;
  const add = () => {
    const nm = prompt(tr(`New ${meta.name} name`)); if (!nm) return;
    adapter.insertDoc(meta.name, { name: nm, [meta.pf ?? "parent"]: isRoot ? "" : doc!.name, is_group: 0 });
    setOpen(true);
  };
  return (
    <div className="ms-2">
      <div className="group flex items-center gap-2 py-0.5" data-tree-node={label}>
        <button className="w-4 text-muted-foreground" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"} disabled={!group}>{group ? (open ? "▾" : "▸") : "•"}</button>
        {doc ? <span data-no-i18n>{label}</span> : <b>{label}</b>}
        <span className="hidden gap-1 group-hover:flex">
          {doc && <button className="btn-ghost px-1.5 py-0 text-xs" onClick={() => void nav({ to: "/app/$app/$doctype/$name", params: { app: meta.app, doctype: meta.doctype, name: doc.name } })}>{tr("Edit")}</button>}
          {group && <button className="btn-ghost px-1.5 py-0 text-xs" onClick={add}>{tr("Add Child")}</button>}
        </span>
        {doc && <Balance name={doc.name} meta={meta} />}
      </div>
      {open && <div className="border-s border-border ps-2">{items.map((d) => <Node key={d.name} label={d.name} doc={d} items={kids(d.name)} kids={kids} meta={meta} />)}</div>}
    </div>
  );
}
