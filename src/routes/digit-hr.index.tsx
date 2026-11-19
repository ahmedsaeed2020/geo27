import { createFileRoute } from "@tanstack/react-router";
import { commandScope } from "@/components/digithr/MetricLink";
import { DigitHrLayout, useTx } from "@/components/digithr/DigitHrLayout";
import { MissionControl } from "@/components/digithr/workspaces/MissionControl";

export const Route = createFileRoute("/digit-hr/")({
  validateSearch: (s: Record<string, unknown>) => ({ ...commandScope(s), ...(typeof s["cat"] === "string" ? { cat: s["cat"] } : {}), ...(typeof s["focus"] === "string" ? { focus: s["focus"] } : {}) }),
  head: () => ({ meta: [
    { title: "DIGIT HR — HR Mission Control" },
    { name: "description", content: "Cross-module HR priorities, decision indicators, upcoming dates and the seven HR modules on canonical HR records." },
    { property: "og:title", content: "DIGIT HR — HR Mission Control" },
    { property: "og:description", content: "Approvals, lifecycle changes, attendance, onboarding, payroll blockers and documents with drill-down to original records." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MissionControlRoute,
});

/** Screen 00: the page renders its own command header (no shared band). */
function MissionControlRoute() {
  const { tx } = useTx();
  return (
    <DigitHrLayout headless title={tx("مركز قيادة الموارد البشرية", "HR Mission Control")}>
      <MissionControl />
    </DigitHrLayout>
  );
}
