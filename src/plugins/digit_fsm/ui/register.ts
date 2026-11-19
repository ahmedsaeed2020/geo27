/** Registers the DIGIT FSM + ITM virtual page components under the keys named by the manifest (index.ts FSM_PAGES). */
import type { ComponentType } from "react";
import { registerPluginPages, type PluginPageProps } from "@/plugins/pages";
import { ExecutivePage, HomePage, OperationsPage, SitesPage } from "./home";
import { Agreement360Page, Deficiency360Page, Device360Page, Job360Page, Site360Page } from "./p360";
import { RunPage } from "./run";
import { Technician360Page } from "./p360more";
import { ReportPreviewPage } from "./reportPreview";
import { DispatchPage, EmergencyPage } from "./dispatch";
import { MyPage, QueuePage } from "./queues";
import { ReportPage, ReportsPage } from "./reports";
import { ConfigPage, DeferredPage, PortalPage } from "./config";
import { FieldHubPage, GroupWorkspacePage, PortalHubPage } from "./workspace";
import { DestinationPage } from "./destination";
import { OpsCenterPage, TechniciansPage, Visit360Page, VisitsPortfolioPage } from "./operations";
import { SiteExplorerPage } from "./explorer";
import { RegisterPage } from "./registerList";
import { FieldDayPage, FieldVisitPage } from "./fieldJourney";
import { FieldOfflinePage } from "./fieldOffline";

const P = (c: ComponentType<Record<string, never>>) => c as unknown as ComponentType<PluginPageProps>;
export const FSM_COMPONENTS: Record<string, ComponentType<PluginPageProps>> = {
  home: P(HomePage), executive: P(ExecutivePage), operations: P(OperationsPage), sites: P(SitesPage),
  site360: Site360Page, device360: Device360Page, agreement360: Agreement360Page, job360: Job360Page, deficiency360: Deficiency360Page, run: RunPage, technician360: Technician360Page, reportPreview: ReportPreviewPage,
  dispatch: P(DispatchPage), emergency: P(EmergencyPage), queue: QueuePage, my: MyPage, reports: P(ReportsPage), report: ReportPage,
  config: ConfigPage, portal: PortalPage, deferred: DeferredPage, moduleDirectory: GroupWorkspacePage, fieldHub: P(FieldHubPage), portalHub: P(PortalHubPage),
  destination: DestinationPage, opsCenter: P(OpsCenterPage), visits: VisitsPortfolioPage, visit360: Visit360Page, technicians: P(TechniciansPage), siteExplorer: P(SiteExplorerPage), register: RegisterPage,
  fieldDay: P(FieldDayPage), fieldVisit: FieldVisitPage, fieldOffline: P(FieldOfflinePage),
};
export function registerFsmPages() { registerPluginPages("digit_fsm", FSM_COMPONENTS); }
