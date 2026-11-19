import { useState } from 'react';
import { Plus,Trash2,Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { quoteTotals,VAT_RATE,type Quote } from '@/lib/crm-schema';

type Saved=Partial<Quote>&{items?:Quote['items']};
const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));

export function QuoteEditor({dealId,customer,company,saved,en,t,busy,onSave}:{dealId:string;customer:string;company?:string|null|undefined;saved:unknown;en:boolean;t:(s:string)=>string;busy:boolean;onSave:(q:Quote)=>Promise<boolean>}){
  const s=(saved&&typeof saved==='object'?saved:{}) as Saved;
  const [q,setQ]=useState<Quote>({deal_id:dealId,number:s.number||`Q-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${dealId.slice(0,4).toUpperCase()}`,valid_until:s.valid_until??null,discount:s.discount??0,notes:s.notes??'',items:s.items?.length?s.items:[{name:'',qty:1,price:0}]});
  const tot=quoteTotals(q);
  const money=(n:number)=>new Intl.NumberFormat(en?'en-SA':'ar-SA',{style:'currency',currency:'SAR'}).format(n);
  const setItem=(i:number,patch:Partial<Quote['items'][number]>)=>setQ({...q,items:q.items.map((x,j)=>j===i?{...x,...patch}:x)});
  function print(){const w=window.open('','_blank');if(!w)return;const rows=q.items.map((i,n)=>`<tr><td>${n+1}</td><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.qty*i.price)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html dir="${en?'ltr':'rtl'}"><head><meta charset="utf-8"><title>${esc(q.number)}</title><style>body{font-family:system-ui,sans-serif;padding:40px;color:#123}h1{color:#0b6b4f}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #ccd;padding:8px;text-align:start}.t td{border:none;padding:4px 8px}.t{width:auto;margin-inline-start:auto}</style></head><body><h1>GeoInTime — ${t('Quotation')}</h1><p><b>${t('Quote number')}:</b> ${esc(q.number)}<br><b>${t('Customer')}:</b> ${esc(customer)}${company?' — '+esc(company):''}<br><b>${t('Date')}:</b> ${new Date().toLocaleDateString(en?'en':'ar')}${q.valid_until?`<br><b>${t('Valid until')}:</b> ${q.valid_until}`:''}</p><table><tr><th>#</th><th>${t('Item')}</th><th>${t('Qty')}</th><th>${t('Unit price')}</th><th>${t('Line total')}</th></tr>${rows}</table><table class="t"><tr><td>${t('Subtotal')}</td><td>${money(tot.subtotal)}</td></tr><tr><td>${t('Discount')}</td><td>${money(q.discount)}</td></tr><tr><td>${t('VAT')} 15%</td><td>${money(tot.vat)}</td></tr><tr><td><b>${t('Total')}</b></td><td><b>${money(tot.total)}</b></td></tr></table>${q.notes?`<p>${esc(q.notes).replace(/\n/g,'<br>')}</p>`:''}<script>onload=()=>print()</script></body></html>`);w.document.close();}
  return <form className="crm-fields" onSubmit={e=>{e.preventDefault();void onSave(q);}}>
    <label>{t('Quote number')}<Input value={q.number} onChange={e=>setQ({...q,number:e.target.value})}/></label>
    <label>{t('Valid until')}<Input type="date" value={q.valid_until??''} onChange={e=>setQ({...q,valid_until:e.target.value||null})}/></label>
    {q.items.map((i,n)=><div key={n} className="crm-tools" data-quote-row><Input aria-label={t('Item')} placeholder={t('Item')} required value={i.name} onChange={e=>setItem(n,{name:e.target.value})}/><Input aria-label={t('Qty')} type="number" min="0" step="any" className="w-20" value={i.qty} onChange={e=>setItem(n,{qty:Number(e.target.value)})}/><Input aria-label={t('Unit price')} type="number" min="0" step="any" className="w-28" value={i.price} onChange={e=>setItem(n,{price:Number(e.target.value)})}/>{q.items.length>1&&<Button type="button" variant="ghost" aria-label={t('Remove')} onClick={()=>setQ({...q,items:q.items.filter((_,j)=>j!==n)})}><Trash2/></Button>}</div>)}
    <Button type="button" variant="outline" onClick={()=>setQ({...q,items:[...q.items,{name:'',qty:1,price:0}]})}><Plus/>{t('Add item')}</Button>
    <label>{t('Discount')} (SAR)<Input type="number" min="0" step="any" value={q.discount} onChange={e=>setQ({...q,discount:Number(e.target.value)})}/></label>
    <label>{t('Notes')}<Textarea value={q.notes} onChange={e=>setQ({...q,notes:e.target.value})}/></label>
    <div className="crm-status"><span>{t('Subtotal')}: {money(tot.subtotal)}</span><span>{t('VAT')} {VAT_RATE*100}%: {money(tot.vat)}</span><strong>{t('Total')}: {money(tot.total)}</strong></div>
    <div className="crm-tools"><Button type="submit" disabled={busy}>{t('Save quote')}</Button><Button type="button" variant="outline" onClick={print}><Printer/>{t('Print / PDF')}</Button></div>
  </form>;
}
