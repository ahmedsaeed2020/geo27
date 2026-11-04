import { createFileRoute } from '@tanstack/react-router';
import { loadPublished } from '@/lib/cms-query';
import { withSeo } from '@/lib/seo';
import { validateBlueprintSearch } from '@/content/blueprint';
import BlueprintBuilder from '@/components/blueprint/BlueprintBuilder';

export const Route = createFileRoute('/blueprint')({
  validateSearch: validateBlueprintSearch,
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) =>
    withSeo('/blueprint', {
      meta: [
        { title: 'صمّم منظومة DIGIT لمنشأتك | مخطط تفاعلي للأنظمة المترابطة' },
        { name: 'description', content: 'اختر قطاعك وحجم منشأتك وما تريد تحسينه، وشاهد فورًا منظومة DIGIT المناسبة: المجالات المترابطة والشاشات الحقيقية ومسار القراءة وطريق التنفيذ، ثم احجز عرضًا توضيحيًا عليها.' },
      ],
    }, loaderData),
  component: BlueprintBuilder,
});
