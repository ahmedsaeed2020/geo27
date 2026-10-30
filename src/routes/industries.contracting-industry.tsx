import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/industries-contracting-industry.json";
import "@/content/site/industries-contracting-industry.css";
export const Route = createFileRoute("/industries/contracting-industry")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/industries/contracting-industry", { meta: [
    { title: `قطاع ${page.title} — Digit` },
    { name: "description", content: page.description },
    { property: "og:title", content: `قطاع ${page.title} — Digit` },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="industries-contracting-industry" />; }
