// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/**
 * DIGIT Pro experience slots (src/plugins/experienceSlots.tsx). Rendered by the Core shell only while DIGIT Pro is
 * enabled AND its experience is active: Pro sidebar + breadcrumbs, the 15 native-form panels, child-grid keyboard
 * navigation, the grouped dock and the workspace entry cards. Every reference is resolved lazily (inside functions)
 * so module cycles through the Core Shell never read an uninitialised binding.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { EnterpriseIndicator, EnterpriseModule, ExperienceSlots, FormPanelProps } from "../experienceSlots";
import { CONTEXTS, NAV_AR, NAV_DOCTYPES, PRO_SOURCE_DOCTYPES, SERVICE_DOCTYPES } from "./nav";

const PRO_OWNED = new Set<string>([...NAV_DOCTYPES, ...SERVICE_DOCTYPES, ...PRO_SOURCE_DOCTYPES]);
import { DIGIT_PRO_PREMIUM } from "./index";
import { JournalEntryPanel } from "./JournalEntryPanel";
import { gridKeyNav } from "./JournalEntryPanel";
import { PaymentEntryPanel } from "./PaymentEntryPanel";
import { Asset360Panel, BatchSerialPanel, Item360Panel, QUICK_ITEM_DOCS, QuickItemsPanel, StockEntryPanel, StockReconPanel } from "./OpsPanels";
import { OrderReservationPanel } from "./InventoryPanels";
import { InvoiceAssetLinesPanel } from "./AssetClosurePanels";
import { Customer360Panel, DocFlowPanel, InvoiceBannerPanel, PartyMiniPanel, PurchasePositionPanel, QuotationComparePanel, QuotationGuidePanel, QuotationRevisionPanel, RevisionPanel, Supplier360Panel } from "./SalesFlowPanel";
import { partyOf } from "./docFlow";
import { ApprovalPathPanel } from "./PolicyPanels";
import { LedgerPreviewPanel } from "./LedgerPreview";
import { NextDocPanel } from "./NextDocPanel";
import { NEXT_STEPS } from "./nextDoc";
import { PREVIEW_DOCTYPES } from "@/lib/postingPreview";
import { INBOX_DOCTYPES } from "./policyDefaults";
import { keepDrawerOn, ProSidebar } from "./ProSidebar";
import { CorePageEyebrow, CorePageTabs, placesCorePage } from "./CorePagePlacement";
import { ProCrumbs, useOriginRecorder } from "./ProCrumbs";
import { DocPanelTabs, type DocPanel } from "@/components/enterprise/DocPanels";
import { appIconFor } from "@/components/enterprise/iconMap";

const FLOW_DOCS = ["Quotation", "Sales Order", "Delivery Note", "Sales Invoice", "Material Request", "Request for Quotation", "Supplier Quotation", "Purchase Order", "Purchase Receipt", "Purchase Invoice"];
const POSITION_DOCS = ["Purchase Order", "Purchase Receipt", "Purchase Invoice", "Sales Order", "Delivery Note", "Sales Invoice"];

/** The DIGIT Pro panels on native ERPNext forms (same conditions and order as the DIGIT Pro source). */
/** Pro document panels, each in its OWN-65 group (rendered as brand tabs by the Core DocPanelTabs; nothing removed). */
export function proFormPanelList({ meta, doc, dirty, canWrite, onChange }: FormPanelProps): DocPanel[] {
  const dt = meta.name; const saved = !doc["__islocal"]; const ds = Number(doc.docstatus ?? 0);
  const out: DocPanel[] = [];
  const add = (on: unknown, id: string, group: DocPanel["group"], node: ReactNode) => { if (on) out.push({ id, group, node }); };
  // saved documents: identity, totals, links and the ledger button are in the shared DocumentSummaryHeader; the panels keep only their working parts
  add(dt === "Journal Entry", "je", "work", <JournalEntryPanel doc={doc} dirty={dirty} canWrite={canWrite} summary={!saved} />);
  add(dt === "Payment Entry", "pe", "work", <PaymentEntryPanel doc={doc} dirty={dirty} canWrite={canWrite} onChange={onChange} summary={!saved} />);
  add(dt in QUICK_ITEM_DOCS, "quick-items", "work", <QuickItemsPanel doc={doc} onChange={onChange} canWrite={canWrite} />);
  add(dt === "Stock Entry", "stock-entry", "work", <StockEntryPanel doc={doc} />);
  add(dt === "Stock Reconciliation", "stock-recon", "work", <StockReconPanel doc={doc} />);
  add(dt === "Quotation", "quote-guide", "work", <QuotationGuidePanel doc={doc} />);
  // S5 approval path on drafts (configured Workflow, else the owner policy defaults + submit roles)
  add((INBOX_DOCTYPES as readonly string[]).includes(dt) && ds === 0, "approval-path", "control", <ApprovalPathPanel doctype={dt} doc={doc} />);
  add(PREVIEW_DOCTYPES.includes(dt) && ds === 0, "ledger-preview", "control", <LedgerPreviewPanel doctype={dt} doc={doc} />);
  add(!!partyOf(dt, doc), "party-mini", "insight", <PartyMiniPanel doctype={dt} doc={doc} />);
  add(saved && dt === "Item", "item-360", "insight", <Item360Panel doc={doc} />);
  add(saved && dt === "Asset", "asset-360", "insight", <Asset360Panel doc={doc} />);
  add(saved && dt === "Supplier", "supplier-360", "insight", <Supplier360Panel doc={doc} />);
  add(saved && dt === "Customer", "customer-360", "insight", <Customer360Panel doc={doc} />);
  add(saved && (dt === "Sales Invoice" || dt === "Purchase Invoice"), "invoice-banner", "insight", <InvoiceBannerPanel doctype={dt} doc={doc} />);
  add(saved && POSITION_DOCS.includes(dt), "purchase-position", "insight", <PurchasePositionPanel doctype={dt} doc={doc} />);
  add(saved && (dt === "Batch" || dt === "Serial No"), "batch-serial", "insight", <BatchSerialPanel doctype={dt as "Batch" | "Serial No"} doc={doc} />);
  add(dt in NEXT_STEPS, "next-doc", "flow", <NextDocPanel doctype={dt} doc={doc} />);
  add(saved && FLOW_DOCS.includes(dt), "doc-flow", "flow", <DocFlowPanel doctype={dt} doc={doc} />);
  add(dt === "Quotation" && !!doc["amended_from"], "quote-revision", "flow", <QuotationRevisionPanel doc={doc} />);
  add(dt === "Purchase Order" && !!doc["amended_from"], "po-revision", "flow", <RevisionPanel doctype="Purchase Order" doc={doc} />);
  add(saved && dt === "Sales Order" && ds === 1, "so-reservation", "flow", <OrderReservationPanel doc={doc} />);
  add(saved && dt === "Purchase Invoice" && ds === 1, "pi-asset-lines", "flow", <InvoiceAssetLinesPanel doc={doc} />);
  add(saved && (dt === "Material Request" || dt === "Request for Quotation"), "quote-compare", "flow", <QuotationComparePanel doctype={dt as "Material Request" | "Request for Quotation"} doc={doc} />);
  return out;
}
/** Legacy single-component slot (kept for hosts that render FormPanels directly): the same panels, organized in tabs. */
export function ProFormPanels(p: FormPanelProps) { return <DocPanelTabs doctype={p.meta.name} panels={proFormPanelList(p)} />; }

const ENTRY_CARDS = [
  ["/pro/finance", "Finance Control Center", "Exceptions first, then routine work — all from Core records."],
  ["/pro/accounts", "Chart of Accounts", "Search, expand and inspect the native account tree."],
  ["/pro/general-ledger", "General Ledger", "Core General Ledger report — same source, filters and totals."],
] as const;

/** DIGIT Pro finance entry cards on the app workspace (/plugins/digit_pro). */
function ProWorkspaceExtras() {
  return <section className="mt-4 grid gap-3 md:grid-cols-3" data-dp-finance-entry>
    {ENTRY_CARDS.map(([to, t, d]) => (
      <Link key={to} to={to} className="dp-card block hover:border-primary" data-dp-entry={to}>
        <span className="chip bg-primary/10 text-primary">Premium enhancement</span>
        <h2 className="mt-2 font-semibold">{t}</h2><p className="text-sm text-muted-foreground">{d}</p>
      </Link>))}
  </section>;
}

/** Primary DIGIT Pro contexts (Executive, the five departments, Reports Center) for the DIGIT Enterprise Home. */
const proModules = (): EnterpriseModule[] => CONTEXTS.filter((c) => c.kind !== "service" || c.id === "reports").flatMap((c) => {
  const t = c.home.target; if (t.kind !== "pro") return [];
  return [{ id: c.id, label: { en: c.label, ar: NAV_AR[c.label] ?? c.label }, to: t.to, ...(t.search ? { search: t.search } : {}), icon: c.icon }];
});
/** Source-backed DIGIT Pro indicators (counts of permitted native records; drill = native list with the same filters). */
const PRO_INDICATORS: EnterpriseIndicator[] = [
  { id: "pro-ar-open", doctype: "Sales Invoice", filters: [["docstatus", "=", 1], ["outstanding_amount", ">", 0]], tone: "attention",
    label: { en: "Unpaid sales invoices", ar: "فواتير مبيعات غير مسددة" },
    definition: { en: "Submitted Sales Invoices with an outstanding amount above zero", ar: "فواتير مبيعات معتمدة رصيدها المستحق أكبر من صفر" } },
  { id: "pro-ap-open", doctype: "Purchase Invoice", filters: [["docstatus", "=", 1], ["outstanding_amount", ">", 0]], tone: "attention",
    label: { en: "Purchase invoices to pay", ar: "فواتير مشتريات مستحقة الدفع" },
    definition: { en: "Submitted Purchase Invoices with an outstanding amount above zero", ar: "فواتير مشتريات معتمدة رصيدها المستحق أكبر من صفر" } },
  { id: "pro-so-open", doctype: "Sales Order", filters: [["docstatus", "=", 1], ["status", "in", ["To Deliver and Bill", "To Deliver", "To Bill"]]],
    label: { en: "Sales orders in progress", ar: "أوامر بيع قيد التنفيذ" },
    definition: { en: "Submitted Sales Orders still to deliver or to bill", ar: "أوامر بيع معتمدة لم تُسلَّم أو تُفوتر بالكامل" } },
  { id: "pro-je-draft", doctype: "Journal Entry", filters: [["docstatus", "=", 0]],
    label: { en: "Draft journal entries", ar: "قيود يومية مسودة" },
    definition: { en: "Journal Entries saved but not yet submitted", ar: "قيود يومية محفوظة ولم تُعتمد بعد" } },
];

export const digitProSlots: ExperienceSlots = {
  Sidebar: (p) => <ProSidebar {...p} />,
  Crumbs: (p) => <ProCrumbs {...p} />,
  useShellEffects: () => useOriginRecorder(),
  keepDrawerOn: (path) => keepDrawerOn(path),
  FormPanels: (p) => <ProFormPanels {...p} />,
  formPanelList: (p) => proFormPanelList(p),
  // ProCrumbs renders the source-aware "Back to …" chip on every Pro page
  ownsBack: true,
  // Journal Entry / Payment Entry panels install their own guard with the same message
  unsavedGuard: { except: ["Journal Entry", "Payment Entry"], message: { en: "You have unsaved changes. Leave without saving?", ar: "لديك تغييرات غير محفوظة. هل تريد المغادرة دون حفظ؟" } },
  gridKeyDown: (e) => gridKeyNav(e),
  dock: { icon: appIconFor("digit_pro", "dock")!, tile: true, label: "DIGIT Pro", label_ar: "ديجيت برو", short: "Pro", short_ar: "برو", home: "/pro/home", main: ["home", "digit_pro", "hrms", "crm", "insights", "reports"], moreIcon: "/icons/digit/ui/digit-ui-menu-light.svg" },
  enterprise: {
    description: { en: "Finance, selling, purchasing, inventory and fixed assets on the shared DIGIT records.", ar: "المالية والمبيعات والمشتريات والمخزون والأصول الثابتة على سجلات DIGIT المشتركة." },
    modules: proModules,
    indicators: PRO_INDICATORS,
    // owner ruling DEC-015 (2026-11-14): app access comes from the user's business role (finance, selling, buying, stock, assets)
    roles: ["Accounts User", "Accounts Manager", "Auditor", "Sales User", "Sales Manager", "Sales Master Manager", "Purchase User", "Purchase Manager", "Purchase Master Manager",
      "Stock User", "Stock Manager", "Item Manager", "Delivery User", "Delivery Manager", "Manufacturing User", "Manufacturing Manager", "Quality Manager", "Maintenance User", "Maintenance Manager",
      "Projects User", "Projects Manager", "Fleet Manager", "Report Manager", "Analytics", "System Manager"],
    owns: (dt) => PRO_OWNED.has(dt),
  },
  WorkspaceExtras: () => <ProWorkspaceExtras />,
  // the shared Core pages Pro's menus list open inside Pro (sidebar, "DIGIT Pro · department" eyebrow, section tabs under the band)
  // wrapped: the placement module cycles through the Shell, so its exports are read at call time, not at module load
  corePage: { places: (path) => placesCorePage(path), Eyebrow: () => <CorePageEyebrow />, Tabs: () => <CorePageTabs /> },
  linkBadge: (doctype) => DIGIT_PRO_PREMIUM.includes(doctype) ? <span className="ms-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground" data-premium>Premium enhancement</span> : null,
};
