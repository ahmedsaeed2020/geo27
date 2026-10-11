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
- Keep WordPress-only trial and payment forms on their original hosted pages until those services are explicitly connected; never simulate successful submissions or payments.
- Render menu-linked WordPress pages through a shared React renderer with extracted per-page JSON and scoped source CSS; this preserves source layouts without executing WordPress scripts.
- Keep every imported content page in its own file-based route and preserve legacy menu URL aliases with redirects; this prevents broken published links and isolates page metadata.
- Keep contextual background and body images in one page-keyed scene manifest consumed by shared renderers; this gives every Arabic page distinct imagery without modifying extracted source content or hosted forms.
- Keep the home page on its original section composition without the internal-page scene renderer; this isolates internal imagery revisions from the restored home design.
- Keep Arabic routes unchanged and give each English content page its own matching /en file-based route; shared renderers and a static translation dictionary preserve layout, SEO, and interactions without runtime translation requests.
- Derive language and document direction from the URL and keep internal links in that language; page-preserving switches must not alter hosted forms, payments, or media URLs.
- Store photographic crop dimensions in the shared scene manifest and render body scenes as decorative backgrounds behind existing content sections, never inserted image-only bands; this preserves page flow and separates imagery from source content.
