import { useNavigate } from '@tanstack/react-router';
import { focusLeadForm, type LeadContext } from '@/components/LeadCapturePanel';
import { localeHref, useLocale } from '@/lib/i18n';

/**
 * Opens the page's demo form with a DIGIT Pro context (department, workspace or question). Pages whose form is
 * switched off in the CMS send the visitor to the demo page instead, so the button never does nothing.
 */
export function useAskDemo() {
  const navigate = useNavigate();
  const locale = useLocale();
  return (context: LeadContext) => {
    if (!focusLeadForm({ product: 'pro', ...context })) void navigate({ to: localeHref('/demo', locale) });
  };
}
