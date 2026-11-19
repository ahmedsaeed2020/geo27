import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/insights/workbook/$workbookName/")({
  head: () => ({ meta: [
    { title: 'Workbook — DIGIT Insights' },
    { name: 'description', content: 'Queries, charts and dashboards in a DIGIT Insights workbook.' },
    { property: 'og:title', content: 'Workbook — DIGIT Insights' },
    { property: 'og:description', content: 'Queries, charts and dashboards in a DIGIT Insights workbook.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <p className="p-6 text-sm text-crm-muted">Select or create a query, chart or dashboard from the workbook sidebar.</p>,
});
