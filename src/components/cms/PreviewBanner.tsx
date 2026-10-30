import { useRouterState } from '@tanstack/react-router';
import { Eye, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n';
import { useCmsPreview } from './CmsContext';

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
