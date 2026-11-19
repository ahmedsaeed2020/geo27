/** Operational quantities from exact native child links, not GRNI/AR/AP valuation. */
import { adapter, type Doc } from '@/lib/adapter';
import { scopedList } from '@/lib/scope';
import { sourceStatus, type SourceStatus } from './finance';
export type BillingMode = 'buying' | 'selling';
export const billingSpec = (mode: BillingMode) => mode === 'buying'
  ? { source:'Purchase Receipt', invoice:'Purchase Invoice', link:'purchase_receipt', detail:'pr_detail', returnDetail:'purchase_receipt_item', party:'supplier', report:'Received Items To Be Billed' }
  : { source:'Delivery Note', invoice:'Sales Invoice', link:'delivery_note', detail:'dn_detail', returnDetail:'dn_detail', party:'customer', report:'Delivered Items To Be Billed' };
const rows = (d: Doc): Record<string,unknown>[] => Array.isArray(d['items']) ? d['items'] : [];
const num = (v:unknown) => Number(v) || 0;
const text = (v:unknown) => String(v ?? '');
const round = (v:number) => Math.round(v * 1e6) / 1e6;
export interface BillingLine { source:string; row:string; position:number; date:string; party:string; item:string; uom:string; quantity:number; returned:number; billed:number; remaining:number; invoices:string[]; uncertain:boolean }
export function selectUnbilled(mode:BillingMode, sources:Doc[], invoices:Doc[], company:string, from:string, to:string) {
  const spec=billingSpec(mode), eligible=(d:Doc)=>d['company']===company && num(d.docstatus)===1;
  const all=sources.filter(eligible), bills=invoices.filter(eligible), lines:BillingLine[]=[];
  let unlinked=0;const unlinkedInvoices=new Set<string>();
  for(const doc of all.filter(d=>!num(d['is_return']))) {
    const date=text(doc['posting_date']);
    if(!date || from && date<from || to && date>to)continue;
    for(const [position,row] of rows(doc).entries()) {
      const id=text(row['name']), item=text(row['item_code']), uom=text(row['uom']);
      let uncertain=!id, returned=0,billed=0;
      const refs=new Set<string>();
      const compatible=(r:Record<string,unknown>)=>text(r['item_code'])===item && !!uom && text(r['uom'])===uom;
      for(const ret of all.filter(d=>num(d['is_return']) && d['return_against']===doc.name)) {
        for(const r of rows(ret)) {
          if(!r[spec.returnDetail]) {uncertain=true;continue;}
          if(r[spec.returnDetail]!==id)continue;
          if(!compatible(r)) {uncertain=true;continue;}
          returned+=Math.abs(num(r['qty']));
        }
      }
      for(const invoice of bills)for(const r of rows(invoice)) {
        if(r[spec.link]!==doc.name)continue;
        if(!r[spec.detail]) {uncertain=true;refs.add(invoice.name);continue;}
        if(!rows(doc).some(s=>s['name']&&s['name']===r[spec.detail])) {uncertain=true;refs.add(invoice.name);continue;}
        if(r[spec.detail]!==id)continue;
        if(!compatible(r) || invoice[spec.party]!==doc[spec.party]) {uncertain=true;continue;}
        refs.add(invoice.name);
        billed+=num(invoice['is_return']) ? -Math.abs(num(r['qty'])) : num(r['qty']);
      }
      const quantity=num(row['qty']), remaining=round(quantity-returned-billed);
      if(remaining<=0 && !uncertain)continue;
      lines.push({source:doc.name,row:id,position:position+1,date,party:text(doc[spec.party]),item,uom,quantity,returned:round(returned),billed:round(billed),remaining,invoices:[...refs],uncertain});
    }
  }
  const selected=new Map(all.filter(d=>!num(d['is_return'])&&text(d['posting_date'])&&(!from||text(d['posting_date'])>=from)&&(!to||text(d['posting_date'])<=to)).map(d=>[d.name,d]));
  for(const d of bills)for(const r of rows(d)) {const source=selected.get(text(r[spec.link]));if(source&&(!r[spec.detail]||!rows(source).some(s=>s['name']&&s['name']===r[spec.detail]))) {unlinked++;unlinkedInvoices.add(d.name);}}
  return {lines:lines.sort((a,b)=>a.date.localeCompare(b.date)||a.source.localeCompare(b.source)||a.position-b.position),unlinked,unlinkedInvoices:[...unlinkedInvoices]};
}
export function unbilled(mode:BillingMode, company:string, from:string, to:string, user:string) {
  const spec=billingSpec(mode);let status:SourceStatus='ok';
  for(const dt of [spec.source,spec.invoice]) {
    const st=sourceStatus(dt,user);if(st!=='ok'){status=st;break;}
    const readable=new Set(scopedList(dt,user).map(d=>d.name));
    // A missing contributing invoice must not make a receipt look unbilled.
    if(adapter.list(dt).some(d=>d['company']===company && num(d.docstatus)===1 && !readable.has(d.name))){status='denied';break;}
  }
  return {status,...(status==='ok'?selectUnbilled(mode,scopedList(spec.source,user),scopedList(spec.invoice,user),company,from,to):{lines:[],unlinked:0,unlinkedInvoices:[]})};
}