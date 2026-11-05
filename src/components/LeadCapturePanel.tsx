import ContactForm from './ContactForm';
import { useLocale } from '@/lib/i18n';
import { Button } from './ui/button';
import SuccessStories from './stories/SuccessStories';

export type LeadContext = { product?: string; department?: string; topic?: string; interest?: string };

/**
 * Scrolls to the page's demo form and focuses it. An optional product/department context (for example a department
 * card on a product hub, or a DIGIT Pro workspace) is attached to the next request. Returns false when the page has no form.
 */
export function focusLeadForm(context?: LeadContext): boolean {
  const form = document.querySelector<HTMLFormElement>('[data-contextual-form]');
  if (!form) return false;
  if (context && typeof context.product === 'string') {
    form.dataset['leadProduct'] = context.product;
    form.dataset['leadDepartment'] = context.department ?? '';
    form.dataset['leadTopic'] = context.topic ?? '';
  }
  // A workspace or question names what the visitor asked about in the visible interest field, when it can.
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement>('[name=interest]');
  if (context?.interest && field) {
    if (field instanceof HTMLSelectElement) {
      if (![...field.options].some(o => o.value === context.interest)) field.add(new Option(context.interest, context.interest), 0);
      field.value = context.interest;
    } else field.value = context.interest;
  }
  form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  form.querySelector<HTMLInputElement>('input[name=name]')?.focus({ preventScroll: true });
  return true;
}

/**
 * The demo form. By default the «قصص النجاح» customer-logo ticker sits right above it on the same background;
 * pages that place the ticker themselves (the home section list) pass `stories={false}`.
 */
export default function LeadCapturePanel({ interest = 'DIGIT', product, department, stories = true }: { interest?: string; stories?: boolean } & LeadContext) {
  const l = useLocale();
  return (
    <>
    {stories && <SuccessStories />}
    <section id="digit-lead" className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">DIGIT · {interest}</p>
          <h2 className="text-3xl font-bold text-foreground">{l === 'ar' ? 'ديمو مبني على احتياجك' : 'A demo built around your needs'}</h2>
        </div>
        <Button asChild variant="outline">
          <a href="https://wa.me/966595051150" target="_blank" rel="noopener noreferrer">
            {l === 'ar' ? 'تواصل عبر واتساب' : 'Contact on WhatsApp'}
          </a>
        </Button>
      </div>
      <ContactForm kind="demo" interest={interest} {...(product ? { product } : {})} {...(department ? { department } : {})} />
    </section>
    </>
  );
}
