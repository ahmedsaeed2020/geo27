import { ArrowDown, ArrowUp, ExternalLink, Lock, RotateCcw } from 'lucide-react';
import proNodes from '@/content/pro.json';
import { arrangeSections, HOME_SECTIONS, PRO_SECTIONS, proSectionIdOf, type SectionDef } from '@/content/section-registry';
import { translate } from '@/lib/i18n';
import type { SectionLayoutConfig } from '@/lib/site-config-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ConfigHistory, ConfigToolbar, useConfigEditor } from './useConfigEditor';
import { Field, StatusPill, type ConfigRow, type TeamMember } from './shared';

type Page = 'home' | 'pro';
type HeadingSlot = { key: string; ar: string; en: string };
type ProNode = { id: string; type: string; className: string; html?: string; children?: ProNode[] };

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Heading slots per section: Home uses one main heading per section, Pro lists every heading inside the section. */
function headingSlots(page: Page): Record<string, HeadingSlot[]> {
  if (page === 'home') {
    return Object.fromEntries(
      (HOME_SECTIONS as readonly SectionDef[]).filter(d => d.heading && !d.locked).map(d => [d.id, [{ key: `${d.id}.heading`, ar: d.heading!.ar, en: d.heading!.en ?? translate(d.heading!.ar, 'en') }]]),
    );
  }
  const out: Record<string, HeadingSlot[]> = {};
  const collect = (n: ProNode, acc: HeadingSlot[]) => {
    if (n.type === 'heading' && n.html) {
      const ar = plain(n.html);
      if (ar) acc.push({ key: n.id, ar, en: translate(ar, 'en') });
    }
    n.children?.forEach(c => collect(c, acc));
  };
  for (const node of proNodes as ProNode[]) {
    const id = proSectionIdOf(node);
    const def = PRO_SECTIONS.find(d => d.id === id) as SectionDef | undefined;
    if (!id || !def || def.locked) continue;
    const acc: HeadingSlot[] = [];
    collect(node, acc);
    if (acc.length) out[id] = acc;
  }
  return out;
}

export default function SectionsEditor({ page, rows, owner, team, notice }: { page: Page; rows: ConfigRow[]; owner: boolean; team: TeamMember[]; notice: (s: string) => void }) {
  const editor = useConfigEditor(page, rows, notice);
  const v = editor.value as SectionLayoutConfig;
  const defs = (page === 'home' ? HOME_SECTIONS : PRO_SECTIONS) as readonly SectionDef[];
  const arranged = arrangeSections(defs, v);
  const movable = arranged.filter(s => !s.locked);
  const slots = headingSlots(page);
  const label = (id: string) => defs.find(d => d.id === id)?.label ?? id;

  const setSections = (next: { id: string; enabled: boolean }[]) => editor.setValue({ ...v, sections: next.map(({ id, enabled }) => ({ id, enabled })) });
  const move = (i: number, d: -1 | 1) => {
    const a = [...movable];
    const x = a[i];
    const y = a[i + d];
    if (!x || !y) return;
    a[i] = y;
    a[i + d] = x;
    setSections(a);
  };
  const setText = (key: string, locale: 'ar' | 'en', value: string) => {
    const current = v.texts[key] ?? { ar: '', en: '' };
    const next = { ...current, [locale]: value };
    const texts = { ...v.texts };
    if (!next.ar.trim() && !next.en.trim()) delete texts[key];
    else texts[key] = next;
    editor.setValue({ ...v, texts });
  };
  const previewHref = `${page === 'home' ? '/' : '/pro'}?draft_settings=${page}`;
  const canPreview = !!editor.row && !editor.dirty;

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        رتّب أقسام {page === 'home' ? 'الصفحة الرئيسية' : 'صفحة DIGIT Pro'} وأخفِ ما لا تحتاجه، وعدّل العناوين بالعربية والإنجليزية. الواجهة الرئيسية ثابتة بتصميمها الأصلي. الحقول الفارغة تعرض النص الأصلي، والتصميم والصور لا يتغيران.
        {page === 'pro' && ' السعر يبقى في قسم «ماذا تحصل في DIGIT Pro» فقط ولا يُعدَّل من هنا.'}
      </p>
      <ConfigToolbar editor={editor} owner={owner} />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild={canPreview} disabled={!canPreview}>
          {canPreview ? (
            <a href={previewHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              معاينة المسودة على الصفحة
            </a>
          ) : (
            <span>
              <ExternalLink size={15} />
              احفظ المسودة لمعاينتها
            </span>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSections([])}>
          <RotateCcw size={15} />
          الترتيب الأصلي
        </Button>
      </div>

      <ol className="space-y-3">
        {arranged
          .filter(s => s.locked)
          .map(s => (
            <li key={s.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <Lock size={15} aria-hidden="true" />
              <span className="font-medium">{label(s.id)}</span>
            </li>
          ))}
        {movable.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-border bg-card p-4" data-section-row={s.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
              <span className="flex-1 font-medium">{label(s.id)}</span>
              {!s.enabled && <StatusPill tone="warn">مخفي</StatusPill>}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                ظاهر
                <Switch aria-label={`إظهار ${label(s.id)}`} checked={s.enabled} onCheckedChange={c => setSections(movable.map(x => (x.id === s.id ? { ...x, enabled: c } : x)))} />
              </label>
              <Button size="icon" variant="ghost" aria-label={`نقل ${label(s.id)} لأعلى`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={15} />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`نقل ${label(s.id)} لأسفل`} disabled={i === movable.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={15} />
              </Button>
            </div>
            {s.enabled &&
              slots[s.id]?.map(slot => (
                <div key={slot.key} className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                  <Field label="العنوان — عربي">
                    <Input value={v.texts[slot.key]?.ar ?? ''} placeholder={slot.ar} maxLength={160} onChange={e => setText(slot.key, 'ar', e.target.value)} />
                  </Field>
                  <Field label="العنوان — English">
                    <Input dir="ltr" value={v.texts[slot.key]?.en ?? ''} placeholder={slot.en} maxLength={160} onChange={e => setText(slot.key, 'en', e.target.value)} />
                  </Field>
                </div>
              ))}
          </li>
        ))}
      </ol>
      <ConfigHistory
        configKey={page}
        team={team}
        onRestore={value => {
          editor.replace(value);
          notice('استُعيد الإصدار إلى المسودة.');
        }}
      />
    </>
  );
}
