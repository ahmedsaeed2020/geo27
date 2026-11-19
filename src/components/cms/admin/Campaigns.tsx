import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, RefreshCw } from 'lucide-react';
import { getCampaignInsights } from '@/lib/marketing.functions';
import { campaignUrl, SOURCES, SOURCE_LABELS } from '@/lib/marketing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, NativeSelect, EmptyState, errorText } from './shared';

export default function Campaigns({ notice }: { notice: (message: string) => void }) {
  const load = useServerFn(getCampaignInsights);
  const query = useQuery({ queryKey: ['campaign-insights'], queryFn: () => load() });
  const [base, setBase] = useState('');
  const [source, setSource] = useState('facebook');
  const [medium, setMedium] = useState('paid_social');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [term, setTerm] = useState('');
  let url = '';
  try { if (campaign.trim()) url = campaignUrl(base || window.location.origin + '/', source, medium, campaign, content, term); } catch { /* Invalid URL is shown below. */ }
  async function copy() {
    try { await navigator.clipboard.writeText(url); notice('تم نسخ رابط الحملة.'); } catch { notice('تعذّر النسخ؛ يمكنك تحديد الرابط ونسخه.'); }
  }
  return <>
    <section className="mb-8 border-b border-border pb-8">
      <h3 className="mb-4 text-lg font-bold">رابط حملة جديد</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="صفحة الوصول"><Input dir="ltr" placeholder="رابط الموقع الحالي" value={base} onChange={e => setBase(e.target.value)} /></Field>
        <Field label="مصدر الحملة"><NativeSelect value={source} onChange={e => { setSource(e.target.value); setMedium(e.target.value === 'google' ? 'cpc' : 'paid_social'); }}>{SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}</NativeSelect></Field>
        <Field label="اسم الحملة"><Input value={campaign} onChange={e => setCampaign(e.target.value)} /></Field>
        <Field label="الوسيط"><NativeSelect value={medium} onChange={e => setMedium(e.target.value)}><option value="paid_social">إعلان اجتماعي</option><option value="cpc">إعلان بحث</option><option value="social">منشور اجتماعي</option><option value="email">بريد إلكتروني</option></NativeSelect></Field>
        <Field label="الإعلان / المحتوى"><Input value={content} onChange={e => setContent(e.target.value)} /></Field>
        <Field label="الكلمة المستهدفة"><Input value={term} onChange={e => setTerm(e.target.value)} /></Field>
      </div>
      {campaign && !url && <p role="alert" className="mt-3 text-destructive">أدخل رابط صفحة صحيحًا.</p>}
      <div className="mt-4 flex gap-2"><Input aria-label="رابط الحملة" dir="ltr" readOnly value={url} /><Button variant="outline" onClick={copy} disabled={!url}><Copy size={16} />نسخ</Button></div>
    </section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">مصادر الطلبات والحملات</h3><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw size={16} />تحديث</Button></div>
    {query.isPending ? <p role="status">جارٍ تحميل نتائج الحملات…</p> : query.error ? <p role="alert">{errorText(query.error)}</p> : <>
      <p className="mb-4 text-sm text-muted-foreground">إجمالي الطلبات: {query.data.total} · أعداد الطلبات المحفوظة فقط، وليست أعداد الزيارات أو تكلفة الإعلانات.</p>
      <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr className="border-b border-border text-muted-foreground">{['المصدر', 'الحملة', 'الطلبات', 'التعاقدات'].map(t => <th key={t} className="p-3 text-start">{t}</th>)}</tr></thead><tbody>{query.data.groups.map(g => <tr key={JSON.stringify([g.source, g.campaign])} className="border-b border-border"><td className="p-3">{SOURCE_LABELS[g.source] || g.source}</td><td className="p-3">{g.campaign || 'غير محددة'}</td><td className="p-3">{g.leads}</td><td className="p-3">{g.won}</td></tr>)}</tbody></table></div>
      {!query.data.total && <EmptyState>لا توجد طلبات مسجلة حتى الآن.</EmptyState>}
    </>}
  </>;
}