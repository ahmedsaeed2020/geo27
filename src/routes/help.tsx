import { createFileRoute } from "@tanstack/react-router";
import { HelpRoute } from "@/components/enterprise/ServicePages";

export const Route = createFileRoute("/help")({
  head: () => ({ meta: [
    { title: "Help & support — DIGIT Enterprise" },
    { name: "description", content: "Find your way around the active DIGIT application: assistant, search, shortcuts, help articles and support tickets." },
    { property: "og:title", content: "Help & support — DIGIT Enterprise" },
    { property: "og:description", content: "Assistant, search, shortcuts, help articles and support tickets for the active DIGIT application." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: HelpRoute,
});
