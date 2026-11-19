import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ChannelOrdersPage } from "@/components/enterprise/TradeDesk";

export const Route = createFileRoute("/selling/channels")({
  head: () => ({ meta: [
    { title: "Marketplace orders — DIGIT Enterprise" },
    { name: "description", content: "Orders from Salla, Zid, Amazon.sa and Noon turned into sales orders or rejected with a reason." },
    { property: "og:title", content: "Marketplace orders — DIGIT Enterprise" },
    { property: "og:description", content: "Orders from Salla, Zid, Amazon.sa and Noon in one queue." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Marketplace orders" ar="طلبات المتاجر الإلكترونية"><ChannelOrdersPage /></ServiceRoute>,
});
