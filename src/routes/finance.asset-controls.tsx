import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { AssetControlsPage } from "@/components/enterprise/AssetControls";

export const Route = createFileRoute("/finance/asset-controls")({
  head: () => ({ meta: [
    { title: "Asset controls — DIGIT Enterprise" },
    { name: "description", content: "Asset custody approval, physical verification, impairment, category changes, work in progress and shift based depreciation." },
    { property: "og:title", content: "Asset controls — DIGIT Enterprise" },
    { property: "og:description", content: "Asset custody approval, physical verification, impairment, category changes, work in progress and shift based depreciation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Asset controls" ar="ضوابط الأصول"><AssetControlsPage /></ServiceRoute>,
});
