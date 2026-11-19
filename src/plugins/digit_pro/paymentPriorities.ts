import {adapter,type Doc} from '@/lib/adapter';
import {scopedList} from '@/lib/scope';
import {sourceStatus} from './finance';
import {sideDoctype,sidePartyField,type Side} from './aging';
export function paymentPriorities(rows:Doc[],side:Side,company:string,asOn:string) {
 const field=sidePartyField(side),groups=new Map<string,{currency:string;total:number;parties:Map<string,number>;dates:Map<string,{total:number;invoices:string[]}>}>();
 for(const d of rows) {
  const amount=Number(d['outstanding_amount']),currency=String(d['currency']||''),date=String(d['due_date']||'');
  if(d['company']!==company||Number(d.docstatus)!==1||!(amount>0))continue;
  const group=groups.get(currency)||{currency,total:0,parties:new Map(),dates:new Map()};group.total+=amount;
  const party=String(d[field]||'');group.parties.set(party,(group.parties.get(party)||0)+amount);
  const key=!date?'unknown':date<asOn?'overdue':date;const day=group.dates.get(key)||{total:0,invoices:[]};day.total+=amount;day.invoices.push(d.name);group.dates.set(key,day);groups.set(currency,group);
 }
 return [...groups.values()].map(g=>({currency:g.currency,total:g.total,parties:[...g.parties].map(([party,total])=>({party,total,share:g.total>0?total/g.total*100:0})).sort((a,b)=>b.total-a.total),dates:[...g.dates].map(([date,row])=>({date,...row})).sort((a,b)=>a.date.localeCompare(b.date))}));
}
export function scopedPaymentPriorities(side:Side,company:string,asOn:string,user:string) {
 const dt=sideDoctype(side);let status=sourceStatus(dt,user);const records=scopedList(dt,user),readable=new Set(records.map(d=>d.name));
 if(status==='ok'&&adapter.list(dt).some(d=>d['company']===company&&Number(d.docstatus)===1&&Number(d['outstanding_amount'])>0&&!readable.has(d.name)))status='denied';
 return {status,groups:status==='ok'?paymentPriorities(records,side,company,asOn):[]};
}