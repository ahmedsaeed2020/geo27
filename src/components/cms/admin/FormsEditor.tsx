import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import ContactForm from '@/components/ContactForm';
import { CmsProvider } from '@/components/cms/CmsContext';
import { DEFAULT_SITE_CONFIG, type FormsConfig } from '@/lib/site-config-schema';
import { LEAD_RECIPIENT } from '@/lib/leads-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConfigHistory, ConfigToolbar, useConfigEditor } from './useConfigEditor';
import { Field, type ConfigRow, type TeamMember } from './shared';

const TOGGLES: { key: keyof FormsConfig; label: string; hint: string }[] = [
  { key: 'showInterest', label: 'المنتج أو المجال', hint: 'يُعبّأ تلقائيًا باسم الصفحة التي يرسل منها الزائر.' },
  { key: 'showRequestType', label: 'نوع الطلب', hint: 'ديمو أو استشارة أو مناقشة نطاق العمل.' },
  { key: 'showJobRole', label: 'الدور الوظيفي', hint: '' },
  { key: 'showMessage', label: 'الرسالة', hint: '' },
];

export default function FormsEditor({ rows, owner, team, notice }: { rows: ConfigRow[]; owner: boolean; team: TeamMember[]; notice: (s: string) => void }) {
  const editor = useConfigEditor('forms', rows, notice);
  const v = editor.value;
  const set = (patch: Partial<FormsConfig>) => editor.setValue({ ...v, ...patch });
  const text = (key: 'heading' | 'submit' | 'success', locale: 'ar' | 'en', value: string) => set({ [key]: { ...v[key], [locale]: value } });
  const moveOption = (i: number, d: -1 | 1) => {
    const a = [...v.interestOptions];
    const x = a[i];
    const y = a[i + d];
    if (!x || !y) return;
    a[i] = y;
    a[i + d] = x;
    set({ interestOptions: a });
  };

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        يطبَّق على نموذج الطلب في كل الصفحات. الاسم والمنشأة ووسيلة تواصل واحدة والموافقة مطلوبة دائمًا ولا يمكن إيقافها. الطلبات تُحفظ في «طلبات العملاء»، وعنوان الإشعارات المعتمد <span dir="ltr">{LEAD_RECIPIENT}</span>.
      </p>
      <ConfigToolbar editor={editor as never} owner={owner} />
      <div className="v3-editor-grid">
        <div className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">الحقول الاختيارية</h3>
            {TOGGLES.map(t => (
              <div key={t.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  {t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
                </div>
                <Switch aria-label={`إظهار ${t.label}`} checked={v[t.key] as boolean} onCheckedChange={c => set({ [t.key]: c })} />
              </div>
            ))}
            <div className="border-t border-border pt-4">
              <label className="flex items-center justify-between gap-4 text-sm">
                جعل الدور الوظيفي مطلوبًا
                <Switch aria-label="الدور الوظيفي مطلوب" checked={v.requireJobRole} disabled={!v.showJobRole} onCheckedChange={c => set({ requireJobRole: c })} />
              </label>
              <label className="mt-3 flex items-center justify-between gap-4 text-sm">
                جعل الرسالة مطلوبة
                <Switch aria-label="الرسالة مطلوبة" checked={v.requireMessage} disabled={!v.showMessage} onCheckedChange={c => set({ requireMessage: c })} />
              </label>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">النصوص</h3>
            <p className="text-xs text-muted-foreground">اترك الحقل فارغًا لاستخدام النص الأصلي.</p>
            {(
              [
                ['heading', 'عنوان النموذج', 'ناقش احتياج منشأتك مع Digit', 'Discuss your business needs with Digit'],
                ['submit', 'زر الإرسال', 'إرسال الطلب', 'Send request'],
                ['success', 'رسالة النجاح', 'تم حفظ طلبك لدى فريق Digit.', 'Your request has been saved with the Digit team.'],
              ] as const
            ).map(([key, label, ar, en]) => (
              <div key={key} className="grid gap-3 sm:grid-cols-2">
                <Field label={`${label} — عربي`}>
                  <Input value={v[key].ar} placeholder={ar} onChange={e => text(key, 'ar', e.target.value)} />
                </Field>
                <Field label={`${label} — English`}>
                  <Input dir="ltr" value={v[key].en} placeholder={en} onChange={e => text(key, 'en', e.target.value)} />
                </Field>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">خيارات «المنتج أو المجال»</h3>
            <p className="text-xs text-muted-foreground">عند إضافة خيارات يصبح الحقل قائمة اختيار. بدون خيارات يبقى حقلًا نصيًا. اسم الصفحة الحالية يُضاف تلقائيًا كخيار أول.</p>
            {v.interestOptions.map((o, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="عربي" className="min-w-[10rem] flex-1">
                  <Input value={o.ar} onChange={e => set({ interestOptions: v.interestOptions.map((x, j) => (j === i ? { ...x, ar: e.target.value } : x)) })} />
                </Field>
                <Field label="English" className="min-w-[10rem] flex-1">
                  <Input dir="ltr" value={o.en} onChange={e => set({ interestOptions: v.interestOptions.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })} />
                </Field>
                <Button size="icon" variant="ghost" aria-label="أعلى" disabled={i === 0} onClick={() => moveOption(i, -1)}>
                  <ArrowUp size={15} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="أسفل" disabled={i === v.interestOptions.length - 1} onClick={() => moveOption(i, 1)}>
                  <ArrowDown size={15} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="حذف الخيار" onClick={() => set({ interestOptions: v.interestOptions.filter((_, j) => j !== i) })}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={v.interestOptions.length >= 30} onClick={() => set({ interestOptions: [...v.interestOptions, { ar: '', en: '' }] })}>
              <Plus size={14} />
              إضافة خيار
            </Button>
          </section>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">معاينة حية بالعربية — لا تُرسل أي طلب.</p>
          <CmsProvider records={[]} config={{ ...DEFAULT_SITE_CONFIG, forms: { ...v, interestOptions: v.interestOptions.filter(o => o.ar && o.en) } }}>
            <ContactForm kind="demo" interest="DIGIT Pro" demo />
          </CmsProvider>
        </div>
      </div>
      <ConfigHistory configKey="forms" team={team} onRestore={value => { editor.replace(value); notice('استُعيد الإصدار إلى المسودة.'); }} />
    </>
  );
}
