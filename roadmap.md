# GeoInTime landing conversion (2026-11-19)
- [x] Replace Arabic/English home with four source-grounded blocks, original imagery and scoped brand motion; hide DIGIT navigation from landing.
- [x] Preserve administration and existing lead functions; brand the landing form without DIGIT customer claims.
- [x] Check desktop/mobile, reduced motion, language switching and saved lead (confirmed in Cloud, verification row removed); do not publish. Admin login gate preserved; signed-in admin verification unavailable because the remixed app has no account matching the owner. Email delivery remains not configured in the existing lead function.

# Orbit navigation, image audit, code review, SEO (owner 2026-11-05 18:38)
- [x] Owner 2026-11-06: close anonymous direct chat-table access before publishing; preserve visitor-checked server handlers and CMS reads.
- [x] Owner 2026-11-06: published current site (live verification tag confirmed), verified Google ownership, added the root property and submitted the sitemap successfully.
- [x] Home orbit: every module chip shows its name on hover/focus and opens its page on click (HR, CRM, accounting, sales, reports, settings, dashboards, e-signature, ...); orbit look unchanged.
- [x] Shared product orbit section (green sun with the product at the core, its departments orbiting, names on hover, click opens the page) added above the existing first fold — existing hero untouched — on Pro, HR, Construction, CRM, FSM + ITM, POS overviews and the all-modules page; AR/EN, keyboard, touch, reduced motion.
- [x] /pro overview: replace the faded, unrelated people photo and the empty price card area with system-relevant visuals.
- [x] Full-site image audit: open every page (AR/EN), find broken, faded or unrelated images and fix them.
- [x] Code review report (confirmed problems + ordered refactor plan, no changes until approved) and security scan summary.
- [ ] (awaiting owner approval) Security: drop the open visitor policies on chat_threads / chat_messages / contact_requests (server already writes through the admin client); re-test chat and forms end to end.
- [ ] (awaiting owner approval) Tests for lead submission and chat visitor-ownership checks before any refactor.
- [ ] (awaiting owner approval) Admin: paginate leads (cap 500) and chats (cap 300) with totals instead of silent cut-offs.
- [ ] (awaiting owner approval) One shared path normaliser (bare/en strip) and one bilingual t() helper instead of copies in catalog, pro-pages, sitemap and content files.
- [ ] (awaiting owner approval) Chat widget: show a retry state when history fails to load instead of swallowing the error.
- [ ] (awaiting owner approval) Footer colours to design tokens; split SpecialistBody / HubStories once tests exist.
- [x] SEO: read current findings, fix every actionable item (metadata, sitemap, structured data, internal links) so Google can index faster.
- [ ] (owner) After publishing: submit https://digit-erp.com/sitemap.xml in Google Search Console and request indexing of the main overview pages.

# Award-level motion & interaction (owner brief 2026-11-05, preview only)
- [x] Shared motion system: per-product entrance identities (Pro, HR x7 arts, Construction, CRM, POS, FSM, site), home orbit/slider first-load beats, scroll reveals and step sequences, home product theater, mega-menu indicator/preview crossfade, lightbox grow-out, section rail, page view transitions.
- [x] Performance: first-fold photo/lead text painted at once (LCP back to baseline); waiting headings never clipped; reduced motion overrides every rule.
- [x] QA: 25 pages AR/EN desktop/mobile + reduced motion (63 checks clean), interactions, 153 tests, recordings + report in Files (digit-motion-qa).
- [ ] Owner: review the motion on the preview and approve publishing.
- [ ] Section rail on the Pro/Starter package pages (kept off to preserve the published package design; add only if the owner wants it).
- [ ] Measure real-visitor Core Web Vitals after the next approved publish and compare with the preview measurements.

# Owner notes 2026-11-05 15:07 (screen frame rejected; Trilogy one-page prompt)
- [x] Screen frame redesign: the multi-screen frame (e.g. CRM reports "5 مقاطع") is rejected as it looks — mixed zoom (blown-up menu crop), heavy caption bars, dashboard-like grid. Replace it with a premium showcase that presents each idea and its real screen clearly at a consistent scale; keep several real screens visible in one frame; lightbox; AR/EN; mobile.
- [x] Visual review of every page that shows the frame (CRM areas + module, Construction areas + module, HR sections, hub stories) at desktop and mobile, AR/EN, element screenshots inspected one by one.
- [x] Trilogy one-page prompt (saved to Files: marketing/trilogy-digit-page-prompt.md; 185 linked pages/images return 200): a copy-ready Lovable prompt for the Trilogy main site that adds one page presenting DIGIT (all products, departments, Pro workspaces, reports, blueprint, delivery, Saudi localization, FAQ, demo/quote) with every link pointing to the right digit-erp.com page; check which links are live on digit-erp.com today.

# Owner notes 2026-11-05 13:58 (home accepted; footer language, form scene, masonry screens, CRM imagery, assistant look)
- [x] Footer: the blank white language pill becomes a clear globe icon + "English"/"العربية" button styled for the dark footer; dead privacy/terms links fixed.
- [x] Request form section: form in one column (right in Arabic, left in English) over a full scene — the Digit advisor (ADVISOR-SA-A) presenting to the Saudi owner (OWNER-SA-A) in a luxury meeting room beside a large screen that shows a real Digit screen (composited, never generated UI); AR/EN mirrored versions, mobile stacking; applied to every LeadCapturePanel and the /demo and /quote pages.
- [x] Masonry screen mosaic: one framed "engine" holding several real-screen crops (wide on top, square + rectangle below, tall side), each tile opening the full screen; reusable across inner pages.
- [x] CRM: new crisp crops from the owner's CRM pack (funnel, sources donut, first-contact time, stage ageing, stage conversion, expected closings, health donut, activity mix, calls by result, KPI strips, module navigation), provenance recorded; every CRM area page hero shows its mosaic instead of the person-with-screen photo, plus an in-page "from inside the system" mosaic.
- [x] Apply the mosaic style to the other inner pages that have real screens (HR sections, Construction areas, CRM module page).
- [x] AI assistant: premium launcher with label, branded header with avatar/online state, welcome card with suggested questions (AR/EN), polished bubbles and composer, mobile full-height sheet.
- [x] QA: AR/EN desktop + mobile on CRM/HR/Construction pages, forms, footer, assistant; tests; build.
- [ ] Owner: a real screen of CRM users/roles/settings so the CRM administration area can join the mosaics (it stays a labelled diagram until then).
- [ ] Owner: review the new request scene, screen mosaics and assistant on the preview and approve publishing.

# Site-wide clarity pass (owner 2026-11-05 08:32: 200+ figure, no empty frames, clear photos, capabilities imagery, menu identity)
- [x] Customer figure: «أكثر من 200 منشأة سعودية» / "200+ Saudi businesses" everywhere (hero, home, slider, stories strip, SEO, assistant, llms.txt, translations, tests).
- [x] Empty frames: every "مثال توضيحي / لقطة توضيحية" browser frame on module, industry and POS pages shows a real registered screen or a clear contextual photo; no placeholder captions left.
- [x] Internal page heroes: photo crisp on the left half (right in English), text on the right; no full-width faded wash; hero visual column no longer covers the photo.
- [x] Internal page body photo: clear photo column beside the first content section instead of a 14% faded backdrop.
- [x] Capabilities page (/features): ten capability visuals as a mix of new photos (e-signature on mobile, document filing to cloud, MFA, roles, cloud/on-prem, currencies, backup), real screens (indicators, bilingual) and a designed icon tile (integrations).
- [x] Careers hero: sharper image with clearly visible faces.
- [x] Mega Menu: each product panel gets its own photo with the green overlay and its own icon; every department/area link has a distinct icon.
- [x] QA: AR/EN desktop + mobile crawl (no placeholders, no broken images, no overflow), tests.
- [x] Owner screenshot packs 2026-11-05 (Pro RUN11.1 live 419 + development 80 not-live, HR best 16 full-res, CRM, construction): review each image, register the usable live ones with provenance, and place full screens or crops as feature proof on /features, modules, packages, every HR page and every construction page. Development (not-live) screens stay out unless clearly labelled; CRM/construction replace photo fills where a real screen matches.

- [x] Screens placed (2026-11-05): Construction 10 crops on all 9 area pages + Contracting module/industry frames; CRM 7 crops on 6 of 7 area pages + CRM module frame (administration stays a labelled diagram); 7 more verified Pro live screens on accounting/sales/purchasing/inventory/assets; HR menu previews use the existing HR screens. Development (not-live) pack not used.
- [x] Owner 2026-11-05: published the 7 CRM area pages (AR/EN, audit-logged) and linked every CRM module-page card (proof stats, six capabilities, sales-visibility funnel) to its area page; area grid and CRM story already open them.
- [ ] Owner: recapture without the "(تجريبي)" tenant label for the existing Pro Item 360 screen (inventory page) and the Pro workspace overviews (AST-SERVICE, INV-CONTROL, PUR-SOURCE still show labelled diagrams) — blocked on owner.

# Home refresh with the new content (owner 2026-11-05 "next till finish": every old home block updated)
- [x] HR 7 + Construction 9 section pages published; demo vs quote buttons open separate pages and forms (2026-11-04 turn).
- [x] Home: role finder ("ابدأ من شغلك", 11 roles), trust strip, "four angles" journey (V4 workspaces), chaos-to-control (six products), modules (six families + every department), capabilities (V4 pages), challenges (linked answers), industries (products per sector, FSM hub), Saudi localization (approved wording, no WPS/GOSI compliance claim), FAQ (+ matching structured data, AR+EN), final CTA (demo / quote / blueprint), band subtitle, showcase tabs (V4 links + HR screens), home lead form for all products.
- [x] Home: AR/EN 1280/390 visual check, keyboard, no overflow; tests for home claims/links (src/test/home-content.test.ts); full test run.
- [ ] Owner: review the refreshed home on the preview and approve publishing.

# Full-site audit & signature experience (owner 2026-11-04 21:36: audit every page, apply recommendations, fix errors, innovate)
- [x] Audit: 130 AR/EN pages at 1280 and 390 px (status, console, overflow, broken images, alt, h1, titles/descriptions, anchors, banned wording, prices, axe WCAG 2.1 AA).
- [x] Fix: brand-green contrast (site + imported pages), mint button text, unlabeled/empty-label icons, focusable scroll strip, duplicate ids (pricing), dead request links (POS), unreadable text on industry/pharmacy/partnership/implementation/construction sections. Re-check of the fixed pages: only decorative or hidden text still flagged.
- [x] Fix: short/long/duplicate titles and descriptions (AR + EN); English careers "thousands of establishments" claim removed; "certified margin" reworded.
- [x] Fix: server code deprecation warnings (validator API).
- [x] Social share card: 1200x630 AR/EN images with the real logo, default og:image for every page without its own.
- [x] Signature experience: /blueprint + /en/blueprint "Design your system" builder (sector, size, needs → live system map, connections, real screens, reading path, starting edition, delivery path, shareable link, print/PDF, demo request carrying the blueprint), home band, Resources menu, sitemap, llms.txt; request saved with blueprint label in admin (E2E, test rows deleted).
- [x] Site search (header button, Ctrl/⌘ K or "/") across products, departments, Pro workspaces, 117 reports and site pages, Arabic spelling-tolerant, AR/EN; hidden at 1280–1365 px where the full menu leaves no room (shortcut still works).
- [x] Re-audit after fixes: 130 pages desktop + mobile clean (200, no errors, no overflow, no broken images); 121 automated tests pass; report in Files.
- [ ] Owner: close visitor access to chat tables and anonymous request inserts together with the next approved publish (live site still uses the old widget) — blocked on publish approval.
- [ ] Blueprint: add CMS controls (sector suggestions, area wording) to the admin so editors can tune the builder without code.
- [ ] Search: show a short "recent searches" list and track zero-result queries in admin to find missing pages.

# Home slider & site-wide CTA pass (owner 2026-11-04 19:26 / 19:39)
- [x] Home: replaced the old laptop band image with a luxury product slider (6 real-screen slides, generated text-free scenes, autoplay timeline, tilt/float motion, verified figures, per-slide demo context, lightbox), hero unchanged; AR/EN 1440/390 + keyboard/reduced-motion checked.
- [x] Whole site: every demo/quote/subscribe/trial button opens the site's own request form (hosted forms on Pro/Starter/Demo/Partnership replaced in place, one form per page, old absolute links made local); 128 AR/EN pages crawled: 200, form present, no outside hosted links, no errors.
- [x] Whole site: removed "تجريبي/مؤقت/demo data/before publishing"-style wording from visible copy (AR + EN, incl. Pro status labels); crawl clean apart from legitimate UAT/regression-testing service steps. Product screenshots still show the demo tenant's "(تجريبي)" names — needs owner recaptures (pixels untouched).
- [x] Home hero (owner 2026-11-04 19:57): first fold is now a five-product slider (Pro, HR, Construction, CRM, POS) with the supplied Saudi characters, real Pro/HR screens, published journey steps for Construction/CRM/POS, per-product demo CTA (form gets the product), autoplay with hover/off-screen/reduced-motion pauses, keyboard tabs, lightbox; AR/EN 1440 and 390 checked, 128-page crawl clean.
- [ ] Owner: real current screens for Construction, CRM and POS so their hero slides can show a system screen instead of the journey card — blocked on owner.

# Requested pages
# DIGIT Website V4 — remaining products & corporate experience (owner brief 2026-11-04 17:07)
Rules: Pro and HR frozen (no page/content/route/SEO/CSS changes); corporate profile = content authority, current site = design authority; no live publish.
- [x] Phase 1: source map — profile pages mapped to pages/images (report); Construction 9, CRM 7, FSM+ITM 9 groups; p.31 roadmap and p.35 historical logos deliberately not published.
- [x] Catalog + Mega Menu: six families (Pro, HR, Construction, CRM, FSM+ITM, POS) in the one registry; no second nav; role row on specialist panels; all nine top groups fit at 1280–1920 px AR/EN (brand eyebrow dropped below 1680 px).
- [x] Construction hub: Project 360 journey (BOQ → Contract → Execution → Claim → Collection), five-stage money chain, four separate cost measures, change impact; nine area pages as unpublished CMS drafts (private preview checked AR/EN 1280/390).
- [x] CRM hub: Lead-to-Deal explorer, Sales Manager workbench; seven area pages (CMS drafts); distinct from Pro Selling; no screenshots until recaptured.
- [x] POS hub: selling / store operations / connected operations chapters; 12-segment searchable industry explorer with generated store photos (no people/logos); industry demo request E2E saved product + interest, test row deleted.
- [x] FSM+ITM hub (new /modules/fsm-itm AR/EN route, sitemap) with 11-step service journey and inspection loop (failed retest reopens the deficiency); nine area pages (CMS drafts).
- [x] About: interactive three layers (platform / specialist apps / technology & delivery), friction between departments, DIGIT ↔ Trilogy services band (scoped separately); AR/EN 1280/390 checked.
- [x] Implementation & delivery page: six-stage stepper (Discovery → Go-live/acceptance) with outputs and participants; package entitlements vs separately scoped vs Trilogy services; next-step band with discovery booking.
- [x] Home targeted additions (editable/hideable home sections): three-layer model, six-family portfolio explorer with connected stories and real Pro/HR screens, four new roles, delivery band, contextual demo — existing sections unchanged; new sections slot in after their design predecessor.
- [x] Contextual lead forms on every new hub/department/service page (product, department/industry, page, language, UTM) — E2E on POS industry and CRM Leads draft saved and read back, test rows deleted.
- [x] SEO/sitemap/hreflang/llms.txt for new routes; drafts noindex + 404 without link; 98 tests; 180 AR/EN views at 390–1920 px incl. Pro/HR regression; screenshots + report in Files (digit-v4-remaining).
- [ ] Owner: real screenshots for Construction, FSM + ITM and POS (pages show labelled diagrams until then) — blocked on owner.
- [ ] Owner: approve the 18 Construction/FSM area drafts (CRM 7 published 2026-11-05) and the new home/About/Implementation sections before publishing — blocked on owner.
- [ ] Owner: set up the email sending domain so new-request notifications reach a.saeed@trilogy.com.sa — blocked on owner.
- [x] Owner 2026-11-04 17:54: screenshots showing the old module logos (pink app icon in the side rail) are wrong — scanned all 67 product screens and 16 profile photos: only the two CRM demo screens had it; removed from pages, stories, menu, editor and storage; CRM pages now show labelled diagrams; test keeps them out.
- [ ] Owner: recaptured DIGIT CRM screens with the current module logos (deals board, manager workbench) — blocked on owner.

# DIGIT Pro V4 complete product pages (owner brief 2026-11-04 16:51)
- [x] Phase A: source map — 321 IDs mapped to evidence tiers (available / being verified / scoped), screenshot→feature provenance, 117 runnable reports (2 e-invoicing entries withheld); rules kept as tests.
- [x] Phase B: five department pages expanded in place (4 workspaces each with Overview · Documents & Work · Reports tabs, distinct visual signature, journeys, decisions, cross-links, contextual demo); original hero, proof band, FAQ and CTA kept; AR/EN.
- [x] Phase C: /modules/reports report center (featured reports + searchable directory) and new pages Executive Dashboards, Settings & Governance, Advanced Capabilities (AR/EN routes, SEO, sitemap, CMS drafts).
- [x] Phase D: CFO Decisions page — 12 executive questions with evidence status, five finance chapters, drill-down to the document.
- [x] /pro hub: department picker now links each department's four workspaces (20 in all) and the cross-department areas; stays in the editable "departments" Pro section.
- [x] CMS: V4 pages list their source sections in the editor (reorder/hide/retitle, Pro-only screen picker where a section has a lead screen, no department-template switch); drafts for inventory + 4 areas with titles. (E2E: retitle + hide saved as draft, public page unchanged, restored.)
- [x] Demo requests from workspaces/questions carry product, department and topic (E2E: ACC-DUES request saved and read back, test row deleted); topic shown in Leads/CSV.
- [x] Phase E: 88 tests pass; all 22 AR/EN URLs (10 V4 pages + /pro) at 390 and 1280 px return 200 with no console errors, overflow, broken images or Arabic in English V4 sections; 404 for unknown areas; canonical/hreflang checked. No live publish.
- [x] /pro hub: new editable "paths" band after the department picker — four CFO questions with evidence status, roles to their pages, and the live report count by department (117), AR/EN, checked at 1280/390 px; listed in the admin Pro sections editor with heading overrides.
- [x] Report-category counts on /pro open /modules/reports#reports-<category> with the directory pre-filtered (checked by click and direct load, AR/EN).
- [x] Hub CFO questions open /pro/cfo-decisions#pv-q-EXE-xx with that question selected.
- [ ] Owner: the V4 pack references screenshots that were not included; sections without a real screen show labelled process diagrams until real captures are supplied — blocked on owner.
- [ ] Owner: approve the V4 pages before the next publish (nothing is live yet) — blocked on owner.
# Product information architecture, Mega Menu & department pages (owner brief 2026-11-04)
- [x] One product catalog: Pro (5 departments + dashboards/reports/tour), HR (7 groups), Construction (9 departments), POS (existing solutions); existing routes reused, new HR/Construction routes registered.
- [x] Header and Mega Menu: new top level, multi-column product panels with real Pro screenshot, explore by role/problem, keyboard/Escape/click, mobile accordions, AR/EN; checked at 390, 1280, 1366 and 1440 px.
- [x] Reusable Department Detail Page driven by the CMS, AR/EN routes, breadcrumbs, SEO; unpublished department URLs return 404 and stay out of the sitemap.
- [x] Product Hubs: department selector on /pro (financial cycle), HR (lifecycle) and Construction (journeys); menu links highlight the chosen department card.
- [x] CMS: 16 department drafts registered, department fields and blocks in the page editor, catalog order/visibility with draft preview (E2E: hide/reorder in draft, public unchanged, restored), admin "Products & departments" view.
- [x] Demo requests carry product, department, page and UTM; shown in Leads and CSV.
- [x] Representative department draft (Inventory) from existing text and real screenshots; preview link checked in AR/EN. Evidence reset to pending for owner approval.
- [x] Tests (catalog-rules: 12 rules), AR/EN desktop/mobile screenshots, overflow and link checks, sitemap/404 checks. No live publish.
- [ ] Owner: review the Inventory draft and approve its evidence before publishing — blocked on owner.
- [x] HR 7-module handoff: seven bilingual HR pages (30 sections, 147 features, 16 real screens, 7 distinct heroes) built as unpublished drafts with 7-day private preview links; CMS can reorder/hide/override sections.
- [x] Owner approved all HR handoff features (incl. REC-09/ANL-09) and confirmed the 16 HR screenshot employee names are demo data (2026-11-04); HR drafts marked evidence-approved, still unpublished.
# Imagery pass (owner 2026-11-04: supplied Saudi characters, no uncovered hair, generate all needed images)
- [x] Audited all 170 non-product site photos; replaced the 6 visible ones showing women with uncovered hair (pro ×2, demo-3 ×2, contact-4, ERPNext service) with hijab-corrected versions; 9 more were already unused. Rule kept as a test.
- [x] Generated two character scenes for each of the 7 HR pages (intro + closing CTA) from the supplied characters, with phone-size versions; wired through the scene manifest.
- [x] Visual QA of every new/edited image (identity, hijab, no text/UI/logos) and all 7 HR pages AR/EN at 1280 and 390 px via temporary preview links (revoked after).
- [ ] Owner: real Employee & Manager Experience screenshots (S-01…S-05, H-01…H-04) and Construction department screens/content — requested from owner.
- [ ] Owner: provide approved content and real screens for the 9 Construction department pages before they can be published — blocked on product evidence.
- [ ] Owner: Employee & Manager Experience has no real screenshot yet (shows a labelled diagram) — needs a real capture.
- [x] Area switchers on all department pages fade at the hidden edge and centre the current area.

# DIGIT Website V3 — 2026-10-30
- [x] Stage 1 foundation: server-saved contextual leads, consent/channel checks, durable rate limit, private inbox and exact approved notification recipient; saved/read-back tested.
- [x] Stage 2 foundation: real-screen Home, searchable App Explorer by department/role/problem/industry, four-step workflow, contextual header/footer CTA; 49 original assets retained.
- [x] Stage 3 foundation: all 42 matrix entries retained as evidence-gated CMS drafts; five screen-led journey drafts and bilingual resource hub.
- [x] Stage 4 foundation: 58 source documents, block ordering/editor, bilingual device preview, save/review/publish/unpublish/history/restore, immutable Pro library, validated media upload, published SSR SEO, private leads/status/export/assignment, editor/sales permissions and audit.
- [x] Stage 5 checked: 21 tests, anonymous lead save/Admin read-back, draft isolation/publish/SEO readback/restoration, upload/approve/placement readback, anonymous admin denial and lead RLS, eight mobile routes without overflow. Synthetic data removed; no live publish.
- [ ] Stage 3 completion: deeper distinct stories across all matrix targets, independent reviewed Arabic/English content, evidence-approved HR/CRM/Construction/FSM public launch; blocker is product evidence and owner release approval.
- [x] Stage 4 completion: signed full-page preview, Home/Pro section editing, media derivatives/usage, form settings editor, logo/favicon/theme, redirect editor, role removal/MFA and scheduling (see the 2026-10-30 build order below).
- [x] Stage 5 acceptance: all 118 AR+EN pages return 200 with unique titles, one h1, canonical, descriptions, correct direction and no untranslated Arabic on English pages; no browser errors on key pages; sitemap now served live with indexable admin pages.
- [ ] Performance measurement on the published build — blocked on owner approval to publish.
- [ ] Blocker: new-lead emails require owner sender-domain setup and verification; no sending domain is configured.

# V3 Stage 4/5 completion — build order (started 2026-10-30 "next")
- [x] Split the admin into focused panels and restore visitor chat transcripts (lost when the new admin replaced the old one).
- [x] Team lifecycle: accounts by email, grant/change/remove roles with last-owner protection, emails in lead assignment; authenticator-app MFA with an owner switch requiring it for publishing. (MFA enrolment UI built; not exercised with a real authenticator app.)
- [x] Expiring, revocable preview links that render the full draft page with a preview banner and noindex. (E2E: create, visitor view, revoke.)
- [x] Scheduled publish and scheduled unpublish, resolved at read time and materialized into revisions. (E2E: page went live 2 min later.)
- [x] Redirect manager: 301/302/307/308, loop and chain checks, existing-page warnings, hit counts. (E2E: 301 verified.)
- [x] One cached published-content query per navigation instead of two server calls; refresh after publishing.
- [x] Form settings editor: visible optional fields, labels, interest options, success messages; server minimums unchanged. (E2E publish/revert.)
- [x] Branding: logo, favicon and accent colour from approved media/presets with contrast checks; draft/publish/history. (E2E colour publish/revert; logo/favicon need an approved upload to exercise.)
- [x] Media: usage map, archive guard, replace file while keeping links, responsive WebP sizes. (srcset on public blocks still to wire — see below.)
- [x] Public CMS image blocks use responsive sizes (srcset) and focal points. (E2E: upload, SVG refusal, approval, 480/960 WebP, replace, archive.)
- [x] Content claims audit: removed third-party platform count, "100%" stat, internal ERPNext captions, per-user-fee and Mudad wording on home/accounting/industry pages (AR+EN).
- [ ] Owner decision: "تنفيذ وترقية ERPNext" service page headline/menu (keep, rename or remove) — blocked on owner.
- [ ] Owner decision: HR/payroll and Saudi-localization claims on WPS/GOSI/Mudad come from the original site — confirm scope — blocked on owner.
- [x] Home and Pro section editing: section order/visibility and editable headings with source fallback; signed-in draft preview on the real page. (E2E: draft preview, publish, revert.)
- [x] Visitor chat: widget reads/writes through visitor-checked server actions; /api/chat saves only into the visitor's own thread, with length and burst limits.
- [ ] Close direct visitor access to chat tables (drop anon policies/grants on chat_threads/chat_messages) — apply together with the next owner-approved publish, because the live site's current widget still reads them directly.
- [x] Stage 5 regressions: editor vs sales access checked against the database rules (editor: pages only; sales: requests and chats only; no role: nothing), rollback E2E, preview/schedule/redirect E2E, chat isolation E2E; rules kept as tests in src/test.

- [x] Install uploaded Starter and Pro pages at their existing menu destinations.
- [x] Verify page content, navigation, FAQ, and narrow-screen layout.
- [x] Restore Starter and Pro published styling and motion, not just their content.
- [x] Compare both pages visually and verify their interactive previews.

# Arabic menu pages
- [x] Apply Accounting design to modules, Contracting design to industries, and Mobile Shops design to POS pages, retaining each page's XML content.
- [x] Match the XML menus to published Arabic pages and supplied templates.
- [x] Install all matched pages with extracted source content, scoped design, and interactions.
- [x] Connect navigation and verify every menu destination and representative page interactions.
- [x] Leave English translation for its requested step.
- [x] Generate the initial six referenced Digit scenes and connect them to representative pages.
- [x] Generate two page-specific referenced scenes for every Arabic content page: background and body.
- [x] Integrate the complete scene collection without changing source content or hosted forms.
- [x] Verify all page images load, layouts remain readable, and existing interactions work.
- [x] Inspect the uploaded image library and select clean photographic crops by subject.
- [x] Install suitable crops on matching pages without advertising copy or layout changes.
- [x] Verify installed crops and page readability.

# Correct rejected image selection
- [ ] Confirm the user's approval status for source advertisements; the archive has no verified approval labels and the selection questions were skipped.
- [x] Replace images on projects, services, and features with reviewed photographic alternatives, without claiming user approval.
- [x] Verify the replacements preserve the subjects and page readability.

# Integrate body imagery
- [x] Remove standalone body image bands and integrate their images behind existing content sections.
- [x] Verify content remains readable and page controls remain usable.

# Restore original home and correct internal pages
- [x] Remove added photographic scenes from the home page, restoring its original sections.
- [x] Correct internal backgrounds without overriding source template colors or overwhelming content.
- [x] Verify home and representative internal pages and their navigation.

# Bilingual site
- [x] Translate all page content, navigation, shared controls, and home sections professionally into English.
- [x] Add equivalent English routes and page-preserving language switching with Arabic default.
- [x] Verify both languages, directions, navigation, pricing, and package interactions.

# Non-hero motion
- [x] Refine staggered section/card reveals, process progression, FAQs and package previews without altering heroes or backgrounds.
- [x] Verify both languages, interactions, reduced motion, and unchanged heroes.

# Site growth phase (user request 2026-10-17)
- [x] Research comparable Saudi ERP/accounting/POS websites (report: /mnt/documents/marketing/research.md).
- [x] AI chat agent answering visitors from site content, Arabic/English, floating on all pages, multi-thread, DB-persisted.
- [x] Internal contact/demo forms added alongside the hosted ones (demo, demo-3, contact-4).
- [x] Brand-driven background motif (Digit-primary mesh + dot grid) behind internal page sections.
- [x] Admin login (/auth: email, Google, Lovable) and panel (/admin: form requests, chat transcripts, site settings).
- [x] SEO deepening: llms.txt with Saudi-market keywords; research actions (Mazaya, ZATCA list, comparison outreach) are owner-side.
- [x] Grant the owner account admin role after they create it (More → Users → Add user), then verify /admin end-to-end.

# Real DIGIT Pro screenshots (owner prompt 2026-10-30)
- [x] Upload all 49 product screenshots with their original file names.
- [x] Shared screenshot frame, lightbox (Esc, click-to-close, next/prev within a section) and ProductProof block.
- [x] Home: tabbed "شوف النظام من جوّه" after the modules grid; thumbnails on three challenge slides; customer count 50 in hero and search description.
- [x] Module pages (accounting x2, sales, purchasing, inventory, fixed assets, reports): ProductProof after the hero.
- [x] Features: smart document and daily control blocks at the top; AI card copy without assistant wording.
- [x] Pro: "ماذا تحصل في DIGIT Pro" with all 10 themes, sticky theme chips, the Pro price line and demo CTA.
- [x] English versions on /en pages; tests for the new rules; desktop/mobile/lightbox verification.
- [ ] Owner decision: the top of /pro still says «عرض سعر مخصص» while the new section shows the Pro price.
- [ ] Owner decision: several screenshots show the word "ERPNext" in small print; recapture if it must not appear.
- [ ] Owner decision: the /pro preview section still says its images are illustrative and will be replaced.

# Owner note 2026-11-05 17:56 (menu icons must be Digit's own)
- [x] Replace the generic menu icons with the DIGIT icon set: original digit-erp.com glyphs where a match exists (Pro departments, dashboard, calendar, signature, settings, search, warning, cost centres, WPS card, POS, pharmacy…), new glyphs drawn in the same grammar for the rest (hard hat, wrench, map pin, ruler, POS activities); desktop mega menu, systems menu and mobile menu, AR/EN; tests.
