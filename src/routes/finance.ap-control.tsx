import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ApControlPage } from "@/components/enterprise/FinanceDesk";

export const Route = createFileRoute("/finance/ap-control")({
  head: () => ({ meta: [
    { title: "Supplier invoice processing — DIGIT Enterprise" },
    { name: "description", content: "Touchless rate, processing days, exceptions and possible duplicate supplier bills." },
    { property: "og:title", content: "Supplier invoice processing — DIGIT Enterprise" },
    { property: "og:description", content: "Touchless rate, processing days, exceptions and possible duplicate supplier bills." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Supplier invoice processing" ar="معالجة فواتير الموردين"><ApControlPage /></ServiceRoute>,
});
