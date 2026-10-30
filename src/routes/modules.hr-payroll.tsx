import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/modules-hr-payroll.json";
import "@/content/site/modules-hr-payroll.css";
export const Route = createFileRoute("/modules/hr-payroll")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/modules/hr-payroll", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-hr-payroll" />; }
