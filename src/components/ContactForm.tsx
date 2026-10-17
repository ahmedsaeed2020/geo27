import { useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255).or(z.literal("")),
  phone: z.string().trim().max(30).or(z.literal("")),
  company: z.string().trim().max(100).or(z.literal("")),
  message: z.string().trim().max(1000).or(z.literal("")),
});

const COPY = {
  ar: {
    title: "أو اترك بياناتك هنا مباشرة",
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "رقم الجوال",
    company: "اسم المنشأة",
    message: "رسالتك (اختياري)",
    submit: "إرسال الطلب",
    sending: "جارٍ الإرسال…",
    success: "وصلنا طلبك وسنعاود التواصل معك قريبًا.",
    error: "تعذّر الإرسال. حاول مرة أخرى أو تواصل معنا واتساب.",
    invalid: "تحقق من البيانات المدخلة.",
  },
  en: {
    title: "Or leave your details here directly",
    name: "Name",
    email: "Email",
    phone: "Mobile number",
    company: "Company name",
    message: "Your message (optional)",
    submit: "Send request",
    sending: "Sending…",
    success: "We received your request and will get back to you soon.",
    error: "Could not send. Please try again or reach us on WhatsApp.",
    invalid: "Please check the entered data.",
  },
} as const;

export default function ContactForm({ kind }: { kind: "contact" | "demo" }) {
  const locale = useLocale();
  const t = COPY[locale];
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [invalid, setInvalid] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = schema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      company: form.get("company"),
      message: form.get("message"),
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setState("sending");
    const { error } = await supabase.from("contact_requests").insert({
      kind,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      company: parsed.data.company || null,
      message: parsed.data.message || null,
      locale,
      page_path: window.location.pathname,
    });
    setState(error ? "error" : "success");
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="font-semibold text-foreground">{t.success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6" noValidate>
      <h2 className="mb-4 text-lg font-bold text-foreground">{t.title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder={t.name} required maxLength={100} />
        <Input name="company" placeholder={t.company} maxLength={100} />
        <Input name="email" type="email" dir="ltr" placeholder={t.email} maxLength={255} />
        <Input name="phone" type="tel" dir="ltr" placeholder={t.phone} maxLength={30} />
      </div>
      <Textarea name="message" placeholder={t.message} maxLength={1000} className="mt-3" />
      {invalid && <p className="mt-2 text-sm text-destructive">{t.invalid}</p>}
      {state === "error" && <p className="mt-2 text-sm text-destructive">{t.error}</p>}
      <Button type="submit" className="mt-4" disabled={state === "sending"}>
        {state === "sending" ? t.sending : t.submit}
      </Button>
    </form>
  );
}
