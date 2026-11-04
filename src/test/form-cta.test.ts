import { describe, expect, it } from 'vitest';
import { opensRequestForm } from '@/lib/form-cta';

describe('request calls to action open the site form', () => {
  it('sends demo links (Arabic and English, with or without slash) to the form', () => {
    expect(opensRequestForm({ href: '/demo', text: 'احجز عرضًا توضيحيًا', current: '/modules/sales' })).toBe(true);
    expect(opensRequestForm({ href: '/demo-3/', text: 'احجز عرضًا توضيحيًا', current: '/' })).toBe(true);
    expect(opensRequestForm({ href: '/en/demo', text: 'Book a demo', current: '/en/pro' })).toBe(true);
  });

  it('sends the old hosted Digit pages to the form instead of leaving the site', () => {
    expect(opensRequestForm({ href: 'https://digit-erp.com/demo/', text: 'احجز Demo', current: '/pro' })).toBe(true);
  });

  it('turns in-page request jumps without a form into the form', () => {
    expect(opensRequestForm({ href: '#cta', text: 'احجز عرض POS', current: '/modules/pos' })).toBe(true);
    expect(opensRequestForm({ href: '#enterprise-form', text: 'اطلب عرض سعر Enterprise', current: '/pricing' })).toBe(true);
    expect(opensRequestForm({ href: '#', text: 'احجز عرض POS', current: '/modules/pos' })).toBe(true);
  });

  it('keeps ordinary navigation as navigation', () => {
    expect(opensRequestForm({ href: '#inside', text: 'شاهدها من الداخل', current: '/modules/sales' })).toBe(false);
    expect(opensRequestForm({ href: '#how', text: 'شاهد المسارات', current: '/services-3/training' })).toBe(false);
    expect(opensRequestForm({ href: '/modules/inventory', text: 'المخزون', current: '/' })).toBe(false);
    expect(opensRequestForm({ href: '/contact-4', text: 'تواصل معنا', current: '/' })).toBe(false);
  });

  it('never intercepts WhatsApp, email or phone contact', () => {
    expect(opensRequestForm({ href: 'https://wa.me/966591909277', text: 'واتساب المبيعات', current: '/' })).toBe(false);
    expect(opensRequestForm({ href: 'mailto:a.saeed@digit-erp.com', text: 'راسلنا بالبريد', current: '/' })).toBe(false);
  });

  it('lets a jump to a section that already holds the form scroll normally', () => {
    expect(opensRequestForm({ href: '#register', text: 'سجّل كشريك', current: '/partnership', targetHasForm: true })).toBe(false);
  });
});
