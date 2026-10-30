import { getPublishedContent } from '@/lib/cms.functions';
import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import arabicPage from "@/content/site/industries-manufacturing-industry.json";
import "@/content/site/industries-manufacturing-industry.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/industries/manufacturing-industry")({
 loader: () => getPublishedContent(),
  head: ({ loaderData }) => withSeo("/en/industries/manufacturing-industry", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="industries-manufacturing-industry" />; }
