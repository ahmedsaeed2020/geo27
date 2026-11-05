import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n";
import { TRUST_ITEMS, type TrustIcon } from "@/content/home";

const svg = (children: ReactNode) => (
  <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 32 32" aria-hidden="true">
    {children}
  </svg>
);

const ICONS: Record<TrustIcon, ReactNode> = {
  customers: svg(<><path d="M6 27V9l10-4 10 4v18" /><path d="M11 27v-6h10v6M11 12h2M19 12h2M11 16h2M19 16h2" /></>),
  products: svg(<><rect fill="currentColor" height="6" rx="1.4" stroke="none" width="6" x="13" y="13" /><rect height="5" rx="1.2" width="5" x="5" y="5" /><rect height="5" rx="1.2" width="5" x="22" y="5" /><rect height="5" rx="1.2" width="5" x="5" y="22" /><rect height="5" rx="1.2" width="5" x="22" y="22" /><path d="M10 7.5h4M18 7.5h4M10 24.5h4M18 24.5h4" /></>),
  reports: svg(<><rect height="20" rx="2.5" width="22" x="5" y="6" /><path d="M5 11h22M10 21v-4M15 21v-7M20 21v-3" /></>),
  einvoice: svg(<><rect height="24" rx="2.5" width="16" x="8" y="4" /><path d="M12 10h8M12 14h8M12 18h5" /><circle cx="21" cy="22" fill="currentColor" r="4" stroke="none" /></>),
  bilingual: svg(<><circle cx="16" cy="16" r="11" /><path d="M5 16h22M16 5c3 3 3 19 0 22M16 5c-3 3-3 19 0 22" /></>),
  delivery: svg(<><path d="M7 9h18M7 16h12M7 23h8" /><path d="m20 22 3 3 5-6" /></>),
};

/** Verified headline facts right under the first fold: customers, products, reports, e-invoicing, language, delivery. */
export default function TrustStrip() {
  const l = useLocale();
  return (
    <section id="trust-strip" aria-label={l === "ar" ? "لماذا DIGIT" : "Why DIGIT"} className="border-t border-mint/15 bg-deep text-paper">
      <ul className="mx-auto grid max-w-[1600px] list-none grid-cols-6 gap-3.5 px-7 py-[18px] max-lg:grid-cols-3 max-md:grid-cols-2 max-md:px-4">
        {TRUST_ITEMS.map(it => (
          <li key={it.icon} data-motion-step className="flex flex-col items-center gap-[7px] text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-mint/12 text-mint [&>svg]:h-[22px] [&>svg]:w-[22px]">
              {ICONS[it.icon]}
            </span>
            <span className="text-[12px] leading-[1.45] font-medium text-paper/85">{it.label[l]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
