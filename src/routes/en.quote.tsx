import { createFileRoute } from '@tanstack/react-router';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import QuotePage from '@/components/QuotePage';

const title = 'Request a Price Quote — Digit';
const description = 'Request a tailored Digit quote based on your products, departments, users and branches, and receive a written scope and cost.';

export const Route = createFileRoute('/en/quote')({
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo('/en/quote', { meta: [
    { title }, { name: 'description', content: description },
    { property: 'og:title', content: title }, { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }, loaderData),
  component: QuotePage,
});
