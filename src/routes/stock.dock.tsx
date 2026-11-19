import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { DockBoardPage } from "@/components/enterprise/OpsDesk";

export const Route = createFileRoute("/stock/dock")({
  head: () => ({ meta: [
    { title: "Dock appointments — DIGIT Enterprise" },
    { name: "description", content: "Book and track inbound and outbound truck slots per warehouse door, with cross-dock." },
    { property: "og:title", content: "Dock appointments — DIGIT Enterprise" },
    { property: "og:description", content: "Book and track inbound and outbound truck slots per warehouse door, with cross-dock." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Dock appointments" ar="مواعيد الرصيف"><DockBoardPage /></ServiceRoute>,
});
