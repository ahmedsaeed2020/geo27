- CRM uses authenticated server functions and assignment-scoped RLS; never fetch private records through the privileged client.
- Existing landing submissions enter CRM through the contact_requests trigger so legacy forms remain unchanged.
- CRM users override legacy Sales access; inactive users must not retain CMS privileges.

## DIGIT Core CRM (pack) component rules
- CRM list filtering (quick, advanced, saved views) is evaluated by one applyView/matchFilter in src/components/crm/CrmViewBar.tsx, so List, Group By and Kanban always show the same records.
- CRM list screens for Contacts, Organizations, Call Logs, Notes and Tasks share src/components/crm/CrmDirList.tsx (kind config in src/lib/crm.ts CRM_DIR/DIR_COLUMNS/DIR_KANBAN), so every directory list gets the same views and bulk actions.
- CRM UI strings go through useL() (crmI18n.ts), which renders Arabic until hydration so SSR and first client render match.
- Archived CRM SVG templates are rendered declaratively by CrmIcon, including prop variants, so source icons need no Vue runtime or redesign.
- CRM settings editors persist source-shaped records through the adapter and overlay saved field layouts, so every view shares edits without modifying the catalog.
- CRM automation runs through crmAutomation adapter hooks; external I/O and durable waits remain server-dependent, so local trials cannot imply live Frappe execution.
- CRM email composition and replies use crmEmail and create Communication plus Email Queue records without claiming delivery, so activity and outbox show the same message.
- CRM products tables render through CrmProducts from CrmField and use crmLogic totals, so layout editors cannot create a duplicate or stringified product grid.
- CRM profile and template editors keep source-shaped User and Email Template fields in the adapter, so the email composer reads the same saved templates.
- Enrichment settings use crmEnrichment normalization and preserve source child-pattern identities, so editing rules cannot discard hidden patterns.
- CRM General/Brand settings use FCRM Settings and Defaults uses System Settings with source field names, so global formatting and saved branding share authoritative records.
- Native CRM lists/records here are the shared superset used by every app; apps add columns, highlights, inspectors and insights only through `listExt.ts` registrations, so native behaviour stays identical when no app is active.
