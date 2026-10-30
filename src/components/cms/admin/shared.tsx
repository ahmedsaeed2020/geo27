import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@/lib/cms.functions';
import { refreshPublishedSite } from '@/lib/cms-query';

export type { Workspace };
export type Doc = Workspace['docs'][number];
export type Media = Workspace['media'][number];
export type Lead = Workspace['leads'][number];
export type TeamMember = Workspace['team'][number];
export type RedirectRow = Workspace['redirects'][number];
export type ConfigRow = Workspace['config'][number];
export type PreviewRow = Workspace['previews'][number];

export const WORKSPACE_KEY = ['cms-workspace'] as const;

export const STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  reviewed: 'تمت المراجعة',
  qualified: 'مؤهل',
  contacted: 'تم التواصل',
  meeting: 'اجتماع محدد',
  opportunity: 'فرصة',
  won: 'تم التعاقد',
  lost: 'لم يكتمل',
  closed: 'مغلق',
};

export const ROLE_LABELS: Record<'admin' | 'owner' | 'editor' | 'sales', string> = {
  admin: 'مالك النظام',
  owner: 'مالك',
  editor: 'محرر محتوى',
  sales: 'مبيعات',
};

export const DOC_STATE_LABELS: Record<string, string> = {
  draft: 'مسودة',
  review: 'للمراجعة',
  published: 'منشور',
  archived: 'غير منشور',
};

export const REVISION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  save: 'حفظ',
  publish: 'نشر',
  unpublish: 'إلغاء النشر',
  schedule: 'جدولة',
};

const ERRORS: [RegExp, string][] = [
  [/^Forbidden$/, 'لا تملك صلاحية هذا الإجراء.'],
  [/Publishing requires owner approval/, 'النشر يتطلب صلاحية المالك.'],
  [/Evidence approval is required/, 'اعتمد دليل النشر أولًا (حقل «دليل النشر»).'],
  [/approved library image/, 'استخدم صورة معتمدة وغير مؤرشفة من المكتبة.'],
  [/Save conflict/, 'تعارض في الحفظ: عدّل شخص آخر هذه الصفحة. حدّث الصفحة ثم أعد المحاولة.'],
  [/Someone else changed these settings/, 'عدّل شخص آخر هذه الإعدادات. حدّث الصفحة ثم أعد المحاولة.'],
  [/Verify your authenticator app before publishing/, 'أدخل رمز تطبيق المصادقة في هذه الجلسة قبل النشر.'],
  [/Verify your authenticator app in this session/, 'أدخل رمز تطبيق المصادقة في هذه الجلسة أولًا.'],
  [/Choose a publish or unpublish time/, 'اختر موعد نشر أو موعد إلغاء نشر.'],
  [/publish time at least one minute ahead/, 'اختر موعد نشر بعد دقيقة على الأقل من الآن.'],
  [/unpublish time at least one minute ahead/, 'اختر موعد إلغاء نشر بعد دقيقة على الأقل من الآن.'],
  [/Unpublish time must be after/, 'موعد إلغاء النشر يجب أن يكون بعد موعد النشر.'],
  [/valid internal page link/, 'استخدم رابطًا داخليًا صحيحًا مثل /modules/sales.'],
  [/valid old path/, 'أدخل مسارًا قديمًا صحيحًا مثل /old-page.'],
  [/internal path such as/, 'أدخل مسارًا داخليًا مثل /modules/sales أو عنوانًا يبدأ بـ https://.'],
  [/cannot point to itself/, 'لا يمكن أن يحوّل الرابط إلى نفسه.'],
  [/already exists/, 'يوجد تحويل لهذا المسار بالفعل.'],
  [/create a loop/, 'هذا التحويل سيُنشئ حلقة لا تنتهي.'],
  [/Only the owner can change redirects/, 'تعديل التحويلات متاح للمالك فقط.'],
  [/No account uses this email/, 'لا يوجد حساب بهذا البريد. أنشئ الحساب أولًا ثم امنحه الصلاحية.'],
  [/already the site owner/, 'هذا الحساب هو مالك النظام بالفعل.'],
  [/Keep at least one owner/, 'يجب أن يبقى مالك واحد على الأقل.'],
  [/requires the site owner/, 'هذا التغيير يتطلب صلاحية المالك.'],
  [/logo and icon/, 'استخدم صورًا معتمدة من المكتبة للشعار والأيقونة.'],
  [/browser icon must be a PNG/, 'أيقونة المتصفح يجب أن تكون صورة PNG.'],
  [/4\.5:1 contrast/, 'اللون المختار لا يحقق تباينًا كافيًا مع نص الأزرار الأبيض (4.5:1).'],
  [/Save the page before sharing/, 'احفظ الصفحة أولًا قبل مشاركة رابط معاينة.'],
  [/File too large/, 'الحد الأقصى لحجم الصورة 8 ميجابايت.'],
  [/Only PNG, JPEG and WebP/, 'الصيغ المقبولة: PNG وJPEG وWebP فقط.'],
  [/still used/, 'الصورة مستخدمة في صفحات منشورة أو مسودات؛ أزلها منها أولًا.'],
];

export function errorText(error: unknown, fallback = 'تعذّر تنفيذ الإجراء. حاول مرة أخرى.'): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  for (const [pattern, text] of ERRORS) if (pattern.test(message)) return text;
  return fallback;
}

export function formatDate(value: string | null | undefined, withTime = true): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-SA-u-nu-latn', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export function NativeSelect({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60 ${className}`} />;
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string | undefined; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 text-sm font-medium ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function StatusPill({ tone = 'muted', children }: { tone?: 'muted' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return <span className="cms-pill" data-tone={tone}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-muted-foreground">{children}</p>;
}

/** Refreshes the admin data and the cached public content after a change. */
export function useRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }), refreshPublishedSite(queryClient)]);
  };
}

export function teamName(team: TeamMember[], id: string | null | undefined): string {
  if (!id) return 'النظام';
  const m = team.find(t => t.user_id === id);
  return m?.email || id.slice(0, 8);
}
