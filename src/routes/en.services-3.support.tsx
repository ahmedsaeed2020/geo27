import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import arabicPage from "@/content/site/services-3-support.json";
import "@/content/site/services-3-support.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/services-3/support")({
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
function Page() { return <ImportedPage page={page} pageKey="services-3-support" />; }
