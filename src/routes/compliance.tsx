import { createFileRoute } from "@tanstack/react-router";
import { ComplianceRoute } from "@/components/enterprise/ServicePages";

export const Route = createFileRoute("/compliance")({
  head: () => ({ meta: [
    { title: "Compliance & audit — DIGIT Enterprise" },
    { name: "description", content: "Change history, access control and error logs read from the system's own audit records, inside the active DIGIT application." },
    { property: "og:title", content: "Compliance & audit — DIGIT Enterprise" },
    { property: "og:description", content: "Change history, access control and error logs read from the system's own audit records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ComplianceRoute,
});
