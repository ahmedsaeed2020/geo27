/**
 * Customization layer (Phase 3). Empty by design: no customizations are
 * applied until the baseline is accepted. Every entry MUST fill all fields.
 * A preview customization here is NOT proof of a deployable Frappe change.
 */
export interface Customization {
  id: string;
  targetApp: "erpnext" | "hrms" | "crm";
  originalScreen: string;            // e.g. "Form: Sales Order" or "crm/frontend/src/pages/Deal.vue"
  targetDoctype: string;
  fieldnames: string[];              // canonical fieldnames touched
  originalBehavior: string;
  proposedBehavior: string;
  reusedFunctionality: string;
  uiChanges: string;
  newFields: { fieldname: string; fieldtype: string; label: string }[];
  newBackendBehavior: string;
  frappeMechanism: "Custom Field" | "Property Setter" | "Client Script" | "Server Script" | "Custom App" | "Workspace" | "Report";
  dependencies: string[];
  restoration: string;
  kind: "preview-only" | "deployable-spec";
}

export const customizations: Customization[] = [];
