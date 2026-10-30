import { createContext, useContext, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { PublishedRecord } from '@/lib/cms-schema';
import type { PreviewResult } from '@/lib/cms.functions';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/site-config-schema';
import { CmsRecordsProvider } from './CmsNavigation';

const RecordsContext = createContext<PublishedRecord[]>([]);
const ConfigContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);
const PreviewContext = createContext<PreviewResult | null>(null);

export function CmsProvider({
  records,
  config = DEFAULT_SITE_CONFIG,
  preview = null,
  children,
}: {
  records: PublishedRecord[];
  config?: SiteConfig;
  preview?: PreviewResult | null;
  children: ReactNode;
}) {
  return (
    <CmsRecordsProvider records={records}>
      <RecordsContext.Provider value={records}>
        <ConfigContext.Provider value={config}>
          <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
        </ConfigContext.Provider>
      </RecordsContext.Provider>
    </CmsRecordsProvider>
  );
}

export function useCmsPage() {
  const path = useRouterState({ select: s => s.location.pathname.replace(/^\/en(?=\/|$)/, '') || '/' });
  return useContext(RecordsContext).find(r => r.path === path)?.published;
}

export function useSiteConfig(): SiteConfig {
  return useContext(ConfigContext);
}

export function useCmsPreview(): PreviewResult | null {
  return useContext(PreviewContext);
}
