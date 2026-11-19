import {adapter,type Doc} from '@/lib/adapter';
import {scopedList} from '@/lib/scope';
import {sourceStatus} from './finance';
const n=(v:unknown)=>Number(v)||0;
const s=(v:unknown)=>String(v||'');
const rows=(d:Doc):Record<string,unknown>[]=>Array.isArray(d['items'])?d['items']:[];
export function salesBacklog(orders:Doc[],company:string,asOn:string) {
 return orders.filter(d=>d['company']===company&&n(d.docstatus)===1&&!['Closed','Completed','Cancelled','On Hold'].includes(s(d['status']))).flatMap(d=>rows(d).flatMap((r,i)=>{
  const due=s(r['delivery_date']||d['delivery_date']),remaining=n(r['qty'])-n(r['delivered_qty']);
  return !n(r['closed'])&&due&&due<asOn&&remaining>0?[{order:d.name,row:s(r['name'])||`#${i+1}`,item:s(r['item_code']),customer:s(d['customer']),due,remaining,uom:s(r['uom'])}]:[];
 })).sort((a,b)=>a.due.localeCompare(b.due)||a.order.localeCompare(b.order));
}
export function quotationCohort(quotes:Doc[],orders:Doc[],company:string,from:string,to:string,asOn:string) {
 const candidates=quotes.filter(d=>d['company']===company&&n(d.docstatus)===1&&s(d['transaction_date'])>=from&&s(d['transaction_date'])<=to);
 const linked=new Map<string,Set<string>>();
 for(const d of orders.filter(d=>d['company']===company&&n(d.docstatus)===1))for(const row of rows(d)) {const key=s(row['prevdoc_docname']);if(!key)continue;const refs=linked.get(key)||new Set<string>();refs.add(d.name);linked.set(key,refs);}
 const result=candidates.map(d=>({name:d.name,date:s(d['transaction_date']),validTill:s(d['valid_till']),orders:[...(linked.get(d.name)||[])],expired:!!d['valid_till']&&s(d['valid_till'])<asOn}));
 return {rows:result,total:result.length,converted:result.filter(r=>r.orders.length>0).length,expiredUnconverted:result.filter(r=>r.expired&&!r.orders.length).length};
}
export function operationalPriorities(company:string,from:string,to:string,user:string) {
 let orderStatus=sourceStatus('Sales Order',user),quoteStatus=sourceStatus('Quotation',user);
 for(const dt of ['Sales Order','Quotation']) {const readable=new Set(scopedList(dt,user).map(d=>d.name));if(adapter.list(dt).some(d=>d['company']===company&&n(d.docstatus)===1&&!readable.has(d.name))){if(dt==='Sales Order')orderStatus='denied';else quoteStatus='denied';}}
 const orders=orderStatus==='ok'?scopedList('Sales Order',user):[];
 return {orderStatus,quoteStatus:orderStatus==='ok'?quoteStatus:orderStatus,backlog:orderStatus==='ok'?salesBacklog(orders,company,to):[],cohort:orderStatus==='ok'&&quoteStatus==='ok'?quotationCohort(scopedList('Quotation',user),orders,company,from,to,to):{rows:[],total:0,converted:0,expiredUnconverted:0}};
}