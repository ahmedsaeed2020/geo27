import { createFileRoute } from "@tanstack/react-router";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { WorkforceWorkspace } from "@/components/digithr/workspaces/WorkforceWorkspace";

export const Route = createFileRoute("/digit-hr/workforce")({
  head: () => ({ meta: [
    { title: "DIGIT HR — Shifts & Attendance Workspace" },
    { name: "description", content: "Daily shift coverage, attendance status, late entries and pending shift or attendance requests from native HR records." },
    { property: "og:title", content: "DIGIT HR — Shifts & Attendance Workspace" },
    { property: "og:description", content: "Daily workforce workspace: shifts, attendance and exceptions." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: WorkforceRoute,
});

/** Same workspace as module 03 home — one implementation, two entry points. */
function WorkforceRoute() {
  const { tx } = useTx();
  return (
    <DigitHrLayout title={tx("لوحة الورديات والحضور", "Shifts & attendance board")} subtitle={tx("تغطية الورديات وحالة الحضور والاستثناءات لليوم المحدد من السجلات الأصلية. الأعداد هي السجلات المتاحة لك فقط.", "Shift coverage, attendance and exceptions for the selected day from native records. Counts are records visible to you only.")} crumbs={[{ label: tx("الورديات والحضور", "Shifts & attendance") }]}>
      <WorkforceWorkspace />
    </DigitHrLayout>
  );
}
