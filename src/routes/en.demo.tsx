import { loadPublished } from '@/lib/cms-query';
import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import arabicPage from "@/content/site/demo.json";
import "@/content/site/demo.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/demo")({
 loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) => withSeo("/en/demo", { meta: [
    { title: "Book a Digit Demo | See the system by department" },
    { name: "description", content: page.description },
    { property: "og:title", content: "Book a Digit Demo | See the system by department" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }, loaderData),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="demo" />; }
