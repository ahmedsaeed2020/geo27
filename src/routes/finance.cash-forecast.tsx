import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { CashForecastPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/cash-forecast")({
  head: () => ({ meta: [
    { title: "Cash forecast — DIGIT Enterprise" },
    { name: "description", content: "7, 30 and 90-day cash forecast from bank balances, receivables, payables and payment runs, with scenarios." },
    { property: "og:title", content: "Cash forecast — DIGIT Enterprise" },
    { property: "og:description", content: "7, 30 and 90-day cash forecast from bank balances, receivables, payables and payment runs, with scenarios." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Cash forecast" ar="توقع النقد"><CashForecastPage /></ServiceRoute>,
});
