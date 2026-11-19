/**
 * Idea 9 on the claims workspace: one claim-position bar for the projects in scope (the Project 360 partition, summed)
 * and one slim bar per client contract — claimed awaiting a certificate → certified not invoiced → invoiced not
 * collected → collected, all from domain/data.ts contractPosition, so the bars equal the contract and project figures.
 */
import { DistributionBar, type DistSegment } from "@/components/enterprise/kit/DistributionBar";
import { r2 } from "../domain/calc";
import { contractPosition, contractsOf, projectTitle } from "../domain/data";
import { constructionProjects } from "../domain/queues";
import { adapter } from "@/lib/adapter";
import { DocRef, compact, money, useCx } from "./kit";
import type { BoardScope } from "../domain/boards";

export interface StageFigs { claimed: number; certified: number; invoiced: number; collected: number }
const stagesOf = (p: ReturnType<typeof contractPosition>): StageFigs => ({ claimed: r2(Math.max(0, p.claimedPending)), certified: r2(Math.max(0, p.certifiedNotInvoiced)), invoiced: r2(Math.max(0, p.outstanding)), collected: r2(Math.max(0, p.collected)) });
/** Client contracts in scope (not draft) with their claim stages; the total is their sum (= Σ projects' claimStages). */
export function claimStageRows(s: BoardScope) {
  const rows = constructionProjects({ company: s.company, project: s.project }).flatMap((p) => contractsOf(p.name).filter((c) => c["workflow_state"] !== "Draft").map((c) => ({ contract: c.name, project: p.name, customer: String(c["customer"] ?? ""), st: stagesOf(contractPosition(c)) })));
  const total = rows.reduce<StageFigs>((a, r) => ({ claimed: r2(a.claimed + r.st.claimed), certified: r2(a.certified + r.st.certified), invoiced: r2(a.invoiced + r.st.invoiced), collected: r2(a.collected + r.st.collected) }), { claimed: 0, certified: 0, invoiced: 0, collected: 0 });
  return { rows: rows.filter((r) => r.st.claimed || r.st.certified || r.st.invoiced || r.st.collected), total };
}

export function ClaimsStagePanel({ scope }: { scope: BoardScope }) {
  const { t, ar } = useCx();
  const { rows, total } = claimStageRows(scope);
  const seg = (st: StageFigs, full: boolean): DistSegment[] => [
    { key: "claimed", label: t("Claimed", "مطالَب"), value: st.claimed, display: full ? money(st.claimed) : compact(st.claimed, ar), hue: "blue" },
    { key: "certified", label: t("Certified", "معتمد"), value: st.certified, display: full ? money(st.certified) : compact(st.certified, ar), hue: "amber" },
    { key: "invoiced", label: t("Invoiced", "مفوتر"), value: st.invoiced, display: full ? money(st.invoiced) : compact(st.invoiced, ar), hue: "teal" },
    { key: "collected", label: t("Collected", "محصّل"), value: st.collected, display: full ? money(st.collected) : compact(st.collected, ar), hue: "emerald" },
  ];
  if (!rows.length) return <p className="text-sm text-muted-foreground">{t("No client contract with a claim in scope.", "لا يوجد عقد عميل عليه مستخلص ضمن النطاق.")}</p>;
  return (
    <div className="grid gap-3" data-claims-stage-panel={rows.length}>
      <DistributionBar title={t("Claim position — all contracts in scope", "موقف المستخلص — كل العقود ضمن النطاق")} segments={seg(total, true)}
        footer={t("Claimed = submitted claims awaiting a certificate · Certified = not yet invoiced · Invoiced = not yet collected.", "مطالَب = مطالبات مقدّمة بانتظار شهادة · معتمد = لم يُفوتر بعد · مفوتر = لم يُحصَّل بعد.")} />
      <ul className="grid gap-2" data-claims-stage-rows>
        {rows.map((r) => (
          <li key={r.contract} data-claim-stage-row={r.contract}>
            <DistributionBar segments={seg(r.st, false)} title={<span className="flex flex-wrap items-baseline justify-between gap-2">
              <DocRef doctype="Digit Client Contract" name={r.contract} />
              <span className="text-xs font-normal text-muted-foreground" data-no-i18n>{projectTitle(adapter.get("Project", r.project), !ar)}{r.customer ? ` · ${String(adapter.get("Customer", r.customer)?.["customer_name"] ?? r.customer)}` : ""}</span>
            </span>} />
          </li>
        ))}
      </ul>
    </div>
  );
}
