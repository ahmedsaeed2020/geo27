import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {useLang} from '@/i18n';
import {todayIso} from './finance';
import {SourceState} from './ProFrame';
import {operationalPriorities} from './operationalPriorities';
import { DateInput } from "@/components/form/DateInput";
import { PanelGrid, SectionPanel } from "@/components/enterprise/SectionPanel";

/**
 * Sales priorities (Pro selling overview): overdue delivery lines and the quotation conversion cohort. Each section is a
 * standard white panel (owner addendum A); the two panels sit side by side from 1024px so neither narrow table stretches
 * across the page, and the cohort list is a table with column headers. Values come from operationalPriorities() unchanged.
 */
export function OperationalPriorities({company,user}:{company:string;user:string}) {
 const ar=useLang()==='ar',t=(en:string,a:string)=>ar?a:en,[to,setTo]=useState(todayIso()),[from,setFrom]=useState(`${todayIso().slice(0,4)}-01-01`),r=operationalPriorities(company,from,to,user);
 const link=(dt:string,name:string)=><Link to='/app/$app/$doctype/$name' params={{app:'erpnext',doctype:dt,name}} className='text-primary hover:underline' data-no-i18n>{name}</Link>;
 const th=(h:string,end=false)=><th key={h} className={`p-2 text-xs ${end?'text-end':'text-start'}`}>{h}</th>;
 const filters=<>
  <label className='flex flex-col gap-1 text-xs text-muted-foreground'>{t('Quotation cohort from','فوج عروض الأسعار من')}<DateInput className='field-input' value={from} onChange={e=>setFrom(e.target.value)}/></label>
  <label className='flex flex-col gap-1 text-xs text-muted-foreground'>{t('As of / cohort to','حتى تاريخ / نهاية الفوج')}<DateInput className='field-input' value={to} onChange={e=>setTo(e.target.value)}/></label>
 </>;
 return <section className='mt-5' data-dp-operational-priorities>
  <SectionPanel title={t('Sales priorities','أولويات المبيعات')} subtitle={t('Choose the due date and the quotation cohort period for both panels below.','اختر تاريخ الاستحقاق وفترة فوج عروض الأسعار للوحتين أدناه.')} actions={filters} data-dp-priorities-head>
   {(!from||!to||from>to)&&<p className='text-sm text-destructive'>{t('Choose a valid date range.','اختر نطاق تاريخ صحيحًا.')}</p>}
  </SectionPanel>
  {from&&to&&from<=to&&<PanelGrid className='mt-4'>
   <SectionPanel title={t('Overdue delivery lines','بنود تسليم متأخرة')} subtitle={t('Current native delivered progress against the selected due date, not a historical snapshot. Closed and held orders excluded.','التقدم الحالي للتسليم وفق التاريخ المحدد وليس لقطة تاريخية؛ تستثنى الطلبات المغلقة والمعلقة.')} data-dp-overdue-lines>
    {r.orderStatus!=='ok'?<SourceState status={r.orderStatus}/>:<div className='dx-sec-table'><table className='text-sm'><thead><tr>{th(t('Order / item','الطلب / الصنف'))}{th(t('Customer','العميل'))}{th(t('Due','الاستحقاق'))}{th(t('Remaining','المتبقي'),true)}</tr></thead>
     <tbody>{r.backlog.map(x=><tr key={`${x.order}:${x.row}`} className='border-t border-border'><td className='p-2'>{link('sales_order',x.order)}<small className='block text-muted-foreground' data-no-i18n>{x.row} · {x.item}</small></td><td className='p-2' data-no-i18n>{x.customer}</td><td className='p-2 tabular-nums' data-no-i18n>{x.due}</td><td className='p-2 text-end tabular-nums' data-no-i18n>{x.remaining} {x.uom}</td></tr>)}</tbody></table>
     {!r.backlog.length&&<div className='p-3'><SourceState status='empty'/></div>}</div>}
   </SectionPanel>
   <SectionPanel title={t('Quotation conversion cohort','فوج تحويل عروض الأسعار')} subtitle={t('Submitted quotations dated in the range, linked to submitted orders today; document conversion, not value conversion or historical probability.','عروض مرحّلة مؤرخة ضمن الفترة مرتبطة بطلبات مرحّلة حاليًا؛ تحويل مستندات وليس تحويل قيمة أو احتمالًا تاريخيًا.')} data-dp-quote-cohort>
    {r.quoteStatus!=='ok'?<SourceState status={r.quoteStatus}/>:<>
     <div className='dx-sec-stats'><span>{t('Quotations','عروض الأسعار')}: <b data-no-i18n>{r.cohort.total}</b></span><span>{t('With submitted orders','بطلبات مرحّلة')}: <b data-no-i18n>{r.cohort.converted}</b></span><span>{t('Expired without order','منتهية دون طلب')}: <b data-no-i18n>{r.cohort.expiredUnconverted}</b></span></div>
     <div className='dx-sec-table'><table className='text-sm'><thead><tr>{th(t('Quotation','عرض السعر'))}{th(t('Date','التاريخ'))}{th(t('Sales orders','أوامر البيع'))}</tr></thead>
      <tbody>{r.cohort.rows.map(x=><tr key={x.name} className='border-t border-border'><td className='p-2'>{link('quotation',x.name)}</td><td className='p-2 tabular-nums' data-no-i18n>{x.date}</td><td className='p-2'>{x.orders.length?<span className='flex flex-wrap gap-x-3 gap-y-1'>{x.orders.map(name=><span key={name}>{link('sales_order',name)}</span>)}</span>:<span className='text-muted-foreground'>—</span>}</td></tr>)}</tbody></table>
      {!r.cohort.rows.length&&<div className='p-3'><SourceState status='empty'/></div>}</div>
    </>}
   </SectionPanel>
  </PanelGrid>}
 </section>;
}
