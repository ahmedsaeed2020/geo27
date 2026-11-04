import { createFileRoute } from '@tanstack/react-router';
import { loadProArea, proAreaHead } from '@/lib/pro-route';
import { proPageByKey } from '@/content/pro/pro-pages';
import ProAreaPage from '@/components/pro/ProAreaPage';
import { PRO_AREA_CONTENT } from '@/content/pro/area-content';

export const Route = createFileRoute('/pro_/$area')({
  loader: ({ context, location, params }) => loadProArea(context.queryClient, location, params.area),
  head: ({ loaderData, params }) => proAreaHead(loaderData, params.area, false),
  component: Page,
});

function Page() {
  const { key } = Route.useLoaderData();
  const config = proPageByKey(key)!;
  return <ProAreaPage config={config} content={PRO_AREA_CONTENT[key]!} />;
}
