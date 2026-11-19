/** Registers the DIGIT Construction virtual page components under the keys named by the manifest (index.ts CONSTRUCTION_PAGES). */
import { registerPluginPages, type PluginPageProps } from "@/plugins/pages";
import type { ComponentType } from "react";
import { HomePage, HubPage, PortfolioPage, ProjectsPage } from "./home";
import { Project360Page } from "./project360";
import { DeptPage } from "./dept";
import { EstimatePage, TenderBoqPage } from "./commercial";
import { QsReviewPage } from "./subcontract";
import { CostSheetPage } from "./cost";
import { CostVerifyPage } from "./costVerify";
import { ComparisonPage, MatchingPage } from "./procurement";
import { FinancePage } from "./finance";
import { IntegrationPage, ReportPage, ReportsCentrePage } from "./reports";
import { PoliciesPage, SettingsPage } from "./settings";
import { PrintOutputsPage } from "./printOutputs";
import { WbsPage } from "./wbs";
import { TeamPage } from "./team";
import { BoqComparePage } from "./boqCompare";
import { AnalyticsHomePage, DashboardPage, MetricLibraryPage } from "./analytics";
import { InboxPage } from "./inbox";
import { FollowUpPage } from "./followup";
import { ContractVersionsPage } from "./contractVersions";
import { GovernancePage } from "./governance";
import { MaterialPositionPage, ProcurementPlanPage } from "./procPlan";
import { AdvancesPage, CashFlowPage } from "./cashAdv";
import { ModuleDirectoryPage } from "./directory";
import { R19DeptPage, R19IndexPage, R19WorkspacePage } from "./r19Workspace";

const P = (c: ComponentType<Record<string, never>>) => c as unknown as ComponentType<PluginPageProps>;
export const CONSTRUCTION_COMPONENTS: Record<string, ComponentType<PluginPageProps>> = {
  home: P(HomePage), portfolio: P(PortfolioPage), hub: P(HubPage), projects: P(ProjectsPage), project360: Project360Page, dept: DeptPage,
  estimate: EstimatePage, tenderBoq: TenderBoqPage, qsReview: QsReviewPage, costSheet: CostSheetPage, costVerify: CostVerifyPage, comparison: ComparisonPage, matching: MatchingPage,
  finance: FinancePage, reports: P(ReportsCentrePage), report: ReportPage, integration: P(IntegrationPage), settings: SettingsPage, policies: PoliciesPage, outputs: PrintOutputsPage, wbs: WbsPage, team: TeamPage, boqCompare: BoqComparePage,
  insightsHome: P(AnalyticsHomePage), inbox: P(InboxPage), followUp: P(FollowUpPage), contractVersions: ContractVersionsPage, governance: GovernancePage, procPlan: ProcurementPlanPage, materialPosition: MaterialPositionPage, cashFlow: CashFlowPage, advances: AdvancesPage, dashboard: DashboardPage, metrics: P(MetricLibraryPage), moduleDirectory: ModuleDirectoryPage,
  r19Index: P(R19IndexPage), r19Workspace: R19WorkspacePage, r19Dept: R19DeptPage,
};
export function registerConstructionPages() { registerPluginPages("digit_construction", CONSTRUCTION_COMPONENTS); }
