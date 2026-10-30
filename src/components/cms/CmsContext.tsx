import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { PublishedRecord } from '@/lib/cms-schema';
import type { PreviewResult, PublicMedia } from '@/lib/cms.functions';
import { DEFAULT_SITE_CONFIG, type SiteConfig } from '@/lib/site-config-schema';
import { CmsRecordsProvider } from './CmsNavigation';

const RecordsContext = createContext<PublishedRecord[]>([]);
const ConfigContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG);
const PreviewContext = createContext<PreviewResult | null>(null);
const MediaContext = createContext<Map<string, PublicMedia>>(new Map());

export function CmsProvider({
  records,
  config = DEFAULT_SITE_CONFIG,
  preview = null,
  media,
  children,
}: {
  records: PublishedRecord[];
  config?: SiteConfig;
  preview?: PreviewResult | null;
  media?: PublicMedia[];
  children: ReactNode;
}) {
  const mediaMap = useMemo(() => new Map((media ?? []).map(m => [m.url, m])), [media]);
  return (
    <CmsRecordsProvider records={records}>
      <RecordsContext.Provider value={records}>
        <ConfigContext.Provider value={config}>
          <PreviewContext.Provider value={preview}>
            <MediaContext.Provider value={mediaMap}>{children}</MediaContext.Provider>
          </PreviewContext.Provider>
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

/** Dimensions and focal point of an approved library image, when known. */
export function useCmsMedia(url: string): PublicMedia | undefined {
  return useContext(MediaContext).get(url.split('?')[0] ?? url);
}
