import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ZakatPage } from "@/components/enterprise/SaudiTax";

export const Route = createFileRoute("/tax/zakat")({
  head: () => ({ meta: [
    { title: "Zakat estimate — DIGIT Enterprise" },
    { name: "description", content: "Zakat base, sources and deductions from posted ledger balances, at 2.5% Hijri and 2.5776% Gregorian." },
    { property: "og:title", content: "Zakat estimate — DIGIT Enterprise" },
    { property: "og:description", content: "Zakat base, sources and deductions from posted ledger balances, at 2.5% Hijri and 2.5776% Gregorian." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Zakat estimate" ar="تقدير الزكاة"><ZakatPage /></ServiceRoute>,
});
