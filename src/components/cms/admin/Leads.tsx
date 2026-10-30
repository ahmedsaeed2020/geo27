import { useMemo, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Mail, Phone } from 'lucide-react';
import { updateLead, LEAD_STATUSES } from '@/lib/cms.functions';
import { LEAD_RECIPIENT } from '@/lib/leads-schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, errorText, formatDate, NativeSelect, STATUS_LABELS, StatusPill, teamName, useRefresh, type Lead, type TeamMember } from './shared';

const REQUEST_TYPES: Record<string, string> = { demo: 'ديمو', consultation: 'استشارة', scope: 'نطاق عمل' };

export function leadsToCsv(rows: Lead[], team: TeamMember[]): string {
  const cols: [string, (r: Lead) => unknown][] = [
    ['name', r => r.name],
    ['company', r => r.company],
    ['email', r => r.email],
    ['phone', r => r.phone],
    ['interest', r => r.interest],
    ['request_type', r => r.request_type],
    ['job_role', r => r.job_role],
    ['status', r => r.status],
    ['assigned_to', r => (r.assigned_to ? teamName(team, r.assigned_to) : '')],
    ['page_path', r => r.page_path],
    ['locale', r => r.locale],
    ['utm', r => JSON.stringify(r.utm ?? {})],
    ['created_at', r => r.created_at],
  ];
  // Prefix formula-like cells so spreadsheet apps never execute them.
  const quote = (v: unknown) => `"${String(v ?? '').replace(/^([=+@\-\t\r])/, "'$1").replaceAll('"', '""')}"`;
  return [cols.map(c => c[0]).join(','), ...rows.map(r => cols.map(([, get]) => quote(get(r))).join(','))].join('\n');
}

export default function Leads({ rows, team, notice }: { rows: Lead[]; team: TeamMember[]; notice: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const update = useServerFn(updateLead);
  const refresh = useRefresh();
  const assignable = team.filter(t => t.role !== 'editor');
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      r =>
        (status === 'all' || r.status === status) &&
        (owner === 'all' || (owner === 'none' ? !r.assigned_to : r.assigned_to === owner)) &&
        (!needle || `${r.name} ${r.company ?? ''} ${r.email ?? ''} ${r.phone ?? ''} ${r.interest ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [rows, q, status, owner]);
  const counts = useMemo(() => Object.fromEntries(LEAD_STATUSES.map(s => [s, rows.filter(r => r.status === s).length])), [rows]);

  async function change(r: Lead, patch: { status?: string; assignedTo?: string | null }) {
    try {
      await update({ data: { id: r.id, status: (patch.status ?? r.status) as Lead['status'] & (typeof LEAD_STATUSES)[number], ...(patch.assignedTo !== undefined ? { assignedTo: patch.assignedTo } : {}) } });
      await refresh();
      notice('تم تحديث الطلب.');
    } catch (e) {
      notice(errorText(e));
    }
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob(['\ufeff' + leadsToCsv(visible, team)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `digit-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {LEAD_STATUSES.filter(s => counts[s]).map(s => (
          <button key={s} type="button" className="cms-chip" data-active={status === s} onClick={() => setStatus(status === s ? 'all' : s)}>
            {STATUS_LABELS[s]} · {counts[s]}
          </button>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input aria-label="بحث الطلبات" value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو المنشأة أو البريد أو الجوال" className="max-w-sm" />
        <NativeSelect aria-label="حالة الطلبات" className="max-w-[12rem]" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">كل الحالات</option>
          {LEAD_STATUSES.map(s => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="المسؤول" className="max-w-[14rem]" value={owner} onChange={e => setOwner(e.target.value)}>
          <option value="all">كل المسؤولين</option>
          <option value="none">بدون إسناد</option>
          {assignable.map(m => (
            <option key={m.user_id} value={m.user_id}>
              {m.email || m.user_id.slice(0, 8)}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
          <Download size={16} />
          تصدير {visible.length} طلب
        </Button>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        عنوان الإشعارات: <span dir="ltr">{LEAD_RECIPIENT}</span> · الإرسال البريدي غير مفعّل حتى يُجهّز نطاق الإرسال؛ كل الطلبات محفوظة هنا.
      </p>
      <div className="space-y-4">
        {visible.map(r => (
          <article key={r.id} className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-bold">
                  {r.name} · {r.company}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {REQUEST_TYPES[r.request_type] ?? r.request_type}
                  {r.interest ? ` · ${r.interest}` : ''}
                  {r.job_role ? ` · ${r.job_role}` : ''}
                </p>
              </div>
              <NativeSelect aria-label={`حالة ${r.name}`} className="max-w-[11rem]" value={r.status} onChange={e => change(r, { status: e.target.value })}>
                {LEAD_STATUSES.map(s => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="my-3 flex flex-wrap gap-4 text-sm" dir="ltr">
              {r.email && (
                <a className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline" href={`mailto:${r.email}`}>
                  <Mail size={14} />
                  {r.email}
                </a>
              )}
              {r.phone && (
                <a className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                  <Phone size={14} />
                  {r.phone}
                </a>
              )}
            </div>
            {r.message && <p className="whitespace-pre-line text-sm">{r.message}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span dir="ltr">{r.page_path}</span>
              <span>{r.locale === 'en' ? 'English' : 'العربية'}</span>
              <span>{formatDate(r.created_at)}</span>
              {Object.keys((r.utm as Record<string, string>) ?? {}).length > 0 && <span dir="ltr">{Object.entries(r.utm as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(' ')}</span>}
              <StatusPill tone={r.notification_status === 'sent' ? 'good' : 'warn'}>{r.notification_status === 'sent' ? 'أُرسل الإشعار' : 'لم يُرسل إشعار بريدي'}</StatusPill>
            </div>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              إسناد إلى
              <NativeSelect className="max-w-[16rem]" value={r.assigned_to ?? ''} onChange={e => change(r, { assignedTo: e.target.value || null })}>
                <option value="">بدون إسناد</option>
                {assignable.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.email || m.user_id.slice(0, 8)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </article>
        ))}
      </div>
      {!visible.length && <EmptyState>لا توجد طلبات مطابقة.</EmptyState>}
    </>
  );
}
