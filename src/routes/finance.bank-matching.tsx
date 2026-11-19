import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { BankMatchingPage } from "@/components/enterprise/FinanceControls";

export const Route = createFileRoute("/finance/bank-matching")({
  head: () => ({ meta: [
    { title: "Bank matching — DIGIT Enterprise" },
    { name: "description", content: "Bank rules, payment match suggestions and matched-by stamps for open bank statement lines." },
    { property: "og:title", content: "Bank matching — DIGIT Enterprise" },
    { property: "og:description", content: "Bank rules, payment match suggestions and matched-by stamps for open bank statement lines." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Bank matching" ar="المطابقة البنكية"><BankMatchingPage /></ServiceRoute>,
});
