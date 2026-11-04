import { CheckCircle2, CircleAlert } from 'lucide-react';
import { departmentById, departmentByPath, productByKey } from '@/content/catalog';
import { SHOTS } from '@/content/product-shots';
import { departmentPublishIssues, type CmsContent } from '@/lib/cms-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, NativeSelect, type Media } from './shared';

/** Department template settings: shown for documents whose path is a registered catalog department. */
export default function DepartmentFields({ content, path, locale, media, edit }: { content: CmsContent; path: string; locale: 'ar' | 'en'; media: Media[]; edit: (c: CmsContent) => void }) {
  const registered = departmentByPath(path);
  const meta = content.department;
  if (!meta) {
    if (!registered) return null;
    return (
      <section className="space-y-2 rounded-md border border-dashed border-border p-4">
        <h3 className="font-bold">قالب صفحة القسم</h3>
        <p className="text-sm text-muted-foreground">
          هذه الصفحة هي «{registered.label.ar}» في {productByKey(registered.product)?.name.ar}. فعّل القالب لبناء الصفحة من أقسام المحتوى؛ تبقى الصفحة الحالية ظاهرة للزوار حتى تنشر المسودة.
        </p>
        <Button variant="outline" onClick={() => edit({ ...content, department: { product: registered.product, id: registered.id, heroShot: registered.shot ?? '', heroMedia: '', heroAlt: { ar: '', en: '' }, related: [] } })}>
          تفعيل قالب صفحة القسم
        </Button>
      </section>
    );
  }
  const local = content[locale];
  const update = (v: Partial<typeof local>) => edit({ ...content, [locale]: { ...local, ...v } });
  const setMeta = (v: Partial<typeof meta>) => edit({ ...content, department: { ...meta, ...v } });
  const family = productByKey(meta.product);
  const issues = departmentPublishIssues(content);
  const approved = media.filter(m => m.approval === 'approved' && !m.archived_at);
  const dept = departmentById(meta.product, meta.id);
  return (
    <section className="space-y-4 rounded-md border border-border bg-muted/30 p-4" aria-label="قالب صفحة القسم">
      <div>
        <h3 className="font-bold">
          قالب صفحة القسم · {family?.name.ar} · {dept?.label.ar ?? meta.id}
        </h3>
        <p className="text-xs text-muted-foreground">العنوان والوصف أعلاه لمحركات البحث؛ هذه الحقول تظهر على الصفحة نفسها.</p>
      </div>
      <Field label={locale === 'ar' ? 'العنوان الرئيسي (H1)' : 'Page headline (H1)'} hint={dept ? `فارغ = ${dept.label[locale]}` : undefined}>
        <Input value={local.headline} onChange={e => update({ headline: e.target.value })} />
      </Field>
      <Field label={locale === 'ar' ? 'الوصف التمهيدي' : 'Lede'}>
        <Textarea rows={3} value={local.lede} onChange={e => update({ lede: e.target.value })} />
      </Field>
      <Field label={locale === 'ar' ? 'اسم القسم في القائمة ومسار التنقل' : 'Menu and breadcrumb label'} hint="اتركه فارغًا لاستخدام الاسم المسجّل في الكتالوج.">
        <Input value={local.navLabel} onChange={e => update({ navLabel: e.target.value })} />
      </Field>
      <Field label="الشاشة الرئيسية للقسم" hint="شاشة فعلية من النظام تُعرض بحجم كبير في أعلى الصفحة.">
        <NativeSelect value={meta.heroShot} onChange={e => setMeta({ heroShot: e.target.value })}>
          <option value="">بدون شاشة</option>
          {Object.values(SHOTS).map(s => (
            <option key={s.id} value={s.id}>
              {s.caption.ar}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {!meta.heroShot && (
        <Field label="أو صورة معتمدة من المكتبة" hint="لأقسام لم تُعتمد لها شاشات بعد؛ لا تستخدم صورًا تخيلية للنظام.">
          <NativeSelect value={meta.heroMedia} onChange={e => setMeta({ heroMedia: e.target.value })}>
            <option value="">بدون صورة</option>
            {approved.map(m => (
              <option key={m.id} value={m.url}>
                {m.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {family && family.departments.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">أقسام مرتبطة</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {family.departments
              .filter(d => d.id !== meta.id)
              .map(d => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={meta.related.includes(d.id)}
                    onChange={e => setMeta({ related: e.target.checked ? [...meta.related, d.id].slice(0, 8) : meta.related.filter(x => x !== d.id) })}
                  />
                  {d.label.ar}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      <div className="rounded-md border border-border bg-card p-3 text-sm" role="status">
        {issues.length ? (
          <>
            <p className="flex items-center gap-2 font-semibold">
              <CircleAlert size={16} className="text-destructive" />
              لا يمكن نشر الصفحة بعد. أكمل:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 ps-6 text-muted-foreground">
              {issues.map(x => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2 font-semibold text-primary">
            <CheckCircle2 size={16} />
            المحتوى مكتمل للنشر (بعد اعتماد دليل النشر).
          </p>
        )}
      </div>
    </section>
  );
}
