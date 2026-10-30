import { SHOTS } from '@/content/product-shots';
import { LEAD_RECIPIENT } from '@/lib/leads-schema';
import Audit from './Audit';
import { formatDate, StatusPill, type Workspace } from './shared';

export default function Overview({ w, onOpen }: { w: Workspace; onOpen: (tab: string) => void }) {
  const canLeads = w.role !== 'editor';
  const canContent = w.role !== 'sales';
  const scheduled = w.docs.filter(d => d.publish_at || d.unpublish_at);
  const review = w.docs.filter(d => d.state === 'review');
  const cards: { label: string; value: string | number; tab?: string }[] = [
    ...(canContent
      ? [
          { label: 'صفحات منشورة', value: w.docs.filter(d => d.published).length, tab: 'pages' },
          { label: 'بانتظار المراجعة', value: review.length, tab: 'pages' },
          { label: 'شاشات المنتج الأصلية', value: Object.keys(SHOTS).length, tab: 'media' },
        ]
      : []),
    ...(canLeads ? [{ label: 'طلبات جديدة', value: w.leads.filter(l => l.status === 'new').length, tab: 'leads' }] : []),
  ];
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(c => (
          <button key={c.label} type="button" className="rounded-lg border border-border bg-card p-5 text-start transition-colors hover:border-primary" onClick={() => c.tab && onOpen(c.tab)}>
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-3xl font-bold">{c.value}</p>
          </button>
        ))}
      </div>
      {canContent && scheduled.length > 0 && (
        <section>
          <h3 className="mb-3 font-bold">مواعيد قادمة</h3>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {scheduled.map(d => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <span dir="ltr" className="font-mono text-xs">
                  {d.path}
                </span>
                <span className="flex gap-2">
                  {d.publish_at && <StatusPill tone="info">نشر {formatDate(d.publish_at)}</StatusPill>}
                  {d.unpublish_at && <StatusPill tone="warn">إيقاف {formatDate(d.unpublish_at)}</StatusPill>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {canLeads && (
        <section className="rounded-lg border border-border bg-card p-5">
          <h3 className="font-bold">إشعارات الطلبات بالبريد</h3>
          <p className="mt-2 text-sm" dir="ltr">
            {LEAD_RECIPIENT}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">غير مفعّلة بعد: يلزم إعداد نطاق إرسال والتحقق منه. كل الطلبات محفوظة في «طلبات العملاء».</p>
        </section>
      )}
      <section>
        <h3 className="mb-3 font-bold">آخر النشاط</h3>
        <Audit rows={w.audit} team={w.team} docs={w.docs} limit={12} />
      </section>
    </div>
  );
}
