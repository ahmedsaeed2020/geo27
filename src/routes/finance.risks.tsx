import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { RiskBoardPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/risks")({
  head: () => ({ meta: [
    { title: "Exceptions and risks — DIGIT Enterprise" },
    { name: "description", content: "Payment, receivable, stock and procurement risks in one board, each opening its records." },
    { property: "og:title", content: "Exceptions and risks — DIGIT Enterprise" },
    { property: "og:description", content: "Payment, receivable, stock and procurement risks in one board, each opening its records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Exceptions and risks" ar="الاستثناءات والمخاطر"><RiskBoardPage /></ServiceRoute>,
});
