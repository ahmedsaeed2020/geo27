import { loadPublished } from '@/lib/cms-query';
import { geoHead } from '@/content/geointime-seo';
import { createFileRoute } from "@tanstack/react-router";
import GeoLanding from '@/components/geointime/GeoLanding';
export const Route = createFileRoute("/en/")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
 head: () => geoHead('en'), component: GeoLanding
});
