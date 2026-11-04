import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { BLOCK_TYPES, type CmsBlock, type CmsBlockItem, type DepartmentMeta } from '@/lib/cms-schema';
import { ALL_SHOTS as SHOTS, SHOT_GROUPS } from '@/content/screens';
import { hrModuleBySlug } from '@/content/hr/hr-modules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, NativeSelect, type Media } from './shared';

/** Editor labels and what each content region is for (shown as a hint). */
export const BLOCK_INFO: Record<CmsBlock['type'], { label: string; hint: string }> = {
  story: { label: 'قصة ميزة', hint: 'نص مع شاشة فعلية كبيرة، ويمكن تكبير جزء محدد منها.' },
  workflow: { label: 'رحلة عمل', hint: 'مراحل مرقّمة؛ كل عنصر مرحلة.' },
  faq: { label: 'أسئلة شائعة', hint: 'كل عنصر سؤال (العنوان) وإجابته (النص).' },
  resource: { label: 'موارد تعليمية', hint: 'أدلة وروابط داخلية مفيدة.' },
  cta: { label: 'دعوة ديمو', hint: 'يفتح نموذج الطلب مع المنتج والقسم.' },
  roles: { label: 'الأدوار والتحديات', hint: 'كل عنصر دور وظيفي (العنوان) والتحدي الذي يواجهه (النص).' },
  capability: { label: 'القدرات', hint: 'قدرات القسم مرتّبة حسب وظيفة العمل.' },
  theater: { label: 'مسرح المنتج', hint: 'تبديل تفاعلي بين شاشات فعلية؛ اختر الشاشات بالترتيب.' },
  document: { label: 'المستندات والعلاقات', hint: 'استخدم «من ← إلى» في العنوان لعرض علاقة بين مستندين؛ العنصر المرتبط بشاشة يُعرض كبيرًا.' },
  profile: { label: 'ملف 360', hint: 'شاشة ملف مع السجلات المرتبطة به.' },
  report: { label: 'لوحات وتقارير', hint: 'لوحة وتقرير جنبًا إلى جنب، مع مؤشرات مختصرة كعناصر.' },
  usecase: { label: 'حالات استخدام', hint: 'سيناريوهات عملية موثّقة؛ كل عنصر سيناريو ونتيجته.' },
  related: { label: 'أقسام مرتبطة', hint: 'روابط لأقسام أو صفحات أخرى، مع شاشة اختيارية.' },
  source: { label: 'قسم من محتوى المصدر', hint: 'يعرض أحد أقسام المصدر بمدخلاته ومخرجاته واستثناءاته ووظائفه. الحقول الفارغة تعرض نص المصدر؛ أخفِ القسم بدل حذفه.' },
};

const WITH_ITEMS: CmsBlock['type'][] = ['workflow', 'faq', 'resource', 'roles', 'capability', 'document', 'profile', 'report', 'usecase', 'related'];
const WITH_SHOT: CmsBlock['type'][] = ['story', 'profile', 'report', 'theater', 'resource'];
const WITH_SHOTS: CmsBlock['type'][] = ['theater', 'report'];
const shotOptions = Object.values(SHOTS);

export function newBlock(type: CmsBlock['type']): CmsBlock {
  return { id: crypto.randomUUID(), type, title: '', body: '', shotId: '', mediaUrl: '', mediaAlt: '', href: '', enabled: true, eyebrow: '', items: [], shots: [], focus: null, ref: '' };
}

type ShotGroup = (typeof SHOT_GROUPS)[number]['label'];

function ShotSelect({ value, onChange, label = 'الشاشة الفعلية', empty = 'بدون شاشة', group }: { value: string; onChange: (v: string) => void; label?: string; empty?: string; group?: ShotGroup | undefined }) {
  return (
    <Field label={label}>
      <NativeSelect value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {SHOT_GROUPS.filter(g => !group || g.label === group).map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.shots.map(s => (
              <option key={s.id} value={s.id}>
                {s.caption.ar}
              </option>
            ))}
          </optgroup>
        ))}
      </NativeSelect>
    </Field>
  );
}

function swap<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const a = [...list];
  const x = a[i];
  const y = a[i + dir];
  if (x === undefined || y === undefined) return list;
  a[i] = y;
  a[i + dir] = x;
  return a;
}

function ItemsEditor({ block, update }: { block: CmsBlock; update: (v: Partial<CmsBlock>) => void }) {
  const items = block.items;
  const set = (i: number, v: Partial<CmsBlockItem>) => update({ items: items.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-semibold text-muted-foreground">العناصر ({items.length})</p>
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs text-muted-foreground">عنصر {i + 1}</span>
            <Button size="icon" variant="ghost" aria-label="تحريك العنصر للأعلى" disabled={i === 0} onClick={() => update({ items: swap(items, i, -1) })}>
              <ArrowUp size={14} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="تحريك العنصر للأسفل" disabled={i === items.length - 1} onClick={() => update({ items: swap(items, i, 1) })}>
              <ArrowDown size={14} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="حذف العنصر" onClick={() => update({ items: items.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </Button>
          </div>
          <Input aria-label="عنوان العنصر" placeholder="العنوان" value={item.title} onChange={e => set(i, { title: e.target.value })} />
          <Textarea aria-label="نص العنصر" placeholder="النص" rows={2} value={item.body} onChange={e => set(i, { body: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <ShotSelect value={item.shotId} onChange={v => set(i, { shotId: v })} />
            <Field label="رابط داخلي">
              <Input dir="ltr" value={item.href} placeholder="/modules/sales" onChange={e => set(i, { href: e.target.value })} />
            </Field>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" disabled={items.length >= 24} onClick={() => update({ items: [...items, { title: '', body: '', shotId: '', href: '' }] })}>
        <Plus size={14} />
        إضافة عنصر
      </Button>
    </div>
  );
}

function ShotsEditor({ block, update }: { block: CmsBlock; update: (v: Partial<CmsBlock>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">شاشات إضافية بالترتيب ({block.shots.length})</p>
      {block.shots.map((id, i) => (
        <div key={id + i} className="flex items-center gap-1 text-sm">
          <span className="flex-1 truncate">{SHOTS[id]?.caption.ar ?? id}</span>
          <Button size="icon" variant="ghost" aria-label="تحريك الشاشة للأعلى" disabled={i === 0} onClick={() => update({ shots: swap(block.shots, i, -1) })}>
            <ArrowUp size={14} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="تحريك الشاشة للأسفل" disabled={i === block.shots.length - 1} onClick={() => update({ shots: swap(block.shots, i, 1) })}>
            <ArrowDown size={14} />
          </Button>
          <Button size="icon" variant="ghost" aria-label="إزالة الشاشة" onClick={() => update({ shots: block.shots.filter((_, j) => j !== i) })}>
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      {block.shots.length < 12 && (
        <NativeSelect aria-label="إضافة شاشة" value="" onChange={e => e.target.value && update({ shots: [...block.shots, e.target.value] })}>
          <option value="">+ إضافة شاشة</option>
          {shotOptions
            .filter(s => !block.shots.includes(s.id))
            .map(s => (
              <option key={s.id} value={s.id}>
                {s.caption.ar}
              </option>
            ))}
        </NativeSelect>
      )}
    </div>
  );
}

function FocusEditor({ block, update }: { block: CmsBlock; update: (v: Partial<CmsBlock>) => void }) {
  const f = block.focus;
  const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));
  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!f} onChange={e => update({ focus: e.target.checked ? { x: 50, y: 50, zoom: 2 } : null })} />
        تكبير جزء من الشاشة
      </label>
      {f && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="أفقي %">
            <Input type="number" min={0} max={100} value={f.x} onChange={e => update({ focus: { ...f, x: num(e.target.value, 0, 100) } })} />
          </Field>
          <Field label="رأسي %">
            <Input type="number" min={0} max={100} value={f.y} onChange={e => update({ focus: { ...f, y: num(e.target.value, 0, 100) } })} />
          </Field>
          <Field label="التكبير">
            <Input type="number" min={1.5} max={4} step={0.1} value={f.zoom} onChange={e => update({ focus: { ...f, zoom: num(e.target.value, 1.5, 4) } })} />
          </Field>
        </div>
      )}
      <p className="text-xs text-muted-foreground">حدّد الجزء الذي يدعم ادعاء القصة فعلًا؛ لا تكبّر منطقة لا تُظهر الميزة.</p>
    </div>
  );
}

/** Editor for a `source` block: placement and visibility plus optional overrides; empty fields keep the source copy. */
function SourceBlockFields({ block, update, title, screen = true, group }: { block: CmsBlock; update: (v: Partial<CmsBlock>) => void; title: string; screen?: boolean; group?: ShotGroup | undefined }) {
  return (
    <>
      <p className="rounded-md bg-muted/40 p-2 text-xs">
        <span className="font-semibold">القسم {block.ref}</span> · {title || 'قسم غير معروف'}
      </p>
      <Field label="عنوان صغير فوق العنوان" hint="فارغ = اسم المجال">
        <Input value={block.eyebrow} onChange={e => update({ eyebrow: e.target.value })} />
      </Field>
      <Field label="العنوان" hint={`فارغ = ${title}`}>
        <Input value={block.title} placeholder={title} onChange={e => update({ title: e.target.value })} />
      </Field>
      <Field label="النص التمهيدي" hint="فارغ = سرد القسم من المصدر">
        <Textarea rows={3} value={block.body} onChange={e => update({ body: e.target.value })} />
      </Field>
      {screen && <ShotSelect value={block.shotId} onChange={v => update({ shotId: v })} label="الشاشة الفعلية" empty="شاشة المصدر (إن وُجدت)" group={group} />}
    </>
  );
}

/** A page's source section as the editor lists it; `screen: false` hides the screen override (the section has no lead screen). */
export type SourceSectionInfo = { id: string; title: { ar: string; en: string }; screen?: boolean };

export function BlockList({ blocks, onChange, media, locale, department = null, sourceSections }: { blocks: CmsBlock[]; onChange: (blocks: CmsBlock[]) => void; media: Media[]; locale: 'ar' | 'en'; department?: DepartmentMeta | null; sourceSections?: SourceSectionInfo[] | undefined }) {
  const updateBlock = (id: string, v: Partial<CmsBlock>) => onChange(blocks.map(b => (b.id === id ? { ...b, ...v } : b)));
  // Explicit source sections are DIGIT Pro V4 pages; otherwise an HR module's handoff sections.
  const source: { sections: SourceSectionInfo[] } | undefined = sourceSections ? { sections: sourceSections } : department?.product === 'hr' ? hrModuleBySlug(department.id) : undefined;
  const group: ShotGroup | undefined = sourceSections ? 'DIGIT Pro' : department?.product === 'hr' ? 'DIGIT HR' : undefined;
  return (
    <>
      {blocks.map((b, i) => {
        const update = (v: Partial<CmsBlock>) => updateBlock(b.id, v);
        if (b.type === 'source') {
          return (
            <div key={b.id} className="space-y-3 rounded-md border border-border p-4" data-block-type={b.type}>
              <div className="flex items-center gap-1">
                <span className="flex-1 text-sm font-semibold">
                  {i + 1} · {BLOCK_INFO.source.label}
                </span>
                <Button size="icon" variant="ghost" aria-label="تحريك للأعلى" disabled={i === 0} onClick={() => onChange(swap(blocks, i, -1))}>
                  <ArrowUp size={16} />
                </Button>
                <Button size="icon" variant="ghost" aria-label="تحريك للأسفل" disabled={i === blocks.length - 1} onClick={() => onChange(swap(blocks, i, 1))}>
                  <ArrowDown size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{BLOCK_INFO.source.hint}</p>
              <SourceBlockFields
                block={b}
                update={update}
                title={source?.sections.find(s => s.id === b.ref)?.title[locale] ?? ''}
                screen={source?.sections.find(s => s.id === b.ref)?.screen !== false}
                group={group}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={b.enabled} onChange={e => update({ enabled: e.target.checked })} />
                ظاهر
              </label>
            </div>
          );
        }
        return (
          <div key={b.id} className="space-y-3 rounded-md border border-border p-4" data-block-type={b.type}>
            <div className="flex items-center gap-1">
              <span className="flex-1 text-sm font-semibold">
                {i + 1} · {BLOCK_INFO[b.type].label}
              </span>
              <Button size="icon" variant="ghost" aria-label="تحريك للأعلى" disabled={i === 0} onClick={() => onChange(swap(blocks, i, -1))}>
                <ArrowUp size={16} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="تحريك للأسفل" disabled={i === blocks.length - 1} onClick={() => onChange(swap(blocks, i, 1))}>
                <ArrowDown size={16} />
              </Button>
              <Button size="icon" variant="ghost" aria-label="حذف القسم" onClick={() => onChange(blocks.filter(x => x.id !== b.id))}>
                <Trash2 size={16} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{BLOCK_INFO[b.type].hint}</p>
            <Field label="عنوان صغير فوق العنوان">
              <Input value={b.eyebrow} onChange={e => update({ eyebrow: e.target.value })} />
            </Field>
            <Field label="العنوان">
              <Input value={b.title} onChange={e => update({ title: e.target.value })} />
            </Field>
            <Field label="المحتوى">
              <Textarea rows={3} value={b.body} onChange={e => update({ body: e.target.value })} />
            </Field>
            {WITH_SHOT.includes(b.type) && <ShotSelect value={b.shotId} onChange={v => update({ shotId: v })} label={b.type === 'theater' ? 'الشاشة الأولى' : 'الشاشة الفعلية'} />}
            {b.type === 'story' && b.shotId && <FocusEditor block={b} update={update} />}
            {WITH_SHOTS.includes(b.type) && <ShotsEditor block={b} update={update} />}
            {b.type === 'story' && (
              <Field label="صورة من المكتبة (بدل الشاشة)">
                <NativeSelect
                  value={b.mediaUrl}
                  onChange={e => {
                    const m = media.find(x => x.url === e.target.value);
                    update({ mediaUrl: e.target.value, mediaAlt: m ? (locale === 'ar' ? m.alt_ar : m.alt_en) : '' });
                  }}
                >
                  <option value="">بدون صورة</option>
                  {media.map(m => (
                    <option key={m.id} value={m.url}>
                      {m.title}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {WITH_ITEMS.includes(b.type) && <ItemsEditor block={b} update={update} />}
            {b.type !== 'cta' && (
              <Field label="رابط مرتبط">
                <Input dir="ltr" value={b.href} onChange={e => update({ href: e.target.value })} placeholder="/modules/sales" />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={b.enabled} onChange={e => update({ enabled: e.target.checked })} />
              ظاهر
            </label>
          </div>
        );
      })}
    </>
  );
}

export function AddBlockButtons({ onAdd, department }: { onAdd: (type: CmsBlock['type']) => void; department: boolean }) {
  // Source sections are placed by the page's source content, never added by hand.
  const types = department ? BLOCK_TYPES.filter(t => t !== 'source') : (['story', 'workflow', 'faq', 'resource', 'cta'] as const);
  return (
    <div className="flex flex-wrap gap-2">
      {types.map(type => (
        <Button key={type} variant="outline" size="sm" onClick={() => onAdd(type)}>
          <Plus size={14} />
          {BLOCK_INFO[type].label}
        </Button>
      ))}
    </div>
  );
}
