import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLang, setLang } from "@/i18n";
import { getSiteSession, siteSignIn } from "@/lib/siteAuth.functions";
import { markSignedIn, withNetworkRetry } from "@/lib/siteGate";

type Search = { redirect?: string | undefined };
const safe = (r?: string) => (r && r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/login") ? r : "/");

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({ redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined }),
  beforeLoad: async ({ search }) => {
    // an unreachable server only means "not known to be signed in": show the sign-in form instead of the error screen
    const session = await withNetworkRetry(() => getSiteSession()).catch(() => ({ signedIn: false }));
    if (session.signedIn) throw redirect({ href: safe(search.redirect) });
  },
  head: () => ({
    meta: [
      { title: "Sign in — DIGIT Enterprise" },
      { name: "description", content: "Sign in to the DIGIT Enterprise workspace: Pro, HR, Construction and CRM." },
      { property: "og:title", content: "Sign in — DIGIT Enterprise" },
      { property: "og:description", content: "Sign in to the DIGIT Enterprise workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const ar = useLang() === "ar";
  const t = (en: string, a: string) => (ar ? a : en);
  const { redirect: back } = Route.useSearch();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false); // the button works only after the page is interactive (no native form post)
  useEffect(() => setReady(true), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError(t("Enter your username and password.", "أدخل اسم المستخدم وكلمة المرور.")); return; }
    setBusy(true); setError("");
    try {
      const r = await siteSignIn({ data: { username, password } });
      if (!r.ok) { setError(t("Incorrect username or password.", "اسم المستخدم أو كلمة المرور غير صحيحة.")); return; }
      markSignedIn();
      await nav({ href: safe(back), replace: true });
    } catch {
      setError(t("Could not reach the server. Try again.", "تعذّر الاتصال بالخادم. حاول مرة أخرى."));
    } finally { setBusy(false); }
  };

  return (
    <main className="dx-login flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/icons/digit/logo/digit-icon-app.svg" alt="" width={56} height={56} className="h-14 w-14" />
          <h1 className="text-2xl font-semibold text-foreground">{t("Sign in to DIGIT", "تسجيل الدخول إلى ديجيت")}</h1>
          <p className="text-sm text-muted-foreground">{t("Pro · HR · Construction · CRM", "برو · الموارد البشرية · المقاولات · CRM")}</p>
        </div>
        <form method="post" onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm" noValidate>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{t("Username", "اسم المستخدم")}</span>
            <input className="field-input w-full" name="username" autoComplete="username" autoFocus dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{t("Password", "كلمة المرور")}</span>
            <input className="field-input w-full" name="password" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={busy || !ready} aria-busy={busy}>
            {busy ? t("Signing in…", "جارٍ تسجيل الدخول…") : t("Sign in", "تسجيل الدخول")}
          </button>
        </form>
        <div className="mt-4 text-center text-xs">
          <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setLang(ar ? "en" : "ar")}>{ar ? "English" : "العربية"}</button>
        </div>
      </div>
    </main>
  );
}
