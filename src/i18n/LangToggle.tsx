import { setLang, useLang } from "./index";

/** One-click عربي / English switch (no reload). Placed in every app's top bar. */
export function LangToggle({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div data-no-i18n className={`inline-flex rounded-md border border-border p-0.5 text-xs ${className}`} role="group" aria-label="Language / اللغة">
      {([["ar", "عربي"], ["en", "English"]] as const).map(([l, label]) => (
        <button key={l} type="button" lang={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded px-2 py-0.5 ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{label}</button>
      ))}
    </div>
  );
}
