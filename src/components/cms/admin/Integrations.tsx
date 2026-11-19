import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Save, Settings2, ShieldCheck } from 'lucide-react';
import { getIntegrationSettings, saveIntegrationSettings } from '@/lib/marketing.functions';
import { integrationSettingsSchema, type IntegrationSettings } from '@/lib/marketing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, StatusPill, errorText } from './shared';

export default function Integrations({ notice }: { notice: (message: string) => void }) {
  const load = useServerFn(getIntegrationSettings);
  const query = useQuery({ queryKey: ['marketing-integrations'], queryFn: () => load() });
  if (query.isPending) return <p role="status">جارٍ تحميل إعدادات الربط…</p>;
  if (query.error) return <div><p role="alert">{errorText(query.error)}</p><Button variant="outline" onClick={() => query.refetch()}>إعادة المحاولة</Button></div>;
  return <IntegrationEditor initial={query.data} notice={notice} />;
}

function IntegrationEditor({ initial, notice }: { initial: IntegrationSettings; notice: (message: string) => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveIntegrationSettings);
  const set = <K extends keyof IntegrationSettings>(key: K, patch: Partial<IntegrationSettings[K]>) => setValue(v => ({ ...v, [key]: { ...v[key], ...patch } }));
  async function submit() {
    if (!integrationSettingsSchema.safeParse(value).success) { notice('راجع المعرّفات والروابط المدخلة.'); return; }
    setBusy(true);
    try { await save({ data: value }); notice('حُفظت إعدادات الربط؛ لم يتم تشغيل أي خدمة خارجية.'); }
    catch (e) { notice(errorText(e)); }
    finally { setBusy(false); }
  }
  const panel = (name: string, configured: boolean, fields: React.ReactNode) => <article className="rounded-lg border border-border bg-card p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-bold"><Settings2 size={18} />{name}</h3><StatusPill tone="warn">{configured ? 'إعدادات محفوظة · غير متصل' : 'غير متصل'}</StatusPill></div>{fields}
  </article>;
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck size={18} />التتبع والإرسال الخارجي غير مفعّلين.</p><Button disabled={busy} onClick={submit}><Save size={16} />{busy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الربط'}</Button></div>
    <div className="grid gap-5 lg:grid-cols-2">
      {panel('Google Analytics', !!value.analytics.measurementId, <><Field label="معرّف القياس"><Input dir="ltr" placeholder="G-…" value={value.analytics.measurementId} onChange={e => set('analytics', { measurementId: e.target.value })} /></Field><Field label="رقم الخاصية"><Input dir="ltr" value={value.analytics.propertyId} onChange={e => set('analytics', { propertyId: e.target.value })} /></Field></>)}
      {panel('Google Search Console', !!value.searchConsole.siteUrl, <Field label="الخاصية المعتمدة"><Input dir="ltr" placeholder="https://your-domain/" value={value.searchConsole.siteUrl} onChange={e => set('searchConsole', { siteUrl: e.target.value })} /></Field>)}
      {panel('Google Sheets', !!value.sheets.spreadsheetUrl, <><Field label="رابط ملف العملاء"><Input dir="ltr" placeholder="https://docs.google.com/spreadsheets/d/…" value={value.sheets.spreadsheetUrl} onChange={e => set('sheets', { spreadsheetUrl: e.target.value })} /></Field><Field label="اسم ورقة العملاء"><Input value={value.sheets.tabName} onChange={e => set('sheets', { tabName: e.target.value })} /></Field></>)}
      {panel('n8n', !!value.n8n.workflowName, <><Field label="اسم سير العمل"><Input value={value.n8n.workflowName} onChange={e => set('n8n', { workflowName: e.target.value })} /></Field><Field label="مسار استقبال الطلبات"><Input dir="ltr" placeholder="/webhook/…" value={value.n8n.webhookPath} onChange={e => set('n8n', { webhookPath: e.target.value })} /></Field></>)}
    </div>
    <p className="mt-5 text-sm text-muted-foreground">الطلبات محفوظة في الإدارة. ربط الحسابات وتفعيل النقل يتم لاحقًا؛ لا تُدخل كلمات مرور أو مفاتيح سرية هنا.</p>
  </>;
}