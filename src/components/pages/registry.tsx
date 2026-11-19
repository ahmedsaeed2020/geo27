import type { ComponentType } from "react";
import * as F from "./FrameworkPages";
import * as E from "./ErpPages";

/** Source Desk Page inventory (frappe, erpnext, hrms: page/NAME/NAME.json). Keys are the Page `name` (route) from source. */
export const DESK_PAGES: Record<string, { title: string; app: string; module: string; source: string; component: ComponentType }> = {
  "backups": { title: "Download Backups", app: "frappe", module: "Desk", source: "frappe/desk/page/backups", component: F.Backups },
  "component-explorer": { title: "Component Explorer", app: "frappe", module: "Core", source: "frappe/core/page/component_explorer", component: F.ComponentExplorer },
  "dashboard-view": { title: "Dashboard", app: "frappe", module: "Core", source: "frappe/core/page/dashboard_view", component: F.DashboardView },
  "desktop": { title: "Desktop", app: "frappe", module: "Desk", source: "frappe/desk/page/desktop", component: F.DesktopPage },
  "permission-manager": { title: "Role Permissions Manager", app: "frappe", module: "Core", source: "frappe/core/page/permission_manager", component: F.PermissionManager },
  "print": { title: "Print", app: "frappe", module: "Printing", source: "frappe/printing/page/print", component: F.PrintPage },
  "print-format-builder": { title: "Print Format Builder", app: "frappe", module: "Printing", source: "frappe/printing/page/print_format_builder", component: F.PrintFormatBuilder },
  "setup-wizard": { title: "Setup Wizard", app: "frappe", module: "Desk", source: "frappe/desk/page/setup_wizard", component: F.SetupWizard },
  "workflow-builder": { title: "Workflow Builder", app: "frappe", module: "Workflow", source: "frappe/workflow/page/workflow_builder", component: F.WorkflowBuilder },
  "workspace-restore": { title: "Restore Workspace Edits", app: "frappe", module: "Desk", source: "frappe/desk/page/workspace_restore", component: F.WorkspaceRestore },
  "bom-comparison-tool": { title: "BOM Comparison Tool", app: "erpnext", module: "Manufacturing", source: "erpnext/manufacturing/page/bom_comparison_tool", component: E.BomComparison },
  "point-of-sale": { title: "Point of Sale", app: "erpnext", module: "Selling", source: "erpnext/selling/page/point_of_sale", component: E.PointOfSale },
  "production-plan-visualizer": { title: "Production Plan Visualizer", app: "erpnext", module: "Manufacturing", source: "erpnext/manufacturing/page/production_plan_visualizer", component: E.ProductionPlanVisualizer },
  "sales-funnel": { title: "Sales Funnel", app: "erpnext", module: "Selling", source: "erpnext/selling/page/sales_funnel", component: E.SalesFunnel },
  "shop-floor": { title: "Shop Floor", app: "erpnext", module: "Manufacturing", source: "erpnext/manufacturing/page/shop_floor", component: E.ShopFloor },
  "stock-balance": { title: "Stock Summary", app: "erpnext", module: "Stock", source: "erpnext/stock/page/stock_balance", component: E.StockBalance },
  "visual-plant-floor": { title: "Visual Plant Floor", app: "erpnext", module: "Manufacturing", source: "erpnext/manufacturing/page/visual_plant_floor", component: E.VisualPlantFloor },
  "warehouse-capacity-summary": { title: "Warehouse Capacity Summary", app: "erpnext", module: "Stock", source: "erpnext/stock/page/warehouse_capacity_summary", component: E.WarehouseCapacity },
  "organizational-chart": { title: "Organizational Chart", app: "hrms", module: "HR", source: "hrms/hr/page/organizational_chart", component: E.OrgChart },
};
