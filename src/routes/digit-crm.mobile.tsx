import { createFileRoute } from "@tanstack/react-router";
import { MobileCrm } from "@/plugins/digit_crm/Wave3";

export const Route = createFileRoute("/digit-crm/mobile")({
  head: () => ({ meta: [
    { title: "Mobile CRM — DIGIT CRM" }, { name: "description", content: "Phone-friendly quick access to CRM work." },
    { property: "og:title", content: "Mobile CRM — DIGIT CRM" }, { property: "og:description", content: "Phone-friendly quick access to CRM work." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MobileCrm,
});
