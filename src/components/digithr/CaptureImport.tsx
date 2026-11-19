import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { indexQuery, loadMeta } from '@/lib/catalog';
import { autoMap, download, parseFile, tableSpecs, validate, type TableSpec } from '@/lib/dataImport';
import { canReadType, useScopeMetas } from '@/plugins/digit_hr/compat/scope';
import { importCheckins } from '@/plugins/digit_hr/capture';
import { enterHrNative } from './HrNav';
import { useUnsavedGuard } from '@/components/digithr/UnsavedGuard';
import { deskUrl, hostAllows } from '@/plugins/digit_hr/compat/host';

export function CaptureImport({ tx }: { tx: (ar: string, en: string) => string }) {
  const { data: index } = useQuery(indexQuery);
  useScopeMetas(['Employee', 'Employee Checkin', 'Data Import', 'Data Import Log']);
  const navigate = useNavigate();
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [specs, setSpecs] = useState<TableSpec[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // A parsed, not-yet-imported file is user work: protect it from accidental navigation; a successful import releases it.
  const guard = useUnsavedGuard(rows.length > 0 && !busy);
  const checked = specs.length && rows.length ? validate(rows.slice(1), autoMap(rows[0] ?? [], specs), specs, 'Insert New Records') : null;
  async function attach(f: File | undefined) {
    if (!f || !index) return;
    setError(''); setRows([]);
    try {
      const meta = await loadMeta(index, 'Employee Checkin');
      if (!meta) return;
      setSpecs(await tableSpecs(index, meta)); setRows(await parseFile(f)); setFile(f.name);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function start() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const log = importCheckins(rows, specs, file); enterHrNative('03.4'); guard.release();
      await navigate({ to: '/app/data-import/$name', params: { name: log.name } });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  // On a Frappe site imports run through the native Data Import tool (DIGIT HR never writes Data Import itself).
  if (!hostAllows('Data Import', 'insert')) return <section className="mb-5 space-y-3" data-capture-import data-capture-native>
    <h2 className="text-base font-semibold">{tx('استيراد تسجيلات الموظفين', 'Employee check-in import')}</h2>
    <p className="text-sm text-muted-foreground">{tx('يتم الاستيراد على هذا الموقع عبر أداة استيراد البيانات الأصلية في فرابيه، مع التحقق والسجل الخاصين بها.', 'On this site, imports run through the native DIGIT Data Import tool, with its own validation and log.')}</p>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => download([['ID', 'Employee', 'Time', 'Log Type', 'Device ID']], 'Employee_Checkin', 'CSV')}><Download />{tx('تنزيل القالب', 'Download template')}</Button>
      <Button asChild><a href={deskUrl('Data Import', 'new', { reference_doctype: 'Employee Checkin', import_type: 'Insert New Records' })} onClick={() => enterHrNative('03.4')}><Upload />{tx('فتح استيراد البيانات', 'Open Data Import')}</a></Button>
      <Button asChild variant="outline"><a href={deskUrl('Data Import')} onClick={() => enterHrNative('03.4')}>{tx('سجل الاستيراد', 'Import history')}</a></Button>
    </div>
  </section>;
  return <section className="mb-5 space-y-3" data-capture-import>
    {guard.dialog}
    <h2 className="text-base font-semibold">{tx('استيراد تسجيلات الموظفين', 'Employee check-in import')}</h2>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => download([['ID', 'Employee', 'Time', 'Log Type', 'Device ID']], 'Employee_Checkin', 'CSV')}><Download />{tx('تنزيل القالب', 'Download template')}</Button>
      {/* NB1-05: the browser's own picker text ("Choose File / No file chosen") cannot follow the app language, so the native input is visually hidden behind a localized control. */}
      <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm focus-within:ring-2 focus-within:ring-ring ${!index || busy ? 'pointer-events-none opacity-50' : ''}`} data-file-picker>
        <Upload className="size-4" aria-hidden /><span>{tx('اختر ملف التسجيلات', 'Choose check-in file')}</span>
        <input type="file" accept=".csv,.xlsx,.xls" aria-label={tx('ملف التسجيلات', 'Check-in file')} className="sr-only !h-px !min-h-0 !w-px !border-0 !p-0" disabled={!index || busy} onChange={e => void attach(e.target.files?.[0])} />
      </label>
      <span className="text-xs text-muted-foreground" aria-live="polite">{file ? <bdi data-no-i18n>{file}</bdi> : tx('لم يُختر ملف بعد (CSV أو Excel)', 'No file chosen yet (CSV or Excel)')}</span>
      <Button disabled={busy || !checked?.docs.length || !!checked.issues.length} onClick={() => void start()}><Upload />{tx('استيراد', 'Import')}</Button>
      {canReadType('Data Import') && <Button asChild variant="outline"><Link to="/app/data-import" onClick={() => enterHrNative('03.4')}>{tx('سجل الاستيراد', 'Import history')}</Link></Button>}
    </div>
    {file && <div className="text-sm" data-no-i18n>{file} · {checked?.docs.length ?? 0}</div>}
    {(error || !!checked?.issues.length) && <div role="alert" className="whitespace-pre-wrap text-sm text-destructive">{error || checked?.issues.map(i => `${i.row}: ${i.messages.join('; ')}`).join('\n')}</div>}
    {rows.length > 0 && <div className="max-h-64 overflow-auto"><table className="w-full text-start text-sm"><thead><tr>{(rows[0] ?? []).map((h, i) => <th className="p-2 text-start" key={i} data-no-i18n>{h}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, i) => <tr key={i} className="border-t border-border">{r.map((v, j) => <td key={j} className="p-2" data-no-i18n>{v}</td>)}</tr>)}</tbody></table></div>}
    <p className="text-sm text-muted-foreground">{tx('تسجيلات فقط؛ لا يتم إنشاء حضور أو تشغيل مزامنة أجهزة تلقائياً.', 'Check-ins only; attendance creation and device synchronization are not automatic.')}</p>
  </section>;
}