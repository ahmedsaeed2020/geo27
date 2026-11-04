import { createFileRoute } from '@tanstack/react-router';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import FsmHubPage, { FSM_HUB_COPY } from '@/components/hubs/FsmHubPage';

export const Route = createFileRoute('/en/modules/fsm-itm')({
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) =>
    withSeo(
      '/en/modules/fsm-itm',
      {
        meta: [
          { title: `${FSM_HUB_COPY.title.en} | Digit` },
          { name: 'description', content: FSM_HUB_COPY.description.en },
          { property: 'og:title', content: `${FSM_HUB_COPY.title.en} | Digit` },
          { property: 'og:description', content: FSM_HUB_COPY.description.en },
          { property: 'og:type', content: 'website' },
          { name: 'twitter:card', content: 'summary_large_image' },
        ],
      },
      loaderData,
    ),
  component: FsmHubPage,
});
