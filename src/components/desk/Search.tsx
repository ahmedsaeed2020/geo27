import { useNavigate } from "@tanstack/react-router";
import { EntGlyph } from "@/components/enterprise/DigitIcon";
import { useGo, useProfileContext } from "@/components/enterprise/Open360";
import { PROFILES_360, profileOf } from "@/lib/coreShared/profile360";
import { masterName } from "@/lib/coreShared/masterName";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cachedMeta, indexQuery, reportsQuery } from "@/lib/catalog";
import type { Doc } from "@/lib/adapter";
import { notificationSubject } from "@/lib/activityFeed";
import { scopedList } from "@/lib/scope";
import { useLang } from "@/i18n";
import { runSearchProviders, type SearchHref } from "./searchProviders";

/** `parts` / `hintParts` render as separate text nodes so the shared i18n layer translates each exact label (audit G15);
 *  `data` parts are record values (names, codes) and are never translated. */
type Part = { text: string; data?: boolean };
type Hit = { label: string; hint: string; go: () => void; noI18n?: boolean; parts?: Part[]; hintParts?: string[] };
/** Setup records are titled by the DocType / field they configure (translatable labels) instead of their internal name. */
function recordParts(dt: string, r: Record<string, unknown>, name: string, title: string, lang: Parameters<typeof notificationSubject>[1]): Part[] {
  const s = (k: string) => String(r[k] ?? "");
  if (dt === "Notification Log") return [{ text: name, data: true }, { text: notificationSubject(r as Doc, lang), data: true }];
  if (dt === "Custom Field" && s("dt")) return [{ text: s("dt") }, { text: s("label") || s("fieldname"), data: !s("label") }];
  if (dt === "Property Setter" && s("doc_type")) return [{ text: s("doc_type") }, { text: s("field_name") || s("property"), data: true }];
  if (dt === "Kanban Board" && s("reference_doctype")) { const col = cachedMeta(s("reference_doctype"))?.fields.find((f) => f.fieldname === s("field_name"))?.label; return [{ text: s("reference_doctype") }, col ? { text: col } : { text: s("kanban_board_name") || name, data: true }]; }
  return [{ text: name, data: true }, ...(title ? [{ text: title, data: true }] : [])];
}

/**
 * Awesomebar-style global search (frappe/public/js/frappe/ui/toolbar/awesome_bar.js): DocTypes, reports, records.
 * Registered app providers (searchProviders.ts) add their pages / permitted actions first while their experience is
 * active. An exact document name ranks above partial matches. Arrow keys move, Enter opens, Escape closes.
 */
export function GlobalSearch() {
  const idx = useQuery(indexQuery);
  const reps = useQuery(reportsQuery);
  const nav = useNavigate();
  const lang = useLang();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  const ctx = useProfileContext(); const go360 = useGo();
  // S1: Alt+Q (Business Central "Tell me") focuses the search / command bar from anywhere
  useEffect(() => { const f = (e: globalThis.KeyboardEvent) => { if (isAltQ(e)) { e.preventDefault(); box.current?.focus(); setOpen(true); } }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, []);
  const results = useMemo(() => {
    if (q.length < 2 || !idx.data) return [];
    const s = q.toLowerCase();
    const go = (h: SearchHref) => void nav(h as never);
    const appOf = (dt: string) => idx.data?.find((e) => e.name === dt)?.app;
    const out: Hit[] = runSearchProviders(q, { appOf, lang, reportRoles: (n) => { const r = reps.data?.find((x) => x.name === n); return r ? ((r as { roles?: string[] }).roles ?? []) : undefined; } })
      .slice(0, 10).map((h) => ({ label: h.label, hint: h.hint, go: () => (h.run ? h.run(go) : h.href && go(h.href)) }));
    idx.data.filter((d) => !d.istable && d.name.toLowerCase().includes(s)).slice(0, 8).forEach((d) =>
      out.push({ label: d.name, hint: d.issingle ? "Settings" : `${d.module} list`, hintParts: d.issingle ? ["Settings"] : [d.module, "List"], go: () => nav({ to: "/app/$app/$doctype", params: { app: d.app, doctype: d.slug } }) }));
    (reps.data ?? []).filter((r) => r.name.toLowerCase().includes(s)).slice(0, 5).forEach((r) =>
      out.push({ label: r.name, hint: `Report · ${r.report_type}`, hintParts: ["Report", r.report_type], go: () => nav({ to: "/report/$name", params: { name: r.name } }) }));
    const records: (Hit & { exact: boolean })[] = []; const hits360: (Hit & { exact: boolean })[] = [];
    // owner notes A-06: records with a 360 profile also offer «360 · <name>» first (opens the profile page)
    for (const p of PROFILES_360) {
      if (hits360.length >= 4 || !ctx.enabled.has(p.app) || !idx.data.some((x) => x.name === p.doctype)) continue;
      for (const r of scopedList(p.doctype)) {
        const title = masterName(p.doctype, r.name);
        if (!(r.name + " " + title).toLowerCase().includes(s)) continue;
        const pr = profileOf(p.doctype, r.name, ctx.app, ctx.enabled);
        if (pr && !hits360.some((h) => h.label === `360 · ${title}`)) hits360.push({ label: `360 · ${title}`, parts: [{ text: "360" }, { text: title, data: true }], hint: lang === "ar" ? pr.label[1] : pr.label[0], noI18n: true, exact: false, go: () => go360(pr.href) });
        if (hits360.length >= 4) break;
      }
    }
    for (const d of idx.data.filter((x) => !x.istable)) {
      for (const r of scopedList(d.name)) {
        const title = String(r["customer_name"] ?? r["supplier_name"] ?? r["item_name"] ?? r["project_name"] ?? r["subject"] ?? r["employee_name"] ?? "");
        if ((r.name + " " + title).toLowerCase().includes(s)) records.push({ label: `${r.name}${title ? ` · ${title}` : ""}`, parts: recordParts(d.name, r, r.name, title, lang), hint: d.name, noI18n: true, exact: r.name.toLowerCase() === s, go: () => nav({ to: "/app/$app/$doctype/$name", params: { app: d.app, doctype: d.slug, name: r.name } }) });
        if (records.length > 25) break;
      }
      if (records.length > 25) break;
    }
    return [...hits360, ...records.filter((r) => r.exact), ...out, ...records.filter((r) => !r.exact)];
  }, [q, idx.data, reps.data, nav, lang, ctx.app, ctx.enabled.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (r: Hit | undefined) => { if (!r) return; r.go(); setQ(""); setOpen(false); setActive(0); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  };
  return (
    <div className="relative w-full min-w-0">
      <span className="dx-search-ico" aria-hidden><EntGlyph name="ui-search" size={16} /></span>
      <input ref={box} data-awesomebar aria-label="Search or type a command" role="combobox" aria-expanded={open && results.length > 0} aria-controls="awesomebar-results" aria-activedescendant={open && results.length ? `awesomebar-hit-${active}` : undefined}
        className="field-input bg-muted" placeholder="Search or type a command (Alt+Q)" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && results.length > 0 && (
        <div id="awesomebar-results" role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((r, i) => (
            <button key={i} id={`awesomebar-hit-${i}`} role="option" aria-selected={i === active} onMouseDown={() => pick(r)} onMouseEnter={() => setActive(i)} data-awesomebar-hit={r.hint}
              className={`flex w-full justify-between gap-2 px-3 py-1.5 text-start text-sm hover:bg-muted ${i === active ? "bg-muted" : ""}`}>
              {r.parts ? <span className="truncate">{r.parts.map((x, k) => <span key={k}>{k > 0 && " · "}<span data-no-i18n={x.data ? "" : undefined}>{x.text}</span></span>)}</span>
                : <span className="truncate" data-no-i18n={r.noI18n ? "" : undefined}>{r.label}</span>}
              <span className="shrink-0 text-xs text-muted-foreground">{r.hintParts ? r.hintParts.map((x, k) => <span key={k}>{k > 0 && " · "}<span>{x}</span></span>) : r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Alt+Q by physical key, so it also works on an Arabic keyboard layout. */
export const isAltQ = (e: Pick<globalThis.KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "code" | "key">) => e.altKey && !e.ctrlKey && !e.metaKey && (e.code === "KeyQ" || e.key.toLowerCase() === "q");
