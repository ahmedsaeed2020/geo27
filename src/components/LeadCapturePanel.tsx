import ContactForm from './ContactForm';
import { useLocale } from '@/lib/i18n';
import { Button } from './ui/button';

export type LeadContext = { product?: string; department?: string; topic?: string };

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
  form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  form.querySelector<HTMLInputElement>('input[name=name]')?.focus({ preventScroll: true });
  return true;
}

export default function LeadCapturePanel({ interest = 'DIGIT', product, department }: { interest?: string } & LeadContext) {
  const l = useLocale();
  return (
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
  );
}
