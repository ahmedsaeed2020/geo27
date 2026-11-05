import ContactForm from './ContactForm';
import { useLocale } from '@/lib/i18n';

const COPY = {
  ar: {
    eyebrow: 'عرض سعر',
    title: 'اطلب عرض سعر مخصص لمنشأتك',
    lead: 'السعر يعتمد على المنتجات والأقسام وعدد المستخدمين والفروع. اكتب احتياجك ويرسل لك فريق Digit عرضًا مكتوبًا بالنطاق والتكلفة.',
    steps: [
      ['١', 'تحدد احتياجك', 'المنتج، الأقسام، عدد المستخدمين والفروع.'],
      ['٢', 'نراجع النطاق', 'يتواصل معك مستشار لتأكيد التفاصيل.'],
      ['٣', 'يصلك العرض', 'عرض مكتوب بالنطاق ومراحل التطبيق والتكلفة.'],
    ],
    demo: 'تريد رؤية النظام أولًا؟ احجز عرضًا توضيحيًا',
  },
  en: {
    eyebrow: 'Price quote',
    title: 'Request a tailored quote for your business',
    lead: 'Pricing depends on the products, departments, users and branches you need. Tell us your needs and the Digit team sends a written scope and cost.',
    steps: [
      ['1', 'Share your needs', 'Product, departments, users and branches.'],
      ['2', 'We review scope', 'A consultant contacts you to confirm the details.'],
      ['3', 'Receive your quote', 'A written scope, rollout stages and cost.'],
    ],
    demo: 'Want to see the system first? Book a demo',
  },
} as const;

/** Standalone quote page: its own copy and a form that records the request as a price quote. */
export default function QuotePage() {
  const locale = useLocale();
  const t = COPY[locale];
  return (
    <main className="bg-background px-4 py-16 text-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <div>
          <p className="text-sm font-bold text-primary">{t.eyebrow}</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">{t.title}</h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{t.lead}</p>
          <ol className="mt-8 grid gap-4">
            {t.steps.map(([n, h, p]) => (
              <li key={n} className="flex gap-4 border-b border-border pb-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{n}</span>
                <span><span className="block font-bold">{h}</span><span className="text-sm text-muted-foreground">{p}</span></span>
              </li>
            ))}
          </ol>
          <a href={locale === 'en' ? '/en/demo' : '/demo'} className="mt-6 inline-block font-bold text-primary underline-offset-4 hover:underline">{t.demo}</a>
        </div>
        <ContactForm kind="quote" />
      </div>
    </main>
  );
}
