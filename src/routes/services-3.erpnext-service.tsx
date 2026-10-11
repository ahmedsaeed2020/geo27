import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/services-3-erpnext-service.json";
import "@/content/site/services-3-erpnext-service.css";
export const Route = createFileRoute("/services-3/erpnext-service")({
  head: () => withSeo("/services-3/erpnext-service", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="services-3-erpnext-service" />; }
