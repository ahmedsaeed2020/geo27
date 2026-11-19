import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ClosePage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/close")({
  head: () => ({ meta: [
    { title: "Period close — DIGIT Enterprise" },
    { name: "description", content: "Close checklist with owners and evidence, staged locking and the period closing voucher." },
    { property: "og:title", content: "Period close — DIGIT Enterprise" },
    { property: "og:description", content: "Close checklist with owners and evidence, staged locking and the period closing voucher." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Period close" ar="إقفال الفترة"><ClosePage /></ServiceRoute>,
});
