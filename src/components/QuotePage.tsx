import { LeadScene } from './LeadCapturePanel';
import { LEAD_SCENE_COPY } from '@/content/lead-scene';
import { useLocale } from '@/lib/i18n';
import Header from './Header';
import Footer from './Footer';

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

/** Standalone quote page: its own copy and steps, then the meeting-scene form that records the request as a price quote. */
export default function QuotePage({ chrome = true }: { chrome?: boolean }) {
  const locale = useLocale();
  const t = COPY[locale];
  const body = (
    <main className="bg-background text-foreground">
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16">
        <div className="max-w-3xl">
          <p className="text-sm font-bold text-primary">{t.eyebrow}</p>
          <h1 className="mt-2 text-4xl font-bold leading-tight">{t.title}</h1>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">{t.lead}</p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {t.steps.map(([n, h, p]) => (
            <li key={n} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{n}</span>
              <span className="min-w-0"><span className="block font-bold">{h}</span><span className="text-sm text-muted-foreground">{p}</span></span>
            </li>
          ))}
        </ol>
        <a href={locale === 'en' ? '/en/demo' : '/demo'} className="mt-6 inline-block font-bold text-primary underline-offset-4 hover:underline">{t.demo}</a>
      </section>
      <LeadScene kind="quote" interest="" id="digit-quote" title={LEAD_SCENE_COPY.quoteFormTitle[locale]} />
    </main>
  );
  if (!chrome) return body;
  return <div className="bg-paper font-plex"><Header />{body}<Footer /></div>;
}
