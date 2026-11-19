import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { Download, Upload, RefreshCw } from 'lucide-react';
import { strToU8 } from 'fflate';
import { Button } from '@/components/ui/button';
import { useLang, t } from '@/i18n';
import { actionExecution, allCapabilities, capabilityHandoff, capabilityOfAny, capabilityQuery, isOptional, relationsOf, searchCapabilities } from '@/lib/capabilities';
import { cachedRuntimeContract } from '@/lib/runtimeContract';
import { RuntimeReadiness } from './RuntimeReadiness';
import { overlayMeta, enabledPlugins, allPlugins, usePluginsVersion } from '@/plugins/runtime';
import { localActionFor, LOCAL_WHEN } from '@/lib/localActions';
import { RUNNERS } from '@/lib/reportRunner';
import { downloadBytes } from '@/plugins/export';
import { filesFromFileList } from '@/plugins/importApp';
import { inspectSourceFiles, ownershipIssues, type SourceInspection } from '@/plugins/sourceInspection';
import type { DocCapability, Relationship } from '@/lib/sourceTypes';
import { compileFitGap, FIT_GAP_CLASSES, type FitGapClass } from '@/lib/sourceFitGap';

const sections = [['applications', 'Applications / Modules', 'التطبيقات والوحدات'], ['schema', 'DocTypes / Relationships', 'المستندات والعلاقات'],
  ['actions', 'Actions / Workflows', 'الإجراءات وسير العمل'], ['reports', 'Reports / Insights', 'التقارير والتحليلات'],
  ['settings', 'Settings / Customization', 'الإعدادات والتخصيص'], ['runtime', 'Runtime / Domains', 'التشغيل والمجالات'], ['handoff', 'Capability Export', 'تصدير القدرات']] as const;
type Section = typeof sections[number][0];

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  return <details className="border-b py-2"><summary className="cursor-pointer text-sm font-medium">{label}</summary><pre data-no-i18n className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted/40 p-3 text-xs" dir="ltr">{JSON.stringify(value ?? null, null, 2)}</pre></details>;
}

export function CapabilityExplorer() {
  const lang = useLang(), ar = lang === 'ar';
  const label = (en: string, arabic: string) => ar ? arabic : en;
  usePluginsVersion();
  const query = useQuery(capabilityQuery);
  const [section, setSection] = useState<Section>('applications');
  const [owner, setOwner] = useState('erpnext'), [module, setModule] = useState(''), [search, setSearch] = useState('');
  const [name, setName] = useState('Customer'), [reportName, setReportName] = useState('');
  const [outcome, setOutcome] = useState(''), [decision, setDecision] = useState<FitGapClass>('SOURCE_UNVERIFIED');
  const [inspection, setInspection] = useState<SourceInspection | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (query.isPending) return <p role="status">{label('Loading source capabilities…', 'جارٍ تحميل قدرات المصادر…')}</p>;
  if (query.isError || !query.data) return <div role="alert"><p>{label('Source index unavailable', 'فهرس المصادر غير متاح')}</p><Button variant="outline" onClick={() => void query.refetch()}><RefreshCw />{label('Retry', 'إعادة المحاولة')}</Button></div>;
  const registry = query.data, app = registry.source_apps.find(a => a.name === owner);
  const modules = [...new Set(allCapabilities(registry).filter(d => d.owner === owner).map(d => d.module))].sort();
  const results = searchCapabilities(registry, search, owner, module);
  const capability = registry.doctypes[name];
  const anyCapability = capabilityOfAny(registry, name);
  const selectDoc = (n: string) => { const d = capabilityOfAny(registry, n); if (!d) return; setName(n); setOwner(d.owner); setModule(''); setSection('schema'); };
  const exportJson = (data: unknown, filename: string) => downloadBytes(strToU8(JSON.stringify(data, null, 2)), filename, 'application/json');
  const inspect = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setError('');
    try {
      const native = Object.values(registry.doctypes).map(d => ({ name: d.name, app: d.host_app }));
      const result = inspectSourceFiles(await filesFromFileList(list), { native, applications: registry.source_apps });
      for (const source of result.applications) result.issues.push(...ownershipIssues({ name: source.name, source_application: source, doctypes: source.owned_doctypes?.map(n => ({ name: n, fields: [], permissions: [] })) ?? [] }, [], allPlugins()));
      setInspection(result);
    }
    catch { setError(label('The source archive could not be read.', 'تعذر قراءة أرشيف المصدر.')); }
    finally { setBusy(false); }
  };
  const selectedReports = registry.reports.filter(r => r.app === owner && (!module || r.module === module));
  const report = selectedReports.find(r => r.name === reportName) ?? selectedReports[0];
  const plugins = enabledPlugins();
  return <div className="min-w-0" data-capability-explorer dir={ar ? 'rtl' : 'ltr'}>
    <div role="tablist" className="flex flex-wrap gap-1 border-b pb-2" aria-label={label('Source explorer sections', 'أقسام مستكشف المصادر')}>
      {sections.map(([id, en, arabic]) => <Button key={id} variant={section === id ? 'secondary' : 'ghost'} size="sm" role="tab" aria-selected={section === id} onClick={() => setSection(id)}>{label(en, arabic)}</Button>)}
    </div>
    <div className="my-4 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs">{label('Source application', 'تطبيق المصدر')}<select aria-label={label('Source application', 'تطبيق المصدر')} className="field-input w-44" value={owner} onChange={e => { setOwner(e.target.value); setModule(''); const first = allCapabilities(registry).find(d => d.owner === e.target.value); setName(first?.name ?? ''); }}>
        {registry.source_apps.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs">{label('Module', 'الوحدة')}<select className="field-input w-48" value={module} onChange={e => setModule(e.target.value)}><option value="">{label('All modules', 'جميع الوحدات')}</option>{modules.map(m => <option key={m} value={m}>{t(m)}</option>)}</select></label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs">{label('DocType / Field', 'نوع المستند / الحقل')}<input className="field-input min-w-0" value={search} onChange={e => setSearch(e.target.value)} placeholder={label('Search', 'بحث')} /></label>
      <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}><Upload />{busy ? label('Inspecting…', 'جارٍ الفحص…') : label('Inspect source package', 'فحص حزمة المصدر')}</Button>
      <input ref={file} type="file" accept=".zip" className="hidden" onChange={e => { void inspect(e.target.files); e.target.value = ''; }} />
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {inspection && <section className="mb-5 border-y py-3" aria-label={label('Package inspection', 'فحص الحزمة')}>
      <h2 className="font-semibold">{label('Inspection only — not installed', 'فحص فقط — لم يتم التثبيت')}</h2>
      <div className="mt-2 flex flex-wrap gap-2">{inspection.applications.map(a => <span key={a.name} className="text-sm" data-no-i18n>{a.name} · {a.version ?? 'UNKNOWN'} · {a.owned_doctypes?.length ?? 0}</span>)}<Button variant="ghost" size="sm" onClick={() => exportJson(inspection, 'source-inspection.json')}><Download />{label('Export inspection', 'تصدير الفحص')}</Button></div>
      {inspection.issues.map((issue, i) => <p key={i} className={issue.severity === 'error' ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'} data-no-i18n dir="ltr">{issue.code}: {issue.message}</p>)}
      <JsonDetails label={label('Provenance / Dependencies', 'مصدر البيانات والاعتماديات')} value={inspection.applications} />
    </section>}
    {section === 'applications' && <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold" data-no-i18n>{app?.name}</h2><span className="text-xs text-muted-foreground" data-no-i18n>{app?.version ?? 'UNKNOWN'} · {app?.recorded_ref ?? 'UNKNOWN'} · {app?.release_status}</span></div>
      <dl className="my-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2"><dt>{label('Namespace / UI host', 'مساحة الاسم / التطبيق المضيف')}</dt><dd data-no-i18n>{app?.namespace} / {app?.host_app ?? '—'}</dd><dt>{label('Source commit', 'نسخة المصدر')}</dt><dd data-no-i18n>{app?.commit ?? 'UNKNOWN'}</dd><dt>{label('Dependencies', 'الاعتماديات')}</dt><dd data-no-i18n>{app?.dependencies.map(d => `${d.name} ${d.constraint ?? ''}`).join(', ') || '—'}</dd><dt>SHA-256</dt><dd className="break-all font-mono text-xs" data-no-i18n>{app?.sha256 ?? 'UNKNOWN'}</dd></dl>
      <div className="grid gap-6 lg:grid-cols-2"><div><h3 className="mb-2 font-medium">{label('Owned DocTypes', 'أنواع المستندات المملوكة')} <bdi>{results.length}</bdi></h3><div className="max-h-96 overflow-auto border-y">{results.map(d => <Button key={d.name} variant="ghost" className="h-auto w-full justify-between whitespace-normal border-b py-2 text-start" onClick={() => selectDoc(d.name)}><span>{t(d.name)}</span><span className="text-xs text-muted-foreground">{t(d.module)}</span></Button>)}</div></div><div>
        <JsonDetails label={label('Relevant workspaces', 'مساحات العمل ذات الصلة')} value={registry.workspaces.filter(w => w.app === owner && (!module || w.module === module))} />
        <JsonDetails label={label('Reports', 'التقارير')} value={selectedReports} />
        <JsonDetails label={label('Source / Compatibility', 'المصدر والتوافق')} value={app} />
      </div></div>
    </section>}
    {section !== 'applications' && section !== 'reports' && <label className="mb-4 grid max-w-lg gap-1 text-xs">{label('Selected DocType', 'نوع المستند المحدد')}<select className="field-input" value={name} onChange={e => setName(e.target.value)}>{results.map(d => <option key={d.name} value={d.name}>{t(d.name)}</option>)}</select></label>}
    {section === 'schema' && capability && <section>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{t(capability.name)}</h2><Button asChild variant="outline" size="sm"><Link to="/app/$app/$doctype" params={{ app: capability.host_app, doctype: capability.slug }}>{label('Open native register', 'فتح السجل الأصلي')}</Link></Button></div>
      <p className="my-2 break-all text-xs text-muted-foreground" data-no-i18n>{capability.source} · autoname: {capability.schema.autoname ?? '—'}</p>
      <SchemaTable capability={capability} />
      <RelationTable rows={relationsOf(registry, name)} title={label('Outgoing / Child tables / Dynamic Links', 'العلاقات الصادرة والجداول الفرعية والروابط الديناميكية')} onSelect={selectDoc} />
      <RelationTable rows={relationsOf(registry, name, 'incoming')} title={label('Incoming references', 'المراجع الواردة')} onSelect={selectDoc} />
      <JsonDetails label={label('Permissions', 'الصلاحيات')} value={capability.schema.permissions} />
      <JsonDetails label={label('Full source schema', 'مخطط المصدر الكامل')} value={capability.schema} />
      <JsonDetails label={label('Customization eligibility', 'إمكانية التخصيص')} value={capability.customization} />
    </section>}
    {section === 'schema' && !capability && isOptional(anyCapability) && <section data-optional-schema={anyCapability.name}>
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{t(anyCapability.name)}</h2><span className="chip bg-accent text-xs">{label('Optional source — metadata only, not installed', 'مصدر اختياري — بيانات وصفية فقط، غير مثبّت')}</span></div>
      <p className="my-2 break-all text-xs text-muted-foreground" data-no-i18n>{anyCapability.source} · {anyCapability.schema.fields.length} fields</p>
      <RelationTable rows={relationsOf(registry, name)} title={label('Outgoing / Child tables / Dynamic Links', 'العلاقات الصادرة والجداول الفرعية والروابط الديناميكية')} onSelect={selectDoc} />
      <RelationTable rows={relationsOf(registry, name, 'incoming')} title={label('Incoming references', 'المراجع الواردة')} onSelect={selectDoc} />
      <JsonDetails label={label('Full source schema', 'مخطط المصدر الكامل')} value={anyCapability.schema} />
    </section>}
    {section === 'runtime' && <RuntimeReadiness registry={registry} name={name} onSelect={selectDoc} />}
    {section === 'actions' && capability && <section>
      <h2 className="mb-3 font-semibold">{label('Native actions', 'الإجراءات الأصلية')}</h2>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{[label('Action', 'الإجراء'), label('Related document', 'المستند المرتبط'), label('Execution', 'التنفيذ'), label('Eligibility / Source', 'الشروط والمصدر')].map(h => <th key={h} className="border-b p-2 text-start">{h}</th>)}</tr></thead><tbody>{capability.actions.map((a, i) => <tr key={i} className="border-b"><td className="p-2">{t(a.label)}</td><td className="p-2">{a.target && registry.doctypes[a.target] ? <Button variant="link" size="sm" onClick={() => selectDoc(a.target ?? '')}>{t(a.target)}</Button> : a.target ?? '—'}</td><td className="p-2" data-no-i18n>{actionExecution(a, !!localActionFor(name, a.label))}</td><td className="max-w-md p-2"><JsonDetails label={label('Details', 'التفاصيل')} value={{ trigger: 'Form action', conditions: a.conditions, local_eligibility: LOCAL_WHEN[`${name}::${a.label}`] ? 'src/lib/localActions.ts LOCAL_WHEN' : null, method: a.method, source: a.source, kind: a.kind, field_map: a.field_map }} /></td></tr>)}</tbody></table></div>
      {!capability.actions.length && <p className="py-3 text-sm text-muted-foreground">{label('No extracted native actions', 'لا توجد إجراءات أصلية مستخرجة')}</p>}
      <JsonDetails label={label('Controller / Real DIGIT dependency', 'المتحكم والاعتماد على DIGIT الحقيقي')} value={capability.controller} />
      <JsonDetails label={label('Workflow definitions / States', 'تعريفات سير العمل والحالات')} value={{ source: capability.workflows, effective: plugins.flatMap(p => p.workflows ?? []).filter(w => w.document_type === name), audit: registry.workflow_audit }} />
      <JsonDetails label={label('Form rules / Triggers', 'قواعد النموذج والمشغلات')} value={capability.form_rules.map(r => ({ ...r, execution: r.server ? 'FRAPPE_SERVER_REQUIRED' : 'VIRTUAL_PARTIAL' }))} />
      <JsonDetails label={label('Link query eligibility', 'شروط استعلام الروابط')} value={capability.link_filters} />
    </section>}
    {section === 'reports' && <section>
      <label className="mb-3 grid max-w-lg gap-1 text-xs">{label('Report', 'التقرير')}<select className="field-input" value={report?.name ?? ''} onChange={e => setReportName(e.target.value)}>{selectedReports.map(r => <option key={r.name} value={r.name}>{t(r.name)}</option>)}</select></label>
      {report ? <><h2 className="font-semibold">{t(report.name)}</h2><p className="my-2 text-xs" data-no-i18n>{report.app} · {report.ref_doctype} · {RUNNERS[report.name] ? 'VIRTUAL_IMPLEMENTED (local port; not production parity)' : report.report_type === 'Report Builder' ? 'VIRTUAL_PARTIAL' : 'FRAPPE_SERVER_REQUIRED'}</p><Button asChild variant="outline" size="sm"><Link to="/report/$name" params={{ name: report.name }}>{label('Open report', 'فتح التقرير')}</Link></Button><JsonDetails label={label('Filters / Columns / Calculation references', 'الفلاتر والأعمدة ومراجع الحساب')} value={{ source: report, local: RUNNERS[report.name] ? { source: RUNNERS[report.name]?.src, filters: RUNNERS[report.name]?.filters } : null }} /></> : <p>{label('No indexed reports for this source application', 'لا توجد تقارير مفهرسة لهذا التطبيق')}</p>}
      <JsonDetails label={label('Metric sources', 'مصادر المؤشرات')} value={{ number_cards: Object.entries(registry.number_cards).filter(([, c]) => c['app'] === owner), charts: Object.entries(registry.charts).filter(([, c]) => c['app'] === owner) }} />
      {owner === 'insights' && <><Button asChild variant="outline"><Link to="/insights">{label('Open Insights', 'فتح التحليلات')}</Link></Button><JsonDetails label={label('Insights ownership / Indexing gap', 'ملكية التحليلات وفجوة الفهرسة')} value={{ source: app, execution: 'VIRTUAL_PARTIAL', source_manifest: 'public/catalog/insights/manifest.json', engine: 'src/lib/insights.ts', gap: '21 optional source DocTypes are indexed as optional source metadata (capabilities.json optional_sources.insights), not registered into the frozen host catalog; query execution stays INSIGHTS_SERVER_REQUIRED' }} /></>}
    </section>}
    {section === 'settings' && capability && <section>
      <JsonDetails label={label('Native settings / Print / Notifications / Naming', 'الإعدادات الأصلية والطباعة والإشعارات والتسمية')} value={capability.settings} />
      <JsonDetails label={label('Custom Fields / Property Setters', 'الحقول المخصصة ومعدلات الخصائص')} value={plugins.map(p => ({ app: p.name, fields: p.custom_fields?.filter(f => f.dt === name), properties: p.property_setters?.filter(f => f.doc_type === name) })).filter(p => p.fields?.length || p.properties?.length)} />
      <JsonDetails label={label('Source metadata', 'بيانات المصدر الوصفية')} value={capability.schema} />
      <JsonDetails label={label('Effective overlay metadata', 'البيانات الوصفية بعد التخصيص')} value={overlayMeta(capability.schema)} />
      <Button asChild variant="outline" className="mt-3"><Link to="/customize-form" search={{ doctype: name }}>{label('Customize form', 'تخصيص النموذج')}</Link></Button>
    </section>}
    {section === 'handoff' && <section>
      <div className="mb-3 flex flex-wrap gap-2"><Button disabled={!capability} onClick={() => exportJson(capabilityHandoff(registry, name), `${name || 'capability'}.capability.json`)}><Download />{label('Export selected capability', 'تصدير القدرة المحددة')}</Button><Button variant="outline" onClick={() => exportJson(registry, 'digit-capabilities.json')}><Download />{label('Export full registry', 'تصدير الفهرس الكامل')}</Button></div>
      <JsonDetails label={label('Developer handoff', 'تسليم المطور')} value={capabilityHandoff(registry, name)} />
      <div className="my-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">{label('Business requirement', 'متطلب العمل')}<input className="field-input" value={outcome} onChange={e => setOutcome(e.target.value)} /></label><label className="grid gap-1 text-xs">{label('Fit-gap decision', 'قرار الملاءمة والفجوة')}<select className="field-input" value={decision} onChange={e => setDecision(e.target.value as FitGapClass)}>{FIT_GAP_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}</select></label></div>
      <Button variant="outline" disabled={!outcome.trim()} onClick={() => exportJson(compileFitGap(registry, { id: 'PROPOSED-REQUIREMENT', evidence: [], outcome, native_candidate: name, decision, acceptance: [], tests: [] }, { contract: cachedRuntimeContract(), runners: RUNNERS }), 'fit-gap-handoff.json')}><Download />{label('Export fit-gap draft', 'تصدير مسودة الملاءمة والفجوة')}</Button>
      <JsonDetails label={label('Existing versus missing capabilities', 'القدرات الحالية والمفقودة')} value={registry.coverage} />
      <JsonDetails label={label('Source fingerprints', 'بصمات المصادر')} value={registry.inputs} />
    </section>}
    {!capability && ['schema', 'actions', 'settings'].includes(section) && <p className="py-4 text-muted-foreground">{label('No host DocType indexed for this source selection', 'لا يوجد نوع مستند مضيف مفهرس لهذا المصدر')}</p>}
  </div>;
}

function SchemaTable({ capability }: { capability: DocCapability }) {
  const ar = useLang() === 'ar';
  return <div className="max-h-96 overflow-auto border-y"><table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr>{(ar ? ['الحقل', 'النوع', 'التسمية', 'الخيارات', 'مطلوب', 'للقراءة فقط'] : ['Field', 'Type', 'Label', 'Options', 'Required', 'Read only']).map(h => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>{capability.schema.fields.map((f, i) => <tr key={`${f.fieldname}:${i}`} className="border-b"><td className="p-2 font-mono" data-no-i18n>{f.fieldname}</td><td className="p-2 font-mono" data-no-i18n>{f.fieldtype}</td><td className="p-2">{t(f.label ?? '')}</td><td className="max-w-xs whitespace-pre-wrap break-words p-2 font-mono" data-no-i18n>{f.options}</td><td className="p-2">{f.reqd ? '✓' : '—'}</td><td className="p-2">{f.read_only ? '✓' : '—'}</td></tr>)}</tbody></table></div>;
}
function RelationTable({ rows, title, onSelect }: { rows: Relationship[]; title: string; onSelect: (name: string) => void }) {
  return <section className="mt-5"><h3 className="mb-2 font-semibold">{title} <bdi>{rows.length}</bdi></h3><div className="max-h-72 overflow-auto"><table className="w-full text-xs"><tbody>{rows.map(r => <tr key={r.id} className="border-b"><td className="p-2"><Button variant="link" size="sm" onClick={() => onSelect(r.from)}>{t(r.from)}</Button></td><td className="p-2 font-mono" data-no-i18n>{r.field}</td><td className="p-2 font-mono" data-no-i18n>{r.kind} {r.cardinality}</td><td className="p-2">{r.to ? <Button variant="link" size="sm" onClick={() => onSelect(r.to ?? '')}>{t(r.to)}</Button> : <span className="font-mono" data-no-i18n>{r.discriminator}</span>}</td></tr>)}</tbody></table></div></section>;
}