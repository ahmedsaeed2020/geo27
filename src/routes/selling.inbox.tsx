import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { SalesInboxPage } from "@/components/enterprise/TradeAssist";

export const Route = createFileRoute("/selling/inbox")({
  head: () => ({ meta: [
    { title: "Sales inbox — DIGIT Enterprise" },
    { name: "description", content: "Customer requests received by e-mail turned into draft quotations." },
    { property: "og:title", content: "Sales inbox — DIGIT Enterprise" },
    { property: "og:description", content: "Customer requests received by e-mail turned into draft quotations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Sales inbox" ar="صندوق طلبات العملاء"><SalesInboxPage /></ServiceRoute>,
});
