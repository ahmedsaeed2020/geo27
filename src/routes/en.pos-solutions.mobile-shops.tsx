import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import arabicPage from "@/content/site/pos-solutions-mobile-shops.json";
import "@/content/site/pos-solutions-mobile-shops.css";
const page = localizeData(arabicPage);
export const Route = createFileRoute("/en/pos-solutions/mobile-shops")({
  head: () => withSeo("/en/pos-solutions/mobile-shops", { meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: page.description },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: page.description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="pos-solutions-mobile-shops" />; }
