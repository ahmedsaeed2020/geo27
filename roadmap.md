# Requested pages
# DIGIT Website V3 — 2026-10-30
- [x] Stage 1 foundation: server-saved contextual leads, consent/channel checks, durable rate limit, private inbox and exact approved notification recipient; saved/read-back tested.
- [x] Stage 2 foundation: real-screen Home, searchable App Explorer by department/role/problem/industry, four-step workflow, contextual header/footer CTA; 49 original assets retained.
- [x] Stage 3 foundation: all 42 matrix entries retained as evidence-gated CMS drafts; five screen-led journey drafts and bilingual resource hub.
- [x] Stage 4 foundation: 58 source documents, block ordering/editor, bilingual device preview, save/review/publish/unpublish/history/restore, immutable Pro library, validated media upload, published SSR SEO, private leads/status/export/assignment, editor/sales permissions and audit.
- [x] Stage 5 checked: 21 tests, anonymous lead save/Admin read-back, draft isolation/publish/SEO readback/restoration, upload/approve/placement readback, anonymous admin denial and lead RLS, eight mobile routes without overflow. Synthetic data removed; no live publish.
- [ ] Stage 3 completion: deeper distinct stories across all matrix targets, independent reviewed Arabic/English content, evidence-approved HR/CRM/Construction/FSM public launch; blocker is product evidence and owner release approval.
- [ ] Stage 4 completion: signed full-page preview, complete original Home/Pro section editing and migration, media derivatives/usage graph, general form-definition editor, logo/favicon/theme management, redirect editor, role removal/MFA and scheduling. Current CMS is a working foundation, not the full reference feature set.
- [ ] Stage 5 completion: full all-page acceptance, two-role permission E2E, full revision rollback/media replacement regressions, chat isolation/security decision (existing anon behavior preserved), dynamic sitemap deployment behavior and performance field measurements. Depends on completing remaining CMS capabilities and approved product evidence.
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
- [ ] Public CMS image blocks use responsive sizes (srcset) and focal points.
- [ ] Content claims audit: confirm imported pages follow the banned-wording/competitor rules (e.g. third-party platform counts on module pages).
- [ ] Home and Pro section editing: section order/visibility and editable headings with source fallback.
- [ ] Stage 5 regressions: editor vs sales permissions, rollback, preview/schedule/redirect E2E, chat isolation; tests kept in src/test.

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
