import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ScanPage } from "@/components/enterprise/OpsDesk";

export const Route = createFileRoute("/stock/scan")({
  head: () => ({ meta: [
    { title: "Scan stock — DIGIT Enterprise" },
    { name: "description", content: "Receive, put away, pick, pack, ship and count by barcode on a phone, each finishing as a draft document." },
    { property: "og:title", content: "Scan stock — DIGIT Enterprise" },
    { property: "og:description", content: "Receive, put away, pick, pack, ship and count by barcode on a phone, each finishing as a draft document." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Scan stock" ar="مسح المخزون"><ScanPage /></ServiceRoute>,
});
