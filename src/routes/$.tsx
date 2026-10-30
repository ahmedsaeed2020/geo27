import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { resolveRedirect } from '@/lib/cms.functions';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import DynamicContentPage from '@/components/cms/DynamicContentPage';

const UNAVAILABLE = 'صفحة غير متاحة — Digit';
const UNAVAILABLE_DESCRIPTION = 'الصفحة المطلوبة غير متاحة.';

export const Route = createFileRoute('/$')({
  loader: async ({ context, location }) => {
    const rows = await loadPublished(context.queryClient, location);
    const path = location.pathname;
    const bare = path.replace(/^\/en(?=\/|$)/, '') || '/';
    if (rows.some(r => r.path === bare)) return { rows, path };
    // Unknown path: an owner-managed redirect wins before the not-found page.
    const target = await resolveRedirect({ data: { path } }).catch(() => null);
    if (target) {
      if (target.to.startsWith('/')) throw redirect({ href: target.to, statusCode: target.status, replace: true });
      throw redirect({ href: target.to, statusCode: target.status, reloadDocument: true });
    }
    throw notFound();
  },
  head: ({ loaderData }) =>
    loaderData
      ? withSeo(loaderData.path, {}, loaderData.rows)
      : {
          meta: [
            { title: UNAVAILABLE },
            { name: 'description', content: UNAVAILABLE_DESCRIPTION },
            { property: 'og:title', content: UNAVAILABLE },
            { property: 'og:description', content: UNAVAILABLE_DESCRIPTION },
            { property: 'og:type', content: 'website' },
            { name: 'twitter:card', content: 'summary' },
            { name: 'robots', content: 'noindex' },
          ],
        },
  component: DynamicContentPage,
});
