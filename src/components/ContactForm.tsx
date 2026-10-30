import { useState, type FormEvent } from "react";
import { useServerFn } from '@tanstack/react-start';
import { useHydrated } from '@tanstack/react-router';
import { submitLead } from '@/lib/leads.functions';
import { leadSchema } from '@/lib/leads-schema';
import { useLocale } from "@/lib/i18n";
import { useSiteConfig } from '@/components/cms/CmsContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const COPY = {
  ar: {
    heading: "ناقش احتياج منشأتك مع Digit",
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "رقم الجوال",
    company: "اسم المنشأة",
    interest: "المنتج أو المجال",
    requestType: "نوع الطلب",
    demo: "احجز ديمو Digit",
    consultation: "استشارة",
    scope: "مناقشة نطاق العمل",
    jobRole: "دورك الوظيفي",
    message: "رسالتك",
    optional: " (اختياري)",
    channel: "أدخل بريدًا صحيحًا أو رقم جوال للتواصل.",
    consent: "أوافق على استخدام بياناتي للتواصل بشأن هذا الطلب فقط.",
    submit: "إرسال الطلب",
    sending: "جارٍ الإرسال…",
    success: "تم حفظ طلبك لدى فريق Digit.",
    error: "تعذّر الإرسال. حاول مرة أخرى أو تواصل معنا واتساب.",
    invalid: "تحقق من البيانات المدخلة.",
    demoOnly: "معاينة فقط — لم يُرسل أي طلب.",
  },
  en: {
    heading: "Discuss your business needs with Digit",
    name: "Name",
    email: "Email",
    phone: "Mobile number",
    company: "Company name",
    interest: "Product or area",
    requestType: "Request type",
    demo: "Book Digit demo",
    consultation: "Consultation",
    scope: "Discuss scope",
    jobRole: "Job role",
    message: "Your message",
    optional: " (optional)",
    channel: "Enter a valid email or mobile number.",
    consent: "I agree to use my details to contact me about this request only.",
    submit: "Send request",
    sending: "Sending…",
    success: "Your request has been saved with the Digit team.",
    error: "Could not send. Please try again or reach us on WhatsApp.",
    invalid: "Please check the entered data.",
    demoOnly: "Preview only — no request was sent.",
  },
} as const;

/** Contextual lead form. Field visibility and copy come from the published form settings; `demo` renders it without submitting. */
export default function ContactForm({ kind, interest = '', demo = false }: { kind: "contact" | "demo"; interest?: string; demo?: boolean }) {
  const locale = useLocale();
  const t = COPY[locale];
  const settings = useSiteConfig().forms;
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [invalid, setInvalid] = useState(false);
  const saveLead = useServerFn(submitLead);
  // Until hydration the browser would submit natively (GET with the visitor's details in the URL), so the button waits.
  const hydrated = useHydrated();
  const requireJob = settings.showJobRole && settings.requireJobRole;
  const requireMessage = settings.showMessage && settings.requireMessage;
  const options = settings.interestOptions.map(o => o[locale]);
  const interestOptions = options.length && interest && !options.includes(interest) ? [interest, ...options] : options;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const jobRole = String(form.get('jobRole') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();
    const parsed = leadSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      company: form.get("company"),
      message,
      interest: settings.showInterest ? form.get('interest') ?? '' : interest,
      requestType: settings.showRequestType ? form.get('requestType') : kind === 'demo' ? 'demo' : 'consultation',
      jobRole,
      locale,
      pagePath: window.location.pathname,
      referrer: document.referrer,
      utm: Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([key]) => key.startsWith('utm_'))),
      consent: form.get('consent') === 'on',
      website: form.get('website') ?? '',
    });
    if (!parsed.success || (requireJob && !jobRole) || (requireMessage && !message)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (demo) {
      setState('success');
      return;
    }
    setState("sending");
    try {
      await saveLead({ data: parsed.data });
      setState('success');
    } catch {
      setState('error');
    }
  }

  if (state === "success") {
    return (
      <div role="status" className="border border-border bg-card p-6 text-center">
        <p className="font-semibold text-foreground">{demo ? t.demoOnly : settings.success[locale] || t.success}</p>
      </div>
    );
  }

  const optional = (required: boolean) => (required ? '' : t.optional);

  return (
    <form onSubmit={handleSubmit} method="post" className="border border-border bg-card p-6" noValidate data-contextual-form={demo ? undefined : true}>
      <h2 className="mb-4 text-lg font-bold text-foreground">{settings.heading[locale] || t.heading}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{t.name}<Input name="name" autoComplete="name" required maxLength={100} /></label>
        <label>{t.company}<Input name="company" autoComplete="organization" required maxLength={160} /></label>
        <label>{t.email}<Input name="email" type="email" autoComplete="email" dir="ltr" maxLength={255} /></label>
        <label>{t.phone}<Input name="phone" type="tel" autoComplete="tel" dir="ltr" maxLength={30} /></label>
        {settings.showInterest && (
          <label>
            {t.interest}
            {interestOptions.length ? (
              <select name="interest" defaultValue={interest || interestOptions[0]} className="h-10 w-full rounded-md border border-input bg-background px-3">
                {interestOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input name="interest" defaultValue={interest} maxLength={180} />
            )}
          </label>
        )}
        {settings.showRequestType && (
          <label>
            {t.requestType}
            <select name="requestType" defaultValue={kind === 'demo' ? 'demo' : 'consultation'} className="h-10 w-full rounded-md border border-input bg-background px-3">
              <option value="demo">{t.demo}</option>
              <option value="consultation">{t.consultation}</option>
              <option value="scope">{t.scope}</option>
            </select>
          </label>
        )}
        {settings.showJobRole && <label>{t.jobRole}{optional(requireJob)}<Input name="jobRole" required={requireJob} maxLength={120} /></label>}
      </div>
      {settings.showMessage && <label className="mt-3 block">{t.message}{optional(requireMessage)}<Textarea name="message" required={requireMessage} maxLength={2000} /></label>}
      <div className="hidden" aria-hidden="true"><Input name="website" tabIndex={-1} autoComplete="off" /></div>
      <p className="mt-3 text-sm text-muted-foreground">{t.channel}</p>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1" />{t.consent}</label>
      {invalid && <p role="alert" className="mt-2 text-sm text-destructive">{t.invalid}</p>}
      {state === "error" && <p className="mt-2 text-sm text-destructive">{t.error}</p>}
      <Button type="submit" className="mt-4" disabled={!hydrated || state === "sending"}>
        {state === "sending" ? t.sending : settings.submit[locale] || t.submit}
      </Button>
    </form>
  );
}
