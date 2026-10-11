import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/components/HomePage";
export const Route = createFileRoute("/en/")({
 head: () => ({ meta: [
 { title: "Digit — Saudi ERP | Accounting, E-Invoicing & POS" },
 { name: "description", content: "Digit connects accounting, e-invoicing, sales, purchasing, inventory, POS and reporting for Saudi businesses, in the cloud or on your own servers." },
 { property: "og:title", content: "Digit — Saudi ERP" },
 { property: "og:description", content: "One platform for your finances, operations and point of sale, built for Saudi businesses." },
 { property: "og:type", content: "website" },
 { name: "twitter:card", content: "summary_large_image" }
 ] }), component: HomePage
});
