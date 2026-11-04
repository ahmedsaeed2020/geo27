import { useMemo } from 'react';
import { resolveCatalog, type ResolvedFamily } from '@/content/catalog';
import { usePublishedRecords } from '@/components/cms/CmsNavigation';
import { useSiteConfig } from '@/components/cms/CmsContext';

/** Product families with the published menu order applied and each department's live/hub destination resolved. */
export function useCatalog(): ResolvedFamily[] {
  const records = usePublishedRecords();
  const { catalog } = useSiteConfig();
  return useMemo(() => resolveCatalog(catalog, records.map(r => r.path)), [catalog, records]);
}
