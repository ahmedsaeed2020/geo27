import { contrastRatio, MIN_ACCENT_CONTRAST, type BrandingConfig } from '@/lib/site-config-schema';
import { DigitMark, DigitMarkLight } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfigHistory, ConfigToolbar, useConfigEditor } from './useConfigEditor';
import { Field, NativeSelect, StatusPill, type ConfigRow, type Media, type TeamMember } from './shared';

const PRESETS: { hex: string; label: string }[] = [
  { hex: '', label: 'أخضر Digit الأصلي' },
  { hex: '#0f7a52', label: 'أخضر أعمق' },
  { hex: '#0b6e6e', label: 'فيروزي' },
  { hex: '#1d4f91', label: 'أزرق' },
  { hex: '#7a3e00', label: 'بني' },
];
const ORIGINAL_HEX = '#1f8a5b';

export default function BrandingEditor({ rows, media, owner, team, notice }: { rows: ConfigRow[]; media: Media[]; owner: boolean; team: TeamMember[]; notice: (s: string) => void }) {
  const editor = useConfigEditor('branding', rows, notice);
  const v = editor.value;
  const set = (patch: Partial<BrandingConfig>) => editor.setValue({ ...v, ...patch });
  const approved = media.filter(m => m.approval === 'approved' && !m.archived_at);
  const pngs = approved.filter(m => !m.mime || m.mime === 'image/png');
  const hexValid = !v.primary || /^#[0-9a-f]{6}$/i.test(v.primary);
  const ratio = v.primary && hexValid ? contrastRatio(v.primary, '#ffffff') : null;
  const accent = v.primary && hexValid ? v.primary : 'var(--primary)';

  const mediaSelect = (label: string, value: string, onChange: (url: string) => void, list: Media[], hint?: string) => (
    <Field label={label} hint={hint}>
      <NativeSelect value={value} onChange={e => onChange(e.target.value)}>
        <option value="">الأصل (علامة Digit)</option>
        {list.map(m => (
          <option key={m.id} value={m.url}>
            {m.title}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        الشعار والأيقونة يُختاران من الصور المعتمدة في المكتبة. اللون يطبَّق على الأزرار والروابط والعناصر البارزة في كل الصفحات، ويجب أن يحقق تباينًا كافيًا مع النص الأبيض.
      </p>
      {!owner && <p className="mb-4 text-sm text-muted-foreground">تغيير الهوية متاح للمالك فقط.</p>}
      {owner && <ConfigToolbar editor={editor as never} owner={owner} />}
      <div className="v3-editor-grid">
        <fieldset className="space-y-5" disabled={!owner}>
          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">الشعار</h3>
            {mediaSelect('شعار الخلفيات الفاتحة (الشريط العلوي)', v.logoUrl, url => set({ logoUrl: url }), approved, 'يفضّل PNG أو WebP بخلفية شفافة، بارتفاع 80 بكسل على الأقل.')}
            {mediaSelect('شعار الخلفيات الداكنة (التذييل)', v.logoOnDarkUrl, url => set({ logoOnDarkUrl: url }), approved)}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم الشعار — عربي">
                <Input value={v.logoAltAr} onChange={e => set({ logoAltAr: e.target.value })} />
              </Field>
              <Field label="Logo name — English">
                <Input dir="ltr" value={v.logoAltEn} onChange={e => set({ logoAltEn: e.target.value })} />
              </Field>
            </div>
          </section>
          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">أيقونة المتصفح</h3>
            {mediaSelect('صورة PNG مربعة', v.faviconUrl, url => set({ faviconUrl: url }), pngs, 'مربعة بمقاس 512×512 مثاليًا. تظهر في تبويب المتصفح وعند الحفظ على الجوال.')}
          </section>
          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="font-bold">لون الهوية</h3>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="cms-chip inline-flex items-center gap-2 text-sm"
                  data-active={v.primary === p.hex}
                  onClick={() => set({ primary: p.hex })}
                >
                  <span className="inline-block h-4 w-4 rounded-full border border-border" style={{ background: p.hex || ORIGINAL_HEX }} aria-hidden="true" />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="لون مخصص" className="w-40">
                <Input dir="ltr" value={v.primary} placeholder={ORIGINAL_HEX} maxLength={7} onChange={e => set({ primary: e.target.value.trim().toLowerCase() })} />
              </Field>
              <input
                type="color"
                aria-label="منتقي اللون"
                className="h-10 w-14 cursor-pointer rounded border border-input bg-background"
                value={hexValid && v.primary ? v.primary : ORIGINAL_HEX}
                onChange={e => set({ primary: e.target.value })}
              />
              {ratio !== null && (
                <StatusPill tone={ratio >= MIN_ACCENT_CONTRAST ? 'good' : 'bad'}>
                  تباين {ratio.toFixed(1)}:1 {ratio >= MIN_ACCENT_CONTRAST ? 'مقبول' : '— أقل من 4.5:1'}
                </StatusPill>
              )}
              {!hexValid && <StatusPill tone="bad">صيغة اللون غير صحيحة</StatusPill>}
            </div>
          </section>
        </fieldset>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">معاينة</p>
          <div className="flex items-center justify-between rounded-lg border border-border bg-light px-5 py-4" dir="rtl">
            <span className="flex items-center gap-2.5" dir="ltr">
              {v.logoUrl ? <img src={v.logoUrl} alt={v.logoAltAr} className="h-9 w-auto max-w-[180px] object-contain" /> : <><DigitMark className="h-9 w-9" /><span className="font-archivo text-2xl font-extrabold text-ink">DIGIT</span></>}
            </span>
            <Button style={{ background: accent }}>احجز ديمو Digit</Button>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-ink px-5 py-4 text-paper">
            {v.logoOnDarkUrl ? <img src={v.logoOnDarkUrl} alt={v.logoAltAr} className="h-9 w-auto max-w-[180px] object-contain" /> : <DigitMarkLight className="h-9 w-9" />}
            <span className="text-sm">التذييل</span>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4">
            {v.faviconUrl ? <img src={v.faviconUrl} alt="" width={32} height={32} className="h-8 w-8 rounded" /> : <img src="/favicon.png" alt="" width={32} height={32} className="h-8 w-8 rounded" />}
            <span className="text-sm">Digit — منصة ERP سعودية</span>
          </div>
          <p className="text-sm">
            رابط نموذجي{' '}
            <span className="font-semibold underline underline-offset-4" style={{ color: accent }}>
              تعرّف على الموديولات
            </span>
          </p>
        </div>
      </div>
      {owner && <ConfigHistory configKey="branding" team={team} onRestore={value => { editor.replace(value); notice('استُعيد الإصدار إلى المسودة.'); }} />}
    </>
  );
}
