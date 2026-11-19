// @ts-nocheck -- DIGIT Pro/HR apps are switched off in the merged site build; their original /pro/* and /hr/* app routes are not in this route tree (re-enabling the app needs those routes, then remove this line)
import { Link } from '@tanstack/react-router';
import { useLang } from '@/i18n';
import { fmtCurrency } from '@/lib/format';
import type { F } from '@/lib/reportRunner';
import { cashFlowSources } from './cashFlowSources';
import { SourceState } from './ProFrame';

export function CashFlowSources({section,filters,user,currency,expected,dimensions}:{section:string;filters:F;user:string;currency:string;expected:number;dimensions?:string|undefined}) {
  const ar=useLang()==='ar',t=(en:string,arabic:string)=>ar?arabic:en;
  const sources=cashFlowSources(section,filters,user);
  if(sources.status!=='ok')return <SourceState status={sources.status}/>;
  const matched=Math.abs(sources.total-expected)<0.01;
  return <section className='my-2 border-s-2 border-border ps-3 font-normal' data-dp-cash-sources>
    <h3 className='text-xs font-semibold'>{t('Contributing accounts','الحسابات المساهمة')}</h3>
    <p className={matched?'mt-1 text-xs text-muted-foreground':'mt-1 text-xs text-destructive'}>{matched?t('Credit less debit · reconciled to the selected report period.','الدائن ناقص المدين · مطابق لفترة التقرير المحددة.'):t('Source movement differs from the report; review required.','تختلف حركة المصدر عن التقرير؛ يلزم المراجعة.')} <span data-no-i18n>{fmtCurrency(sources.total,currency)} / {fmtCurrency(expected,currency)}</span></p>
    {!sources.rows.length?<SourceState status='empty'/>:<ul className='mt-2 divide-y divide-border'>{sources.rows.map(r=><li key={r.account} className='flex flex-wrap justify-between gap-3 py-2 text-xs'><Link to='/pro/general-ledger' search={{...filters,account:r.account,group_by:'',dimensions} as never} className='text-primary hover:underline' data-no-i18n data-dp-cash-account={r.account}>{r.account}</Link><span className='tabular-nums' data-no-i18n>{fmtCurrency(r.contribution,currency)}</span></li>)}</ul>}
  </section>;
}