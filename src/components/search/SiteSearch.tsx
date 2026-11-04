import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BarChart3, Boxes, FileText, LayoutGrid, Search, Sparkles, Workflow } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useCatalog } from "@/components/catalog/useCatalog";
import { buildSearchIndex, searchEntries, SEARCH_GROUPS, type SearchEntry, type SearchGroup } from "@/lib/site-search";
import { localeHref, useLocale, type Locale } from "@/lib/i18n";

const COPY = {
  open: { ar: "ابحث في الموقع", en: "Search the site" },
  title: { ar: "البحث في DIGIT", en: "Search DIGIT" },
  description: { ar: "ابحث في المنتجات والأقسام ومساحات العمل والتقارير وصفحات الموقع.", en: "Search products, departments, workspaces, reports and site pages." },
  placeholder: { ar: "ابحث: المخزون، الرواتب، ميزان المراجعة، المقاولات…", en: "Search: inventory, payroll, trial balance, construction…" },
  empty: { ar: "لا نتائج مطابقة. جرّب كلمة أقصر أو اسم القسم.", en: "No matching results. Try a shorter word or a department name." },
  suggested: { ar: "اقتراحات", en: "Suggestions" },
  hint: { ar: "للتنقل استخدم الأسهم، وEnter للفتح، وEsc للإغلاق", en: "Use the arrows to move, Enter to open and Esc to close" },
} as const;

const ICONS: Record<SearchGroup, typeof Boxes> = {
  products: Boxes,
  departments: LayoutGrid,
  workspaces: Workflow,
  reports: BarChart3,
  pages: FileText,
};

/** Hand-picked starting points shown before the visitor types. */
const SUGGESTED: { path: string; label: { ar: string; en: string } }[] = [
  { path: "/blueprint", label: { ar: "صمّم منظومتك", en: "Design your system" } },
  { path: "/pro", label: { ar: "DIGIT Pro", en: "DIGIT Pro" } },
  { path: "/modules/hr-payroll", label: { ar: "DIGIT HR", en: "DIGIT HR" } },
  { path: "/modules/reports", label: { ar: "دليل التقارير", en: "Report directory" } },
  { path: "/pricing", label: { ar: "الباقات", en: "Packages" } },
  { path: "/demo", label: { ar: "احجز عرضًا توضيحيًا", en: "Book a demo" } },
];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function Results({ entries, locale, go }: { entries: SearchEntry[]; locale: Locale; go: (e: { path: string; hash?: string | undefined }) => void }) {
  return (
    <>
      {SEARCH_GROUPS.map(group => {
        const items = entries.filter(e => e.group === group.id);
        if (!items.length) return null;
        const Icon = ICONS[group.id];
        return (
          <CommandGroup key={group.id} heading={group.label[locale]}>
            {items.map(entry => (
              <CommandItem key={entry.id} value={entry.id} onSelect={() => go(entry)} className="site-search-item">
                <Icon aria-hidden="true" className="text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{entry.title}</span>
                  {entry.hint && <span className="block truncate text-xs text-muted-foreground">{entry.hint}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}

/** Header search button and the Ctrl/⌘ K (or "/") search palette across products, departments, reports and pages. */
export default function SiteSearch() {
  const locale = useLocale();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const index = useMemo(() => (open ? buildSearchIndex(catalog, locale) : []), [open, catalog, locale]);
  const results = useMemo(() => searchEntries(index, query), [index, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(value => !value);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = ({ path, hash }: { path: string; hash?: string | undefined }) => {
    setOpen(false);
    void navigate({ to: localeHref(path, locale), ...(hash ? { hash } : {}) });
  };

  return (
    <>
      <button type="button" className="site-search-btn" onClick={() => setOpen(true)} aria-label={COPY.open[locale]} title={`${COPY.open[locale]} (Ctrl K)`} aria-haspopup="dialog">
        <Search aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="site-search-dialog overflow-hidden p-0 sm:max-w-2xl" dir={locale === "ar" ? "rtl" : "ltr"}>
          <DialogTitle className="sr-only">{COPY.title[locale]}</DialogTitle>
          <DialogDescription className="sr-only">{COPY.description[locale]}</DialogDescription>
          <Command shouldFilter={false} loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input-wrapper]]:pe-12 [&_[cmdk-input]]:h-14 [&_[cmdk-input]]:text-base [&_[cmdk-item]]:gap-3 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-4 [&_[cmdk-item]_svg]:w-4">
            <CommandInput value={query} onValueChange={setQuery} placeholder={COPY.placeholder[locale]} aria-label={COPY.title[locale]} />
            <CommandList className="max-h-[min(60vh,480px)]">
              {query.trim() ? (
                <>
                  <CommandEmpty>{COPY.empty[locale]}</CommandEmpty>
                  <Results entries={results} locale={locale} go={go} />
                </>
              ) : (
                <CommandGroup heading={COPY.suggested[locale]}>
                  {SUGGESTED.map(s => (
                    <CommandItem key={s.path} value={`suggested-${s.path}`} onSelect={() => go({ path: s.path })} className="site-search-item">
                      <Sparkles aria-hidden="true" className="text-primary" />
                      <span className="font-medium text-foreground">{s.label[locale]}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{COPY.hint[locale]}</p>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
