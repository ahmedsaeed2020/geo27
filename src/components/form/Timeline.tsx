/** Document timeline shown under every form: Activity (with its count) and Changes (the field-by-field change log). */
import { useState } from "react";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { cachedMeta } from "@/lib/catalog";
import { useSettings } from "@/lib/userSettings";
import { relTime } from "@/lib/relTime";
import { useLang } from "@/i18n";
import { logTimeline } from "./FormSidebar";

/** Form timeline (frappe/public/js/frappe/form/footer/form_timeline.js): Version, Comment (incl. Assigned/Attachment/Shared/Tag) and Communication records. */
export function timelineCounts(doctype: string, name: string): { activity: number; changes: number } {
  const versions = adapter.list("Version").filter((v) => v["ref_doctype"] === doctype && v["docname"] === name);
  const act = versions.length + adapter.list("Comment").filter((c) => c["reference_doctype"] === doctype && c["reference_name"] === name).length
    + adapter.list("Communication").filter((c) => c["reference_doctype"] === doctype && c["reference_name"] === name).length;
  let ch = 0; for (const v of versions) { try { const d = JSON.parse(String(v["data"] ?? "{}")) as { changed?: unknown[]; added?: unknown[]; removed?: unknown[]; row_changed?: unknown[][] }; ch += (d.changed?.length ?? 0) + (d.added?.length ?? 0) + (d.removed?.length ?? 0) + (d.row_changed ?? []).reduce((a, rc) => a + (((rc[3] as unknown[]) ?? []).length), 0); } catch { /* ignore */ } }
  return { activity: act, changes: ch };
}
/** `only` renders one of the two panels without the switch (the DIGIT document frame puts each in its own document tab). */
export function Timeline({ doctype, name, only, onEmail }: { doctype: string; name: string; only?: "activity" | "changes"; onEmail?: () => void }) {
  useStoreVersion(); const [t, setT] = useState(""); const [tab0, setTab] = useState<"activity" | "changes">("activity"); const tab = only ?? tab0;
  const abs = useSettings().absolute_datetime;
  const lang = useLang();
  const meta = cachedMeta(doctype);
  const versions = adapter.list("Version").filter((v) => v["ref_doctype"] === doctype && v["docname"] === name);
  const comments = adapter.list("Comment").filter((c) => c["reference_doctype"] === doctype && c["reference_name"] === name);
  const emails = adapter.list("Communication").filter((c) => c["reference_doctype"] === doctype && c["reference_name"] === name);
  const VERB: Record<string, string> = { Assigned: "assigned to", "Assignment Completed": "removed the assignment of", Attachment: "attached", Shared: "shared with", Tag: "added a tag" };
  // the person who acted, as recorded on the timeline record (Version owner / comment author / e-mail sender)
  const who = (d: Record<string, unknown>, ...keys: string[]) => String(keys.map((k) => d[k]).find((v) => v) ?? "Administrator");
  const parse = (v: Record<string, unknown>) => { try { return JSON.parse(String(v["data"] ?? "{}")) as { created?: unknown; changed?: unknown[][]; added?: unknown[][]; removed?: unknown[][]; row_changed?: unknown[][] }; } catch { return {}; } };
  const items = [
    ...versions.map((v) => { const d = parse(v); return { at: String(v["creation"]), kind: "version", by: who(v, "owner", "modified_by"), text: d.created ? "created this" : "changed", detail: d.created ? "" : (d.changed ?? []).map((c) => `${c[0]}: ${String(c[1] ?? "—")} → ${String(c[2])}`).join(", ") }; }),
    ...comments.map((c) => { const ty = String(c["comment_type"] ?? "Comment"); const by = who(c, "comment_email", "owner"); return VERB[ty] ? { at: String(c["creation"]), kind: ty, by, text: VERB[ty]!, detail: String(c["content"]) } : { at: String(c["creation"]), kind: "comment", by, text: "commented", detail: String(c["content"]) }; }),
    ...emails.map((e) => ({ at: String(e["creation"]), kind: "email", by: who(e, "sender", "owner"), text: e["sent_or_received"] === "Received" ? "received an email" : "sent an email", detail: `${String(e["subject"] ?? "")} → ${String(e["recipients"] ?? "")}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  // change log (frappe version_timeline / "Changes"): one row per changed field of every Version, newest first
  const label = (f: unknown) => meta?.fields.find((x) => x.fieldname === f)?.label ?? String(f);
  const changes = versions.flatMap((v) => { const d = parse(v); const at = String(v["creation"]); const by = who(v, "owner", "modified_by");
    return [...(d.changed ?? []).map((c) => ({ at, by, field: label(c[0]), from: String(c[1] ?? "—"), to: String(c[2] ?? "—") })),
      ...(d.row_changed ?? []).flatMap((rc) => ((rc[3] as unknown[][] | undefined) ?? []).map((c) => ({ at, by, field: `${label(rc[0])} #${String(rc[1])} · ${String(c[0])}`, from: String(c[1] ?? "—"), to: String(c[2] ?? "—") }))),
      ...(d.added ?? []).map((a) => ({ at, by, field: label(a[0]), from: "—", to: "row added" })), ...(d.removed ?? []).map((a) => ({ at, by, field: label(a[0]), from: "row removed", to: "—" }))]; }).sort((a, b) => b.at.localeCompare(a.at));
  const when = (at: string) => <span className="text-xs text-muted-foreground" data-timeline-time={abs ? "absolute" : "relative"}>· <span data-no-i18n>{abs ? at.slice(0, 19).replace("T", " ") : relTime(at, lang)}</span></span>;
  return (
    <section className={only ? "max-w-3xl" : "mt-6 max-w-3xl"} data-timeline-only={only}>
      {!only && <div role="tablist" className="mb-2 flex gap-3 text-sm font-semibold" data-timeline-tabs>
        <button type="button" role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "text-primary" : "text-muted-foreground"} data-timeline-tab="activity" onClick={() => setTab("activity")}><span>Activity</span> <bdi className="tabular-nums" data-no-i18n data-timeline-count={items.length}>({items.length})</bdi></button>
        <button type="button" role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "text-primary" : "text-muted-foreground"} data-timeline-tab="changes" onClick={() => setTab("changes")}><span>Changes</span> <bdi className="tabular-nums" data-no-i18n data-changes-count={changes.length}>({changes.length})</bdi></button>
      </div>}
      {tab === "activity" ? <>
        <div className="flex gap-2">{onEmail && <button type="button" className="btn-ghost border border-border" data-timeline-email onClick={onEmail}>New Email</button>}<input className="field-input" placeholder="Add a comment" value={t} onChange={(e) => setT(e.target.value)} aria-label="Add a comment" /><button type="button" className="btn-ghost" disabled={!t} onClick={() => { logTimeline(doctype, name, "Comment", t); setT(""); }}>Comment</button></div>
        <ol className="mt-3 space-y-1.5 border-s border-border ps-4 text-sm" data-timeline>
          {items.map((i, k) => <li key={k} data-timeline-kind={i.kind}><b data-no-i18n>{i.by}</b> <span>{i.text}</span>{i.detail && <> <span data-no-i18n className="bidi-iso" dir="auto">{i.detail}</span></>} {when(i.at)}</li>)}
          {!items.length && <li className="text-muted-foreground">No activity yet</li>}
        </ol>
      </> : <div className="overflow-auto" data-changes>
        {changes.length ? <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="p-2 text-start">Field</th><th className="p-2 text-start">From</th><th className="p-2 text-start">To</th><th className="p-2 text-start">By</th><th className="p-2 text-start">When</th></tr></thead>
          <tbody>{changes.map((c, k) => <tr key={k} className="border-t border-border" data-change-row={c.field}><td className="p-2">{c.field}</td><td className="p-2" data-no-i18n>{c.from}</td><td className="p-2" data-no-i18n>{c.to}</td><td className="p-2 text-xs" data-no-i18n>{c.by}</td><td className="p-2">{when(c.at)}</td></tr>)}</tbody></table>
          : <p className="text-sm text-muted-foreground">No changes recorded yet</p>}
      </div>}
    </section>
  );
}

