/** Current configured mandatory rules applied read-only to historical native GL, not a posting violation verdict. */
import {adapter,type Doc} from '@/lib/adapter';
import {scopedList} from '@/lib/scope';
import {scrub} from '@/lib/dimensions';
import {sourceStatus,type SourceStatus} from './finance';
export const DIMENSION_REVIEW_SOURCES=['Accounting Dimension','Accounting Dimension Filter','Account','GL Entry'];
const num=(v:unknown)=>Number(v)||0;
const children=(d:Doc,f:string):Record<string,unknown>[]=>Array.isArray(d[f])?d[f]:[];
export interface DimensionException {name:string;date:string;account:string;field:string;label:string;configuration:string;doctype:string;voucher:string}
export function selectDimensionReview(gl:Doc[],accounts:Doc[],dimensions:Doc[],filters:Doc[],company:string,from:string,to:string) {
 const byAccount=new Map(accounts.filter(a=>a['company']===company).map(a=>[a.name,a]));
 const exceptions:DimensionException[]=[];let unknownAccounts=0;
 for(const g of gl) {
  const date=String(g['posting_date']||'');
  if(g['company']!==company||num(g['is_cancelled'])||!date||from&&date<from||to&&date>to||g['voucher_type']==='Period Closing Voucher')continue;
  const account=byAccount.get(String(g['account'])),root=String(account?.['root_type']||'');
  if(!['Asset','Liability','Equity','Income','Expense'].includes(root)){unknownAccounts++;continue;}
  const pl=root==='Income'||root==='Expense',required=new Map<string,{label:string;configuration:string}>();
  for(const d of dimensions.filter(d=>!num(d['disabled']))) {
   const rule=children(d,'dimension_defaults').find(r=>r['company']===company);
   const field=String(d['fieldname']||scrub(String(d['document_type']||'')));
   if(field&&rule&&num(rule[pl?'mandatory_for_pl':'mandatory_for_bs']))required.set(field,{label:String(d['label']||d['document_type']),configuration:d.name});
  }
  for(const f of filters.filter(f=>!num(f['disabled'])&&(!f['company']||f['company']===company))) {
   if(!children(f,'accounts').some(r=>r['applicable_on_account']===g['account']&&num(r['is_mandatory'])))continue;
   const field=String(f['fieldname']||scrub(String(f['accounting_dimension']||'')));
   if(field)required.set(field,{label:String(f['accounting_dimension']||field),configuration:f.name});
  }
  for(const [field,rule] of required)if(!g[field])exceptions.push({name:g.name,date,account:String(g['account']),field,...rule,doctype:String(g['voucher_type']||''),voucher:String(g['voucher_no']||'')});
 }
 return {exceptions,unknownAccounts};
}
export function dimensionReview(company:string,from:string,to:string,user:string) {
 let status:SourceStatus='ok';
 for(const dt of DIMENSION_REVIEW_SOURCES){const st=sourceStatus(dt,user);if(st!=='ok'){status=st;break;}
  const readable=new Set(scopedList(dt,user).map(d=>d.name));
  if(adapter.list(dt).some(d=>(!d['company']||d['company']===company)&&!readable.has(d.name))){status='denied';break;}
 }
 return {status,...(status==='ok'?selectDimensionReview(scopedList('GL Entry',user),scopedList('Account',user),scopedList('Accounting Dimension',user),scopedList('Accounting Dimension Filter',user),company,from,to):{exceptions:[],unknownAccounts:0})};
}