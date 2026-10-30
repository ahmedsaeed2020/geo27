# DIGIT Website V3: Complete Product-Led Redesign and Content Expansion Blueprint

Prepared: 2026-10-28. Scope: **upgrade the uploaded `digit-erp-site_v2.zip` in place**, preserving existing routes, source, CMS/backend, SEO equity, brand, and working integrations. **This is a design/architecture/content execution plan, not a production implementation or live-browser acceptance report.**

## 0. Executive decision

The previous collage-based screenshot concepts must NOT serve as the macro design system. They are not a satisfactory marketing treatment. The website should be a premium, Saudi-first B2B software product experience with three connected discovery paths: **by product, by industry, by business problem/role**. Product screens should be large, readable and context-rich. A real workflow should control the storytelling and placement, not the available number of screenshots.

Core proposition: "Find the right Digit application; see the actual workflow; understand its output; book a contextual demonstration without leaving the page." Preserve the current React/TanStack Start application. Recompose the page experience using reusable components, not a generic page replacement.

## 1. Evidence and authority

### Files examined
- Current website: `digit-erp-site_v2.zip` / inspected source at `siteaudit/digit/` (React 19, TanStack Start, Tailwind, imported JSON content, 55 content manifest pages, bilingual routes, Supabase contact requests).
- Pro screenshots: `Archive(10).zip` (524 PNG, grouped as feature/report/workspace/Enterprise development captures; may include historical/pre-release states).
- Pro feature evidence: `DIGIT_Feature_Visual_Kit_20261028/FULL_PRO_321_FEATURE_EVIDENCE.csv` (321 listed candidates: 67 COMPLETE_VERIFIED, 127 IMPLEMENTED_NEEDS_UAT, 52 STAGING_WRITE_TEST_REQUIRED, 37 CONFIGURATION_REQUIRED, 27 OWNER_POLICY_REQUIRED, 4 PARTIAL, 4 EXTERNAL_DEPENDENCY, 2 DEFERRED_APPROVED, 1 NOT_APPLICABLE_VERIFIED). Even `COMPLETE_VERIFIED` in this index must be cross-checked against current product/release and owner approval before public promises.
- HR: `DIGIT_HR_V8_PRODUCT_STANDARD_SYNTHESIS_20261027(1).zip` (31 HR families and 234 researched capabilities; expressly NOT proof those capabilities are deployed).
- CRM: `DIGIT_CRM_UPDATED_SOURCE_FINAL(2).zip` (Frappe CRM v0.7.0 source/disposable bench evidence; latest frontend handoff not built/installed/tested).
- Construction: `DIGIT_CONSTRUCTION_UPDATED_SOURCE_FINAL(2).zip` (Frappe app 1.0.0rc1 and frontend source; release docs describe disposable-site testing while latest frontend changes remain unbuilt/untested).
- FSM: `DIGIT_FSM_FRAPPE_V16_FINAL(1).zip` (32 DocTypes, five workflows, 20 reports, 30 KPIs; source-complete and RUNTIME_NOT_TESTED per README).
- Marketing library previously extracted from website: 125 marketing images plus icons, separate from real product screenshots.
- Site design screenshots `digit_research/reference/00-hero-desktop.png`, `04-modules-desktop.png`, and companions; visual audit of source-captured screenshots, not verified live pages.

### Benchmark mechanisms, not identities
- Odoo: app discovery, categorized index, feature depth: https://www.odoo.com/ar/page/all-apps ; https://www.odoo.com/app/accounting-features
- Daftra: Arabic feature explanations, problem/use-case categorization, industry chooser: https://www.daftra.com/features/sub_feature/11 ; https://www.daftra.com/%D9%85%D8%AC%D8%A7%D9%84-%D8%A7%D9%84%D8%B9%D9%85%D9%84/
- Acumatica: industry solution + guided product experience + customer/resources architecture: https://www.acumatica.com/industries/construction/
- Microsoft Dynamics 365 Business Central: role/function chapters, product demo/learning content: https://www.microsoft.com/en-us/dynamics-365/products/business-central
- NetSuite: hierarchical product capability and module library: https://www.netsuite.com/portal/products.shtml
- SAP: solution/business function portfolio, trust and enterprise information architecture: https://www.sap.com/products.html
- Google SEO official references: https://developers.google.com/search/docs/appearance/google-images and https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics

No benchmark site's branding, trademarks, source imagery or proprietary UI should be copied. Transfer only the discoverability, explanation and interaction mechanisms.

## 2. Current site: source-grounded assessment

| Area | Actual source | Observed concern | Required change | Priority |
|---|---|---|---|---|
| Hero | `src/sections/Hero.tsx` | Large Orbit/chip animation (desktop content begins around 600px top padding) puts decoration before product proof; headline + two demo links but no product view | New two-column (RTL) product-first hero with first-party screenshots, real contextual CTA form entry | P0 |
| Home page sequence | `src/components/HomePage.tsx` | `Hero -> TrustStrip -> ChaosToControl -> ProductBand -> Modules -> Capabilities -> ProblemConveyor -> Industries -> SaudiLocalization -> Faq -> FinalCta` | Reorder around product discovery, workflow proof, buyer role, industries and conversion; retain valid existing copy/sections in reworked positions | P0 |
| App grid | `src/sections/Modules.tsx` | 12 equal-format icon cards with three bullet phrases each, no visual work demonstration | Replace uniform grid with grouped application explorer and featured journeys; no extra app claims | P1 |
| Industry selection | `src/sections/Industries.tsx` | Full-bleed image-background 8-tile grid, hover-based; Education and Operations & Maintenance text repeats pharmacy copy and O&M links to healthcare | Replace with industry selector + product-fit panel; fix source copy and routes immediately | P0 |
| Header | `src/components/Header.tsx` and `src/content/site/navigation.json` | Six broad groups, 12-item Module and Services menus; duplicated Construction/Manufacturing entries; universal 'try free' button | Product/Industry/Solutions/Resources/Services/Pricing mega-navigation, CRM/HR/Construction/FSM as product hubs, contextual demo CTA | P0 |
| Imported pages | `src/components/ImportedPage.tsx` and `src/content/site/*.json` | 55 content page manifests; HTML injected through generic node renderer, shared page-scene stock imagery; only `/demo`,`/demo-3`,`/contact-4` get embedded `ContactForm` | Preserve legacy pages and route SEO; add typed story blocks and per-page conversion sections; migrate content to CMS gradually | P0 |
| Visual asset mapping | `src/content/page-scenes.json`, `src/components/PageScene.tsx` | Per-page background/body photos but no consistent product screenshot proof system | Central media registry with roles, crop coordinates, version, feature ID and optional annotations | P1 |
| Lead capture | `src/components/ContactForm.tsx` | Client-side `contact_requests` insert, name/email/phone/company/message; not attached to every product page; no proven notification delivery | Server-validated lead endpoint, forms embedded on every commercial page, attribution, email queue, consent and CRM handoff | P0 |
| SEO | `src/lib/seo.ts`, `src/routes/*` | Central canonical, alternate languages, JSON-LD exist; home has >200 customers claim while Hero has >50; unknown claim verification; risk of stale page copy | Claim approval register, unique localized metadata, content-scoped schema, hreflang validation, per-feature internal linking | P0 |
| Language | `src/lib/i18n*`, `/en/*` routes, EN translations | App supports RTL/LTR but localized page copy needs full editorial control | Field-level AR/EN CMS content; own translated headlines/alt/metadata, no machine-only fallback for core pages | P1 |
| Admin | `src/routes/_authenticated/admin.tsx` | Operational/admin settings and JSON fields are not a full content site builder | Reuse appropriate Trilogy CMS patterns without copying tenant data; permissions, drafts, preview, media, form and SEO builders | P2 |
| Product trust | e.g. `src/sections/Hero.tsx`, `src/lib/seo.ts` | Conflicting '50' vs '200' customer claim; free-trial/button wording without universal verified offer | Remove conflicting unsupported numbers and 'try free' until confirmed per package | P0 |

Additional architecture note: contact, chat and event storage require isolation of public insert from private read. Source `drizzle/migrations/0000_create_site_backend.sql` should be checked for open anonymous-read policies before exposing CRM/lead or conversation admin. Never copy company records or any private Trilogy content into Digit.

## 3. New navigation and Information Architecture

**Top navigation (desktop)**
1. PRODUCTS: DIGIT Starter; DIGIT Pro; HR & HCM; CRM; Construction; Field Service (FSM/ITM); [other explicitly verified products]. Display verification/published availability by product and *do not* imply each is included in Pro.
2. SOLUTIONS: CFO & Finance, Sales & Customers, Purchasing, Inventory & Distribution, HR Manager, Contractors, Field Operations; problem-based routes.
3. INDUSTRIES: Contracting, Retail, Manufacturing, Distribution, Professional Services, Education, Healthcare, Field Services (only approved business fit), and legacy industry routes.
4. TOUR & RESOURCES: Product tours, actual screenshots/videos, resource hub, FAQs, deployment guides when approved, use-case explainers.
5. SERVICES: Discovery, Implementation, Customization, Training, Migration, Support, ZATCA connection as independently scoped services.
6. PRICING: Starter / Pro (and request an individual scope for separate app products).
7. Fixed CTA: BOOK A DEMO. Separate WhatsApp utility (verified number `966595051150`) and AR/EN switch.

**Preserve all established URLs**, including `/modules/accounting`, `/modules/sales`, `/modules/purchasing`, `/modules/inventory`, `/modules/fixed-assets`, `/modules/hr-payroll`, `/modules/crm`, `/modules/contracting`, `/industries/contracting-industry`, `/services-3`, `/pricing`, `/pro`, `/starter`, `/demo`. Consider new product-hub routes `/products/pro`, `/products/hr`, `/products/crm`, `/products/construction`, `/products/fsm` as additive. Determine canonical/hreflang per distinct user intent; avoid duplicate canonical content. Audit old/new route redirects before applying any 301. Add `/resources`, `/product-tours`, `/solutions/{role-or-problem}`, `/industries/field-services` if the content is approved.

**Mega menu anatomy**: right rail by product family -> selected family's short pain-based description -> 3 featured links ('Overview', 'Key Capabilities', 'See Real Screens') -> relevant industry -> 'Book a specific demo'. On mobile use accessible accordion/drawer with permanent action button and no hover-only traps.

## 4. Home page V3: exact vertical structure

01. **Compact utility/header**: brand logo preserved, main mega nav, language, Demo and WhatsApp. No floating menu noise.
02. **Above-the-fold Hero**: right side 42% copy, left 58% product proof on desktop (flip naturally for LTR); display one real executive/cash/sales view at a readable size; 2 real UI snippets beside/below not overlapping critical labels. Headline about connected operations (no invented superlative). Secondary links 'Explore Applications' and 'See How It Works'. Include inline micro lead form or a persistent 'Book Demo' CTA; no fake trial offer. Use approved original logo SVG.
03. **Product family switcher**: Pro / HR / CRM / Construction / FSM; each changes description, proof image(s), and relevant CTA. Do not display unverified screenshots as current product.
04. **Application explorer**: four grouped categories (Finance & Core Operations / Customers / People / Projects & Field) with 5-7 visible choices + progressive 'View all'; distinguish integrated departments from separately scoped apps.
05. **Signature workflow**: choose e.g. Sales --> Purchase/Inventory --> Accounting --> Management reports. A horizontal step sequence with one true screen per step, synchronized caption and final decision/output; do not mix unrelated source screens.
06. **Feature Theater**: one feature at a time with big screen, brief callout, 2 proof details; toggles for View/Workflow/Report; content sourced from feature-story registry.
07. **Industry selector**: choose Construction / Trade & Distribution / Retail / Professional Services / Field Operations. Replace hover-grid with tab/panel and action-bound primary link.
08. **Role selector**: CFO, Sales Manager, HR Manager, Project Director, Service Manager. Change the specific question, featured report and recommended tour.
09. **Localization and deployment**: proof-oriented factual Arabic/English, hosting and ZATCA *scoped* language, no government seals or unsupported certification.
10. **Resources & education**: 3-5 genuine, owned resources; feature guides, checklists, system walkthroughs, FAQ. Do not publish empty or fabricated PDFs.
11. **Frequently asked questions**: package/scope/training/implementation/availability separated; claims validated.
12. **Conversion terminal**: embedded tailored lead form, contact and WhatsApp, clear disclosure that submitting a demo request is not an instant trial.
13. **Footer**: product, industry, resources and contact routes; privacy/terms; validated corporate identity and social links.

### Home page motion grammar
- Product transitions: 200-400ms crossfade or content swap; user-controlled feature tabs, not automatic nonstop rotation.
- Only one strong hero image or software video loop; low-motion default, reduced-motion support; no heavy 3D orbit above the product.
- Step connector motion highlights relationship between documents; no meaningless floating UI cards.
- Mobile: stack copy -> readable product screen -> module chips -> CTA; avoid micro thumbnails and horizontal overflow.

## 5. Product visual system: replace collages with SEVEN disciplined story patterns

**V1 Product Theater (Pro/CFO home)**: one 65-75% width real screen at minimum legible width, with a real output/report excerpt within a smaller secondary panel. Only one focal element. Primary screenshot displayed accurately with original labels; no re-drawn KPIs.

**V2 Workflow Filmstrip (Selling / Procurement / Construction / FSM)**: 3-5 ordered screens connected by verb+output: customer record -> quotation -> sales order -> invoice; or BOQ -> estimate -> contract -> certified claim; or site -> job -> inspection -> deficiency -> retest. Only step in focus is large; other steps show small contextual previews; transitions triggered by clicks/scroll. Text sits in HTML, not permanently flattened into image.

**V3 Detail Microscope (Inventory/Accounting)**: full master form or register with an anchored zoom window revealing *only* a precise highlighted field/table/status from the same UI. The zoom has a visual connection to the source area. Do not splice metrics from unrelated states or create false cross-screen causality.

**V4 Role Dashboard Reader (CFO, HR Manager)**: lead with one decision question and one legible dashboard. Under it are three 'What you can answer' toggles, each switching to the source report (not just decorative metrics).

**V5 Context-to-System Split (Construction/Field Service)**: real contextual photography as LEFT/RIGHT support, real software as proof in another zone, not semi-transparent on photo. Contract photo -> BOQ/Estimate UI -> retention/cost output. Human photo may be generated only for context, never as false proof of a customer/project.

**V6 Document-to-Decision (AR/AP, payroll, contracting certificates)**: real document preview -> exception/reconciliation -> resulting report/ledger, with explicit source names and states. Never imply accounting posting without verified operational evidence.

**V7 Device Journey (Technician/ESS)**: desktop dispatch/team UI next to a true mobile task UI; require authentic mobile app screenshot; DO NOT fabricate mobile screen merely by cropping a desktop view into a phone frame.

Reject previous universal three-window overlay treatment. It is acceptable for a supplementary small gallery but not the primary page architecture. Product screenshots remain separate editable assets; CSS/HTML controls create clean composition.

## 6. Per-product commercialization playbook

### 6A DIGIT Pro (evidence: Run11.1 images + feature register)
Buyer: CFO, finance head, sales operations, purchasing, warehouse and fixed-assets managers.
Core positioning: linked finance-to-operations, not generic 'all apps fully delivered'.
Page sequence: hero financial dashboard -> five departmental selectors -> 4 practical workflows -> report outputs -> localization/service scope -> specific demo form.
Major proof chapters and screenshot/source choices (candidate, verify current screenshots):
1. CFO management: `EXEC_home_ar.png`, `E2`, `E3`; focus cash outlook and exception decisions.
2. Accounting: `WS_ACC-CASH_overview_ar.png`, `F1`, `F11`; explain journal review/period close; exact screens must be checked.
3. Sales and Customer 360: `WS_SEL-CUSTOMER_overview_ar.png`, `SL1`, `SL2`, `SL5`, `SL11`; chapter order customer -> quote -> availability -> fulfillment -> invoice.
4. Purchasing: `WS_PUR-ORDERS_overview_ar.png`, `PU6`, `PU12`, `PU9`; commitment -> supplier view -> variance/reports.
5. Inventory: `WS_INV-MASTER_overview_ar.png`, `IN2`, `IN3`, `IN11`; item 360 -> actual/available/reserved/projected -> stock analytics.
6. Fixed Assets: register + `FA2`, `FA5`; asset lifecycle -> reconciliation.
CTA: 'Book a DIGIT Pro Demo', request CFO/functional role and main challenge. Never substitute an unsupported 'Free Trial'. Pro source register contains statuses beyond verified; internal research evidence is not go-live proof.

### 6B DIGIT HR/HCM (evidence: 31-family V8 RESEARCH; runtime claims separately gated)
Buyer: HR Director, HR Ops, Payroll Manager, department managers.
Five stories to prioritize for site design: Employee 360 and lifecycle; recruitment-to-onboarding; leave/attendance and exceptions; payroll/reconciliation; ESS and HR service cases.
Visuals: staff dossier/relationship panel for employee 360; native employment/leave/attendance/payroll forms only after current screenshots approved; realistic Saudi office photography may set context but may not portray approved customer installations.
Page sections: Role picker -> lifecycle timeline -> employee/master proof -> operations/attendance exception proof -> payroll control proof -> manager/employee experience -> secure data/privacy section -> 'Book an HR workflow demo'.
Gate: research file's 234 capabilities and competitor-derived details cannot be announced wholesale. Use only capabilities confirmed against the current DIGIT HR app staging/live by product owner.

### 6C DIGIT CRM (source Frappe CRM v0.7.0)
Buyer: Sales Director, Account Manager, Revenue Operations.
Stories: Lead acquisition -> Qualification -> Deal pipeline -> activity/meeting timeline -> quotation handoff -> management reports; and Account 360 / account health.
Product proof: Frappe CRM records, DIGIT CRM workspace, source-confirmed report pages; obtain contemporary screenshots per workflow and locale. CRM README describes 21 reports and quotation handoff; do not turn source-only possibilities into unconditional public promises.
Page anatomy: pipeline hero -> click-through customer path -> task follow-up -> quotation handoff -> CRM reporting -> demo lead form. Clarify CRM product vs Pro's Selling module: not the same package/ownership.

### 6D DIGIT Construction (source app RC, not site-proven full production)
Buyer: General Manager of contracting company, Project Director, Commercial/Contracts Manager, Quantity Surveyor, Project CFO.
Stories: tender/estimation/BOQ; project budget and job cost; contracts/variation/claims; subcontractor valuations and retention; site execution/evidence; certificates/final account.
Page design: dramatic but restrained site photo limited to hero context; one *large* real Project 360/Cost dashboard UI; 'follow money' sequence tender -> BOQ -> contract -> site -> progress claim/certificate -> costs -> financial output.
Proposed landing page set: Project Cost Control, BOQ & Estimation, Contracts & Variations, Progress Billing & Certificates, Subcontractor Management, Site Operations. Every claimed screenshot must be sourced from a current genuine system state; RC/source status displayed only internally, not as marketing badges.
CTA 'Book a Construction Workflow Demo' with number of active projects, main pain (cost, certificates, subcontractors), company, contact. Avoid asserting full live integration until verified.

### 6E DIGIT FSM / ITM (source-complete, runtime-not-tested)
Buyer: Service Operations Manager, Fire & Life Safety service provider, Maintenance Director.
Stories: customer site / installed asset register -> contractual obligation -> dispatch & technician visit -> inspection checklist and evidence -> deficiencies -> quotation/repair -> retest -> verified closure; customer/site reporting.
Page visuals: actual site/equipment/technician context, then original authorized product screenshots of site/device/dispatch/inspection/deficiency/certificate. No invented live field app. Use service lifecycle rails and a true mobile proof only if captured.
Initial web publishing may offer 'Explore the proposed solution / Discuss the workflow' until product availability is formally approved. Runtime-not-tested source must not be promoted as generally deployed and proven.

### 6F Starter/POS (existing website, separate commercial truth)
Starter's existing page should remain but be rewritten for its real light ERP/operations capabilities. Pro's feature depth must not be smuggled into Starter. Product-specific price and ZATCA optional price from approved package source only. For POS, do not publish add-on pricing until approved.

## 7. Page-type templates with section contracts

1. **Product Hub** (`/products/{id}`): hero+product proof; segment; grouped capability map; 3 story chapters; screen tour; adjacent apps; resources; FAQ; embedded contextual form; sticky CTA.
2. **Module Page** (`/modules/{module}`): exact workflow problem and audience; screen+annotations; steps; 3-6 validated capabilities; real report/output; linked document/role; interactive proof; embedded contextual form.
3. **Feature Detail** (`/features/{slug}`): one feature outcome; trigger/actors; 3-step action; meaningful real screenshot; related documents; related report; availability/scope if pertinent; FAQs; CTA. Initially build 12-20 highest commercial value features, not 321 pages in bulk.
4. **Industry** (`/industries/{slug}`): specific pain; 3 decision-maker questions; industry workflow; source-backed app map; sector visual, real Digit UI; resources; role-specific form. Keep paths and avoid duplicating product material wholesale.
5. **Use Case / Solutions** (`/solutions/{slug}`): problem-led page, before/after process (not unsupported ROI), exact process path, what outputs are available, related products and CTA.
6. **Landing Page** (`/lp/{campaign}`): one campaign/keyword/role, one offer, one dominant UI proof, 2-3 claims, proof screenshot, embedded short lead form, relevant FAQ, no distracting navigation or unrelated modules.
7. **Resources** (`/resources/{type}/{slug}`): real screenshots, readable captions, video/PDF, related products and gated/un-gated download where justified; status and date.
8. **Product Tour** (`/product-tours/{product}`): guided state sequence with source-authored captures; top tab/stepper, module selector, zoom and transcripts for accessible understanding; never emulate working UI actions not demonstrated.
9. **Pricing** (`/pricing`): correct Starter vs Pro ownership, ZATCA option, included vs separately scoped services, no arbitrary HR/CRM/Construction/FSM add-on prices.
10. **Demo/Contact**: high-conversion, 4-6 required fields, offer/source attribution, owner routing, consent, notification, clear success state.

## 8. Source screenshot / photo asset contract

Asset object fields: `asset_id`, `kind` (product_screenshot/context_photo/brand_icon/diagram/video), `product`, `module`, `feature_id`, `source_zip`, `source_path`, `version`, `source_state` (documented/staging-tested/production-approved), `language`, `viewport`, `width`, `height`, `safe_crop`, `sensitive_region_redaction`, `approved_public_use`, `alt_ar`, `alt_en`, `caption_ar`, `caption_en`, `page_usage`, `primary_focus`, `created_at`.

Processing: exact real UI -> redact all private/identifying/sample-sensitive contents -> retain original as immutable -> crop only by recorded coordinates and keep enough context -> export WebP/AVIF sizes with PNG fallback where justified -> check in 2-3 browser widths -> ensure text readable -> annotate in independent HTML layer, not fake UI edits -> associate with feature/story and publish only after product owner approves source/version.

Image rules:
- Hero: one large original product screen, with perhaps one related micro-proof, not three equal-height collage panels.
- Section: 1 primary image + at most 1 zoom or single next-stage screen visible; other stages through user interaction.
- Background: contextual environment (project site/office/service), never make screenshots transparent wallpapers.
- Product tour: real native product screens and states; no AI-generative replacement of visible data.
- Generated characters allowed only for non-documentary brand context; identity references locked; correct Saudi role/wardrobe and scene. Never imply generated photos are actual Digit customers or workplaces.
- No screenshot before privacy and owner approval; no unsupported 'current production release' caption.

## 9. Sales CTA & lead funnel, EVERY commercial page

In-page sections: sticky desktop 'Book Demo' + bottom mobile action bar; contextual form embedded after primary proof and near page end; optional short contact drawer with source tracking; WhatsApp action should prefill a coherent product inquiry but not transmit sensitive form contents automatically.

Form dynamic fields:
- Required: name, company, one reachable channel (validated email or phone), interest/product, permission/consent where needed.
- Optional/conditional: job title/role, industry, company size, main challenge, target workflow, preferred channel/time, notes.
- Hidden validated tracking: `page_path`, `product_id`, `module_id`, `feature_id`, `content_id`, `utm_source/medium/campaign/content/term`, `referrer`, `locale`, `form_variant`, submission timestamp, dedup id, consent version. Do not trust client-supplied role/scope to authorize private data access.
- Backend: server-side validation, rate limiting, spam/honeypot, consent record, storage with private RLS, transactional email to approved destination, retry queue, delivery state, optional CRM owner assignment. Public POST cannot read all requests.
- Handoff: source, product, role, pain, existing system (if supplied), status and consent retained; no premature quote or made-up sales response promise.
- CTA semantics: Home -> book platform overview; Pro -> guided discovery; HR -> HR workflow demo; CRM -> pipeline demo; Construction -> project/contract walkthrough; FSM -> field service workflow discussion/demonstration only after verified availability; landing campaigns -> relevant feature demo or guide. No unrelated CTA pointing to generic demo with no preselection.

## 10. CMS/Admin architecture: do not require Lovable for content edits

Preserve current app. Introduce typed block registry, avoid freeform arbitrary HTML where possible:
`HeroProductProof`, `AppExplorer`, `ProductSwitcher`, `FeatureTheater`, `WorkflowStepper`, `DetailSpotlight`, `RoleSelector`, `IndustrySelector`, `RealReportPanel`, `ResourceCollection`, `EmbeddedLeadForm`, `FAQ`, `TrustEvidence`, `ComparisonOfApprovedPackages`, `RelatedCapabilities`, `FinalCTA`.

Content types: `SitePage`, `PageBlock`, `Product`, `Module`, `Feature`, `WorkflowStory`, `Industry`, `Persona`, `MediaAsset`, `Resource`, `DemoTour`, `FormTemplate`, `FormSubmission`, `SEORecord`, `NavigationMenu`, `BrandSettings`, `Redirect`, `Approval`, `ContentRevision`, `AuditLog`.

User experience: visual WYSIWYG block controls and per-image replace/crop; AR/EN content fields; SEO editor; preview in responsive sizes; drafts/approvals; revisions/rollback; audit; publish without code deployment for existing block types. Developer/Lovable adds *new block types and new behavior*, marketing staff creates/edits pages with approved existing blocks.

Reuse the architectural practices already present in `trilogy-site.zip` only after reviewing model compatibility, company isolation and asset rights. Never migrate its private contact/lead/team data into Digit.

## 11. Brand / aesthetic guardrails

Use approved Digit colors: Deep Green `#064E3B`, Emerald `#0A8754`, Mint `#34D399`, Ink `#0B1F17`, Paper `#F4F3EE`, white. Arabic IBM Plex Sans Arabic where licensed. Semantic color, airy product page surfaces; one deliberate dark showcase chapter. No neon green room or generic rotating glass cards. Genuine screenshot region can be light neutral even inside dark showcase; keep original UI contrast.

Editorial rhythm: hero large; discovery dense but navigable; one premium Product Theater; quiet story text; varied full-bleed context section; conversion. 12 identical cards in every section is prohibited. Descriptive HTML headings, correct semantic links, hover/focus keyboard equivalence, reduced motion, Arabic numbers and clear LTR fields.

## 12. SEO, localization and technical performance

- Existing `src/lib/seo.ts` is the SEO center: preserve canonical, hreflang and structured data. Remove or correct unsubstantiated '50 vs 200 clients', unsupported free trial, guaranteed instant activation, unclear compliance approval, and generic duplicate metadata.
- Publish product/feature/industry intent hierarchy: distinct H1/SEO copy + breadcrumb + contextual internal links + related guide + original UI alt text. Do not generate thin pages for all 321 source requirements; prioritize evidence-rich intent groups.
- Structured data only reflects visibly presented content; FAQ data should correspond to real page FAQ and current search feature policies. Avoid invented review scores, star ratings and client counts.
- Server-render meaningful copy: TanStack Start route head, route-specific product data, server-rendered headings and links. No critical body text only embedded in images. Monitor 404/301 and hreflang reciprocal routes; consolidate legacy duplicate `/demo` `/demo-3`, `/about` `/about-4` after redirect design.
- Optimize main images via pre-sized source derivatives, srcset/sizes, non-lazy LCP, lazy secondary content, reduced-motion and low-cost animation. Do not preload every marketing image.
- Explicit analytics event plan: `nav_product_open`, `product_tab_select`, `workflow_step_view`, `screen_zoom_open`, `resource_download`, `cta_click`, `lead_form_start`, `lead_form_submit`, `lead_form_success`, `demo_booking_start`, `whatsapp_click`. Respect privacy/consent settings and never send customer data as event properties.

## 13. Route-by-route modification map

| Route/group | Action |
|---|---|
| `/` | Replace orbit-dominated hero + equal app cards with 13-part product-first home architecture, keep valid localization/trust/FAQ content in reworked form. |
| `/modules` and `/modules/*` | Become searchable, categorized product/department explorer; migrate approved module pages to feature-story templates; preserve route. |
| `/pro` and optional `/products/pro` | Make feature-rich five-department sales hub; distinguish source features from verified live; role-specific demos; avoid unsupported claims. |
| `/starter` | Correct base package scope; separate from Pro and add-on products, approved price policy. |
| `/modules/crm` + `/products/crm` | Lead/deal/pipeline story and source-based report proof; CRM product distinct from Pro Sales. |
| `/modules/hr-payroll` + `/products/hr` | Employee/attendance/payroll/ESS story, capacity verification before any assertive public text. |
| `/modules/contracting`, `/modules/projects`, `/industries/contracting-industry`, `/products/construction` | Separate product and industry intent; shared BOQ/project/contract workflow source and canonical cross-links. |
| New `/products/fsm` and relevant industry landing | Field service/ITM workflow, product availability gate; use authentic screen captures when available. |
| `/modules/accounting`, `/modules/sales`, `/modules/purchasing`, `/modules/inventory`, `/modules/fixed-assets` | Feature tours, outputs and in-page demo forms using Pro screen evidence. |
| `/features` | Evolve from broad catalog to searchable library with selected detail pages and source-backed statuses. |
| `/industries` + `/industries/*` | Fix copied Education/O&M text and bad links; role+industry-tailored workflow, direct feature proof. |
| `/pricing` | Correct plans vs add-ons vs additional services, ZATCA language and CTA segmentation. |
| `/services-3` + child services | Each page gets qualified service scope, timeline as discovery not promise, proof, form. |
| `/faq`, `/saudi-localization`, `/trust-security` | Audit claims and source links; remove seals/compliance absolutism, show only approved evidence. |
| `/demo`, `/demo-3`, `/contact-4` | One reusable contextual lead form backend with notification handling and attribution; maintain redirects and known routes. |
| `/en/*` | Source editorial English variants matching each Arabic page, 2-way language links and localized alt/meta. |
| `/resources`, `/product-tours`, `/solutions`, `/lp/*` | Add typed blocks/pages with owned actual media and meaningful internal navigation. |

## 14. Prioritized delivery sequence (not a new-site rebuild)

**Release A - evidence and conversion fixes**: preserve a complete source/route snapshot; fix wrong links and duplicated/copy-paste copy; remove unsupported copy; replace free-trial CTA for non-trial products; contextual in-page lead form with safe backend/email; lock brand assets; screenshot approval manifest. No unapproved production publish.

**Release B - home and navigation**: new mega menu, product-first Hero, app directory, actual Pro proof, workflow tour, role/industry selectors, responsive mobile conversion. Preserve routes. Reuse current React components and swap composition.

**Release C - five product hubs**: Pro first, HR/CRM/Construction/FSM using source-backed stories, gaps and product approval; create relevant screenshot capture queue for missing live media. Distinct UX treatment per vertical, no recycled collage template.

**Release D - module, industry and landing pages**: priority Pro finance/sales/purchasing/inventory/assets and Construction/HR/CRM/FSM subpages; contextual forms; featured download guides and guided tours.

**Release E - CMS and growth**: typed visual block editor, revisions and media asset cropping, nav/SEO/forms management, AR/EN translation, content publishing without Lovable, controlled analytics and conversion optimization.

## 15. Acceptance requirements and handoff evidence

A page is not finished by screenshot alone. At minimum document: route + target persona + claim/evidence + primary feature + primary actual screenshot path + crop/alt + required content sections + CTA type/form destination + SEO title/description/canonical/locale + mobile layout + source component + preview. Test UI interaction and note tested staging vs source-only; no staging result means NOT YET VERIFIED. Ensure source-protected package and product truth, privacy of personal/financial data, no fake customer case studies, no fictional ERP data.

Priority web fixes: no invalid internal links, no duplicated industry description, no free-trial promise without live trial, no unverified customer counts, no empty CTA, no non-functional mock forms, no private chat/lead read access to public users, no production deployment bypass.

## 16. Decisions required only at the publication gate

1. Approved representative live screenshots for HR, CRM, Construction, FSM (Pro can use approved current source captures after review).
2. Latest public availability of each separately sold Digit product / scope; any claim requiring operational proof.
3. Authorized organization/customer count (or omit all counts) and any case-study logo publication rights.
4. Actual notification inbox/CRM endpoint and form consent policy.
5. Chosen canonical new/legacy URLs and who signs off on commercial content.

The design and phased development planning can proceed without those decisions; missing evidence must not be silently invented.
