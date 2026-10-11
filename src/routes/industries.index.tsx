import { createFileRoute } from "@tanstack/react-router";
import ImportedPage from "@/components/ImportedPage";
import page from "@/content/site/industries.json";
import "@/content/site/industries.css";
export const Route = createFileRoute("/industries/")({
  head: () => ({ meta: [
    { title: page.title + " — Digit" },
    { name: "description", content: "حلول Digit للقطاعات السعودية — المقاولات والتجزئة والتوزيع والصناعة والخدمات." },
    { property: "og:title", content: page.title + " — Digit" },
    { property: "og:description", content: "حلول Digit للقطاعات السعودية — المقاولات والتجزئة والتوزيع والصناعة والخدمات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Page,
});
function Page() { return <ImportedPage page={page} pageKey="industries" />; }
