import type { ComponentType, SVGProps } from "react";
import { Landmark, Users, HardHat, Handshake, Wrench, Store } from "lucide-react";
import { useLocale, localeHref } from "@/lib/i18n";
import { SectionHeading } from '@/components/cms/SectionText';
import { useCatalog } from "@/components/catalog/useCatalog";
import { MORE_SYSTEMS, type ProductKey } from "@/content/catalog";
import { MODULES } from "@/content/home";

const ICONS: Record<ProductKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  pro: Landmark, hr: Users, construction: HardHat, crm: Handshake, fsm: Wrench, pos: Store,
};

const href = (path: string, hash: string | undefined, l: "ar" | "en") => localeHref(path, l) + (hash ? `#${hash}` : "");

/**
 * The six product families with every department, read from the catalog: a department whose page is not public yet
 * links to its card on the product page, so nothing here can open an empty page.
 */
export default function Modules() {
  const l = useLocale();
  const families = useCatalog();
  return (
    <section id="modules" className="bg-paper py-[84px] max-md:px-4 max-md:py-[54px]">
      <div className="mx-auto w-[88%] max-w-[1600px] max-md:w-full">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-3 text-[16px] font-semibold tracking-[0.5px] text-primary uppercase">
            <span className="inline-block h-[2px] w-[50px] bg-primary" aria-hidden="true" />
            {MODULES.eyebrow[l]}
            <span className="inline-block h-[2px] w-[50px] bg-primary" aria-hidden="true" />
          </div>
          <SectionHeading k="modules" className="pt-5 text-center text-[34px] font-bold text-ink max-md:text-[26px]">
            {MODULES.heading[l]}
          </SectionHeading>
          <p className="mt-3 max-w-[680px] text-center text-[16px] leading-[1.75] text-body2">{MODULES.lede[l]}</p>
        </div>

        <div className="mt-12 grid grid-cols-3 items-stretch gap-5 max-xl:grid-cols-2 max-md:grid-cols-1">
          {families.map(f => {
            const Icon = ICONS[f.key];
            const items = f.key === "pos" ? f.solutions.map(s => ({ id: s.id, label: s.label, href: href(s.path, s.hash, l) })) : f.departments.map(d => ({ id: d.id, label: d.label, href: href(d.href, d.hash, l) }));
            const unit = f.key === "pos" ? MODULES.activities : f.key === "pro" || f.key === "construction" ? MODULES.departments : MODULES.areas;
            return (
              <article
                key={f.key}
                data-motion-card
                aria-labelledby={`mod-${f.key}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-[16px] border border-dline bg-card p-[26px_24px] text-start shadow-[0_10px_30px_rgba(6,78,59,.07)] transition-colors hover:border-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex rounded-[13px] border border-iconborder p-[13px] text-primary shadow-[0_8px_22px_rgba(10,135,84,.12)]">
                    <Icon className="h-7 w-7" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-light px-3 py-1 font-monospace text-[11.5px] font-bold text-deep">
                    {items.length} {unit[l]}
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-semibold text-primary">{f.area[l]}</p>
                <h3 id={`mod-${f.key}`} className="text-[22px] font-bold text-deep" dir="ltr" style={{ textAlign: "start" }}>{f.name[l]}</h3>
                <p className="mt-2 text-[14px] leading-[1.7] text-body2">{f.summary[l]}</p>
                <ul className="mt-4 mb-4 list-none space-y-1.5 border-t border-dline pt-4 p-0">
                  {items.map(it => (
                    <li key={it.id}>
                      <a href={it.href} className="group/link flex items-start gap-2 text-[13.5px] leading-[1.55] text-ink/80 hover:text-primary">
                        <span aria-hidden="true" className="mt-px font-bold text-primary">↗</span>
                        <span className="group-hover/link:underline">{it.label[l]}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {f.key === "pro" && f.extras.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-[12px] font-semibold text-body2">{MODULES.also[l]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {f.extras.map(x => (
                        <a key={x.id} href={href(x.path, x.hash, l)} className="rounded-full border border-dline px-2.5 py-1 text-[12px] text-deep transition-colors hover:border-primary hover:text-primary">
                          {x.label[l]}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <a
                  href={localeHref(f.overview, l)}
                  aria-label={`${MODULES.more[l]} — ${f.name[l]}`}
                  className="mt-auto self-start rounded-[8px] bg-light px-[15px] py-[9px] text-[16px] font-medium text-deep transition-colors hover:text-primary"
                >
                  {MODULES.more[l]}
                </a>
              </article>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <span className="text-[13.5px] font-semibold text-body2">{MODULES.extra[l]}:</span>
          {MORE_SYSTEMS.map(m => (
            <a key={m.path} href={localeHref(m.path, l)} className="rounded-full border border-dline bg-card px-3.5 py-1.5 text-[13.5px] text-deep transition-colors hover:border-primary hover:text-primary">
              {m.label[l]}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
