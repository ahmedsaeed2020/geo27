import { getSettings as useSettingsSnapshot } from "@/lib/userSettings";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { indexQuery } from "@/lib/catalog";
import { gsAll } from "@/lib/globalSearchConfig";
import { adapter, useStoreVersion } from "@/lib/adapter";
import { setLang, useLang } from "@/i18n";
import { ADMIN, useSessionUser } from "@/lib/session";
import { canReadType, scopedGet, scopedList, useScopeMetas } from "@/lib/scope";
import { activeAppName } from "@/plugins/appShell";
import {
  readSessionDefaults, resolveDefaultCompany, resolveUserDefault, sessionDefaultFields, setSessionDefaults, useSessionDefaultsVersion,
  type DefaultSource, type SessionDefaultField,
} from "@/lib/sessionDefaults";
import {
  applySettings, DOCK_APPS, onShellDialog, openShellDialog, resetSettings, setDock, setSettings, useDock, useSettings,
  type ShellDialog, type UserSettings,
} from "@/lib/userSettings";

const SECTIONS = ["Profile", "Email", "Appearance", "Preferences", "Lists", "Forms", "Reports", "Session Defaults", "Keyboard Shortcuts"] as const;
type Section = (typeof SECTIONS)[number];

export const SHORTCUTS: [string, string][] = [
  ["Ctrl+K", "Open Awesomebar"],
  ["Ctrl+G", "Open Global Search"],
  ["Shift+/", "Show keyboard shortcuts"],
  ["Ctrl+Shift+R", "Clear cache and reload"],
  ["Ctrl+Shift+J", "Open console"],
  ["Ctrl+B", "Toggle sidebar"],
  ["Ctrl+Shift+L", "Switch theme"],
  ["Ctrl+.", "Open the app dock"],
  ["Ctrl+P", "Print document"],
];

/** Mounted once in __root: shell dialogs + global keyboard shortcuts (spec §0, §2, §6). */
export function UserSettingsHost() {
  const [open, setOpen] = useState<ShellDialog | null>(null);
  const [section, setSection] = useState<Section>("Profile");
  useEffect(() => { applySettings(); }, []);
  useEffect(() => onShellDialog((d, s) => { if (s) setSection(s as Section); setOpen(d); }), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if (mod && k === "g") { e.preventDefault(); setOpen("global-search"); }
      else if (mod && k === "k") { e.preventDefault(); document.querySelector<HTMLInputElement>("[data-awesomebar]")?.focus(); }
      else if (mod && k === "b") { e.preventDefault(); const s = useSettingsSnapshot(); setSettings({ module_sidebar: !s.module_sidebar }); }
      else if (mod && e.shiftKey && k === "l") { e.preventDefault(); const s = useSettingsSnapshot(); setSettings({ theme: s.theme === "Dark" ? "Light" : "Dark" }); toast("Theme Changed"); }
      else if (mod && e.shiftKey && k === "r") { e.preventDefault(); location.reload(); }
      else if (mod && k === ".") { e.preventDefault(); setOpen("dock"); }
      else if (!mod && !typing && e.key === "?") { setOpen("shortcuts"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <>
      <Dialog open={open === "settings"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl p-0" data-user-settings>
          <SettingsBody section={section} setSection={setSection} onClose={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={open === "global-search"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-4xl" data-global-search>
          <DialogTitle>Global Search</DialogTitle>
          <GlobalSearchTable onDone={() => setOpen(null)} />
        </DialogContent>
      </Dialog>
      <Dialog open={open === "shortcuts"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg"><DialogTitle>Keyboard Shortcuts</DialogTitle><ShortcutTable /></DialogContent>
      </Dialog>
      <Dialog open={open === "dock"} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md"><DialogTitle>Manage Dock</DialogTitle><ManageDock /></DialogContent>
      </Dialog>
    </>
  );
}

/** Session Defaults fields configured in Session Default Settings (or the ERPNext install default, Company). */
function useSessionDefaultFields(): SessionDefaultField[] {
  const idx = useQuery(indexQuery);
  useStoreVersion();
  const known = useMemo(() => new Set((idx.data ?? []).map((e) => e.name)), [idx.data]);
  return sessionDefaultFields((dt) => !idx.data || known.has(dt));
}

function SettingsBody({ section, setSection, onClose }: { section: Section; setSection: (s: Section) => void; onClose: () => void }) {
  const live = useSettings();
  const user = useSessionUser();
  const [draft, setDraft] = useState<Partial<UserSettings>>({});
  const [sdPending, setSdPending] = useState<Record<string, string>>({});
  const sdFields = useSessionDefaultFields();
  useScopeMetas([...sdFields.map((f) => f.ref_doctype), "Session Default Settings"]);
  // a different simulated user has different preferences: pending edits never carry over
  useEffect(() => { setDraft({}); setSdPending({}); }, [user]);
  const s = { ...live, ...draft };
  /** Toggles apply instantly (spec: "Every toggle must change the UI immediately"); text fields wait for Save. */
  const instant = (p: Partial<UserSettings>, msg = "Saved") => { setSettings(p); toast(msg); };
  const pending = Object.keys(draft).length + Object.keys(sdPending).length;
  const save = () => {
    if (Object.keys(sdPending).length) {
      const errs = setSessionDefaults(sdPending, (dt, n) => !!scopedGet(dt, n), sdFields);
      if (errs.length) { toast.error(errs.join("\n")); return; }
      setSdPending({});
    }
    setSettings(draft); setDraft({}); toast("Saved");
  };
  return (
    <div className="flex h-[620px] max-h-[85vh] w-full min-w-0 flex-col sm:flex-row">
      <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-muted/40 p-2 text-sm sm:w-52 sm:flex-col sm:space-y-0.5 sm:overflow-visible sm:border-b-0 sm:border-e sm:p-3 max-sm:ltr:me-10 max-sm:rtl:ms-10" aria-label="Settings">
        <DialogTitle className="mb-3 hidden px-2 text-base sm:block rtl:ps-8">Settings</DialogTitle>
        {SECTIONS.map((x) => (
          <button key={x} type="button" data-section={x} aria-current={section === x ? "page" : undefined} onClick={() => setSection(x)}
            className={`block shrink-0 whitespace-nowrap rounded px-2 py-1.5 text-start sm:w-full ${section === x ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:bg-card"}`}>{x}</button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 ltr:pe-8">
          <h2 className="me-auto text-lg font-semibold">{section}</h2>
          {pending > 0 && <span className="chip bg-accent text-accent-foreground" data-unsaved-settings={pending}>Not Saved</span>}
          <button type="button" className="btn-primary" data-settings-save onClick={save}>Save</button>
        </div>
        <p className="-mt-3 mb-4 text-[11px] text-muted-foreground" data-settings-scope={user}><span>Saved for</span> <bdi data-no-i18n>{user === ADMIN ? ADMIN : user}</bdi> <span>in this browser (virtual preview, not stored on a DIGIT server).</span></p>
        {section === "Profile" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-semibold">{(s.first_name || "A")[0]}</div>
              <div><div className="font-medium" data-no-i18n>{[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ")}</div><div className="text-xs text-muted-foreground" data-no-i18n>{s.email}</div></div>
              <button type="button" className="btn-ghost ms-auto" onClick={() => toast("Change Password (simulated)")}>Change Password</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["first_name", "middle_name", "last_name", "username"] as const).map((k) => (
                <Field key={k} label={{ first_name: "First Name", middle_name: "Middle Name", last_name: "Last Name", username: "Username" }[k]}>
                  <input className="field-input" value={s[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                </Field>
              ))}
            </div>
          </div>
        )}
        {section === "Email" && (
          <div className="space-y-3">
            <Toggle label="Send notifications for email threads" v={s.thread_notify} on={(v) => instant({ thread_notify: v })} />
            <Toggle label="Send me a copy of outgoing emails" v={s.send_me_a_copy} on={(v) => instant({ send_me_a_copy: v })} />
            <Toggle label="Request read receipts" v={s.read_receipts} on={(v) => instant({ read_receipts: v })} />
            <Field label="Email Signature">
              <div contentEditable suppressContentEditableWarning className="field-input min-h-28" data-no-i18n
                onBlur={(e) => setDraft({ ...draft, email_signature: e.currentTarget.innerHTML })} dangerouslySetInnerHTML={{ __html: live.email_signature }} />
            </Field>
          </div>
        )}
        {section === "Appearance" && (
          <div className="space-y-6">
            <Group title="Theme">
              <div className="grid grid-cols-3 gap-3">
                {(["Automatic", "Light", "Dark"] as const).map((t) => (
                  <label key={t} className={`cursor-pointer rounded-lg border p-2 ${s.theme === t ? "border-primary ring-2 ring-ring" : "border-border"}`}>
                    <ThemeThumb t={t} />
                    <div className="mt-2 flex items-center gap-2 text-sm"><input type="radio" name="theme" checked={s.theme === t} onChange={() => instant({ theme: t }, "Theme Changed")} />{t}</div>
                  </label>
                ))}
              </div>
            </Group>
            <Group title="Layout"><Radios name="layout" opts={["Compact", "Full Width"]} v={s.layout} on={(v) => instant({ layout: v as UserSettings["layout"] })} /><p className="mt-1 text-xs text-muted-foreground">Full Width uses the whole page width; Compact keeps a narrower centred page.</p></Group>
            <Group title="Dock"><Radios name="dock" opts={["Pinned", "Floating"]} v={s.dock} on={(v) => instant({ dock: v as UserSettings["dock"] })} /></Group>
          </div>
        )}
        {section === "Preferences" && <PreferencesSection s={s} instant={instant} />}
        {section === "Lists" && (
          <div className="space-y-3">
            <Toggle label="Show sidebar" v={s.list_sidebar} on={(v) => instant({ list_sidebar: v })} />
            <Toggle label="Allow bulk actions" v={s.bulk_actions} on={(v) => instant({ bulk_actions: v })} />
            <Toggle label="Show view switcher" v={s.view_switcher} on={(v) => instant({ view_switcher: v })} />
          </div>
        )}
        {section === "Forms" && (
          <div className="space-y-3">
            <Toggle label="Show sidebar" v={s.form_sidebar} on={(v) => instant({ form_sidebar: v })} />
            <Toggle label="Show timeline" v={s.form_timeline} on={(v) => instant({ form_timeline: v })} />
            <Toggle label="Show dashboard" v={s.form_dashboard} on={(v) => instant({ form_dashboard: v })} />
            <Toggle label="Show absolute datetime in timeline" v={s.absolute_datetime} on={(v) => instant({ absolute_datetime: v })} />
            <Toggle label="Show navigation buttons" v={s.form_nav_buttons} on={(v) => instant({ form_nav_buttons: v })} />
          </div>
        )}
        {section === "Reports" && (
          <Toggle label="Split view" hint="Open a linked document in a side panel instead of navigating away" v={s.report_split_view} on={(v) => instant({ report_split_view: v })} />
        )}
        {section === "Session Defaults" && <SessionDefaults fields={sdFields} pending={sdPending} setPending={setSdPending} onConfigure={onClose} />}
        {section === "Keyboard Shortcuts" && <ShortcutTable />}
      </div>
    </div>
  );
}

function PreferencesSection({ s, instant }: { s: UserSettings; instant: (p: Partial<UserSettings>, m?: string) => void }) {
  const lang = useLang();
  const zones = ["Asia/Riyadh", "Asia/Dubai", "Africa/Cairo", "Europe/London", "UTC"];
  return (
    <div className="space-y-3">
      <Toggle label="Allow notifications" v={s.allow_notifications} on={(v) => instant({ allow_notifications: v })} />
      <Toggle label="Show search bar" v={s.show_search_bar} on={(v) => instant({ show_search_bar: v })} />
      <Toggle label="Show My Space" v={s.show_my_space} on={(v) => instant({ show_my_space: v })} />
      <Toggle label="Mute sounds" v={s.mute_sounds} on={(v) => instant({ mute_sounds: v })} />
      <Group title="Locale">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Language">
            <div className="flex gap-2"><span className="field-input" data-no-i18n>{lang === "ar" ? "العربية" : "English"}</span>
              <button type="button" className="btn-ghost shrink-0" onClick={() => setLang(lang === "ar" ? "en" : "ar")}>Change Language</button></div>
          </Field>
          <Field label="Calendar">
            <select className="field-input" value={s.calendar} onChange={(e) => instant({ calendar: e.target.value as "Gregorian" | "Hijri" | "Both" })} data-calendar-select>
              {(["Gregorian", "Hijri", "Both"] as const).map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Field>
          <Field label="Time Zone">
            <div className="flex gap-2">
              <select className="field-input" data-no-i18n value={s.time_zone} onChange={(e) => instant({ time_zone: e.target.value })}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
              <button type="button" className="btn-ghost shrink-0" onClick={() => toast("Saved")}>Change Time Zone</button>
            </div>
          </Field>
        </div>
      </Group>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button type="button" className="btn-ghost" data-reset-preferences onClick={() => { resetSettings(); toast("Preferences reset"); }}>Reset preferences</button>
        <span className="text-xs text-muted-foreground">Restores the system defaults for this user only.</span>
      </div>
    </div>
  );
}

const SOURCE_LABEL: Record<DefaultSource, string> = { session: "Session default", global: "Global Defaults", "user-permission": "User Permission default", fallback: "Preview fallback", none: "Not set" };

/**
 * Settings › Session Defaults (frappe user_settings_dialog.js session defaults panel + session_default_settings.py):
 * one Link select per configured row, readable records only; pending choices show until Save; Configure opens the
 * Session Default Settings form for users who may read it.
 */
function SessionDefaults({ fields, pending, setPending, onConfigure }: { fields: SessionDefaultField[]; pending: Record<string, string>; setPending: (p: Record<string, string>) => void; onConfigure: () => void }) {
  const user = useSessionUser(); useSessionDefaultsVersion(); useStoreVersion();
  const idx = useQuery(indexQuery);
  const nav = useNavigate();
  useScopeMetas([...fields.map((f) => f.ref_doctype), "Session Default Settings"]);
  const stored = readSessionDefaults(user);
  const cfg = idx.data?.find((e) => e.name === "Session Default Settings");
  const canConfigure = !!cfg && canReadType("Session Default Settings");
  return (
    <div className="space-y-4" data-session-defaults>
      {!fields.length && <p className="text-sm text-muted-foreground" data-no-session-defaults>No session defaults configured.</p>}
      {fields.map((f) => {
        const opts = scopedList(f.ref_doctype).map((d) => d.name);
        const value = f.fieldname in pending ? pending[f.fieldname]! : stored[f.fieldname] ?? "";
        // Company also shows the preview fallback the reports use when no default is set (resolveDefaultCompany)
        const eff = f.ref_doctype === "Company" ? resolveDefaultCompany(user) : resolveUserDefault(f.fieldname, user);
        return (
          <Field key={f.fieldname} label={f.label}>
            <select className="field-input" data-no-i18n data-session-default={f.fieldname} value={value} onChange={(e) => setPending({ ...pending, [f.fieldname]: e.target.value })}>
              <option value="">—</option>
              {[...new Set([...(value && !opts.includes(value) ? [value] : []), ...opts])].map((c) => <option key={c} value={c} disabled={!opts.includes(c)}>{c}</option>)}
            </select>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground" data-session-default-effective={eff.value ?? ""} data-session-default-source={eff.source}>
              {f.fieldname in pending && pending[f.fieldname] !== (stored[f.fieldname] ?? "") && <span className="chip bg-accent text-accent-foreground" data-session-default-pending>Not Saved</span>}
              <span>In use</span>: <bdi data-no-i18n>{eff.value ?? "—"}</bdi> <span>({SOURCE_LABEL[eff.source]})</span>
            </span>
          </Field>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button type="button" className="btn-ghost" data-session-defaults-configure disabled={!canConfigure}
          onClick={() => { if (!cfg) return; onConfigure(); const app = activeAppName(); nav({ to: "/app/$app/$doctype/$name", params: { app: cfg.app, doctype: cfg.slug, name: cfg.name }, search: (app ? { app } : {}) as never }); }}>Configure</button>
        <span className="text-xs text-muted-foreground">{canConfigure ? "Choose which document types appear here (Session Default Settings)." : "Only users who can open Session Default Settings (System Manager) can change which defaults appear here."}</span>
      </div>
    </div>
  );
}

function ShortcutTable() {
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="text-start text-xs text-muted-foreground"><tr><th className="py-1 text-start">Shortcut</th><th className="py-1 text-start">Action</th></tr></thead>
        <tbody>{SHORTCUTS.map(([k, a]) => <tr key={k} className="border-t border-border"><td className="py-1.5"><kbd className="chip bg-muted font-mono" data-no-i18n>{k}</kbd></td><td>{a}</td></tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-muted-foreground">Press Alt key to trigger additional shortcuts in Menu and Sidebar</p>
    </div>
  );
}

function ManageDock() {
  const dock = useDock();
  return (
    <div className="space-y-2">
      {DOCK_APPS.map((a) => (
        <label key={a.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dock.includes(a.id)} onChange={(e) => { setDock(e.target.checked ? [...dock, a.id] : dock.filter((x) => x !== a.id)); toast("Saved"); }} />{a.label}
        </label>
      ))}
    </div>
  );
}

/** Ctrl/Cmd+G — tabular global search over every DocType's records (spec §2 Global Search). */
function GlobalSearchTable({ onDone }: { onDone: () => void }) {
  const idx = useQuery(indexQuery);
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!idx.data || q.trim().length < 2) return [];
    const s = q.toLowerCase(), out: { doctype: string; app: string; slug: string; name: string; title: string; modified: string }[] = [];
    const gs = gsAll(); const pr = (n: string) => { const i = gs.priority.indexOf(n); return i < 0 ? 1e6 : i; };
    for (const d of [...idx.data].sort((a, b) => pr(a.name) - pr(b.name))) {
      if (d.istable || d.issingle || gs.doctypes[d.name]?.include === false) continue;
      const fs = gs.doctypes[d.name]?.fields ?? [];
      for (const r of adapter.list(d.name)) {
        if (fs.length && !fs.some((f) => String(r[f] ?? "").toLowerCase().includes(s))) { if (!r.name.toLowerCase().includes(s)) continue; }
        const title = String(r["title"] ?? r["customer_name"] ?? r["supplier_name"] ?? r["item_name"] ?? r["employee_name"] ?? r["subject"] ?? r["project_name"] ?? "");
        if (fs.length || (r.name + " " + title).toLowerCase().includes(s)) out.push({ doctype: d.name, app: d.app, slug: d.slug, name: r.name, title, modified: String(r["modified"] ?? "") });
        if (out.length >= 100) return out;
      }
    }
    return out;
  }, [q, idx.data]);
  return (
    <div>
      <input autoFocus className="field-input" placeholder="Search across all documents" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 max-h-[55vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="px-2 py-1 text-start">Document Type</th><th className="px-2 py-1 text-start">ID</th><th className="px-2 py-1 text-start">Title</th><th className="px-2 py-1 text-start">Last Modified</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.doctype + r.name} className="cursor-pointer border-t border-border hover:bg-muted/60" onClick={() => { onDone(); nav({ to: "/app/$app/$doctype/$name", params: { app: r.app, doctype: r.slug, name: r.name } }); }}>
                <td className="px-2 py-1.5">{r.doctype}</td><td className="px-2 py-1.5 text-primary" data-no-i18n>{r.name}</td><td className="px-2 py-1.5" data-no-i18n>{r.title}</td><td className="px-2 py-1.5 text-xs text-muted-foreground" data-no-i18n>{r.modified.slice(0, 16)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {q.trim().length >= 2 && rows.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No results found</p>}
      </div>
      <button type="button" className="btn-ghost mt-3" onClick={() => { toast("Global search updated"); }}>Manage priority</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3>{children}</div>;
}
function Toggle({ label, hint, v, on }: { label: string; hint?: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-md border border-border p-3 text-sm">
      <span><span className="block font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={v} aria-label={label} onClick={() => on(!v)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${v ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all ${v ? "start-[18px]" : "start-0.5"}`} />
      </button>
    </label>
  );
}
function Radios({ name, opts, v, on }: { name: string; opts: string[]; v: string; on: (v: string) => void }) {
  return <div className="flex gap-4 text-sm">{opts.map((o) => <label key={o} className="flex items-center gap-2"><input type="radio" name={name} checked={v === o} onChange={() => on(o)} />{o}</label>)}</div>;
}
function ThemeThumb({ t }: { t: string }) {
  const half = (dark: boolean) => (
    <div className={`flex h-full flex-1 gap-1 p-1.5 ${dark ? "bg-foreground" : "bg-card"}`}>
      <div className={`w-3 rounded-sm ${dark ? "bg-muted-foreground" : "bg-muted"}`} />
      <div className="flex-1 space-y-1"><div className={`h-1.5 rounded ${dark ? "bg-muted-foreground" : "bg-muted"}`} /><div className={`h-1.5 w-2/3 rounded ${dark ? "bg-muted-foreground" : "bg-muted"}`} /></div>
    </div>
  );
  return <div className="flex h-16 overflow-hidden rounded border border-border">{t === "Automatic" ? <>{half(false)}{half(true)}</> : half(t === "Dark")}</div>;
}

export { openShellDialog };
