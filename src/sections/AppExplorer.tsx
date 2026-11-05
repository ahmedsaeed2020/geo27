import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, HelpCircle, FileText, Search, X } from 'lucide-react';
import { useLocale, localeHref, type Locale } from '@/lib/i18n';
import { useCatalog } from '@/components/catalog/useCatalog';
import { productByKey, type L, type ResolvedFamily } from '@/content/catalog';
import { EXPLORER, EXPLORER_ROLES, type ExplorerLink } from '@/content/home';
import { SectionHeading } from '@/components/cms/SectionText';

type Row = { key: string; kind: 'question' | 'page'; label: L; href: string; product?: L };

/** Turns a role link into a visible row; catalog departments resolve to their live page or their hub card. */
function toRow(link: ExplorerLink, families: ResolvedFamily[], l: Locale): Row | null {
  if (link.kind === 'question') return { key: `${link.page}#${link.ws}`, kind: 'question', label: link.label, href: `${localeHref(link.page, l)}#pv-${link.ws}` };
  if (link.kind === 'page') return { key: link.href, kind: 'page', label: link.label, href: localeHref(link.href, l) };
  const family = families.find(f => f.key === link.product);
  if (!family) return null;
  const dept = family.departments.find(x => x.id === link.id);
  if (dept) return { key: `${family.key}:${dept.id}`, kind: 'page', label: dept.label, product: family.name, href: localeHref(dept.href, l) + (dept.hash ? `#${dept.hash}` : '') };
  const solution = family.solutions.find(x => x.id === link.id);
  return solution ? { key: `${family.key}:${solution.id}`, kind: 'page', label: solution.label, product: family.name, href: localeHref(solution.path, l) + (solution.hash ? `#${solution.hash}` : '') } : null;
}

function RowLink({ row, l }: { row: Row; l: Locale }) {
  const Arrow = l === 'ar' ? ArrowLeft : ArrowRight;
  const Icon = row.kind === 'question' ? HelpCircle : FileText;
  return (
    <a href={row.href} className="group flex items-center gap-3 rounded-[12px] border border-dline bg-card px-4 py-3.5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-light text-primary"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold text-body2">{row.kind === 'question' ? EXPLORER.question[l] : row.product ? row.product[l] : EXPLORER.page[l]}</span>
        <span className="block text-[15.5px] leading-[1.5] font-bold text-deep group-hover:text-primary">{row.label[l]}</span>
      </span>
      <Arrow className="h-4 w-4 flex-none text-primary transition-transform group-hover:-translate-x-0.5 ltr:group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

/**
 * Home "start from your work": pick a role and get the questions DIGIT answers for it and the pages to open, or search
 * across every role link and catalog department. Nothing here links to a page that is not public.
 */
export default function AppExplorer() {
  const l = useLocale();
  const uid = useId();
  const families = useCatalog();
  const [roleId, setRoleId] = useState(EXPLORER_ROLES[0]!.id);
  const [query, setQuery] = useState('');
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, EXPLORER_ROLES.findIndex(r => r.id === roleId));
  const role = EXPLORER_ROLES[index]!;
  const rows = role.links.map(link => toRow(link, families, l)).filter((r): r is Row => !!r);
  const family = role.product === 'all' ? undefined : productByKey(role.product);

  const all = useMemo(() => {
    const seen = new Map<string, Row>();
    for (const r of EXPLORER_ROLES) for (const link of r.links) { const row = toRow(link, families, l); if (row && !seen.has(row.key)) seen.set(row.key, row); }
    for (const f of families) {
      for (const dept of f.departments) { const row = toRow({ kind: 'dept', product: f.key, id: dept.id }, families, l); if (row && !seen.has(row.key)) seen.set(row.key, row); }
      for (const s of f.solutions) { const row = toRow({ kind: 'dept', product: f.key, id: s.id }, families, l); if (row && !seen.has(row.key)) seen.set(row.key, row); }
    }
    return [...seen.values()];
  }, [families, l]);
  const term = query.trim().toLowerCase();
  const results = term ? all.filter(r => `${r.label.ar} ${r.label.en} ${r.product?.ar ?? ''} ${r.product?.en ?? ''}`.toLowerCase().includes(term)) : [];

  const select = (i: number, focus = false) => {
    const next = (i + EXPLORER_ROLES.length) % EXPLORER_ROLES.length;
    setRoleId(EXPLORER_ROLES[next]!.id);
    if (focus) tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const forward = e.key === 'ArrowDown' || (l === 'ar' ? e.key === 'ArrowLeft' : e.key === 'ArrowRight');
    const back = e.key === 'ArrowUp' || (l === 'ar' ? e.key === 'ArrowRight' : e.key === 'ArrowLeft');
    if (forward) select(index + 1, true);
    else if (back) select(index - 1, true);
    else if (e.key === 'Home') select(0, true);
    else if (e.key === 'End') select(EXPLORER_ROLES.length - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <section id="app-explorer" className="border-y border-border bg-card px-4 py-16 max-md:py-12" aria-labelledby={`${uid}-title`}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[640px]">
            <p className={`text-[13px] font-bold text-primary ${l === 'en' ? 'font-monospace tracking-[0.14em] uppercase' : ''}`}>{EXPLORER.eyebrow[l]}</p>
            <SectionHeading k="explorer" id={`${uid}-title`} className="mt-1 text-4xl font-bold text-foreground max-md:text-[28px]">{EXPLORER.heading[l]}</SectionHeading>
            <p className="mt-3 text-[16px] leading-[1.75] text-body2">{EXPLORER.lede[l]}</p>
          </div>
          <div className="relative w-full max-w-sm">
            <label htmlFor={`${uid}-q`} className="sr-only">{EXPLORER.search[l]}</label>
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-body2" aria-hidden="true" />
            <input
              id={`${uid}-q`}
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={EXPLORER.placeholder[l]}
              className="h-12 w-full rounded-[12px] border border-input bg-background ps-11 pe-10 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={EXPLORER.clear[l]} className="absolute end-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-body2 hover:bg-light">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {term ? (
          <div aria-live="polite">
            <p className="mb-3 text-[13.5px] font-semibold text-body2">{results.length} {EXPLORER.results[l]}</p>
            {results.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.map(r => <RowLink key={r.key} row={r} l={l} />)}</div>
            ) : (
              <p className="rounded-[12px] border border-dashed border-dline p-6 text-center text-[15px] text-body2">{EXPLORER.none[l]}</p>
            )}
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div role="tablist" aria-orientation="vertical" aria-label={EXPLORER.roles[l]} className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:gap-1.5">
              {EXPLORER_ROLES.map((r, i) => {
                const on = i === index;
                return (
                  <button
                    key={r.id}
                    ref={el => { tabs.current[i] = el; }}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${r.id}`}
                    aria-selected={on}
                    aria-controls={`${uid}-panel`}
                    tabIndex={on ? 0 : -1}
                    onClick={() => select(i)}
                    onKeyDown={onKey}
                    className={`rounded-full border px-4 py-2 text-start text-[14.5px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:rounded-[12px] lg:px-4 lg:py-3 ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-dline bg-background text-deep hover:border-primary'}`}
                  >
                    {r.label[l]}
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${role.id}`} className="rounded-[18px] border border-dline bg-paper2 p-6 max-md:p-4" key={role.id} style={{ animation: 'dcvfade .38s cubic-bezier(.2,.7,.2,1)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[24px] font-bold text-deep">{role.label[l]}</h3>
                  <p className="mt-1 text-[15.5px] leading-[1.7] text-body2">{role.start[l]}</p>
                </div>
                {family && (
                  <a href={localeHref(family.overview, l)} className="flex-none rounded-full border border-primary/30 bg-card px-3 py-1 text-[12.5px] font-bold text-primary hover:border-primary">
                    {family.name[l]}
                  </a>
                )}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">{rows.map(r => <RowLink key={r.key} row={r} l={l} />)}</div>
              <a href={localeHref('/demo', l)} className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-deep px-4 py-2.5 text-[14.5px] font-semibold text-paper transition-colors hover:bg-primary">
                {EXPLORER.demo[l]}
              </a>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes dcvfade{from{opacity:0;transform:translateX(18px);}to{opacity:1;transform:none;}}@media (prefers-reduced-motion: reduce){#app-explorer [role=tabpanel]{animation:none!important}}`}</style>
    </section>
  );
}
