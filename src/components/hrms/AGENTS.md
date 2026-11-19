## src/components/hrms rules
- HR PWA screens (`src/routes/hr.*` + `src/components/hrms/`) render adapter-backed content only after hydration (`useHydrated` in HrShell), because records live in localStorage and SSR renders an empty store; keep that gate when adding HR screens.
