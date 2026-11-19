import { createFileRoute } from "@tanstack/react-router";
import { ServiceRoute } from "@/components/enterprise/ServicePages";
import { ApprovalPathsPage } from "@/components/enterprise/OpsDesk";

export const Route = createFileRoute("/control/approvals")({
  head: () => ({ meta: [
    { title: "Approval paths — DIGIT Enterprise" },
    { name: "description", content: "Approval templates by amount, branch and category, with a simulator showing who approves and in which order." },
    { property: "og:title", content: "Approval paths — DIGIT Enterprise" },
    { property: "og:description", content: "Approval templates by amount, branch and category, with a simulator showing who approves and in which order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ServiceRoute en="Approval paths" ar="مسارات الاعتماد"><ApprovalPathsPage /></ServiceRoute>,
});
