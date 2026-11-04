import { createFileRoute } from '@tanstack/react-router';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import { validateBlueprintSearch } from '@/content/blueprint';
import BlueprintBuilder from '@/components/blueprint/BlueprintBuilder';

export const Route = createFileRoute('/en/blueprint')({
  validateSearch: validateBlueprintSearch,
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) =>
    withSeo('/en/blueprint', {
      meta: [
        { title: 'Design your DIGIT system | Interactive blueprint of connected systems' },
        { name: 'description', content: 'Choose your sector, size and what you want to improve, and instantly see the DIGIT system that fits: connected areas, real screens, a reading path and the road to go-live, then book a demo on it.' },
      ],
    }, loaderData),
  component: BlueprintBuilder,
});
