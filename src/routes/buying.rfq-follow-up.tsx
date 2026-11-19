import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { RfqFollowUpPage } from "@/components/enterprise/ControlPanels";

export const Route = createFileRoute("/buying/rfq-follow-up")({
  head: () => ({ meta: [
    { title: "RFQ follow-up — DIGIT Enterprise" },
    { name: "description", content: "Suppliers who have not quoted yet, reminder e-mails before the required date, and every reminder sent." },
    { property: "og:title", content: "RFQ follow-up — DIGIT Enterprise" },
    { property: "og:description", content: "Suppliers who have not quoted yet, reminder e-mails before the required date, and every reminder sent." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="RFQ follow-up" ar="متابعة طلبات عروض الأسعار"><RfqFollowUpPage /></ServiceRoute>,
});
