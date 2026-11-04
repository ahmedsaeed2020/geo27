import { useRouterState } from '@tanstack/react-router';
import { Eye, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { useCmsPreview } from './CmsContext';
import type { SiteConfig } from '@/lib/site-config-schema';

type DraftKey = 'forms' | 'home' | 'pro' | 'catalog';
export type SettingsDraftState =
  | { status: 'off' }
  | { status: 'loading' | 'denied'; key: DraftKey }
  | { [K in DraftKey]: { status: 'ok'; key: K; value: SiteConfig[K] } }[DraftKey];

const DRAFT_LABEL: Record<DraftKey, [string, string]> = {
  home: ['أقسام الصفحة الرئيسية', 'Home page sections'],
  pro: ['أقسام صفحة Pro', 'Pro page sections'],
  forms: ['نموذج الطلب', 'Request form'],
  catalog: ['ترتيب المنتجات والأقسام', 'Product and department order'],
};

/** Fixed notice shown whenever a page is opened through a draft preview link. */
export default function PreviewBanner() {
  const preview = useCmsPreview();
  const locale = useLocale();
  const pathname = useRouterState({ select: s => s.location.pathname });
  if (!preview) return null;
  const ar = locale === 'ar';
  const expires =
    preview.status === 'ok'
      ? new Date(preview.expiresAt).toLocaleString(ar ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
  return (
    <div role="status" className="cms-preview-banner" data-state={preview.status} dir={ar ? 'rtl' : 'ltr'}>
      <Eye size={18} aria-hidden="true" />
      <p>
        {preview.status === 'ok'
          ? ar
            ? `معاينة مسودة غير منشورة · لا يراها الزوار · ينتهي الرابط ${expires}`
            : `Unpublished draft preview · not visible to visitors · link expires ${expires}`
          : ar
            ? 'رابط المعاينة منتهي أو أُلغي — تظهر الصفحة المنشورة.'
            : 'This preview link expired or was revoked — showing the published page.'}
      </p>
      <a href={pathname} className="cms-preview-exit">
        <X size={16} aria-hidden="true" />
        {ar ? 'إنهاء المعاينة' : 'Exit preview'}
      </a>
    </div>
  );
}

/** Shown while a signed-in editor views saved, unpublished site settings on the real page. */
export function SettingsDraftBanner({ state }: { state: SettingsDraftState }) {
  const locale = useLocale();
  const pathname = useRouterState({ select: s => s.location.pathname });
  if (state.status === 'off') return null;
  const ar = locale === 'ar';
  const [labelAr, labelEn] = DRAFT_LABEL[state.key];
  const text =
    state.status === 'ok'
      ? ar ? `معاينة مسودة «${labelAr}» · لا يراها الزوار حتى النشر` : `Previewing draft ${labelEn} · visitors see it only after publishing`
      : state.status === 'loading'
        ? ar ? 'جارٍ تحميل المسودة…' : 'Loading draft…'
        : ar ? 'سجّل الدخول بحساب محرر لمعاينة المسودة — تظهر الإعدادات المنشورة.' : 'Sign in as an editor to preview drafts — showing published settings.';
  return (
    <div role="status" className="cms-preview-banner" data-state={state.status === 'denied' ? 'invalid' : 'ok'} dir={ar ? 'rtl' : 'ltr'}>
      <Eye size={18} aria-hidden="true" />
      <p>{text}</p>
      <a href={pathname} className="cms-preview-exit">
        <X size={16} aria-hidden="true" />
        {ar ? 'إنهاء المعاينة' : 'Exit preview'}
      </a>
    </div>
  );
}
