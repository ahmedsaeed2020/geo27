import { loadPublished } from '@/lib/cms-query';
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withSeo } from "@/lib/seo";
import { MEDIA } from "@/components/geointime/geo-media";
import "@/lux-auth.css";

export const Route = createFileRoute("/auth")({
  loader: ({ context, location }) => loadPublished(context.queryClient, location),
  head: ({ loaderData }) =>
    withSeo("/auth", {
      meta: [
        { title: "تسجيل الدخول — GeoInTime" },
        { name: "description", content: "بوابة الدخول الآمنة لفريق GeoInTime: الإدارة وإدارة العملاء." },
        { name: "robots", content: "noindex" },
      ],
    }, loaderData),
  component: AuthPage,
});

function AuthPage() {
  const [ar, setAr] = useState(true);
  const t = (a: string, e: string) => (ar ? a : e);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (e) return setError(t("بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.", "Incorrect email or password."));
    window.location.assign("/digit-crm/");
  }

  return (
    <main className="lux-auth" dir={ar ? "rtl" : "ltr"}>
      <div className="lux-glow lux-glow-a" aria-hidden />
      <div className="lux-glow lux-glow-b" aria-hidden />
      <div className="lux-grid" aria-hidden />
      <section className="lux-card">
        <img src={MEDIA.logoOnDark.src} alt="GeoInTime" className="lux-logo" width={2048} height={615} />
        <h1>{t("تسجيل الدخول إلى النظام", "Sign in to your workspace")}</h1>
        <p className="lux-sub">{t("الإدارة · إدارة العملاء · المبيعات", "Admin · CRM · Sales")}</p>
        <form onSubmit={submit} className="lux-form">
          <label>
            <span>{t("البريد الإلكتروني", "Email")}</span>
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
          </label>
          <label>
            <span>{t("كلمة المرور", "Password")}</span>
            <div className="lux-pass">
              <input type={show ? "text" : "password"} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <button type="button" onClick={() => setShow(!show)}>{show ? t("إخفاء", "Hide") : t("إظهار", "Show")}</button>
            </div>
          </label>
          {error && <p role="alert" className="lux-error">{error}</p>}
          <button type="submit" className="lux-submit" disabled={busy}>
            {busy ? t("جارٍ الدخول…", "Signing in…") : t("دخول", "Sign in")}
          </button>
        </form>
        <div className="lux-foot">
          <span>{t("اتصال آمن ومشفّر", "Secure, encrypted connection")}</span>
          <button type="button" onClick={() => setAr(!ar)}>{ar ? "English" : "العربية"}</button>
        </div>
      </section>
    </main>
  );
}
