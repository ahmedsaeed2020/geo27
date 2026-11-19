import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { StatementDesignerPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/statements")({
  head: () => ({ meta: [
    { title: "Financial statement designer — DIGIT Enterprise" },
    { name: "description", content: "Design statement rows and column sets and preview them from the ledger." },
    { property: "og:title", content: "Financial statement designer — DIGIT Enterprise" },
    { property: "og:description", content: "Design statement rows and column sets and preview them from the ledger." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Financial statement designer" ar="مصمم القوائم المالية"><StatementDesignerPage /></ServiceRoute>,
});
