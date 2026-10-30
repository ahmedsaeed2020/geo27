import { useMemo, useState } from 'react';
import { cmsContentSchema } from '@/lib/cms-schema';
import { Button } from '@/components/ui/button';
import { NativeSelect, StatusPill, type Doc } from './shared';

type Issue = { tone: 'bad' | 'warn'; text: string };

export function seoIssues(d: Doc): Issue[] {
  const c = cmsContentSchema.safeParse(d.draft);
  if (!c.success) return [{ tone: 'bad', text: 'بيانات غير صالحة' }];
  const issues: Issue[] = [];
  for (const [l, name] of [['ar', 'العربي'], ['en', 'الإنجليزي']] as const) {
    const t = c.data[l].title.trim();
    const desc = c.data[l].description.trim();
    if (!t) issues.push({ tone: 'bad', text: `العنوان ${name} فارغ` });
    else if (t.length > 65) issues.push({ tone: 'warn', text: `العنوان ${name} أطول من 65 حرفًا` });
    if (!desc) issues.push({ tone: 'bad', text: `الوصف ${name} فارغ` });
    else if (desc.length > 170) issues.push({ tone: 'warn', text: `الوصف ${name} أطول من 170 حرفًا` });
    else if (desc.length < 60) issues.push({ tone: 'warn', text: `الوصف ${name} قصير` });
  }
  if (!c.data.indexable) issues.push({ tone: 'warn', text: 'مستبعدة من الفهرسة' });
  return issues;
}

export default function SeoPanel({ docs, onEdit }: { docs: Doc[]; onEdit: (d: Doc) => void }) {
  const [filter, setFilter] = useState<'issues' | 'all'>('issues');
  const rows = useMemo(
    () =>
      docs
        .filter(d => !['story', 'navigation', 'branding'].includes(d.kind))
        .map(d => ({ d, issues: seoIssues(d), c: cmsContentSchema.safeParse(d.draft) }))
        .filter(r => filter === 'all' || r.issues.length > 0),
    [docs, filter],
  );
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        يعرض عناوين وأوصاف المسودات. عند ترك الحقول فارغة تبقى بيانات الصفحة الأصلية هي المستخدمة؛ القيم المنشورة هنا تتجاوزها. الرابط الأساسي وروابط اللغتين وخريطة الموقع تُدار تلقائيًا.
      </p>
      <NativeSelect aria-label="عرض" className="mb-4 w-48" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}>
        <option value="issues">الصفحات التي تحتاج مراجعة</option>
        <option value="all">كل الصفحات</option>
      </NativeSelect>
      <div className="overflow-x-auto">
        <table className="v3-cms-table">
          <thead>
            <tr>
              <th>المسار</th>
              <th>العنوان العربي</th>
              <th>ملاحظات</th>
              <th>
                <span className="sr-only">تحرير</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, issues, c }) => (
              <tr key={d.id}>
                <td dir="ltr" className="text-start font-mono text-xs">
                  {d.path}
                </td>
                <td>{c.success ? c.data.ar.title || '—' : '—'}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {issues.length ? issues.map(i => <StatusPill key={i.text} tone={i.tone}>{i.text}</StatusPill>) : <StatusPill tone="good">سليم</StatusPill>}
                  </div>
                </td>
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
    </>
  );
}
