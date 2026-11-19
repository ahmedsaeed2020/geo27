/**
 * Enterprise saved views (Construction phase 4 C4-09): save the current filter (step 1), then choose who sees it
 * (step 2: خاص / فريقي / الجميع / مخصص with one line each, roles or users for مخصص, and the n / 20 limit counter).
 * Hosts pass the DocType, the surface and the filter payload; storage and share rules live in lib/sharedViews.ts.
 */
import { translateTo } from "@/i18n";
import { useMemo, useState, type ReactNode } from "react";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { currentUser, useSessionUser } from "@/lib/session";
import { ownCount, saveView, SHARE_SCOPES, SHARE_TEXT, updateView, VIEW_LIMIT, type ShareScope, type SharedView, type ViewSurface } from "@/lib/sharedViews";
import { EntDialog } from "./Surfaces";

const tx = (ar: boolean, en: string, a: string) => (ar ? a : en);
const SCOPE_ICON: Record<ShareScope, string> = { private: "🔒", team: "👥", all: "🌐", custom: "⚙" };
export const shareLabel = (s: ShareScope, ar: boolean) => SHARE_TEXT[s].label[ar ? 1 : 0];
const userLabel = (u: string) => String(adapter.get("User", u)?.["full_name"] ?? "") || u;

function Picker({ ar, title, options, value, onChange, attr }: { ar: boolean; title: string; options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; attr: string }) {
  const [q, setQ] = useState("");
  const shown = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()) || o.key.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <fieldset className="rounded-lg border border-border p-2" data-share-picker={attr}>
      <legend className="px-1 text-xs font-semibold">{title} <span className="tabular-nums text-muted-foreground" data-no-i18n>({value.length})</span></legend>
      <input className="field-input mb-1 min-h-9 w-full py-1 text-xs" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tx(ar, "Search", "بحث")} aria-label={`${title}: ${tx(ar, "search", "بحث")}`} />
      <div className="max-h-36 overflow-y-auto">
        {shown.map((o) => <label key={o.key} className="flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" checked={value.includes(o.key)} onChange={(e) => onChange(e.target.checked ? [...value, o.key] : value.filter((x) => x !== o.key))} data-share-option={o.key} /><span data-no-i18n>{o.label}</span></label>)}
        {!shown.length && <p className="py-2 text-center text-xs text-muted-foreground">{tx(ar, "No match", "لا نتائج")}</p>}
      </div>
    </fieldset>
  );
}

export function SaveShareDialog({ open, onOpenChange, ar, doctype, surface, payload, summary, onSaved, editing }: {
  open: boolean; onOpenChange: (o: boolean) => void; ar: boolean; doctype: string; surface: ViewSurface; payload: Record<string, unknown>;
  /** the filter in words, shown in step 1 */ summary: ReactNode[]; onSaved: (v: SharedView) => void; /** change who sees an existing view (opens on step 2) */ editing?: SharedView | undefined;
}) {
  useStoreVersion(); const user = useSessionUser();
  const [step, setStep] = useState<1 | 2>(editing ? 2 : 1);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [share, setShare] = useState<ShareScope>(editing?.share ?? "private");
  const [roles, setRoles] = useState<string[]>(editing?.roles ?? []);
  const [users, setUsers] = useState<string[]>(editing?.users ?? []);
  const [errors, setErrors] = useState<string[]>([]);
  const used = ownCount(doctype, user);
  const roleOpts = useMemo(() => {
    const fromUsers = adapter.list("User").flatMap((u) => (Array.isArray(u["roles"]) ? (u["roles"] as Record<string, unknown>[]).map((r) => String(r["role"] ?? "")) : []));
    return [...new Set([...adapter.list("Role").filter((r) => !Number(r["disabled"] ?? 0)).map((r) => r.name), ...fromUsers])].filter((r) => r && !["All", "Guest", "Administrator"].includes(r)).sort().map((r) => ({ key: r, label: translateTo(r, ar ? "ar" : "en") }));
  }, [open, ar]); // eslint-disable-line react-hooks/exhaustive-deps
  const userOpts = useMemo(() => adapter.list("User").filter((u) => !["Guest", user].includes(u.name) && Number(u["enabled"] ?? 1) !== 0).map((u) => ({ key: u.name, label: `${userLabel(u.name)}${userLabel(u.name) !== u.name ? ` · ${u.name}` : ""}` })).sort((a, b) => a.label.localeCompare(b.label)), [open, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { onOpenChange(false); setStep(editing ? 2 : 1); setErrors([]); };
  const confirm = () => {
    const r = editing ? updateView(editing.id, { share, roles, users }, user) : saveView({ doctype, surface, title, payload, share, roles, users }, user);
    if (r.errors.length || !r.view) { setErrors(r.errors); return; }
    setErrors([]); onSaved(r.view); onOpenChange(false); setStep(1); setTitle(""); setShare("private"); setRoles([]); setUsers([]);
  };
  const full = !editing && used >= VIEW_LIMIT;
  return (
    <EntDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} id="save-share-view" size="md"
      title={editing ? tx(ar, "Who sees this view", "من يرى هذا العرض") : tx(ar, "Save and share the view", "حفظ العرض ومشاركته")}
      kicker={<span data-share-step={step}>{tx(ar, `Step ${step} of 2`, `الخطوة ${step} من 2`)} · {step === 1 ? tx(ar, "Save the filter", "حفظ الفلتر") : tx(ar, "Share", "المشاركة")}</span>}
      footer={<div className="flex w-full flex-wrap items-center gap-2">
        <span className={`text-xs tabular-nums ${full ? "text-destructive" : "text-muted-foreground"}`} data-share-limit={`${used}/${VIEW_LIMIT}`}>{tx(ar, `${used} of ${VIEW_LIMIT} saved views for this list`, `${used} من ${VIEW_LIMIT} عرضًا محفوظًا لهذه القائمة`)}</span>
        <span className="ms-auto" />
        {step === 2 && !editing && <button type="button" className="btn-ghost min-h-11 text-xs sm:min-h-9" onClick={() => setStep(1)} data-share-back>{tx(ar, "Back", "رجوع")}</button>}
        {step === 1 ? <button type="button" className="btn-primary min-h-11 text-xs sm:min-h-9" disabled={!title.trim() || full} onClick={() => { setErrors([]); setStep(2); }} data-share-next>{tx(ar, "Next: share", "التالي: المشاركة")}</button>
          : <button type="button" className="btn-primary min-h-11 text-xs sm:min-h-9" onClick={confirm} data-share-save>{editing ? tx(ar, "Save sharing", "حفظ المشاركة") : tx(ar, "Save view", "حفظ العرض")}</button>}
      </div>}>
      {step === 1 ? (
        <div className="space-y-3" data-share-step-body="1">
          <label className="block text-xs font-semibold">{tx(ar, "View name", "اسم العرض")}
            <input className="field-input mt-1 min-h-11 w-full text-sm sm:min-h-9" value={title} maxLength={60} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && title.trim() && !full) setStep(2); }} data-share-name /></label>
          <div><p className="mb-1 text-xs font-semibold">{tx(ar, "Filter saved with it", "الفلتر المحفوظ معه")}</p>
            {summary.length ? <ul className="flex flex-wrap gap-1.5" data-share-summary>{summary.map((s, i) => <li key={i} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">{s}</li>)}</ul>
              : <p className="text-xs text-muted-foreground">{tx(ar, "No filter — the view shows the whole list.", "بلا فلتر — يعرض العرض القائمة كاملة.")}</p>}</div>
          {full && <p className="text-xs text-destructive" role="alert">{tx(ar, `You already have ${VIEW_LIMIT} saved views for this list; delete one first.`, `لديك ${VIEW_LIMIT} عرضًا محفوظًا لهذه القائمة؛ احذف واحدًا أولًا.`)}</p>}
        </div>
      ) : (
        <div className="space-y-2" data-share-step-body="2">
          <div role="radiogroup" aria-label={tx(ar, "Who sees it", "من يراه")} className="grid gap-2 sm:grid-cols-2">
            {SHARE_SCOPES.map((s) => <button key={s} type="button" role="radio" aria-checked={share === s} onClick={() => setShare(s)} data-share-scope={s}
              className={`rounded-lg border p-2.5 text-start ${share === s ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
              <span className="flex items-center gap-1.5 text-sm font-semibold"><span aria-hidden>{SCOPE_ICON[s]}</span>{shareLabel(s, ar)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground" data-share-hint={s}>{SHARE_TEXT[s].hint()[ar ? 1 : 0]}</span></button>)}
          </div>
          {share === "custom" && <div className="grid gap-2 sm:grid-cols-2">
            <Picker ar={ar} title={tx(ar, "Roles", "الأدوار")} options={roleOpts} value={roles} onChange={setRoles} attr="roles" />
            <Picker ar={ar} title={tx(ar, "Users", "المستخدمون")} options={userOpts} value={users} onChange={setUsers} attr="users" />
          </div>}
          <p className="text-xs text-muted-foreground">{tx(ar, "Sharing shares the filter only: each person still sees just the documents their own permissions allow.", "المشاركة تشارك الفلتر فقط: يرى كل شخص المستندات التي تسمح بها صلاحياته فقط.")}</p>
          {errors.length > 0 && <ul className="rounded-md bg-destructive/10 p-2 text-xs text-destructive" role="alert" data-share-errors>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
      )}
    </EntDialog>
  );
}

/** A saved view chip: apply it; the owner can change who sees it or delete it; shared views name their owner. */
export function ViewChip({ v, ar, active, onApply, onShare, onDelete }: { v: SharedView; ar: boolean; active: boolean; onApply: () => void; onShare: () => void; onDelete: () => void }) {
  const mine = v.owner === currentUser();
  return (
    <span className={`inline-flex items-center rounded-full border text-xs ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`} data-shared-view={v.id} data-share={v.share}>
      <button type="button" className="inline-flex min-h-11 items-center gap-1 px-3 sm:min-h-9" onClick={onApply} aria-pressed={active} title={`${shareLabel(v.share, ar)}${mine ? "" : ` · ${userLabel(v.owner)}`}`}>
        <span aria-hidden>{SCOPE_ICON[v.share]}</span><bdi data-no-i18n>{v.title}</bdi>{!mine && <span className="text-[10px] text-muted-foreground" data-no-i18n>· {userLabel(v.owner)}</span>}</button>
      {mine && <button type="button" className="min-h-11 px-1.5 text-muted-foreground hover:text-foreground sm:min-h-9" onClick={onShare} aria-label={tx(ar, `Who sees ${v.title}`, `من يرى ${v.title}`)} data-shared-view-share={v.id}>⇪</button>}
      {mine && <button type="button" className="min-h-11 px-2 text-muted-foreground hover:text-destructive sm:min-h-9" onClick={onDelete} aria-label={tx(ar, `Delete ${v.title}`, `حذف ${v.title}`)} data-shared-view-delete={v.id}>✕</button>}
    </span>
  );
}
