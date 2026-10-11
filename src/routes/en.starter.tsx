import { withSeo } from "@/lib/seo";
import { localizeData, translate } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import PackagePage from "@/components/PackagePage";
import arabicNodes from "@/content/starter.json";

const nodes = localizeData(arabicNodes);
export const Route = createFileRoute("/en/starter")({
  head: () => withSeo("/en/starter", { meta: [
    { title: translate("باقة Starter — Digit | الفوترة الإلكترونية") },
    { name: "description", content: translate("باقة Digit Starter لإدارة العملاء والأصناف والفواتير الإلكترونية، تبدأ من 1,499 ر.س سنويًا، مع خيار ربط ZATCA.") },
    { property: "og:title", content: translate("باقة Starter — Digit") },
    { property: "og:description", content: translate("ابدأ الفوترة الإلكترونية مع Starter، 3 مستخدمين واستضافة ونسخ احتياطي وخيار ربط ZATCA.") },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: StarterPage,
});

function StarterPage() { return <PackagePage nodes={nodes} slug="starter" />; }