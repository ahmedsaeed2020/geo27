# Orbit navigation

- Every orbit (home first fold and product overviews) is driven by `startOrbit` in `orbit-engine.ts`; components render real `<Link>` chips and the engine only writes transforms, so motion never owns content or URLs.
- Orbit modules and destinations live in `src/content/orbits.ts`; product orbits derive from `resolveCatalog`, so an unpublished department still links to its hub card and never to an empty page.
- `ProductOrbit` is an additive section inserted above an overview's existing source hero (ImportedPage via `ORBIT_PAGES`, PackagePage for Pro, FsmHubPage); it never replaces or edits the source hero.
- Orbit chips are pointer shortcuts (`aria-hidden`, `tabIndex=-1`); the named legend beside them carries the same links for keyboard and screen-reader users, and hovering/focusing a legend link highlights its chip.
- Styles are scoped under `.porb` in `src/orbit.css` with a reduced-motion override that stops rotation without hiding chips.
