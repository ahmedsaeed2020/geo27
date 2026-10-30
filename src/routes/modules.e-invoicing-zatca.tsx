import { getPublishedContent } from '@/lib/cms.functions';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/modules-e-invoicing-zatca.json";
import "@/content/site/modules-e-invoicing-zatca.css";
export const Route = createFileRoute("/modules/e-invoicing-zatca")({
 loader: () => getPublishedContent(),
  head: ({ loaderData }) => withSeo("/modules/e-invoicing-zatca", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-e-invoicing-zatca" />; }
