import { useMemo, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteRedirect, saveRedirect } from '@/lib/cms-admin.functions';
import { normalizeRedirectSource, normalizeRedirectTarget } from '@/lib/redirect-rules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { EmptyState, errorText, Field, formatDate, NativeSelect, StatusPill, useRefresh, type Doc, type RedirectRow } from './shared';

type Draft = { id?: string; from: string; to: string; status: 301 | 302 | 307 | 308; enabled: boolean; note: string };
const EMPTY: Draft = { from: '', to: '', status: 301, enabled: true, note: '' };
const STATUS_HELP: Record<number, string> = {
  301: 'دائم — ينقل قيمة البحث للرابط الجديد (الأنسب لمعظم الحالات)',
  302: 'مؤقت — يبقي الرابط القديم في نتائج البحث',
  307: 'مؤقت مع الحفاظ على نوع الطلب',
  308: 'دائم مع الحفاظ على نوع الطلب',
};

export default function Redirects({ rows, docs, owner, notice }: { rows: RedirectRow[]; docs: Doc[]; owner: boolean; notice: (s: string) => void }) {
  const save = useServerFn(saveRedirect);
  const remove = useServerFn(deleteRedirect);
  const refresh = useRefresh();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Paths served by a real page never reach the redirect lookup, so warn before saving such a rule.
  const livePaths = useMemo(() => {
    const set = new Set<string>();
    for (const key of Object.keys(router.routesByPath)) if (!key.includes('$') && !key.startsWith('/_') && key !== '/') set.add(key.replace(/\/$/, '').toLowerCase());
    for (const d of docs) if (d.published) {
      set.add(d.path);
      set.add(d.path === '/' ? '/en' : `/en${d.path}`);
    }
    return set;
  }, [router, docs]);

  const from = draft ? normalizeRedirectSource(draft.from) : null;
  const to = draft ? normalizeRedirectTarget(draft.to) : null;
  const shadowed = !!from && livePaths.has(from);
  const visible = rows.filter(r => !q || `${r.from_path} ${r.to_path} ${r.note}`.toLowerCase().includes(q.toLowerCase()));

  async function submit() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const result = await save({ data: draft });
      await refresh();
      setDraft(null);
      notice(result.flattened ? `تم حفظ التحويل، وحُدّث ${result.flattened} تحويل سابق ليشير مباشرة إلى الوجهة النهائية.` : 'تم حفظ التحويل.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted-foreground">
        التحويلات تعمل للروابط غير الموجودة فقط — مثل روابط WordPress القديمة أو صفحات حُذفت. يُطبّق التحويل قبل صفحة «غير موجودة» ويُحتسب عدد مرات استخدامه.
      </p>
      <div className="flex flex-wrap gap-3">
        <Input aria-label="بحث التحويلات" placeholder="ابحث في المسارات" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm" />
        {owner && (
          <Button onClick={() => { setDraft({ ...EMPTY }); setError(''); }}>
            <Plus size={16} />
            تحويل جديد
          </Button>
        )}
      </div>

      {draft && (
        <form
          className="space-y-4 rounded-lg border border-border bg-card p-5"
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="الرابط القديم" hint={from ? `سيُطابق: ${from}` : 'مثال: /old-page أو الرابط الكامل القديم'}>
              <Input dir="ltr" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} placeholder="/old-page" />
            </Field>
            <Field label="الوجهة" hint={to ? (to.kind === 'external' ? 'رابط خارجي' : 'صفحة داخلية') : 'مسار داخلي مثل /modules/sales أو https://…'}>
              <Input dir="ltr" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} placeholder="/modules/sales" />
            </Field>
            <Field label="نوع التحويل" hint={STATUS_HELP[draft.status]}>
              <NativeSelect value={draft.status} onChange={e => setDraft({ ...draft, status: Number(e.target.value) as Draft['status'] })}>
                <option value={301}>301 دائم</option>
                <option value={302}>302 مؤقت</option>
                <option value={307}>307 مؤقت</option>
                <option value={308}>308 دائم</option>
              </NativeSelect>
            </Field>
            <Field label="ملاحظة داخلية">
              <Input value={draft.note} maxLength={300} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="سبب التحويل" />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={v => setDraft({ ...draft, enabled: v })} aria-label="مفعّل" />
            مفعّل
          </label>
          {draft.from && !from && <p className="text-sm text-destructive">المسار القديم غير صالح أو محجوز.</p>}
          {draft.to && !to && <p className="text-sm text-destructive">الوجهة غير صالحة. استخدم مسارًا يبدأ بـ / أو رابطًا يبدأ بـ https://.</p>}
          {shadowed && <p className="text-sm text-amber-700 dark:text-amber-400">تنبيه: هذا المسار صفحة موجودة حاليًا، فلن يعمل التحويل إلا إذا أُزيلت الصفحة.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !from || !to}>
              حفظ التحويل
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              إلغاء
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="v3-cms-table">
          <thead>
            <tr>
              <th>من</th>
              <th>إلى</th>
              <th>النوع</th>
              <th>الاستخدام</th>
              <th>الحالة</th>
              <th>
                <span className="sr-only">إجراءات</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td dir="ltr" className="text-start font-mono text-xs">{r.from_path}</td>
                <td dir="ltr" className="text-start font-mono text-xs">
                  <ArrowLeft size={12} className="me-1 inline rotate-180" aria-hidden="true" />
                  {r.to_path}
                </td>
                <td>{r.status_code}</td>
                <td>
                  {r.hits} مرة
                  {r.last_hit_at && <span className="block text-xs text-muted-foreground">آخرها {formatDate(r.last_hit_at)}</span>}
                </td>
                <td>{r.enabled ? <StatusPill tone="good">مفعّل</StatusPill> : <StatusPill>متوقف</StatusPill>}</td>
                <td className="whitespace-nowrap">
                  {owner && (
                    <>
                      <Button size="icon" variant="ghost" aria-label={`تعديل ${r.from_path}`} onClick={() => { setDraft({ id: r.id, from: r.from_path, to: r.to_path, status: r.status_code as Draft['status'], enabled: r.enabled, note: r.note }); setError(''); }}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`حذف ${r.from_path}`}
                        onClick={async () => {
                          if (!window.confirm(`حذف التحويل ${r.from_path}؟`)) return;
                          try {
                            await remove({ data: { id: r.id } });
                            await refresh();
                            notice('حُذف التحويل.');
                          } catch (e) {
                            notice(errorText(e));
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && <EmptyState>لا توجد تحويلات.</EmptyState>}
    </div>
  );
}
