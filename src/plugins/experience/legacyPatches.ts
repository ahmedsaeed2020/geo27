/**
 * Register of the Enterprise host's runtime UI patches (owner brief 2026-11-10 "LOVABLE NEXT GOAL" §1–§4).
 *
 * The hosted DIGIT Enterprise build (frappe_apps/digit_enterprise, owner archive digit_enterprise-main.zip) serves a
 * frozen bundle of this Core (release_source 686dc86) and lazy-loads app overlay scripts on top of it
 * (public/js/screen-assets.js → pro-sections.js on Pro routes, con-screens.js on Construction routes). Those scripts
 * never run in this preview and are not edited here. Each behaviour they apply is listed once with what owns it now:
 *
 *  - SOURCE_OWNED  the current Core source already renders it (evidence = source path + a check of this run);
 *  - MIGRATED      moved into app source in this run (replacement + test + rollback);
 *  - KEEP_SERVER   needs a Frappe server method / host data this preview cannot call — stays a host behaviour;
 *  - KEEP_HOST     fills an address the frozen bundle lacks; retiring it depends on the hosted build moving forward.
 *
 * `retire` is the exact step the Enterprise owner takes in the host app once the hosted build carries this Core; the
 * DOM contract markers (data-dp-tab-contract="run11-3", data-dp-reports-contract="source-v1") let a host guard skip the
 * patch as soon as the source-owned markup is present.
 */
export type PatchStatus = "SOURCE_OWNED" | "MIGRATED" | "KEEP_SERVER" | "KEEP_HOST";
export interface LegacyPatch {
  id: string;
  script: string;
  functions: string;
  selector: string;
  behaviour: string;
  status: PatchStatus;
  owner: string;
  replacement?: string;
  evidence: string;
  test?: string;
  rollback?: string;
  retire: string;
}

export const ENTERPRISE_PATCH_SOURCE = "digit_enterprise-main.zip · digit_enterprise/public/js (release_source 686dc86)";

export const LEGACY_PATCHES: LegacyPatch[] = [
  {
    id: "ent.pro-sections.three-tabs", script: "pro-sections.js", functions: "threeTabs()",
    selector: "main [data-dp-section-tabs] a[data-dp-section-tab-link]",
    behaviour: "Hide the old Work / Details tab links and relabel the rest to Dashboard · Documents & work · Full reports.",
    status: "SOURCE_OWNED", owner: "digit_pro", replacement: "src/plugins/digit_pro/SectionWorkspace.tsx (RUN11_TABS, data-dp-tab-contract=\"run11-3\") + /pro/$dept_/$section beforeLoad redirect of ?tab=work|details",
    evidence: "Browser 2026-11-10: 20/20 workspaces render exactly the three approved tabs; legacy threeTabs() dry-run finds 0 links to hide and 0 labels to change (ENT_03).",
    test: "src/plugins/digit_pro/proRepairs.test.ts (three tabs)",
    retire: "Guard threeTabs() with `if (document.querySelector('main [data-dp-tab-contract=\"run11-3\"]')) return;` or delete it once the hosted build is this Core.",
  },
  {
    id: "ent.pro-sections.reports-dedupe", script: "pro-sections.js", functions: "reportKey() + dedupeReportsTab()",
    selector: "main [role=tabpanel][data-dp-tabpanel] a[href] (ACC workspaces)",
    behaviour: "On the Reports tab, supersede a second link to the same report destination (path + non-underscore query).",
    status: "MIGRATED", owner: "digit_pro", replacement: "src/plugins/digit_pro/reportTab.ts reportTabEntries() — one entry per destination across the whole tab, all 20 workspaces",
    evidence: "Before: dry-run of the verbatim legacy logic on 40 tabs (20 × AR/EN) superseded 0 links; after: still 0, and the source now keys by destination instead of label + target.",
    test: "src/plugins/digit_pro/reportTab.test.ts",
    rollback: "Revert reportTab.ts and the Reports() wiring in SectionWorkspace.tsx (git revert of this change); the host patch keeps working unchanged.",
    retire: "Guard dedupeReportsTab() with `if (panel.querySelector('[data-dp-reports-contract]')) return;`.",
  },
  {
    id: "ent.pro-sections.reports-clear-label", script: "pro-sections.js", functions: "clearLabel() + relabel()",
    selector: "main [role=tabpanel][data-dp-tabpanel] a[href] text nodes (ACC workspaces)",
    behaviour: "Rename ambiguous report labels: ملخص دفتر الأستاذ → ملخص دفتر أستاذ العملاء / الموردين; القوائم المالية / Financial Statements (the /pro/statements hub) → مركز القوائم المالية / Financial statements center.",
    status: "MIGRATED", owner: "digit_pro", replacement: "src/plugins/digit_pro/reportTab.ts CLEAR_LABEL (rendered with data-dp-label-clarified)",
    evidence: "Before: the legacy dry-run would relabel 7 entries (ACC-DUES ×2, ACC-REPORT ×2 incl. EN, SEL-CUSTOMER, SEL-INTEL, PUR-SUPPLIER); after: 0 — the source already shows the clear labels.",
    test: "src/plugins/digit_pro/reportTab.test.ts",
    rollback: "Revert reportTab.ts CLEAR_LABEL; labels fall back to the shared translation.",
    retire: "Same guard as reports-dedupe (both run inside dedupeReportsTab()).",
  },
  {
    id: "ent.pro-sections.server-sections", script: "pro-sections.js", functions: "render() / reportsBlock() / docsBlock() / markConfig()",
    selector: "main [role=tabpanel][data-dp-tabpanel] (appends [data-pro-section])",
    behaviour: "Append server-backed section blocks read from digit_pro.api (get_section / get_product_registry) on the Frappe host.",
    status: "KEEP_SERVER", owner: "digit_pro (server) + digit_enterprise (host)", evidence: "Needs DIGIT Pro whitelisted methods; this preview never calls Frappe.",
    retire: "Owner decision after staging: move into the hosted Core build as a server-backed adapter, or keep as host overlay.",
  },
  {
    id: "ent.pro-sections.exception-badges", script: "pro-sections.js", functions: "renderBadges()",
    selector: "Pro sidebar workspace links",
    behaviour: "Show per-workspace exception counts from digit_pro.api workspace_exception_counts.",
    status: "KEEP_SERVER", owner: "digit_pro (server) + digit_enterprise (host)", evidence: "Server method only; no virtual equivalent is claimed.",
    retire: "Owner decision after staging.",
  },
  {
    id: "ent.con-screens.host-screens", script: "con-screens.js", functions: "screen renderers for bundle-missing Construction addresses + Project 360 management section",
    selector: "Construction routes of the frozen bundle (main)",
    behaviour: "Render Construction screens the frozen 686dc86 bundle lacks and append a server-sourced Project 360 section; Construction owns calculations, DocTypes and permissions.",
    status: "KEEP_HOST", owner: "digit_construction (data) + digit_enterprise (host)", evidence: "This Core renders the R19 workspaces, the 10 shared R19 pages and Project 360 from app source (experience registry); the host script exists only because the hosted bundle is older.",
    retire: "Retire per address once the hosted build carries this Core and a staging check shows the source page; not before.",
  },
];
