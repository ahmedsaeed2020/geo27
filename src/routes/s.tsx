import { createFileRoute } from "@tanstack/react-router";
import { loadPublished } from '@/lib/cms-query';
import { geoHead } from '@/content/geointime-seo';
import GeoLanding from '@/components/geointime/GeoLanding';
export const Route = createFileRoute("/s")({
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: () => { const h = geoHead('ar'); return { ...h, meta: [...(h.meta ?? []), { name: 'robots', content: 'noindex, follow' }] }; },
  component: GeoLanding,
});
