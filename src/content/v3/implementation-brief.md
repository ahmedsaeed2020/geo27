# DIGIT WEBSITE V3 — EXECUTE THE COMPLETE APPROVED UPGRADE IN THE EXISTING LOVABLE PROJECT

## Goal / current checkpoint
You are working **inside the current DIGIT marketing website project (digit-erp.com)**, not ERPNext, not the DIGIT Pro enterprise application, and not a new project. Execute the previously agreed full **DIGIT Website V3** plan now, including a content-rich product-led website, a real operational Admin/CMS, and functional contextual lead forms. Do not respond only with a strategy, proposed design, screenshot gallery, or mock backend.

The previous Lovable report states that **49 authentic DIGIT Pro screenshots have ALREADY been integrated** on Home, Pro, Accounting, Sales, Purchasing, Inventory, Fixed Assets, Reports and Features; their lightbox, AR/EN captions and responsive views have been checked by that developer. **Verify the current branch and preserve/reuse this work. Do NOT re-upload, regenerate, duplicate, or reimplement those 49 images unless inspection proves a specific fault.** Preserve previous edits and existing product assets, pages, SEO, routes, admin data and customer submissions.

## Read the attached small handoff files in this priority
1. `01_EXECUTE_THIS_IN_LOVABLE.md` (this instruction; newest overrides older planning assumptions).
2. `02_RESEARCH_AND_BLUEPRINT.md` — agreed full website architecture, design and route map.
3. `03_FEATURE_TO_PAGE_MATRIX_42.csv` — 42 feature-story/page candidates, reference screenshot mapping, proposed CTA and evidence restrictions. These are CONTENT TARGETS, not all verified live claims.
4. `05_ADMIN_CMS_ARCHITECTURE_REFERENCE.md` — source-grounded admin/content/lead/SEO/media operating architecture and security expectations.
5. `04_ORIGINAL_LOVABLE_IMPLEMENTATION_GOAL_REFERENCE.md` — older long implementation goal, useful only where not superseded.
6. `06_PREVIOUS_PRO_SCREENSHOT_TASK_REFERENCE.md` — the earlier feature-image task, provided for continuity, NOT an instruction to repeat it.

Use the **current Lovable project repository and its current database/schema** as authoritative source. The historic exported `digit-erp-site_v2.zip` was the earlier baseline, but the active branch may be newer. Do not request the old 310 MB ZIP if you can inspect the project. If working in a different project, STOP before changes and report the mismatch.

## Explicit owner decision — lead notification destination (non-negotiable)
**Send internal notification emails for new valid demo/contact/consultation leads to exactly `a.saeed@trilogy.com.sa`.**
This email replaces any previous or draft recipient such as `ida.saed@rorigi.com.sa`.
- Store recipient server-side as a configurable Admin/system setting with this value as the approved default.
- Never place SMTP/API credentials in browser code. Do not misuse this email as the website's public sender address unless email-domain sending authorization is configured.
- Save every accepted lead securely to the website's lead database BEFORE attempting email notification.
- Use a verified email provider/server integration, durable outbox/retry and delivery-state audit. A green frontend success is proof of saved data, NOT proof that email was delivered.
- Perform an authorized test using synthetic lead details and confirm: DB saved, Admin inbox visible, notification accepted AND delivered (if provider available), recipient exact-match, retry/failure state. If provider or domain DNS is unconfigured, implement the adapter and report the exact missing secret/configuration or provider verification; do NOT claim working mail.
- Notification content: name, company, chosen contact method, product/feature, message, source URL and UTM, time, and lead record link where permitted. Do not send sensitive ERP data.

## Non-negotiable design and product rules
- AR-first RTL, equally complete `/en` experience; use existing brand official logo, current typography and approved green system. No rebranded template site.
- Product UI proof must use actual authorized DIGIT screenshots. Never generate fake ERP dashboards, numbers, invoices or reports. Generated Saudi environment/character backgrounds are optional context only.
- Use transferable ideas from Odoo (application discovery), Acumatica (industry workflows), Dynamics 365 (detailed product capabilities and tours), NetSuite (department/report hierarchy), SAP (solution/role hierarchy) and Daftra (Arabic-first clarity). Do NOT copy their proprietary imagery or layouts.
- Pages must have substantive feature stories and readable data, not 12 equal tiles or repeated 3-screenshot overlays. Different stories deserve different layouts: large Product Theater; interactive step-by-step workflow; Document-to-Decision; Role Dashboard Reader; Detail Spotlight; Report-to-Decision; context-and-product split. Show one readable UI focal screen at a time and provide zoom/full original.
- Public product claims must be separately verified: source spec is not a deployed feature; a screenshot alone does not prove end-to-end automation. Pro images already in the site must be mapped to their appropriate verified capability. HR/CRM/Construction/FSM material from older research must not be published as tested/live. Use draft/pending-proof status where needed, not fake screens.
- Do not publish unverified customer counts, ZATCA certification, automatic compliance, guaranteed savings, AI assistant, zero-variance or instant activation claims. Pro commercial CTA is Demo > Discovery > Scope > Quote. No unapproved public add-on prices.
- Preserve functioning routes or implement verified redirects; do not erase the 55 historical content documents or change the existing site architecture destructively. Keep current Starter and Pro scope separate and do not merge unrelated ERP application databases.

## EXECUTION: five concrete working stages — IMPLEMENT, TEST, REPORT; do not stop after a plan

### Stage 1 — Current-code audit and conversion foundation (P0)
Inspect the current project for App/Route/Home/Header/Footer/ImportedPage/ContactForm/admin/CMS/SEO/image library, current auth/data, current 49-screenshot sections and all lead-submission handlers. Establish a concise keep/change/add map, then make necessary changes.

Build a **reusable `ContextualLeadForm`/`LeadCapturePanel`** visible directly on every principal commercial page: Home, Pro, module/feature pages, HR, CRM, Construction, FSM (if marketable), industries, solutions, campaigns, demo and contact. Preserve any existing working forms and migrate rather than parallel duplicate backends.

Contact form fields: name, company, email and/or telephone (one verified reachable channel required), product/solution interest (prefilled by page), request type (Book Demo, Consultation, Discuss Scope), optional job role, optional message, privacy/consent notice. Hidden capture: page route, product, feature, industry, language, UTM/referrer, submission timestamp. Implement AR/EN validation, keyboard accessibility, success/error, anti-spam/rate limit and useful mobile CTA. Ensure primary CTA "احجز ديمو Digit" opens/focuses an actual in-page working form; secondary WhatsApp if relevant may use `https://wa.me/966595051150`. Do NOT leave all buttons as unqualified links to `/demo`.

Build server-side save with access-controlled lead table/inbox, anti-spam and notification pipeline to **a.saeed@trilogy.com.sa**. Protect leads against anonymous reads; verify authorization and do not accidentally expose customer contact details. Confirm server readback; test notification path separately. Keep audit trail and no accidental repeated mail on retries.

### Stage 2 — Home, navigation and product-led visual design (P0)
Replace/attenuate orbit-dominated first impression with a compelling first fold: true Pro product screenshot, sharp Saudi-market value proposition, clear booking CTA/form entry. Preserve older valid content by purposeful migration, not deleting everything.

Build a clear responsive **Product Mega Menu / App Explorer**, searchable or navigable by product, department, problem, role and industry, and with working Arabic/English routes. The homepage should have distinct visual rhythm: real product hero; product family switcher; App Explorer; workflow story Sales → Stock → Finance; screen-led feature theater; business role journeys; industry solutions; reports/outputs; localization + credibility; resources; FAQs; conversion. Do not place stale/free-trial promises or publish unavailable product screens. Preserve existing Pro 49-image showcase and improve its placement instead of rebuilding it.

### Stage 3 — Deep product, module, industry and resource pages (P1)
Use the 42-row matrix as the content-to-page checklist. Improve existing routes before introducing new pages. For each relevant product/feature page, show the user job, business problem, exact workflow, documents/actions, actual product screens, useful report or output, connected capabilities, resources/FAQ, SEO and contextual CTA/form. Keep pages content-rich but with purposeful hierarchy, not filler.

- Pro: retain genuine existing screenshot sections, expand real Finance / Sales / Purchasing / Inventory / Fixed Assets user journeys and reports.
- HR: employee lifecycle/360, recruitment, attendance/leave, payroll and ESS; only assert currently verified functions. If screenshots lack current approval, make content an internal CMS draft and include capture tasks.
- Construction: Project 360, Tender/BOQ, Budget & Cost, Contracts/Claims, Site/Resources, Reporting; separate research Atlas claims from actual deployed evidence and keep unverified chapters in draft.
- CRM: lead/Account 360, opportunities, follow-up, sales handoff and reports; gate product availability and evidence.
- FSM/ITM: site/equipment, dispatch, visits/inspection, defects/retest/close; gate public launch and evidence.
- Industry and landing pages: tailored role/job use cases and contextually relevant forms, not copy-pasted modules.

Create/upgrade **Resource Hub** for guides, PDFs, FAQs, feature explainers, product tours and related articles using existing approved media. Each asset requires owner/source, correct URLs and publishing status. Do not fabricate downloadable manuals or video assets.

### Stage 4 — FULL working Admin CMS (P0 for launch readiness)
Extend the current website Admin **using existing code, authentication, database and roles**, taking compatible design patterns from the supplied CMS reference. Provide actual working admin pages/components, not screenshots, nonfunctional mock controls or raw JSON input as the only content editing surface.

Admin navigation and functionality:
1. **Overview:** activity, new Leads and site health (real data; no invented KPI counts).
2. **Pages & Visual Block Editor:** list/search/create/edit page, arrange approved blocks, preview AR/EN desktop/mobile, draft/review/publish/unpublish, revision history and rollback. Keep current routes and existing contents via migration/fallback.
3. **Products, Modules, Industries, Features & Stories:** CMS data drives text, content sections, screenshot binding and internal links without hard-coded edits per page.
4. **Media Library:** upload/select/replace image, correct alt AR/EN, crop/focal point, storage, source/version, and publication approval; keep original real product screenshots immutable and separate from derivatives. Do not accept arbitrary dangerous SVG/scripts without sanitization.
5. **Navigation & Footer:** menu labels/routes/order, Product Mega Menu and footer sections editable within guardrails.
6. **Brand Settings:** authorized logo/favicon/assets, approved colors/fonts/tokens and CTA text with preview; don't replace official logo without owner approval.
7. **SEO Editor:** AR/EN title, description, canonical, hreflang, OG media, indexability, sitemap/redirect controls, on published canonical pages; preserve server-rendering.
8. **Forms & Leads Inbox:** configure visible form/page mapping, inspect new submissions, filter/search, lead statuses, assignment and exports with correct permissions, notifications to **a.saeed@trilogy.com.sa**, email delivery audit and retry; no public access to private lead data.
9. **Resources:** guides, PDFs, articles, FAQs and tour/video records with content approval and related product links.
10. **Users/Roles/Audit:** Owner/Admin, Editor and Sales access partitioning; show content changes/publishing/lead actions; secure session and authorization.

Use a robust server-side content model and privacy-preserving storage. Provide real draft/publish behavior: visitor sees only approved PUBLISHED revisions; editors see signed preview; cache invalidation/SSR updates upon publish. Verify AR/EN sync where applicable. Do not copy Trilogy private DB, customers, personnel or credentials into Digit; reuse UI/workflow patterns only.

### Stage 5 — SEO/brand/performance, E2E verification and launch handoff (P0)
Correct known duplicate or wrong sector labels/links, copied industry text, unsupported customer count and free-trial wording. Fix SEO: distinct AR/EN semantic content, page-localized metadata, reciprocal canonical/hreflang, structured data based on approved visible claims, meaningful screenshot alt, sitemap based on published pages, internal links/breadcrumbs and redirect preservation. Avoid thin duplicate search pages.

Optimize image dimensions/sizes, lazy secondary media (NOT the LCP hero), full-resolution lightboxes, loading and layout stability. Verify desktop/mobile RTL & EN, accessibility keyboard/focus, reduced-motion and no sideways scroll. Keep forms accessible and secure.

Perform real tests in an authorized development/preview environment:
- Recheck ALL 49 Pro images and existing route behavior;
- Home and 5 principal product journeys in AR and EN, responsive desktop/mobile;
- Public anonymous lead submits synthetic test record; Admin authorized user sees it; unauthorized user CANNOT read it;
- Email notification to `a.saeed@trilogy.com.sa` delivered and log shows success, or report exact missing external-provider config;
- Admin editor makes a copy change, previews draft, publishes, sees it publicly, then rolls back successfully;
- Media replacement shows correct approved published asset and no layout shift;
- SEO metadata/canonical/sitemap update on CMS publish;
- Existing price/product copy and ZATCA claims remain approved; No invented product UI/functional claims;
- Build passes and existing essential functionality remains intact.

Deliver a concise execution report: **implemented** files/routes/components/schema/migrations; **verified** tests with evidence; **blocked** prerequisites; **remaining** tasks and realistic publish readiness. Attach actual screenshots of Home, representative product/feature page and Admin (Pages editor + Media + Leads), plus successful test evidence without private customer data.

## EXECUTION BOUNDARIES
- You are authorized to work in the EXISTING Lovable project and the approved development/preview environment. You are NOT authorized by this prompt to push to the public production domain without explicit user publish approval.
- If actual email sending configuration, authentication permissions, schema migrations or DNS settings require an action from the owner, implement what is permissible in the current environment, report exactly what remains and proceed on other independent work. Do not report full readiness when a lead submission or required Admin operation is still only mocked.
- Do not issue another speculative plan or ask to recreate inputs already in the project. Implement the agreed stages in order with minimal diffs and a coherent final result. When scope exceeds one run, preserve a checkpoint and proceed to the highest-impact working deliverable; distinguish completed work from backlog.

## Completion criterion
The result is **not** merely a beautiful site. It is an Arabic-first, product-led DIGIT marketing website with substantive approved page content, authentic Pro screen proof, purposeful HR/CRM/Construction/FSM draft/public evidence controls, contextual lead generation with recipient `a.saeed@trilogy.com.sa`, and a real secure Admin/CMS capable of editing, previewing, publishing, managing images, SEO, forms and leads without Lovable edits for every normal content change. Do not claim completion until both public flows and Admin back office are tested.
