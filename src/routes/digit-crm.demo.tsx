import { createFileRoute } from "@tanstack/react-router";
import { CrmFrame } from "@/plugins/digit_crm/CrmApp";
import { DemoControls } from "@/plugins/digit_crm/DemoControls";
export const Route = createFileRoute("/digit-crm/demo")({
  head: () => ({ meta: [{ title: "Enterprise demo dataset — DIGIT CRM" }, { name: "description", content: "Explicitly activate and reset isolated synthetic CRM demonstration history." }, { property: "og:title", content: "Enterprise demo dataset — DIGIT CRM" }, { property: "og:description", content: "Isolated, opt-in synthetic CRM demonstration data." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <CrmFrame title="DIGIT CRM Demo" subtitle="">{() => <DemoControls />}</CrmFrame>,
});