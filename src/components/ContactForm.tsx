import { useState, type FormEvent } from "react";
import { useServerFn } from '@tanstack/react-start';
import { submitLead } from '@/lib/leads.functions';
import { leadSchema } from '@/lib/leads-schema';
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

export default function ContactForm({ kind, interest = '' }: { kind: "contact" | "demo"; interest?:string }) {
  const locale = useLocale();
  const t = COPY[locale];
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [invalid, setInvalid] = useState(false);
  const saveLead = useServerFn(submitLead);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = leadSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      company: form.get("company"),
      message: form.get("message"),
      interest:form.get('interest'),requestType:form.get('requestType'),jobRole:form.get('jobRole'),
      locale,pagePath:window.location.pathname,referrer:document.referrer,
      utm:Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([key])=>key.startsWith('utm_'))),
      consent:form.get('consent')==='on',website:form.get('website')??'',
    });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setState("sending");
    try { await saveLead({data:parsed.data});setState('success'); } catch { setState('error'); }
  }

  if (state === "success") {
    return (
      <div role="status" className="border border-border bg-card p-6 text-center">
        <p className="font-semibold text-foreground">{locale==='ar'?'تم حفظ طلبك لدى فريق Digit.':'Your request has been saved with the Digit team.'}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border bg-card p-6" noValidate data-contextual-form>
      <h2 className="mb-4 text-lg font-bold text-foreground">{locale==='ar'?'ناقش احتياج منشأتك مع Digit':'Discuss your business needs with Digit'}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>{t.name}<Input name="name" autoComplete="name" required maxLength={100} /></label>
        <label>{t.company}<Input name="company" autoComplete="organization" required maxLength={160} /></label>
        <label>{t.email}<Input name="email" type="email" autoComplete="email" dir="ltr" maxLength={255} /></label>
        <label>{t.phone}<Input name="phone" type="tel" autoComplete="tel" dir="ltr" maxLength={30} /></label>
        <label>{locale==='ar'?'المنتج أو المجال':'Product or area'}<Input name="interest" defaultValue={interest} maxLength={180}/></label>
        <label>{locale==='ar'?'نوع الطلب':'Request type'}<select name="requestType" defaultValue={kind==='demo'?'demo':'consultation'} className="h-10 w-full rounded-md border border-input bg-background px-3"><option value="demo">{locale==='ar'?'احجز ديمو Digit':'Book Digit demo'}</option><option value="consultation">{locale==='ar'?'استشارة':'Consultation'}</option><option value="scope">{locale==='ar'?'مناقشة نطاق العمل':'Discuss scope'}</option></select></label>
        <label>{locale==='ar'?'دورك الوظيفي (اختياري)':'Job role (optional)'}<Input name="jobRole" maxLength={120}/></label>
      </div>
      <label className="mt-3 block">{t.message}<Textarea name="message" maxLength={2000}/></label>
      <div className="hidden" aria-hidden="true"><Input name="website" tabIndex={-1} autoComplete="off"/></div>
      <p className="mt-3 text-sm text-muted-foreground">{locale==='ar'?'أدخل بريدًا صحيحًا أو رقم جوال للتواصل.':'Enter a valid email or mobile number.'}</p>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" name="consent" required className="mt-1"/>{locale==='ar'?'أوافق على استخدام بياناتي للتواصل بشأن هذا الطلب فقط.':'I agree to use my details to contact me about this request only.'}</label>
      {invalid && <p role="alert" className="mt-2 text-sm text-destructive">{t.invalid}</p>}
      {state === "error" && <p className="mt-2 text-sm text-destructive">{t.error}</p>}
      <Button type="submit" className="mt-4" disabled={state === "sending"}>
        {state === "sending" ? t.sending : t.submit}
      </Button>
    </form>
  );
}
