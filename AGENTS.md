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
