import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import arabicPage from "@/content/site/modules-manufacturing.json";
import "@/content/site/modules-manufacturing.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/modules/manufacturing")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/en/modules/manufacturing", { meta: [
    { title: `${page.title} Module — Digit` },
    { name: "description", content: page.description },
    { property: "og:title", content: `${page.title} Module — Digit` },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-manufacturing" />; }
