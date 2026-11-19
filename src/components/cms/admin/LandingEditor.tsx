import { GEO_COPY } from '@/content/geointime';
import { LANDING_FIELDS, type LandingField } from '@/lib/site-config-schema';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfigToolbar, useConfigEditor } from './useConfigEditor';
import type { ConfigRow } from './shared';

const LABELS: Record<LandingField, string> = {
  headerCta: 'زر الشريط العلوي', overline: 'السطر فوق العنوان', title: 'العنوان — السطر الأول', titleB: 'العنوان — بداية السطر الثاني',
  titleEm: 'الكلمة المميزة باللون', titleC: 'العنوان — نهاية السطر الثاني', lead: 'الجملة الرئيسية', description: 'الوصف',
  primary: 'الزر الأساسي', secondary: 'الزر الثانوي',
};
const source = (l: 'ar' | 'en', f: LandingField) => (f === 'headerCta' ? GEO_COPY[l].headerCta : (GEO_COPY[l].hero as Record<string, unknown>)[f]) as string;

/** Text overrides for the GeoInTime landing first fold; empty fields fall back to the source copy. */
export default function LandingEditor({ rows, owner, notice }: { rows: ConfigRow[]; owner: boolean; notice: (s: string) => void }) {
  const editor = useConfigEditor('landing', rows, notice);
  const v = editor.value;
  const set = (l: 'ar' | 'en', f: LandingField, s: string) => editor.setValue({ ...v, [l]: { ...v[l], [f]: s } });
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">عدّل نصوص أول الصفحة الرئيسية بالعربي والإنجليزي. اترك الحقل فارغًا لاستخدام النص الأصلي. احفظ كمسودة ثم انشر ليظهر للزوار.</p>
      <ConfigToolbar editor={editor} owner={owner} />
      <div className="grid gap-6 lg:grid-cols-2">
        {(['ar', 'en'] as const).map(l => (
          <section key={l} className="space-y-3 rounded-lg border border-border bg-card p-5" dir={l === 'ar' ? 'rtl' : 'ltr'}>
            <h3 className="font-bold">{l === 'ar' ? 'العربية' : 'English'}</h3>
            {LANDING_FIELDS.map(f => (
              <label key={f} className="block space-y-1 text-sm">
                <span className="font-medium">{LABELS[f]}</span>
                {f === 'description'
                  ? <Textarea value={v[l][f] ?? ''} placeholder={source(l, f)} onChange={e => set(l, f, e.target.value)} />
                  : <Input value={v[l][f] ?? ''} placeholder={source(l, f)} onChange={e => set(l, f, e.target.value)} />}
              </label>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
