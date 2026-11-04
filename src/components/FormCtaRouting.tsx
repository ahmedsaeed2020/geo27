import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { focusLeadForm } from '@/components/LeadCapturePanel';
import { opensRequestForm } from '@/lib/form-cta';
import { localeHref, useLocale } from '@/lib/i18n';

/**
 * Site-wide: a click on any request call to action (book a demo, request a quote, subscribe, talk to sales) opens the
 * request form on the current page; pages without one go to /demo. Runs in the capture phase so it wins over router
 * links, and leaves modified clicks (new tab, etc.) to the browser.
 */
export default function FormCtaRouting() {
  const navigate = useNavigate();
  const locale = useLocale();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.closest('[data-form-cta-ignore]')) return;
      const href = link.getAttribute('href') ?? '';
      const hash = href.startsWith('#') ? href : href.includes('#') ? href.slice(href.indexOf('#')) : '';
      let target: Element | null = null;
      try { target = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; } catch { target = null; }
      const text = link.textContent ?? '';
      if (!opensRequestForm({ href, text, current: window.location.pathname, targetHasForm: Boolean(target?.querySelector('form')) })) return;
      event.preventDefault();
      event.stopPropagation();
      if (!focusLeadForm()) void navigate({ to: localeHref('/demo', locale) });
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [navigate, locale]);
  return null;
}
