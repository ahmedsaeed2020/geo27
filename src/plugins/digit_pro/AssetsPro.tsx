// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
/** Fixed Assets Control Center: source-scoped exceptions, native operations and management signals. */
import { DeptOverview } from './DeptOverview';
import { freshness } from './command';
import { amountFigure, ChartCard, ContextStrip, Donut, LINK_CHIP, LinkGroup, WorkPanel, type Datum, type KpiItem, type WorkTab } from '@/components/enterprise/kit';
import { proWrap } from './ProKit';
import { useLang } from '@/i18n';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtCurrency } from '@/lib/format';
import { financeContext, sourceStatus, todayIso } from './finance';
import { ProFrame, SourceState } from './ProFrame';
import { ASSET_SOURCES, assetWorkspace } from './assetWorkspace';
import { AssetDocLink, AssetListLink, NewAssetDoc, useAssetLabels } from './AssetUI';
import { resolveLayout, saveLayout, resetPersonal, toggle, type DashLayout } from './dashLayout';
import { depreciationLifecycle, lifecycleStages } from './assetLifecycle';
import { DepreciationChart, DepreciationQueue, LifecycleTimeline } from './AssetLifecycle';
import { DateInput } from "@/components/form/DateInput";
import { AssetMatrix, RatioGauge } from './richBlocks';
export interface AssetsSearch {company?:string|undefined;asof?:string|undefined;book?:string|undefined;queue?:string|undefined}
const sections=['signals','lifecycle','schedule','work','analysis','activity'] as const;
export function AssetsPro({search}:{search:AssetsSearch}) {
 const nav=useNavigate();const isAr=useLang()==='ar';const {label:l,display}=useAssetLabels();const [edit,setEdit]=useState(false);const [draft,setDraft]=useState<DashLayout|null>(null);
 const set=(p:Partial<AssetsSearch>)=>void nav({to:'/pro/assets-overview',search:((prev:AssetsSearch)=>({...prev,...p})) as never,replace:true});
 return <ProFrame title={l('Fixed Assets Control Center','مركز إدارة الأصول الثابتة')} subtitle={l('Monitor asset values, depreciation, custody, maintenance and lifecycle exceptions','متابعة قيمة الأصول وإهلاكها وعهدتها وصيانتها وإجراءات دورة حياتها')} bare tabs={false} doctypes={ASSET_SOURCES} icon="/icons/digit/mod/digit-mod-assets-light.svg">
 {({user,roles})=>{
 const ctx=financeContext(search.company,user);if(!ctx.companies.length)return <SourceState status="denied" doctype="Company"/>;
 const asof=search.asof||todayIso();const assetUpdated=freshness(['Asset','Asset Movement','Asset Repair','Journal Entry'],user);const w=assetWorkspace({company:ctx.company,asof,book:search.book},user);
 const scope={company:ctx.company,asof,book:search.book};const stages=lifecycleStages(w,scope);const dl=depreciationLifecycle(w,scope,user);
 const money=(v:number|undefined)=>v===undefined?l('Unavailable','غير متاح'):fmtCurrency(v,ctx.currency);
 const layout=draft??resolveLayout('dept:assets',user,sections).layout;
 const queue=search.queue||'depreciation';
 const queues=[['depreciation','Due depreciation','الإهلاك المستحق','Asset Depreciation Schedule'],['drafts','New assets','أصول جديدة','Asset'],['custody','Location & custody','الموقع والعهدة','Asset'],['maintenance','Overdue maintenance','صيانة متأخرة','Asset Maintenance Log'],['repairs','Open repairs','إصلاحات مفتوحة','Asset Repair'],['movements','Pending movements','حركات معلقة','Asset Movement']];
 const items=w.issues.filter(i=>i.kind===queue);const queueSource=queues.find(q=>q[0]===queue)?.[3]??'Asset';
 const sectionLabels:Record<string,string>={signals:l('Key figures','الأرقام الرئيسية'),lifecycle:l('Asset lifecycle','دورة حياة الأصول'),schedule:l('Depreciation schedule','جدول الإهلاك'),work:l('Action required','تحتاج إلى إجراء'),analysis:l('Management intelligence','مؤشرات الإدارة'),activity:l('Recent activity & reports','النشاط والتقارير')};
 const hidden=(id:string)=>!edit&&layout.hidden.includes(id);
 // cost, accumulated depreciation, net book value and due depreciation are the contract tiles AST.COST / DEP_POSTED / NBV / DEP_DUE
 const lead:KpiItem[]=hidden('signals')?[]:[
  {id:'ast:count',figure:'ast:count',label:l('Total assets','إجمالي الأصول'),value:w.states['Asset']==='ok'?String(w.all.length):'—',sub:l('Permitted non-cancelled Asset records acquired by the selected date','الأصول المسموح بها غير الملغاة والمقتناة حتى التاريخ المحدد'),wrap:(n)=><Link to="/pro/asset-register" search={{company:ctx.company} as never} className="contents" data-dp-asset-kpi="count">{n}</Link>},
  {id:'ast:custody',figure:'ast:custody',label:l('Missing custody / location','دون عهدة أو موقع'),value:String(w.missingCustody),tone:w.missingCustody?'attention':undefined,sub:<>{l('In maintenance','قيد الصيانة')}: {w.underMaintenance} · {l('Actionable exceptions','إجراءات مطلوبة')}: {w.issues.length}</>,wrap:(n)=><button type="button" className="contents" onClick={()=>set({queue:'custody'})} data-dp-asset-kpi="custody">{n}</button>},
 ];
 const queueBody=w.states[queueSource]!=='ok'?<SourceState status={w.states[queueSource]??'unavailable'} doctype={queueSource}/>:!items.length?<div className="py-8 text-center"><p className="font-medium">{l('No pending work in this queue','لا توجد أعمال معلقة في هذه القائمة')}</p><p className="mt-1 text-sm text-muted-foreground">{l('No matching permitted source records for this company and date','لا توجد سجلات مصدر مسموح بها مطابقة للشركة والتاريخ')}</p></div>:
  <div className="ek-table-wrap"><table className="ek-table"><thead><tr>{[l('Asset / source','الأصل / المصدر'),l('Category / status','الفئة / الحالة'),l('Date','التاريخ'),l('Exposure','القيمة'),l('Reason','سبب الإجراء'),l('Next action','الإجراء التالي')].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{items.map((i,k)=><tr key={`${i.name}-${k}`}><td><AssetDocLink dt="Asset" name={i.asset.name}/><div className="mt-1 text-xs">{display(i.asset['asset_name'])}</div>{i.dt!=='Asset'&&<AssetDocLink dt={i.dt} name={i.name}/>}</td><td><span>{display(i.asset['asset_category'])}</span><div className="mt-1 text-xs text-muted-foreground">{display(i.asset['status']||'Draft')}</div></td><td className="whitespace-nowrap tabular-nums">{i.date||'—'}</td><td className="whitespace-nowrap tabular-nums">{i.amount===undefined?'—':money(i.amount)}</td><td>{display(i.reason)}</td><td>{i.kind==='depreciation'?<Link to="/pro/depreciation" search={{company:ctx.company,to:asof,state:'due',book:search.book} as never} className={LINK_CHIP}>{l('Review','مراجعة')}</Link>:<AssetDocLink dt={i.dt} name={i.name}>{l('Open document','فتح المستند')}</AssetDocLink>}</td></tr>)}</tbody></table></div>;
 const extra:WorkTab[]=[
  ...(hidden('schedule')?[]:[{id:'schedule',label:l('Depreciation schedule','جدول الإهلاك'),attrs:{'data-dp-asset-tab':'schedule'},content:<DepreciationQueue d={dl} currency={ctx.currency} company={ctx.company} book={search.book} asof={asof}/>}]),
  ...(hidden('activity')?[]:[{id:'activity',label:l('Recent source activity','أحدث نشاط المصدر'),attrs:{'data-dp-asset-tab':'activity'},content:<div data-dp-asset-activity>{!w.activity.length?<SourceState status="empty"/>:<ul className="ek-rowlist">{w.activity.map(r=><li key={`${r.dt}-${r.doc.name}`} className="ek-row"><span className="ek-row-main"><AssetDocLink dt={r.dt} name={r.doc.name}/><span className="ek-row-meta">{display(r.dt)}</span></span><time className="ek-row-meta tabular-nums">{r.date}</time></li>)}</ul>}</div>}]),
 ];
 const activeTab=extra.some(x=>x.id===search.queue)?search.queue!:queue;
 const customize=edit&&<div className="ek-card" data-dp-asset-customize><div className="ek-card-body flex flex-wrap items-center gap-3">
  {sections.map(id=><label key={id} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!layout.hidden.includes(id)} onChange={()=>setDraft(toggle(layout,id))}/>{sectionLabels[id]}</label>)}
  <span className="ms-auto flex flex-wrap gap-2"><Button size="sm" onClick={()=>{saveLayout('dept:assets','Personal',user,layout);setDraft(null);setEdit(false);}}>{l('Save personal view','حفظ العرض الشخصي')}</Button>{(user==='Administrator'||roles.includes('System Manager'))&&<Button size="sm" variant="outline" onClick={()=>{saveLayout('dept:assets','Team',user,layout);setDraft(null);setEdit(false);}}>{l('Save team default','حفظ الافتراضي للفريق')}</Button>}<Button variant="ghost" size="sm" onClick={()=>{resetPersonal('dept:assets',user);setDraft(null);}}><RotateCcw/>{l('Reset','إعادة الضبط')}</Button></span></div></div>;
 return <div data-no-i18n data-dp-assets-center>
  {w.states['Asset']!=='ok'?<SourceState status={w.states['Asset']??'unavailable'} doctype="Asset"/>:
  <DeptOverview dept="assets" boards={["assets"]} company={ctx.company} currency={ctx.currency} user={user} ar={isAr} lead={lead}
   context={(question)=><div data-dp-context><ContextStrip icon={<img src="/icons/digit/mod/digit-mod-assets-light.svg" alt="" className="h-7 w-7"/>}
    eyebrow={l('DIGIT Pro · Fixed assets','ديجيت برو · الأصول الثابتة')} title={l('Fixed Assets Control Center','مركز إدارة الأصول الثابتة')} sub={question}
    facts={[{label:l('Compare','المقارنة'),value:<span data-dp-band-compare>{l('Previous month','الشهر السابق')}</span>},{label:l('Currency','العملة'),value:<bdi data-dp-band-currency data-no-i18n>{ctx.currency}</bdi>},{label:l('Role','الدور'),value:<bdi>{display(roles[0]||user)}</bdi>},{label:l('Last change','آخر تعديل'),value:<bdi data-no-i18n>{display(assetUpdated)}</bdi>}]}
    aside={<span className="contents"><label className="ek-context-select"><span>{l('Company','الشركة')}</span><select value={ctx.company} onChange={e=>set({company:e.target.value,book:undefined})}>{ctx.companies.map(c=><option key={c}>{c}</option>)}</select></label>
     <label className="ek-context-select"><span>{l('As of','حتى تاريخ')}</span><DateInput className="field-input" value={asof} onChange={e=>set({asof:e.target.value})}/></label>
     {w.states['Finance Book']==='ok'&&<label className="ek-context-select"><span>{l('Finance Book','الدفتر المالي')}</span><select value={search.book??''} onChange={e=>set({book:e.target.value||undefined})}><option value="">{l('Default asset values','قيم الأصل الافتراضية')}</option>{w.data['Finance Book']?.map(b=><option key={b.name} value={b.name}>{display(b['finance_book_name']||b.name)}</option>)}</select></label>}</span>}
    actions={<span className="contents" data-dp-asset-actions><NewAssetDoc company={ctx.company} user={user}/>
     <Link to="/pro/asset-register" search={{company:ctx.company} as never} className="ek-context-btn">{l('All Assets','كل الأصول')}</Link>
     {w.states['Asset Depreciation Schedule']==='ok'&&<Link to="/pro/depreciation" search={{company:ctx.company} as never} className="ek-context-btn">{l('Depreciation Review','مراجعة الإهلاك')}</Link>}
     </span>}/>
    {customize}</div>}
   rows={[
    {id:'asset-matrix',title:['Asset category × location','فئة الأصل × الموقع'],w:8,node:<AssetMatrix company={ctx.company} currency={ctx.currency} user={user} ar={isAr}/>},
    {id:'gauge-depreciation',title:['Depreciated of cost','المُهلك من التكلفة'],w:4,node:<RatioGauge kind="depreciation" company={ctx.company} currency={ctx.currency} user={user} ar={isAr}/>},
   ]}
   stripTitle={['Asset lifecycle','دورة حياة الأصول']}
   charts={hidden('analysis')?[]:[
    <ChartCard key="sched" id="ast-depr" size="md" title={l('Scheduled vs booked depreciation','الإهلاك المجدول مقابل المقيد')} sub={l('Posted means the referenced journal entry is submitted and has ledger rows; a reference alone is shown separately.','المُرحّل يعني أن قيد اليومية المرجعي معتمد وله صفوف في الأستاذ؛ المرجع وحده يظهر منفصلًا.')}><DepreciationChart d={dl} currency={ctx.currency} asof={asof}/></ChartCard>,
    <ChartCard key="status" id="ast-status" size="sm" title={l('Asset status','حالات الأصول')} attrs={{'data-dp-asset-analysis':''}}>
     <Donut ar={isAr} wrap={proWrap} fmt={(v)=>String(v)} centerLabel={l('Assets','أصل')} data={w.statuses.map((s):Datum=>({key:s.status,label:display(s.status),value:s.count,data:true,drill:{to:'/pro/asset-register',search:{company:ctx.company,status:s.status}},attrs:{'data-dp-asset-status':s.status}}))}/></ChartCard>,
   ]}
   skipInsights={[]}
   strip={!hidden('lifecycle')&&<LifecycleTimeline stages={stages} currency={ctx.currency}/>}
   work={!hidden('work')&&<div data-dp-asset-work><WorkPanel id="ast-work" title={l('Action required','تحتاج إلى إجراء')} sub={l('Source-linked work, no posting','أعمال مرتبطة بالمصدر دون ترحيل')} height={460} active={activeTab} onTab={(id)=>set({queue:id})}
    tabs={[...queues.map(([id,en,ar,dt])=>({id:id!,label:l(en??'',ar??''),count:w.states[dt??'']==='ok'?w.issues.filter(i=>i.kind===id).length:undefined,attrs:{'data-dp-asset-tab':id!},content:id===queue?queueBody:null})),...extra]}/></div>}
   links={!hidden('activity')&&<LinkGroup id="ast-reports" title={l('Registers & source reports','السجلات وتقارير المصدر')}>
    {['Movement','Maintenance','Repair'].map(k=>`Asset ${k}`).filter(dt=>w.states[dt]==='ok').map(dt=><AssetListLink key={dt} dt={dt} company={ctx.company}>{display(dt)}</AssetListLink>)}
    {['Fixed Asset Register','Asset Depreciation Ledger','Asset Depreciations and Balances','Asset Activity'].map(r=><Link key={r} to="/report/$name" params={{name:r}} search={{company:ctx.company,finance_book:search.book} as never} className={LINK_CHIP} data-dp-asset-report={r}>{display(r)}</Link>)}</LinkGroup>}/>}
 </div>;
 }}
 </ProFrame>;
}
