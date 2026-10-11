import { withSeo } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import PackagePage from "@/components/PackagePage";
import nodes from "@/content/starter.json";

export const Route = createFileRoute("/starter")({
  head: () => withSeo("/starter", { meta: [
    { title: "باقة Starter — Digit | الفوترة الإلكترونية" },
    { name: "description", content: "باقة Digit Starter لإدارة العملاء والأصناف والفواتير الإلكترونية، تبدأ من 1,499 ر.س سنويًا، مع خيار ربط ZATCA." },
    { property: "og:title", content: "باقة Starter — Digit" },
    { property: "og:description", content: "ابدأ الفوترة الإلكترونية مع Starter، 3 مستخدمين واستضافة ونسخ احتياطي وخيار ربط ZATCA." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: StarterPage,
});

function StarterPage() { return <PackagePage nodes={nodes} slug="starter" />; }