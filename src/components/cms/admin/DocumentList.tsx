import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { cmsContentSchema } from '@/lib/cms-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DOC_STATE_LABELS, EmptyState, formatDate, NativeSelect, StatusPill, type Doc } from './shared';

export type ListKind = 'pages' | 'stories' | 'resources' | 'navigation';

const KIND_FILTER: Record<ListKind, (d: Doc) => boolean> = {
  pages: d => !['story', 'resource', 'navigation', 'branding'].includes(d.kind),
  stories: d => d.kind === 'story',
  resources: d => d.kind === 'resource',
  navigation: d => d.kind === 'navigation',
};
const KIND_LABELS: Record<string, string> = { page: 'صفحة', module: 'موديول', industry: 'قطاع', product: 'باقة', story: 'قصة', resource: 'مورد', navigation: 'قائمة', department: 'قسم منتج' };

export function docTitle(d: Doc): string {
  const c = cmsContentSchema.safeParse(d.draft);
  return (c.success && (c.data.ar.title || c.data.en.title)) || d.path;
}

export default function DocumentList({ docs, kind, onEdit, onNew }: { docs: Doc[]; kind: ListKind; onEdit: (d: Doc) => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState('all');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs
      .filter(KIND_FILTER[kind])
      .filter(d => state === 'all' || (state === 'scheduled' ? !!(d.publish_at || d.unpublish_at) : d.state === state))
      .filter(d => !needle || d.path.includes(needle) || JSON.stringify(d.draft).toLowerCase().includes(needle));
  }, [docs, kind, q, state]);
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-3">
        <Input aria-label="بحث" placeholder="ابحث بالعنوان أو المسار أو النص" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
        <NativeSelect aria-label="الحالة" className="w-44" value={state} onChange={e => setState(e.target.value)}>
          <option value="all">كل الحالات</option>
          <option value="draft">مسودة</option>
          <option value="review">للمراجعة</option>
          <option value="published">منشور</option>
          <option value="archived">غير منشور</option>
          <option value="scheduled">مجدول</option>
        </NativeSelect>
        <Button onClick={onNew}>
          <Plus size={17} />
          إنشاء
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="v3-cms-table">
          <thead>
            <tr>
              <th>العنوان</th>
              <th>المسار</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>آخر تعديل</th>
              <th>
                <span className="sr-only">تحرير</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id}>
                <td className="font-medium">{docTitle(d)}</td>
                <td dir="ltr" className="text-start font-mono text-xs">
                  {d.path}
                </td>
                <td>{KIND_LABELS[d.kind] ?? d.kind}</td>
                <td className="space-x-1 space-x-reverse">
                  <StatusPill tone={d.state === 'published' ? 'good' : d.state === 'review' ? 'info' : 'muted'}>{DOC_STATE_LABELS[d.state] ?? d.state}</StatusPill>
                  {(d.publish_at || d.unpublish_at) && <StatusPill tone="info">مجدول</StatusPill>}
                </td>
                <td className="text-xs">{formatDate(d.updated_at)}</td>
                <td>
                  <Button size="sm" variant="outline" onClick={() => onEdit(d)}>
                    تحرير
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <EmptyState>لا توجد عناصر مطابقة.</EmptyState>}
    </>
  );
}
