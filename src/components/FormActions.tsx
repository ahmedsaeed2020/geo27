import { useNavigate } from "@tanstack/react-router";
import { gifSources } from "@/lib/getItemsFrom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDevMode } from "@/lib/mode";
import { toast } from "sonner";
import { indexQuery, loadMeta, TABLE_TYPES, type DocTypeMeta } from "@/lib/catalog";
import { adapter, type Doc } from "@/lib/adapter";
import { createDraft } from "@/lib/documentApi";
import { actionVisible, formActions, formActionsQuery, mapDoc, type FormAction } from "@/lib/engines";
import { localActionFor, LOCAL_PRIMARY, LOCAL_EXTRA, localWhen } from "@/lib/localActions";
import { t } from "@/i18n";

type IndexEntry = { name: string; app: string; slug: string };
/** The form's currently permitted source actions (add_custom_button eligibility, docstatus groups, local ports), so the
 * header buttons and the next-step guide list the same actions. */
export function visibleFormActions(meta: DocTypeMeta, doc: Doc, all: unknown, index: IndexEntry[] | undefined, hide?: string[]): FormAction[] {
  // form_actions.json is keyed by DocType
  const acts = formActions((all as Record<string, FormAction[]> | undefined)?.[meta.name]).filter((a) => !hide?.includes(a.label)).filter((a) => (localActionFor(meta.name, a.label) ? localWhen(meta.name, a.label, doc, (d) => actionVisible(a, d)) : actionVisible(a, doc)) && !(a.group === "Get Items From" && ((doc.docstatus ?? 0) > 0 || (!!a.target && a.target.toLowerCase() === meta.name.toLowerCase() && !!index?.some((e) => e.name === a.label))))
    // source refresh() wraps Create / Status / Stock Reservation groups in `if (doc.docstatus == 1)` (and get_mapped_doc / update_status require a submitted source)
    && !(meta.is_submittable && Number(doc.docstatus ?? 0) !== 1 && ["Create", "Status", "Stock Reservation"].includes(String(a.group ?? "")))
    // a local port carries its own source eligibility (LOCAL_WHEN): extracted conditions flatten nested if-branches (e.g. the Failed-retry path of Create Salary Slips)
    );
  for (const x of LOCAL_EXTRA[meta.name] ?? []) if (localWhen(meta.name, x.label, doc) && !acts.some((a) => a.label === x.label)) acts.push({ label: x.label, group: x.group, primary: x.primary, conditions: [] } as unknown as FormAction);
  const prim = LOCAL_PRIMARY[meta.name];
  if (prim && !acts.some((a) => a.label === prim)) acts.unshift({ label: prim, primary: true } as unknown as FormAction);
  return acts;
}

/** Runs one form action: a local port, a list route, or a mapped document opened as an unsaved draft. */
export function useFormActionRunner(meta: DocTypeMeta, doc: Doc, onPatch?: (p: Record<string, unknown>) => void) {
  const { data: index } = useQuery(indexQuery);
  const nav = useNavigate();
  const dev = useDevMode();
  const [busy, setBusy] = useState(false);
  const runInner = async (a: FormAction) => {
    const local = localActionFor(meta.name, a.label);
    if (local) {
      try {
        const r = local({ ...(adapter.get(meta.name, doc.name) ?? {}), ...doc } as Doc, (q) => window.prompt(t(q)));
        if (r.patch) onPatch?.(r.patch);
        if (r.message) toast.success(t(r.message));
        const oe = r.open && index?.find((e) => e.name === r.open![0]);
        if (oe) void nav({ to: "/app/$app/$doctype/$name", params: { app: oe.app, doctype: oe.slug, name: r.open![1] } });
      } catch (e) { toast.error((e as Error).message.split("\n").map((x) => t(x)).join("\n")); }
      return;
    }
    const entry = a.target && index?.find((e) => e.name === a.target);
    if (!entry || !index) { toast.info(dev ? `${a.label}: server-dependent${a.method ? ` (${a.method})` : ""}` : a.label); return; }
    if (a.kind === "route") {
      // frappe.set_route("List", target, {filters}) — navigation, nothing is created
      const filters = Object.entries(a.route_filters ?? {}).map(([k, v]) => [k, "=", v.field ? (v.field === "name" ? doc.name : String(doc[v.field] ?? "")) : v.value ?? ""]);
      void nav({ to: "/app/$app/$doctype", params: { app: entry.app, doctype: entry.slug }, search: filters.length ? { filters: JSON.stringify(filters) } : {} } as never);
      return;
    }
    const tm = await loadMeta(index, entry.name); if (!tm) return;
    const childMetas: Record<string, DocTypeMeta> = {};
    for (const f of tm.fields.filter((x) => TABLE_TYPES.has(x.fieldtype) && x.options)) { const m = await loadMeta(index, f.options!); if (m) childMetas[f.options!] = m; }
    // frappe.model.open_mapped_doc: the mapped document opens as an unsaved local draft (create permission checked);
    // validation, naming and the target's controller hooks run on its first Save, so nothing is stored until then
    const r = createDraft(tm, { mapped: mapDoc(meta, doc, tm, childMetas, a.field_map) });
    if (!r.doc) { toast.error(r.errors.map((x) => t(x)).join("\n")); return; }
    void nav({ to: "/app/$app/$doctype/$name", params: { app: entry.app, doctype: entry.slug, name: r.doc.name } });
  };
  const run = async (a: FormAction) => {
    if (busy) return; setBusy(true);
    try { await runInner(a); } finally { setBusy(false); }
  };
  return { run, busy };
}

/** Form action engine: renders source add_custom_button actions (grouped like "Create ▸") and runs preview mappings. */
export function FormActions({ meta, doc, onPatch, hide }: { meta: DocTypeMeta; doc: Doc; onPatch?: (p: Record<string, unknown>) => void; /** labels shown elsewhere on the page (the document summary card's ledger buttons) */ hide?: string[] | undefined }) {
  const { data: all } = useQuery(formActionsQuery);
  const { data: index } = useQuery(indexQuery);
  const [open, setOpen] = useState<string | null>(null);
  const dev = useDevMode();
  const { run: runAction, busy } = useFormActionRunner(meta, doc, onPatch);
  // the shared Get Items From button (GetItemsFrom.tsx) carries this group's entries in its one menu when it has mapped sources
  const gifOwns = Number(doc.docstatus ?? 0) === 0 && gifSources(formActions((all as Record<string, FormAction[]> | undefined)?.[meta.name]), meta.name, (dt) => !!index?.some((e) => e.name === dt)).length > 0;
  const acts = visibleFormActions(meta, doc, all, index, hide).filter((a) => !(gifOwns && a.group === "Get Items From"));
  if (!acts.length) return null;
  const groups = new Map<string, FormAction[]>();
  acts.forEach((a) => { const g = a.group ?? ""; groups.set(g, [...(groups.get(g) ?? []), a]); });
  const run = async (a: FormAction) => { setOpen(null); await runAction(a); };

  return (
    <div className="flex flex-wrap items-center gap-2" data-form-actions={acts.length} aria-busy={busy}>
      {[...groups].map(([g, list]) => g === "" ? list.map((a) => (
        <button key={a.label} className={(a as { primary?: boolean }).primary ? "btn-primary" : "btn-ghost"} data-action-label={a.label} data-action-target={a.target ?? ""} data-action-kind={a.kind ?? "create"} disabled={busy} onClick={() => void run(a)} title={a.source}>{a.label}</button>
      )) : (
        <div key={g} className="relative">
          <button className="btn-ghost" aria-expanded={open === g} onClick={() => setOpen(open === g ? null : g)} data-action-group={g}>{g} ▾</button>
          {open === g && (
            <div className="absolute end-0 top-full z-40 mt-1 min-w-48 rounded-md border border-border bg-popover py-1 shadow-lg" role="menu">
              {list.map((a) => (
                <button key={a.label} role="menuitem" disabled={busy} className="block w-full px-3 py-1.5 text-start text-sm hover:bg-muted" data-action-label={a.label} data-action-target={a.target ?? ""} data-action-kind={a.kind ?? "create"} onClick={() => void run(a)} title={a.target ? `Preview mapping → ${a.target}` : `Server-dependent${a.method ? `: ${a.method}` : ""}`}>
                  {a.label}{dev && !a.target && <span className="ms-2 text-[10px] text-muted-foreground">server</span>}
                </button>))}
            </div>)}
        </div>
      ))}
    </div>
  );
}

/** Full source action list (incl. ones hidden by the current docstatus/status) for the Action inventory panel. */
export function SourceActionList({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  const { data: all } = useQuery(formActionsQuery);
  const acts = formActions(all?.[meta.name]);
  if (!acts.length) return null;
  return (
    <div data-source-actions={acts.length} className="mt-2">
      <h4 className="text-xs font-semibold">Source buttons ({acts.length})</h4>
      <ul className="mt-1 space-y-0.5">
        {acts.map((a) => (
          <li key={`${a.group}-${a.label}`} data-source-action={a.label} className={actionVisible(a, doc) ? "" : "text-muted-foreground"}>
            {a.group ? <><span>{a.group}</span>{" ▸ "}</> : null}<span>{a.label}</span>
            <span className="ms-1 text-[10px]">{a.target ? <>→ <span>{a.target}</span></> : "server"}{actionVisible(a, doc) ? "" : <> · <span>hidden now</span></>}</span>
          </li>))}
      </ul>
    </div>
  );
}
