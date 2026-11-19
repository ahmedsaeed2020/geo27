// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import {Link} from '@tanstack/react-router';
import { EntTable } from "@/components/enterprise/kit/EntTable";
import {useLang} from '@/i18n';
import {fmtCurrency} from '@/lib/format';
import {SourceState} from './ProFrame';
import {stockExposure} from './stockExposure';
import {useState} from 'react';
export function StockExposure({company,currency,asOn,user,days=90}:{company:string;currency:string;asOn:string;user:string;days?:number}) {
 const [inactiveOnly,setInactiveOnly]=useState(false);
 const ar=useLang()==='ar',t=(en:string,arabic:string)=>ar?arabic:en,r=stockExposure(company,asOn,days,user),quiet=r.rows.filter(x=>x.inactive),visible=inactiveOnly?quiet:r.rows;
 return <section className='dp-card mt-5' data-dp-stock-exposure data-dp-surface='stock-exposure'>
  <h2 className='font-semibold'>{t('Inventory exposure','انكشاف المخزون')}</h2>
  <p className='mt-1 text-xs text-muted-foreground'>{t('Posted stock value as of the selected date; inactivity is time since last quantity movement, not FIFO stock age or a write-down.','قيمة المخزون المرحّل حتى التاريخ المحدد؛ الخمول مدة منذ آخر حركة كمية وليس عمر المخزون بطريقة الوارد أولًا أو تخفيضًا للقيمة.')} <span data-no-i18n>{asOn}</span></p>
  {r.status!=='ok'?<SourceState status={r.status}/>:<>
   <div className='mt-3 flex flex-wrap gap-6 text-sm'><span>{t('Stock value','قيمة المخزون')}: <b data-no-i18n data-dp-exposure-total>{fmtCurrency(r.total,currency)}</b></span><span>{t('Inactive item / warehouse positions','أرصدة صنف / مستودع خاملة')}: <b data-no-i18n>{quiet.length}</b> · <span data-no-i18n>{days}</span> {t('days','يوم')}</span></div>
   <label className='mt-3 flex items-center gap-2 text-sm'><input type='checkbox' checked={inactiveOnly} onChange={e=>setInactiveOnly(e.target.checked)} data-dp-inactive-only/>{t('Inactive only','الخاملة فقط')}</label>
   <div className='mt-3 max-h-[480px] overflow-auto'><EntTable id="pro-stock-exposure" wrap><table className='w-full min-w-[560px] text-sm'><thead><tr>{[t('Item','الصنف'),t('Warehouse','المستودع'),t('Quantity','الكمية'),t('Value','القيمة'),t('Last movement','آخر حركة')].map(h=><th key={h} className='p-2 text-start text-xs text-muted-foreground'>{h}</th>)}</tr></thead><tbody>{visible.map(x=><tr key={JSON.stringify([x.item,x.warehouse])} className='border-t border-border' data-dp-exposure-row={x.item}><td className='p-2'><Link to='/pro/stock-ledger' search={{company,item:x.item,warehouse:x.warehouse,to:asOn} as never} className='text-primary hover:underline' data-no-i18n>{x.item}</Link></td><td className='p-2' data-no-i18n>{x.warehouse}</td><td className='p-2' data-no-i18n>{x.quantity}</td><td className='p-2' data-no-i18n>{fmtCurrency(x.value,currency)}</td><td className='p-2' data-no-i18n>{x.lastMovement || '—'}</td></tr>)}</tbody></table></EntTable></div>
   {!visible.length&&<SourceState status='empty'/>}
  </>}
 </section>;
}