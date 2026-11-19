import { createFileRoute } from "@tanstack/react-router";
import { DeskLauncher } from "@/components/desk/DeskLauncher";

export const Route = createFileRoute("/desk/")({
  head: () => ({
    meta: [
      { title: "Desk Home — DIGIT Enterprise" },
      { name: "description", content: "Native DIGIT, DIGIT HR, DIGIT CRM and Insights launchers for administrators." },
      { property: "og:title", content: "Desk Home — DIGIT Enterprise" },
      { property: "og:description", content: "Native DIGIT, DIGIT HR, DIGIT CRM and Insights launchers for administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeskLauncher,
});
