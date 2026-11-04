<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Render imported Elementor package pages through one shared React renderer with extracted content and scoped CSS so both pages preserve their source layout without WordPress dependencies.
- Keep published preview metadata alongside extracted package content and implement motion in the shared renderer so both packages retain their original interactive layout without loading WordPress scripts.
- Every demo, quote, trial and subscribe call to action opens the site's own request form (on-page form, else /demo) via the one rule set in src/lib/form-cta.ts and the root click router; imported hosted-form nodes render the real form in place, so visitors never leave for hosted subscription pages and no payment is simulated.
- Render menu-linked WordPress pages through a shared React renderer with extracted per-page JSON and scoped source CSS; this preserves source layouts without executing WordPress scripts.
- Keep every imported content page in its own file-based route and preserve legacy menu URL aliases with redirects; this prevents broken published links and isolates page metadata.
- Keep contextual background and body images in one page-keyed scene manifest consumed by shared renderers; this gives every Arabic page distinct imagery without modifying extracted source content or hosted forms.
- Keep the home page on its original section composition without the internal-page scene renderer; its `band` section is the product slider (src/sections/ProductSlider.tsx, slide data in src/content/home-slider.ts) that pairs text-free generated scenes with registered real screens only, so imagery changes never alter product UI.
- Keep Arabic routes unchanged and give each English content page its own matching /en file-based route; shared renderers and a static translation dictionary preserve layout, SEO, and interactions without runtime translation requests.
- Derive language and document direction from the URL and keep internal links in that language; page-preserving switches must not alter hosted forms, payments, or media URLs.
- Store photographic crop dimensions in the shared scene manifest and render body scenes as decorative backgrounds behind existing content sections, never inserted image-only bands; this preserves page flow and separates imagery from source content.
- Coordinate non-hero reveals through the shared page-motion hook using content targets and sibling stages; one observer avoids conflicting animations and honors reduced-motion preferences without changing layouts or scenes.
- Wrap every content route head() with withSeo(path, head) from src/lib/seo.ts and keep src/content/sitemap-baseline.xml in sync with source routes (the /sitemap.xml route adds indexable CMS pages); one module keeps canonical, hreflang, og and JSON-LD consistent across both languages.
- Visitor chat stays sign-in free: /api/chat (AI SDK Responses, openai/gpt-6-astra) and src/lib/chat.functions.ts check the localStorage visitor UUID against chat_threads.visitor_id before any read or write; the browser never queries chat tables directly, so conversations cannot be enumerated.
- Admin lives at /admin under the _authenticated gate with role checks via public.has_role('admin'); admin accounts are created in the Users view then granted the role in user_roles.
- Real product screenshots are Lovable asset pointers in src/assets/product, with sizes and bilingual captions in src/content/product-shots.ts and page placements in src/content/product-proof.ts; shared ShotFrame/ShotLightbox/ProductProof render them so frames reserve their size and each section keeps its own lightbox.
- CMS documents keep separate draft/published snapshots and immutable revisions; existing renderers use published overrides with source fallback so editorial changes do not erase imported layouts. Authenticate every mutation and enforce content/lead/owner scopes on the server.
- Contextual forms save through server functions into the existing contact_requests store; notification status records actual sending readiness. Managed email handles delivery/retries externally; never create an email queue or email SQL tables.
- CMS media uses a private bucket and a server-validated approval-gated media route; deny SVG and preserve original Pro pointers unchanged.
- Home and Pro sections are listed in src/content/section-registry.ts and arranged from the `home`/`pro` site settings (order, visibility, plain-text heading overrides with source fallback); heroes are locked so the original first fold never moves or disappears, and a section the saved order doesn't know yet is inserted after its source predecessor.
- Editors preview unpublished form/section settings with `?draft_settings=<key>`, loaded only in the browser through an authenticated server function, so visitors and crawlers always receive published settings.
- Product families, departments and menu groups live only in src/content/catalog.ts; headers, mega/mobile menus, product hubs, breadcrumbs and lead tagging read it through resolveCatalog, so an unpublished CMS department always links to its hub card and never to an empty page.
- Department pages are CMS documents with `department` meta rendered by the shared DepartmentPage template; departmentPublishIssues gates publishing so thin or screenshot-less pages cannot go live.
- DIGIT HR module pages keep handoff copy in src/content/hr/modules/*.json (loaded per route) and CMS `source` blocks only reference, reorder, hide or override those sections; HR screenshots live in hr-shots.ts with provenance JSON, so source truth and editorial changes stay separate.
- DIGIT Pro V4 copy lives in src/content/pro/pages/*.ts (registry and lead topics in pro-pages.ts, evidence tiers in evidence.ts, runnable reports in reports.ts); department routes keep their imported hero/FAQ/CTA and insert ProPageBody, areas use /pro/$area, and CMS `source` blocks only order/hide/retitle sections, so visitor claims always trace to a verified ID or real screen.
- V4 styles in src/pro-pages.css are all scoped under .pv-root so they outrank the imported page's element rules without touching other imported pages.
- Construction, CRM and FSM + ITM area pages are CMS documents whose source copy lives in src/content/specialist/*.ts (light index in index-data.ts) and renders through SpecialistBody; product hub and corporate stories live in src/components/hubs and attach to imported pages by page key (HUB_STORIES), so imported layouts and CMS overrides stay separate.
- src/content/screens.ts is the only registry of real product screens (Pro and HR); a page without a registered screen is marked illustrative and shows labelled diagrams, so withdrawn or reconstructed screenshots can never be referenced.
