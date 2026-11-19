import { EntGlyph, type DigitIconName } from "@/components/enterprise/DigitIcon";
import { useState } from "react";
import { adapter, type Doc } from "@/lib/adapter";
import type { DocTypeMeta } from "@/lib/catalog";
import { useLang } from "@/i18n";
import { relTime } from "@/lib/relTime";
import { addAssignment, addTags, removeAssignment, removeTag } from "@/lib/assignment";
import { toggleFollow, toggleLike } from "@/lib/docActivity";
import { currentUser, useSessionUser } from "@/lib/session";

/**
 * Form sidebar (frappe/public/js/frappe/form/sidebar/form_sidebar.js): image, Assigned To, Attachments, Tags,
 * Share, Follow, Like and Created/Modified by. Every action writes adapter records (doc._assign/_user_tags/
 * _liked_by, File, DocShare, Comment) so list sidebars and the timeline read the same data.
 */
const arr = (v: unknown): string[] => { try { const a = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
const USERS = ["Administrator", "sales@example.test", "accounts@example.test", "hr@example.test"];


/** DIGIT Enterprise glyphs for the sidebar sections (Standard Desk shows none). */
const SIDE_ICON: Record<string, DigitIconName> = { "Assigned To": "ui-user", Attachments: "ui-upload", Tags: "ui-filter", Share: "ui-share" };
export function logTimeline(doctype: string, name: string, comment_type: string, content: string) {
  adapter.insertDoc("Comment", { comment_type, reference_doctype: doctype, reference_name: name, content, comment_email: currentUser(), creation: new Date().toISOString() });
}

export function FormSidebar({ meta, doc }: { meta: DocTypeMeta; doc: Doc }) {
  const lang = useLang();
  const me = useSessionUser();
  const [adding, setAdding] = useState<null | "assign" | "tag" | "share">(null);
  const [val, setVal] = useState("");
  const dt = meta.name, name = doc.name;
  const assign = arr(doc["_assign"]);
  const tags = String(doc["_user_tags"] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const liked = arr(doc["_liked_by"]);
  const followers = arr(doc["_followers"]);
  const files = adapter.list("File").filter((f) => f["attached_to_doctype"] === dt && f["attached_to_name"] === name);
  const shares = adapter.list("DocShare").filter((s) => s["share_doctype"] === dt && s["share_name"] === name);
  const imgField = (meta as { image_field?: string }).image_field;
  const img = imgField ? String(doc[imgField] ?? "") : "";
  const commit = () => {
    const v = val.trim(); if (!v) return;
    // shared with the list bulk actions (src/lib/assignment.ts): ToDo + _assign + timeline, Tag master + _user_tags
    if (adding === "assign" && !assign.includes(v)) addAssignment(dt, name, [v], { hasAssignedToField: meta.fields.some((f) => f.fieldname === "assigned_to") });
    if (adding === "tag" && !tags.includes(v)) addTags(dt, [name], [v]);
    if (adding === "share") { adapter.insertDoc("DocShare", { share_doctype: dt, share_name: name, user: v, read: 1 }); logTimeline(dt, name, "Shared", v); }
    setVal(""); setAdding(null);
  };
  const head = (label: string, k: "assign" | "tag" | "share" | null, onPlus?: () => void) => (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{SIDE_ICON[label] && <EntGlyph name={SIDE_ICON[label]!} size={14} />}<span>{label}</span>
      <button type="button" className="ms-auto rounded px-1.5 hover:bg-muted" aria-label={`Add ${label}`} data-sidebar-add={label} onClick={onPlus ?? (() => { setAdding(adding === k ? null : k); setVal(""); })}><EntGlyph name="ui-add" size={14} fallback="+" /></button>
    </div>
  );
  const input = (k: "assign" | "tag" | "share", list?: string[]) => adding === k && (
    <div className="mt-1 flex gap-1">
      <input autoFocus list={list ? `sb-${k}` : undefined} data-no-i18n className="field-input py-1 text-xs" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commit()} aria-label={k} />
      {list && <datalist id={`sb-${k}`}>{list.map((u) => <option key={u} value={u} />)}</datalist>}
      <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={commit}>✓</button>
    </div>
  );
  const fmt = (iso: unknown) => (iso ? relTime(String(iso), lang) : "");
  return (
    <aside data-form-sidebar className="space-y-4 text-sm">
      {imgField && (
        <div data-sidebar-image className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted text-3xl font-semibold text-muted-foreground">
          {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <span data-no-i18n>{String(doc[meta.title_field ?? "name"] ?? name).slice(0, 1)}</span>}
        </div>
      )}
      <section data-sidebar="assigned">{head("Assigned To", "assign")}{input("assign", USERS)}
        <ul className="mt-1 space-y-0.5">{assign.map((u) => <li key={u} className="flex items-center gap-1 text-xs"><span data-no-i18n className="truncate">{u}</span><button type="button" className="ms-auto text-muted-foreground" aria-label="Remove" onClick={() => removeAssignment(dt, name, u)}>×</button></li>)}</ul>
      </section>
      <section data-sidebar="attachments">{head("Attachments", null, () => document.getElementById("sb-file")?.click())}
        <input id="sb-file" type="file" className="hidden" aria-label="Add attachment" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; adapter.insertDoc("File", { file_name: f.name, file_url: `/files/${f.name}`, file_size: f.size, attached_to_doctype: dt, attached_to_name: name, is_private: 1 }); logTimeline(dt, name, "Attachment", f.name); e.target.value = ""; }} />
        <ul className="mt-1 space-y-0.5">{files.map((f) => <li key={f.name} className="truncate text-xs" data-no-i18n title={String(f["file_url"])}>📎 {String(f["file_name"])}</li>)}</ul>
      </section>
      <section data-sidebar="tags">{head("Tags", "tag")}{input("tag")}
        <div className="mt-1 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="chip bg-muted" data-no-i18n>{t}<button type="button" className="ms-1" aria-label="Remove" onClick={() => removeTag(dt, name, t)}>×</button></span>)}</div>
      </section>
      <section data-sidebar="share">{head("Share", "share")}{input("share", USERS)}
        <ul className="mt-1 space-y-0.5">{shares.map((s) => <li key={s.name} className="truncate text-xs" data-no-i18n>{String(s["user"])}</li>)}</ul>
      </section>
      <section className="flex items-center gap-3 border-t border-border pt-3 text-xs">
        <button type="button" data-sidebar="follow" className="btn-ghost px-2 py-0.5" aria-pressed={followers.includes(me)} onClick={() => toggleFollow(dt, name, me)}>{followers.includes(me) ? "Unfollow" : "Follow"}</button>
        <button type="button" data-sidebar="like" aria-pressed={liked.includes(me)} className="flex items-center gap-1" onClick={() => toggleLike(dt, name, me)}>
          <span className={liked.includes(me) ? "text-destructive" : "text-muted-foreground"}>♥</span><span data-no-i18n>{liked.length}</span>
        </button>
      </section>
      <section className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground" data-sidebar="created">
        <p><span data-no-i18n>{String(doc["owner"] ?? "Administrator")}</span> · <span>Created by</span> · <span data-no-i18n>{fmt(doc["creation"])}</span></p>
        <p><span data-no-i18n>{String(doc["modified_by"] ?? doc["owner"] ?? "Administrator")}</span> · <span>Modified by</span> · <span data-no-i18n>{fmt(doc["modified"] ?? doc["creation"])}</span></p>
      </section>
    </aside>
  );
}
