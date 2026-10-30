import { getPublishedContent } from '@/lib/cms.functions';
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withSeo } from "@/lib/seo";
import "@lovable.dev/cloud-auth-js/styles.css";

export const Route = createFileRoute("/auth")({
 loader: () => getPublishedContent(),
  head: ({ loaderData }) =>
    withSeo("/auth", {
      meta: [
        { title: "تسجيل دخول الإدارة — Digit" },
        { name: "robots", content: "noindex" },
      ],
    }, loaderData),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleEmailSignIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError("بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.");
      return;
    }
    navigate({ to: "/admin" });
  }

  async function handleOAuth(provider: "google" | "lovable") {
    setError(null);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("تعذّر تسجيل الدخول. حاول مرة أخرى.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/admin" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-xl font-bold text-foreground">تسجيل دخول الإدارة</h1>
        <p className="mt-1 text-sm text-muted-foreground">لوحة تحكم موقع Digit — للمشرفين فقط.</p>

        <form onSubmit={handleEmailSignIn} className="mt-6 flex flex-col gap-3">
          <Input
            type="email"
            dir="ltr"
            placeholder="البريد الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            type="password"
            dir="ltr"
            placeholder="كلمة المرور"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          أو
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" onClick={() => handleOAuth("google")}>
            المتابعة بحساب Google
          </Button>
          <button type="button" className="lovable-auth-button" onClick={() => handleOAuth("lovable")}>
            Continue with Lovable
          </button>
        </div>
      </div>
    </div>
  );
}
