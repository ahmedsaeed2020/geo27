import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import proPurchasing from "@/content/pro/pages/purchasing";
import arabicPage from "@/content/site/modules-purchasing.json";
import "@/content/site/modules-purchasing.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/modules/purchasing")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/en/modules/purchasing", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-purchasing" pro={proPurchasing} />; }
