import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { useLocale } from '@/lib/i18n';
import { useSiteConfig } from './CmsContext';

type EditablePage = 'home' | 'pro';
const SectionPageContext = createContext<EditablePage | null>(null);

/** Marks a page whose section headings may be overridden from the admin. Outside it, sources render unchanged. */
export function EditableSections({ page, children }: { page: EditablePage; children: ReactNode }) {
  return <SectionPageContext.Provider value={page}>{children}</SectionPageContext.Provider>;
}

export function useSectionOverride(key: string): string | undefined {
  const page = useContext(SectionPageContext);
  const config = useSiteConfig();
  const locale = useLocale();
  if (!page) return undefined;
  const value = config[page].texts[key]?.[locale]?.trim();
  return value || undefined;
}

/** A section's main heading: the published override (plain text) or the original markup. */
export function SectionHeading({ k, children, ...rest }: HTMLAttributes<HTMLHeadingElement> & { k: string; children: ReactNode }) {
  const override = useSectionOverride(`${k}.heading`);
  return <h2 {...rest}>{override ?? children}</h2>;
}
