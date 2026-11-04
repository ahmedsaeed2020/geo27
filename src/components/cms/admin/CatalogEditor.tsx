import { ArrowDown, ArrowUp, ExternalLink, RotateCcw } from 'lucide-react';
import { PRODUCTS, type ProductFamily, type ProductKey } from '@/content/catalog';
import { cmsContentSchema, departmentPublishIssues } from '@/lib/cms-schema';
import { orderSections, type CatalogConfig } from '@/lib/site-config-schema';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ConfigHistory, ConfigToolbar, useConfigEditor } from './useConfigEditor';
import { DOC_STATE_LABELS, StatusPill, type ConfigRow, type Doc, type TeamMember } from './shared';

type Entry = { id: string; label: string; path: string; source: 'page' | 'cms' | 'solution' };

function entriesOf(f: ProductFamily): Entry[] {
  if (f.key === 'pos') return f.solutions.map(s => ({ id: s.id, label: s.label.ar, path: s.path, source: 'solution' }));
  return f.departments.map(d => ({ id: d.id, label: d.label.ar, path: d.path, source: d.source }));
}

function DocStatus({ entry, doc }: { entry: Entry; doc: Doc | undefined }) {
  if (entry.source === 'solution') return <StatusPill tone="good">صفحة قائمة</StatusPill>;
  const parsed = doc ? cmsContentSchema.safeParse(doc.draft) : null;
  const draft = parsed?.success ? parsed.data : null;
  const live = !!doc?.published && !!cmsContentSchema.safeParse(doc.published).data?.department;
  if (entry.source === 'page') {
    return (
      <>
        <StatusPill tone="good">صفحة قائمة</StatusPill>
        {draft?.department && <StatusPill tone={live ? 'good' : 'info'}>{live ? 'قالب القسم منشور' : 'قالب القسم: مسودة'}</StatusPill>}
      </>
    );
  }
  if (!doc) return <StatusPill tone="bad">لا توجد مسودة</StatusPill>;
  const issues = draft ? departmentPublishIssues(draft) : ['—'];
  return (
    <>
      <StatusPill tone={doc.published ? 'good' : doc.state === 'review' ? 'info' : 'muted'}>{doc.published ? 'منشور' : (DOC_STATE_LABELS[doc.state] ?? doc.state)}</StatusPill>
      {!doc.published && <StatusPill tone={issues.length ? 'warn' : 'good'}>{issues.length ? `ينقصه ${issues.length}` : 'جاهز للنشر'}</StatusPill>}
    </>
  );
}

/**
 * Products & departments: menu order and visibility per product (draft/publish/history like other settings), plus each
 * department's page status with a shortcut into the page editor.
 */
export default function CatalogEditor({ rows, docs, owner, team, notice, onEdit }: { rows: ConfigRow[]; docs: Doc[]; owner: boolean; team: TeamMember[]; notice: (s: string) => void; onEdit: (d: Doc) => void }) {
  const editor = useConfigEditor('catalog', rows, notice);
  const v = editor.value as CatalogConfig;
  const canPreview = !!editor.row && !editor.dirty;
  const setProduct = (key: ProductKey, list: { id: string; enabled: boolean }[]) => editor.setValue({ ...v, products: { ...v.products, [key]: list } });

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        رتّب أقسام كل منتج كما تظهر في القائمة الرئيسية وصفحة المنتج، وأخفِ ما لا تريد عرضه. قسم الموارد البشرية أو المقاولات لا يفتح كصفحة مستقلة إلا بعد نشر صفحته؛ قبل ذلك يوجّه رابطه إلى بطاقته في صفحة المنتج.
      </p>
      <ConfigToolbar editor={editor} owner={owner} />
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild={canPreview} disabled={!canPreview}>
          {canPreview ? (
            <a href="/modules/hr-payroll?draft_settings=catalog" target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              معاينة الترتيب على الموقع
            </a>
          ) : (
            <span>
              <ExternalLink size={15} />
              احفظ المسودة لمعاينتها
            </span>
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => editor.setValue({ products: {} })}>
          <RotateCcw size={15} />
          الترتيب الأصلي
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {PRODUCTS.map(f => {
          const entries = entriesOf(f);
          const arranged = orderSections(
            entries.map(e => e.id),
            { sections: v.products[f.key] ?? [], texts: {} },
          );
          const byId = new Map(entries.map(e => [e.id, e]));
          const move = (i: number, d: -1 | 1) => {
            const a = [...arranged];
            const x = a[i];
            const y = a[i + d];
            if (!x || !y) return;
            a[i] = y;
            a[i + d] = x;
            setProduct(f.key, a);
          };
          return (
            <section key={f.key} className="rounded-lg border border-border bg-card p-4" aria-labelledby={`cat-${f.key}`}>
              <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`cat-${f.key}`} className="text-lg font-bold">
                  {f.name.ar} <span className="text-sm font-medium text-muted-foreground">· {f.area.ar}</span>
                </h3>
                <a className="text-sm text-primary underline-offset-4 hover:underline" dir="ltr" href={f.overview} target="_blank" rel="noopener noreferrer">
                  {f.overview}
                </a>
              </header>
              <p className="mb-3 text-xs text-muted-foreground">{f.groupLabel.ar}</p>
              <ol className="space-y-2">
                {arranged.map((s, i) => {
                  const entry = byId.get(s.id);
                  if (!entry) return null;
                  const doc = docs.find(d => d.path === entry.path);
                  return (
                    <li key={s.id} className="rounded-md border border-border p-3" data-catalog-row={`${f.key}:${s.id}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                        <span className="min-w-[10rem] flex-1 font-medium">{entry.label}</span>
                        {!s.enabled && <StatusPill tone="warn">مخفي</StatusPill>}
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          ظاهر
                          <Switch aria-label={`إظهار ${entry.label}`} checked={s.enabled} onCheckedChange={c => setProduct(f.key, arranged.map(x => (x.id === s.id ? { ...x, enabled: c } : x)))} />
                        </label>
                        <Button size="icon" variant="ghost" aria-label={`نقل ${entry.label} لأعلى`} disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`نقل ${entry.label} لأسفل`} disabled={i === arranged.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown size={15} />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 ps-8 text-xs">
                        <span dir="ltr" className="font-mono text-muted-foreground">
                          {entry.path}
                        </span>
                        <DocStatus entry={entry} doc={doc} />
                        {doc && entry.source !== 'solution' && (
                          <Button size="sm" variant="outline" className="ms-auto" onClick={() => onEdit(doc)}>
                            تحرير الصفحة
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
      <ConfigHistory
        configKey="catalog"
        team={team}
        onRestore={value => {
          editor.replace(value);
          notice('استُعيد الإصدار إلى المسودة.');
        }}
      />
    </>
  );
}
