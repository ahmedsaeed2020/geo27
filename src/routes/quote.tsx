import { createFileRoute } from '@tanstack/react-router';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import QuotePage from '@/components/QuotePage';

const title = 'اطلب عرض سعر — Digit';
const description = 'اطلب عرض سعر مخصص لأنظمة Digit حسب المنتجات والأقسام وعدد المستخدمين والفروع، ويصلك عرض مكتوب بالنطاق والتكلفة.';

export const Route = createFileRoute('/quote')({
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo('/quote', { meta: [
    { title }, { name: 'description', content: description },
    { property: 'og:title', content: title }, { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }, loaderData),
  component: QuotePage,
});
