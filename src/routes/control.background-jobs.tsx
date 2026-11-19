import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { JobsPage } from "@/components/enterprise/JobsPage";

export const Route = createFileRoute("/control/background-jobs")({
  head: () => ({ meta: [
    { title: "Background jobs — DIGIT Enterprise" },
    { name: "description", content: "Large bulk actions and background data imports with progress and a per-row log." },
    { property: "og:title", content: "Background jobs — DIGIT Enterprise" },
    { property: "og:description", content: "Large bulk actions and background data imports with progress and a per-row log." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Background jobs" ar="المهام الخلفية"><JobsPage /></ServiceRoute>,
});
