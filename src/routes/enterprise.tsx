import { createFileRoute } from "@tanstack/react-router";
import { EnterpriseHome } from "@/components/enterprise/EnterpriseHome";

export const Route = createFileRoute("/enterprise")({
  head: () => ({
    meta: [
      { title: "Enterprise Home — DIGIT Enterprise" },
      { name: "description", content: "Your DIGIT applications, their key indicators and your assigned work in one place." },
      { property: "og:title", content: "Enterprise Home — DIGIT Enterprise" },
      { property: "og:description", content: "Your DIGIT applications, their key indicators and your assigned work in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnterpriseHome,
});
