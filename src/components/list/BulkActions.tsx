import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { cachedMeta, ensureMetas, type DocField, type DocTypeMeta } from "@/lib/catalog";
import { capabilityQuery } from "@/lib/capabilities";
import { runtimeContractQuery, documentCapability } from "@/lib/runtimeContract";
import { currentUser, hasPerm, permRules, userRoles, useSessionUser } from "@/lib/session";
import { activeWorkflow } from "@/lib/workflow";
import { useSettings } from "@/lib/userSettings";
import { BULK_LABEL, bulkActionItems, clipboardTSV, exportOwnerOnly, isBulkEditable, printSelectionError, type BulkActionId } from "@/lib/listActions";
import { bulkSubmitCancel, bulkUpdate } from "@/lib/bulkOps";
import { deleteDocument, deleteDocuments, deleteSupport } from "@/lib/deleteDoc";
import { runsInBackground, startBulkJob } from "@/lib/coreShared/jobs";
import { addAssignment, addTags, clearAssignments } from "@/lib/assignment";
import { tLabel } from "@/i18n";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/form/DateInput";

/**
 * List "Actions" menu for checked rows (frappe/public/js/frappe/list/list_view.js get_actions_menu_items +
 * bulk_operations.js). Visibility follows listActions.ts source gates; execution goes through the shared delete /
 * lifecycle / assignment services, and actions that need a Frappe server stay visible but disabled with the reason.
 */
export interface BulkColumn { label: string; value: (row: Record<string, unknown>) => unknown }
type Confirm = { kind: "delete" | "submit" | "cancel" | "clear_assignment" } | null;
type Report = { title: string; items: { name: string; errors: string[] }[] } | null;

export function BulkActions({ meta, selected, columns, onDone }: { meta: DocTypeMeta; selected: Doc[]; columns: BulkColumn[]; onDone: () => void }) {
  const user = useSessionUser();
  const us = useSettings();
  const nav = useNavigate();
  const reg = useQuery(capabilityQuery);
  const rc = useQuery(runtimeContractQuery);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [dialog, setDialog] = useState<null | "edit" | "assign" | "tags">(null);
  const [report, setReport] = useState<Report>(null);
  const names = selected.map((d) => d.name);
  const roles = userRoles(user);
  const wf = activeWorkflow(meta.name);
  const items = bulkActionItems(meta, {
    can: (p) => hasPerm(meta, p, undefined, user), bulkActions: us.bulk_actions, hasWorkflow: !!wf,
    workflowAllowEdit: !!Number(adapter.get("List View Settings", meta.name)?.["allow_edit"] ?? 0),
    exportOwnerOnly: exportOwnerOnly(permRules(meta), roles),
  });
  const cap = rc.data ? documentCapability(meta) : null;
  const del = rc.data ? deleteSupport(meta) : null;
  const disabled = (id: BulkActionId): string | null => {
    if (id === "assignment_rule") return "Assignment Rules run on the DIGIT server (automation/doctype/assignment_rule bulk_apply)";
    if (id === "submit" || id === "cancel") { if (!cap) return "Loading…"; return cap[id] === "SERVER_ONLY" ? cap.reasons[0] ?? "Requires the DIGIT server" : null; }
    if (id === "delete") { if (!del || !reg.data) return "Loading…"; return del.ok ? null : del.reason; }
    return null;
  };
  // the selection is cleared only once the failure report is closed, so the report stays mounted with this menu
  const finish = (failed: { name: string; errors: string[] }[], title: string) => {
    if (failed.length) setReport({ title, items: failed }); else onDone();
  };
  const run = (id: BulkActionId) => {
    setOpen(false);
    if (id === "copy") {
      if (!selected.length) { toast.warning(tLabel("No rows selected")); return; }
      void navigator.clipboard?.writeText(clipboardTSV(columns, selected));
      toast.success(tLabel(`Copied ${selected.length} ${selected.length === 1 ? "row" : "rows"} to clipboard`));
      return;
    }
    if (id === "export") { void nav({ to: "/app/data-export", search: { doctype: meta.name, names: names.join(",") } }); return; }
    if (id === "print") {
      const ps: Record<string, unknown> = adapter.get("Print Settings", "Print Settings") ?? { allow_print_for_draft: 1, allow_print_for_cancelled: 0 };
      const err = printSelectionError(!!meta.is_submittable, selected, ps, user === "Administrator");
      if (err) { setReport({ title: "Print", items: [{ name: "", errors: [err] }] }); return; }
      void nav({ to: "/printview", search: { doctype: meta.name, name: names[0] ?? "", names: JSON.stringify(names) } });
      return;
    }
    if (id === "edit" || id === "assign" || id === "add_tags") { setDialog(id === "add_tags" ? "tags" : id); return; }
    if (id === "delete" || id === "submit" || id === "cancel" || id === "clear_assignment") setConfirm({ kind: id });
  };
  const confirmed = () => {
    const k = confirm?.kind; setConfirm(null);
    if (!k) return;
    // frappe enqueues large bulk actions (submit/cancel from 20, delete above 10): they run as a background job with a per-row log
    if (k !== "clear_assignment" && runsInBackground(k, names.length)) {
      const reg2 = reg.data; const j = startBulkJob({ doctype: meta.name, names, action: k, user, ...(k === "delete" && reg2 ? { deleter: (nm: string) => deleteDocument(meta, nm, reg2, user) } : {}) });
      if (j.ok) { toast.success(`Bulk operation is enqueued in background (${j.name}). Follow it in Background jobs.`); onDone(); } else toast.error(j.reason[0]);
      return;
    }
    if (k === "delete") { if (!reg.data) return; const r = deleteDocuments(meta, names, reg.data, user); finish(r.failed, `Cannot delete ${r.failed.map((f) => f.name).join(", ")}`); return; }
    if (k === "clear_assignment") { clearAssignments(meta.name, names, user); onDone(); return; }
    const r = bulkSubmitCancel(meta, names, k, user);
    if (r.error) { setReport({ title: k === "submit" ? "Submit" : "Cancel", items: [{ name: "", errors: [r.error] }] }); return; }
    finish(r.failed, `Cannot ${k} ${r.failed.map((f) => f.name).join(", ")}.`);
  };
  const confirmText = confirm?.kind === "delete" ? (names.length === 1 ? `Delete ${names.length} item permanently?` : `Delete ${names.length} items permanently?`)
    : confirm?.kind === "submit" ? `Submit ${names.length} documents?` : confirm?.kind === "cancel" ? `Cancel ${names.length} documents?` : "Are you sure you want to clear the assignments?";
  const inBackground = !!confirm && confirm.kind !== "clear_assignment" && runsInBackground(confirm.kind, names.length);

  return (
    <div className="relative" data-bulk-actions>
      <button type="button" className="btn-ghost" aria-haspopup="menu" aria-expanded={open} data-bulk-actions-button onClick={() => setOpen(!open)}>
        <span>Actions</span> <span aria-hidden>▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute end-0 top-10 z-40 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
          {items.map((id) => {
            const why = disabled(id);
            return (
              <button key={id} type="button" role="menuitem" data-bulk-action={id} disabled={!!why} title={why ? tLabel(why) : undefined} onClick={() => run(id)}
                className={`block w-full rounded px-2 py-1.5 text-start text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${id === "delete" ? "text-destructive" : ""}`}>
                <span>{BULK_LABEL[id]}</span>
                {why && why !== "Loading…" && <span className="block text-[11px] text-muted-foreground" data-server-only>{why}</span>}
              </button>
            );
          })}
        </div>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent data-bulk-confirm={confirm?.kind}>
          <DialogHeader><DialogTitle>Confirm</DialogTitle></DialogHeader>
          <p className="text-sm">{confirmText}</p>
          {inBackground && <p className="text-xs text-muted-foreground" data-bulk-background>This runs in the background; you can keep working and follow each row in Background jobs.</p>}
          <DialogFooter>
            <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>{confirm?.kind === "delete" ? "Cancel" : "No"}</button>
            <button type="button" className={confirm?.kind === "delete" || confirm?.kind === "cancel" ? "btn-primary bg-destructive text-destructive-foreground hover:bg-destructive/90" : "btn-primary"} data-bulk-confirm-yes onClick={confirmed}>{confirm?.kind === "delete" ? "Delete" : "Yes"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!report} onOpenChange={(o) => { if (!o) { setReport(null); onDone(); } }}>
        <DialogContent data-bulk-report>
          <DialogHeader><DialogTitle>{report?.title ?? ""}</DialogTitle></DialogHeader>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {report?.items.map((it, i) => (
              <li key={`${it.name}-${i}`} className="rounded border border-border p-2">
                {it.name && <span className="block font-medium" data-no-i18n>{it.name}</span>}
                {(it.errors.length ? it.errors : ["Not applicable to this document's status"]).map((e, j) => <span key={j} className="block text-muted-foreground" data-bulk-error>{e}</span>)}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {dialog === "edit" && <BulkEditDialog meta={meta} names={names} onClose={(failed) => { setDialog(null); if (failed) finish(failed, `Cannot update ${failed.map((f) => f.name).join(", ")}`); }} />}
      {dialog === "assign" && <AssignDialog meta={meta} names={names} onClose={(ok) => { setDialog(null); if (ok) onDone(); }} />}
      {dialog === "tags" && <TagsDialog meta={meta} names={names} onClose={(ok) => { setDialog(null); if (ok) onDone(); }} />}
    </div>
  );
}

type Mapping = { key: string; label: string; field: DocField; child?: string };
function valueInput(f: DocField, value: string, set: (v: string) => void) {
  const common = { className: "field-input", "aria-label": "Value", "data-bulk-edit-value": "" } as const;
  if (f.fieldtype === "Select") return <select {...common} value={value} onChange={(e) => set(e.target.value)}>{String(f.options ?? "").split("\n").map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (f.fieldtype === "Check") return <input type="checkbox" aria-label="Value" data-bulk-edit-value checked={value === "1"} onChange={(e) => set(e.target.checked ? "1" : "0")} />;
  if (f.fieldtype === "Date") return <DateInput {...common} value={value} onChange={(e) => set(e.target.value)} />;
  if (["Int", "Float", "Currency", "Percent"].includes(f.fieldtype)) return <input type="number" {...common} value={value} onChange={(e) => set(e.target.value)} />;
  if (f.fieldtype === "Link" && f.options) {
    const opts = adapter.list(String(f.options)).slice(0, 200).map((d) => d.name);
    return <><input {...common} list="bulk-edit-link" data-no-i18n value={value} onChange={(e) => set(e.target.value)} /><datalist id="bulk-edit-link">{opts.map((o) => <option key={o} value={o} />)}</datalist></>;
  }
  return <input {...common} data-no-i18n value={value} onChange={(e) => set(e.target.value)} />;
}
const cast = (f: DocField, v: string): unknown => (["Int", "Check"].includes(f.fieldtype) ? (v === "" ? 0 : Math.trunc(Number(v))) : ["Float", "Currency", "Percent"].includes(f.fieldtype) ? (v === "" ? 0 : Number(v)) : v);

/** bulk_operations.js edit(): Field (parent + child table fields) and Value; primary "Update {n} records". */
function BulkEditDialog({ meta, names, onClose }: { meta: DocTypeMeta; names: string[]; onClose: (failed?: { name: string; errors: string[] }[]) => void }) {
  const [ready, setReady] = useState(0);
  const tables = meta.fields.filter((f) => f.fieldtype === "Table" && f.options);
  useEffect(() => { void ensureMetas(tables.map((t) => String(t.options))).then(() => setReady((n) => n + 1)); }, [meta.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const maps = useMemo<Mapping[]>(() => {
    const out: Mapping[] = meta.fields.filter(isBulkEditable).map((f) => ({ key: `${f.label ?? f.fieldname} (${meta.name})`, label: `${tLabel(f.label ?? f.fieldname!)} (${tLabel(meta.name)})`, field: f }));
    for (const t of tables) { const cm = cachedMeta(String(t.options)); for (const cf of cm?.fields.filter(isBulkEditable) ?? []) out.push({ key: `${cf.label ?? cf.fieldname} (${t.label ?? t.fieldname})`, label: `${tLabel(cf.label ?? cf.fieldname!)} (${tLabel(t.label ?? t.fieldname!)})`, field: cf, child: String(t.options) }); }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [meta, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = maps.find((m) => /status/i.test(m.key)) ?? maps.find((m) => m.field.fieldtype === "Select") ?? maps[0];
  const [key, setKey] = useState<string>("");
  const cur = maps.find((m) => m.key === (key || def?.key));
  const [value, setValue] = useState("");
  const [warn, setWarn] = useState(false);
  const apply = () => {
    if (!cur) return;
    if (value === "" && !warn) { setWarn(true); return; }
    const v = cast(cur.field, value);
    const r = cur.child ? bulkUpdate(meta, names, {}, { [cur.child]: { [cur.field.fieldname!]: v } }) : bulkUpdate(meta, names, { [cur.field.fieldname!]: v });
    if (r.error) { toast.error(tLabel(r.error)); return; }
    if (!r.failed.length) toast.success(tLabel("Updated successfully"));
    onClose(r.failed.length ? r.failed : undefined);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-bulk-edit>
        <DialogHeader><DialogTitle>Bulk Edit</DialogTitle></DialogHeader>
        <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Field</span>
          <select className="field-input" aria-label="Field" data-bulk-edit-field value={cur?.key ?? ""} onChange={(e) => { setKey(e.target.value); setValue(""); setWarn(false); }}>
            {maps.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
        {cur && <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Value</span>{valueInput(cur.field, value, (v) => { setValue(v); setWarn(false); })}</label>}
        {warn && <p className="text-sm text-warning-foreground" data-bulk-edit-empty>You have not entered a value. The field will be set to empty.</p>}
        <DialogFooter>
          <button type="button" className="btn-primary" data-bulk-edit-apply disabled={!cur} onClick={apply}>{`Update ${names.length} records`}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** frappe.ui.form.AssignToDialog (bulk_assign): Assign to me, Assign To, Complete By, Priority, Comment. */
function AssignDialog({ meta, names, onClose }: { meta: DocTypeMeta; names: string[]; onClose: (ok: boolean) => void }) {
  const users = adapter.list("User").filter((u) => Number(u["enabled"] ?? 1) !== 0).map((u) => u.name);
  const all = [...new Set(["Administrator", ...users])];
  const [me, setMe] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [comment, setComment] = useState("");
  const targets = [...new Set([...(me ? [currentUser()] : []), ...pick])];
  const add = () => {
    const hasField = meta.fields.some((f) => f.fieldname === "assigned_to");
    const dup = new Set<string>();
    for (const n of names) addAssignment(meta.name, n, targets, { description: comment, priority, date, hasAssignedToField: hasField }).duplicates.forEach((d) => dup.add(d));
    if (dup.size) toast.info(tLabel("Already in the following Users ToDo list:"), { description: [...dup].join(", ") });
    onClose(true);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent data-bulk-assign>
        <DialogHeader><DialogTitle>Add to ToDo</DialogTitle></DialogHeader>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={me} onChange={(e) => setMe(e.target.checked)} data-assign-me /><span>Assign to me</span></label>
        <fieldset className="text-sm"><legend className="mb-1 text-muted-foreground">Assign To</legend>
          <div className="max-h-40 space-y-1 overflow-auto rounded border border-border p-2">
            {all.map((u) => <label key={u} className="flex items-center gap-2"><input type="checkbox" data-assign-user={u} checked={pick.includes(u)} onChange={(e) => setPick(e.target.checked ? [...pick, u] : pick.filter((x) => x !== u))} /><span data-no-i18n>{u}</span></label>)}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label><span className="mb-1 block text-muted-foreground">Complete By</span><DateInput className="field-input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Complete By" /></label>
          <label><span className="mb-1 block text-muted-foreground">Priority</span>
            <select className="field-input" value={priority} onChange={(e) => setPriority(e.target.value as "Low" | "Medium" | "High")} aria-label="Priority">{["Low", "Medium", "High"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Comment</span><textarea className="field-input min-h-16" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Comment" /></label>
        <DialogFooter><button type="button" className="btn-primary" data-assign-add disabled={!targets.length} onClick={add}>Add</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** bulk_operations.js add_tags(): Tags (comma separated, existing Tag masters suggested); primary "Add". */
function TagsDialog({ meta, names, onClose }: { meta: DocTypeMeta; names: string[]; onClose: (ok: boolean) => void }) {
  const [v, setV] = useState("");
  const known = adapter.list("Tag").map((t) => t.name);
  const tags = v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent data-bulk-tags>
        <DialogHeader><DialogTitle>Add Tags</DialogTitle></DialogHeader>
        <label className="block text-sm"><span className="mb-1 block text-muted-foreground">Tags</span>
          <input className="field-input" list="bulk-tags" data-no-i18n aria-label="Tags" value={v} onChange={(e) => setV(e.target.value)} />
          <datalist id="bulk-tags">{known.map((k) => <option key={k} value={k} />)}</datalist>
        </label>
        <DialogFooter><button type="button" className="btn-primary" data-tags-add disabled={!tags.length} onClick={() => { addTags(meta.name, names, tags); onClose(true); }}>Add</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
