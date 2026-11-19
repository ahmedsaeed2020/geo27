/**
 * 360 access pieces (owner notes A-06), shared by every app: the «360» button for a record (list rows, document headers),
 * the header entry «ملفات 360» that opens a picker in the shared side panel (kind tabs → search → record → its 360 page,
 * two clicks), and the hook the global search uses. Records are read through the scoped readers, so nobody sees a profile
 * of a record they may not read; addresses come from src/lib/coreShared/profile360.ts.
 */
import { useMemo, useState } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useLang } from "@/i18n";
import { canReadType, scopedGet, scopedList } from "@/lib/scope";
import { useSessionUser } from "@/lib/session";
import { useStoreVersion } from "@/lib/adapter";
import { enabledPlugins, usePluginsVersion } from "@/plugins/runtime";
import { useActiveApp } from "@/plugins/appShell";
import { masterName } from "@/lib/coreShared/masterName";
import { profileKinds, profileOf, type Profile360 } from "@/lib/coreShared/profile360";
import { closeQuickView, openQuickView } from "./QuickView";
import { publicHref } from "@/lib/appUrls";

/** Enabled apps + the active app, read reactively. */
export function useProfileContext(): { app: string | undefined; enabled: Set<string> } {
  usePluginsVersion(); const app = useActiveApp();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => (r.location.search as Record<string, unknown>)["app"] });
  return { app: appOfPath(path, typeof search === "string" ? search : undefined) ?? app?.name, enabled: new Set(enabledPlugins().map((p) => p.name)) };
}
/** The app whose frame shows a page: its own address prefix, else the `?app=` context of a Core page opened inside it. */
export function appOfPath(path: string, appParam?: string): string | undefined {
  if (/^\/pro(\/|$)/.test(path)) return "digit_pro";
  if (/^\/(construction|plugins\/digit_construction)(\/|$)/.test(path)) return "digit_construction";
  if (/^\/(digit-hr|hr)(\/|$)/.test(path)) return "digit_hr";
  if (/^\/digit-crm(\/|$)/.test(path)) return "digit_crm";
  if (/^\/(fsm|plugins\/digit_fsm)(\/|$)/.test(path)) return "digit_fsm";
  const a = appParam === "pro" ? "digit_pro" : appParam === "hr" ? "digit_hr" : appParam === "crm" ? "digit_crm" : appParam === "construction" ? "digit_construction" : appParam;
  return a && a.startsWith("digit_") ? a : undefined;
}

/** Navigates to a visible app address (the router maps it to its internal page). */
export function useGo() {
  const router = useRouter();
  // owner rule: apps show only their clean addresses (/hr, /fsm, /construction …), never the internal /digit-hr or /plugins path
  return (href: string) => { closeQuickView(); router.history.push(publicHref(href)); };
}

/** «360» button for one record; renders nothing when the record has no profile or the user cannot read it. */
export function Open360({ doctype, name, className, compact = false }: { doctype: string; name: string; className?: string; compact?: boolean }) {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const ctx = useProfileContext(); const go = useGo();
  const p = profileOf(doctype, name, ctx.app, ctx.enabled);
  if (!p || !canReadType(doctype === "Customer" && p.app === "digit_crm" ? "CRM Organization" : doctype, user) || !scopedGet(doctype, name, user)) return null;
  const label = ar ? p.label[1] : p.label[0];
  return <a href={publicHref(p.href)} className={className ?? "dx-360"} data-open-360={`${doctype}:${name}`} title={`${label} · ${masterName(doctype, name)}`} aria-label={`${label} · ${masterName(doctype, name)}`}
    onClick={(e) => { if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); e.stopPropagation(); go(p.href); }}>
    <span aria-hidden className="dx-360-ico">◎</span>{compact ? "360" : <>360<span className="dx-360-l"> · {ar ? "الملف" : "profile"}</span></>}</a>;
}

/** Opens the «ملفات 360» picker in the shared side panel. */
export function openProfiles360(el?: HTMLElement | null, ar = true) {
  openQuickView({ kind: "content", title: ar ? "ملفات 360" : "360 profiles", sub: ar ? "اختر النوع ثم السجل" : "Pick a kind, then a record", node: <Profiles360Picker /> }, el ?? null);
}

function Profiles360Picker() {
  useStoreVersion(); const user = useSessionUser(); const ar = useLang() === "ar";
  const ctx = useProfileContext(); const go = useGo();
  const kinds = profileKinds(ctx.app, ctx.enabled).filter((k) => canReadType(k.doctype, user));
  const [kind, setKind] = useState<string>(kinds[0]?.doctype ?? "");
  const [q, setQ] = useState("");
  const k: Profile360 | undefined = kinds.find((x) => x.doctype === kind) ?? kinds[0];
  const rows = useMemo(() => {
    if (!k) return [];
    const s = q.trim().toLowerCase();
    return scopedList(k.doctype, user).map((d) => ({ name: d.name, title: masterName(k.doctype, d.name) }))
      .filter((r) => !s || `${r.name} ${r.title}`.toLowerCase().includes(s)).sort((a, b) => a.title.localeCompare(b.title, ar ? "ar" : "en")).slice(0, 40);
  }, [k?.doctype, q, user, ar]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!kinds.length) return <p className="ent-qv-empty">{ar ? "لا توجد ملفات 360 مسموح لك بفتحها في هذا التطبيق." : "No 360 profile you may open in this app."}</p>;
  return <div className="grid gap-3" data-profiles-360={ctx.app ?? "core"}>
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={ar ? "نوع الملف" : "Profile kind"}>
      {kinds.map((x) => <button key={x.doctype} type="button" role="tab" aria-selected={x.doctype === k?.doctype} className="dx-360-kind" onClick={() => { setKind(x.doctype); setQ(""); }} data-360-kind={x.doctype}>{ar ? x.label[1] : x.label[0]}</button>)}
    </div>
    <input className="field-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "ابحث بالاسم أو الرقم" : "Search by name or number"} aria-label={ar ? "بحث" : "Search"} autoFocus data-360-search />
    {rows.length ? <ul className="grid gap-1">{rows.map((r) => <li key={r.name}>
      <a href={publicHref(k!.href(r.name))} className="ent-qv-li" data-360-row={r.name} onClick={(e) => { e.preventDefault(); go(k!.href(r.name)); }}>
        <span className="min-w-0 flex-1 text-start"><bdi className="block truncate font-medium" data-no-i18n>{ar ? r.title : r.title}</bdi>{r.title !== r.name && <bdi className="block truncate text-xs text-muted-foreground r1-mono" data-no-i18n>{r.name}</bdi>}</span>
        <span className="dx-360" aria-hidden>360</span></a></li>)}</ul>
      : <p className="ent-qv-empty">{q ? (ar ? "لا نتيجة لهذا البحث." : "No match.") : (ar ? "لا توجد سجلات مسموح لك برؤيتها." : "No records you may see.")}</p>}
  </div>;
}

/** Ordinary app-navigation entry; never a separate control beside the company in the top bar. */
export function Profiles360NavButton({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const ar = useLang() === "ar";
  return <button type="button" className="dx-nav-item" onClick={(e) => { onNavigate?.(); openProfiles360(e.currentTarget, ar); }} data-profiles-360-open title={ar ? "ملفات 360" : "360 profiles"}>
    <span className="min-w-0 flex-1 text-start">{ar ? "ملفات 360" : "360 profiles"}</span><span aria-hidden className="dx-360-ico">◎</span></button>;
}
