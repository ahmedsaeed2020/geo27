import { useState } from 'react';
import type { Workspace } from '@/lib/cms.functions';
import { Input } from '@/components/ui/input';
import { EmptyState, formatDate, STATUS_LABELS, teamName, type Doc, type TeamMember } from './shared';

const ACTIONS: Record<string, string> = {
  save: 'حفظ مسودة',
  review: 'إرسال للمراجعة',
  publish: 'نشر',
  unpublish: 'إلغاء نشر',
  rollback: 'استعادة ونشر',
  schedule: 'جدولة',
  unschedule: 'إلغاء الجدولة',
  upload: 'رفع صورة',
  'media:update': 'تعديل صورة',
  'media:replace': 'استبدال ملف صورة',
  'media:archive': 'أرشفة صورة',
  'media:restore': 'استعادة صورة',
  'preview:create': 'إنشاء رابط معاينة',
  'preview:revoke': 'إلغاء روابط المعاينة',
  'redirect:create': 'إضافة تحويل',
  'redirect:update': 'تعديل تحويل',
  'redirect:delete': 'حذف تحويل',
  'config:save': 'حفظ إعدادات',
  'config:publish': 'نشر إعدادات',
  'config:unpublish': 'إلغاء نشر إعدادات',
  'role:owner': 'منح صلاحية مالك',
  'role:editor': 'منح صلاحية محرر',
  'role:sales': 'منح صلاحية مبيعات',
  'role:removed': 'إزالة صلاحية',
};
const ENTITIES: Record<string, string> = { document: 'صفحة', media: 'صورة', lead: 'طلب', member: 'عضو', redirect: 'تحويل', config: 'إعدادات' };

function describe(action: string): string {
  if (ACTIONS[action]) return ACTIONS[action];
  if (action.startsWith('lead:')) return `حالة الطلب: ${STATUS_LABELS[action.slice(5)] ?? action.slice(5)}`;
  return action;
}

export default function Audit({ rows, team, docs = [], limit = 150 }: { rows: Workspace['audit']; team: TeamMember[]; docs?: Doc[]; limit?: number }) {
  const [q, setQ] = useState('');
  const target = (entity: string, id: string | null) => {
    if (entity === 'document') return docs.find(d => d.id === id)?.path ?? '';
    if (entity === 'member') return teamName(team, id);
    if (entity === 'config') return id ?? '';
    return '';
  };
  const items = rows
    .map(a => ({ ...a, label: describe(a.action), who: teamName(team, a.actor_id), what: target(a.entity, a.entity_id) }))
    .filter(a => !q || `${a.label} ${a.who} ${a.what}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, limit);
  return (
    <section>
      {limit > 20 && <Input aria-label="بحث السجل" placeholder="ابحث بالإجراء أو الشخص أو المسار" value={q} onChange={e => setQ(e.target.value)} className="mb-4 max-w-md" />}
      <ol className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map(a => (
          <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
            <span>
              <strong>{a.label}</strong> · {ENTITIES[a.entity] ?? a.entity}
              {a.what && (
                <span dir="ltr" className="ms-2 text-muted-foreground">
                  {a.what}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              <span dir="ltr">{a.who}</span> · {formatDate(a.created_at)}
            </span>
          </li>
        ))}
      </ol>
      {!items.length && <EmptyState>لا يوجد نشاط مسجل.</EmptyState>}
    </section>
  );
}
