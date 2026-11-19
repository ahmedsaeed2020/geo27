/**
 * Enterprise organisation chart (owner round H1-06): one card per person — avatar, name, title, a top edge in the
 * department colour, a Saudi / non-Saudi tag — under their manager, with a reports-count circle that opens or folds the
 * branch, zoom (− / 100% / +) and export (CSV of every person, print). Branches below the opened depth are folded and
 * counted in one «N not shown» chip that opens them all, so a large company never renders as an unreadable wall.
 * Display only — apps pass the people (already permission-scoped), their manager ids, colours and links.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Minus, Plus, Download, Printer } from "lucide-react";

export interface OrgPerson {
  id: string; parent: string; name: string; title?: string | undefined; dept?: string | undefined;
  /** CSS colour token name of the department (emerald, teal, blue, …) */
  hue: string;
  tag?: { label: string; tone: "saudi" | "other" } | undefined;
  /** wraps the card's name in the link to the person's record */
  link?: ((node: ReactNode) => ReactNode) | undefined;
  /** extra columns of the CSV export (already in the reader's language) */
  csv?: Record<string, string> | undefined;
}
type Labels = { zoomIn: string; zoomOut: string; reset: string; export: string; print: string; hidden: (n: number) => string; reports: (n: number) => string; empty: string; roots: (n: number) => string; csvHead: [string, string, string, string, string] };
const L = (ar: boolean): Labels => ar
  ? { zoomIn: "تكبير", zoomOut: "تصغير", reset: "الحجم الأصلي", export: "تصدير", print: "طباعة", hidden: (n) => `${n} غير معروض — افتح الكل`, reports: (n) => `${n} ${n === 1 ? "مرؤوس" : "مرؤوسين"} — افتح أو اطوِ`, empty: "لا يوجد موظفون ضمن نطاقك.", roots: (n) => `+${n} بلا مدير مسجل`, csvHead: ["الاسم", "المسمى", "القسم", "المدير", "الجنسية"] }
  : { zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Actual size", export: "Export", print: "Print", hidden: (n) => `${n} not shown — open all`, reports: (n) => `${n} direct report${n === 1 ? "" : "s"} — open or fold`, empty: "No employees within your scope.", roots: (n) => `+${n} without a recorded manager`, csvHead: ["Name", "Title", "Department", "Manager", "Nationality"] };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

export function OrgChart({ people, ar, depth = 2, focus, maxRoots = 6, fileName = "org-chart", attrs }: {
  people: OrgPerson[]; ar: boolean; /** levels opened at first (roots = level 0) */ depth?: number;
  /** a person whose branch and manager chain open first (Employee 360) */ focus?: string | undefined;
  maxRoots?: number; fileName?: string; attrs?: Record<string, string>;
}) {
  const t = L(ar);
  const { byId, kids, roots, size } = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const kids = new Map<string, OrgPerson[]>();
    for (const p of people) if (p.parent && byId.has(p.parent) && p.parent !== p.id) kids.set(p.parent, [...(kids.get(p.parent) ?? []), p]);
    const size = new Map<string, number>();
    const count = (id: string, seen: Set<string>): number => { if (seen.has(id)) return 0; seen.add(id); const n = (kids.get(id) ?? []).reduce((a, c) => a + 1 + count(c.id, seen), 0); size.set(id, n); return n; };
    const roots = people.filter((p) => !p.parent || !byId.has(p.parent) || p.parent === p.id);
    for (const r of roots) count(r.id, new Set());
    roots.sort((a, b) => (size.get(b.id) ?? 0) - (size.get(a.id) ?? 0) || a.name.localeCompare(b.name));
    for (const [k, v] of kids) kids.set(k, [...v].sort((a, b) => (size.get(b.id) ?? 0) - (size.get(a.id) ?? 0) || a.name.localeCompare(b.name)));
    return { byId, kids, roots, size };
  }, [people]);
  const chain = useMemo(() => { const s = new Set<string>(); let c = focus ? byId.get(focus) : undefined; let g = 0; while (c && g++ < 40) { s.add(c.id); c = c.parent ? byId.get(c.parent) : undefined; } return s; }, [focus, byId]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allRoots, setAllRoots] = useState(false);
  const [zoom, setZoom] = useState(1);
  const isOpen = (id: string, level: number) => open[id] ?? (chain.size ? chain.has(id) : level < depth);
  const shownRoots = allRoots || roots.length <= maxRoots + 1 ? roots : roots.slice(0, maxRoots);
  // people folded away (inside a closed branch or past the shown roots)
  let hidden = 0;
  const walk = (p: OrgPerson, level: number, seen: Set<string>) => { if (seen.has(p.id)) return; seen.add(p.id); const ks = kids.get(p.id) ?? []; if (!ks.length) return; if (!isOpen(p.id, level)) { hidden += size.get(p.id) ?? 0; return; } for (const k of ks) walk(k, level + 1, seen); };
  { const seen = new Set<string>(); for (const r of shownRoots) walk(r, 0, seen); for (const r of roots.slice(shownRoots.length)) hidden += 1 + (size.get(r.id) ?? 0); }
  const openAll = () => { const o: Record<string, boolean> = {}; for (const p of people) if (kids.has(p.id)) o[p.id] = true; setOpen(o); setAllRoots(true); };
  const exportCsv = () => {
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const extra = [...new Set(people.flatMap((p) => Object.keys(p.csv ?? {})))];
    const lines = [[...t.csvHead, ...extra].map(q).join(","), ...people.map((p) => [p.name, p.title ?? "", p.dept ?? "", byId.get(p.parent)?.name ?? "", p.tag?.label ?? "", ...extra.map((k) => p.csv?.[k] ?? "")].map(q).join(","))];
    const href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = href; a.download = `${fileName}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  };
  const card = (p: OrgPerson, level: number, seen: Set<string>): ReactNode => {
    if (seen.has(p.id)) return null; seen.add(p.id);
    const ks = kids.get(p.id) ?? []; const o = ks.length > 0 && isOpen(p.id, level);
    const name = <span className="ek-oc-name">{p.name}</span>;
    return <li key={p.id} className="ek-oc-node" data-oc-node={p.id} data-oc-open={o || undefined}>
      <div className="ek-oc-card" style={{ ["--oc-hue" as string]: `var(--${p.hue})` }} data-oc-focus={p.id === focus || undefined} data-oc-hue={p.hue}>
        <span className="ek-oc-av" aria-hidden data-no-i18n>{initials(p.name)}</span>
        <span className="ek-oc-txt" data-no-i18n>{p.link ? p.link(name) : name}{p.title && <span className="ek-oc-title">{p.title}</span>}{p.dept && <span className="ek-oc-dept">{p.dept}</span>}</span>
        {p.tag && <span className="ek-oc-tag" data-oc-tag={p.tag.tone}>{p.tag.label}</span>}
        {ks.length > 0 && <button type="button" className="ek-oc-count" aria-expanded={o} aria-label={t.reports(size.get(p.id) ?? ks.length)} title={t.reports(ks.length)} onClick={() => setOpen((m) => ({ ...m, [p.id]: !o }))} data-oc-count={ks.length}><bdi data-no-i18n>{ks.length}</bdi></button>}
      </div>
      {o && <ul className="ek-oc-kids">{ks.map((k) => card(k, level + 1, seen))}</ul>}
    </li>;
  };
  const seen = new Set<string>();
  return (
    <section className="ek-oc" data-org-chart={people.length} data-oc-hidden={hidden} {...attrs}>
      <header className="ek-oc-bar">
        <div className="ek-oc-zoom" role="group" aria-label={t.reset}>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label={t.zoomOut} data-oc-zoom="out"><Minus size={14} /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label={t.reset} data-oc-zoom="reset"><bdi data-no-i18n>{Math.round(zoom * 100)}%</bdi></button>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))} aria-label={t.zoomIn} data-oc-zoom="in"><Plus size={14} /></button>
        </div>
        {hidden > 0 && <button type="button" className="ek-oc-hidden" onClick={openAll} data-oc-open-all>{t.hidden(hidden)}</button>}
        <span className="ek-oc-sp" />
        <button type="button" className="ek-oc-btn" onClick={exportCsv} data-oc-export><Download size={14} />{t.export}</button>
        <button type="button" className="ek-oc-btn" onClick={() => window.print()} data-oc-print><Printer size={14} />{t.print}</button>
      </header>
      {!people.length ? <p className="ek-wb-empty">{t.empty}</p> : <div className="ek-oc-scroll">
        <div className="ek-oc-canvas" style={{ ["--oc-zoom" as string]: zoom }} data-oc-zoom-level={zoom}>
          <ul className="ek-oc-tree">{shownRoots.map((r) => card(r, 0, seen))}</ul>
          {shownRoots.length < roots.length && <button type="button" className="ek-oc-more" onClick={() => setAllRoots(true)} data-oc-more-roots={roots.length - shownRoots.length}>{t.roots(roots.length - shownRoots.length)}</button>}
        </div>
      </div>}
    </section>
  );
}
