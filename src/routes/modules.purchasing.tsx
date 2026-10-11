import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/modules-purchasing.json";
import "@/content/site/modules-purchasing.css";
export const Route = createFileRoute("/modules/purchasing")({
  head: () => ({ meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="modules-purchasing" />; }
