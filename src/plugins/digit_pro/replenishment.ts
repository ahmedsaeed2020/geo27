/** Prepare one native unsent Material Request; no purchase order or stock posting. */
import {adapter,type Doc} from '@/lib/adapter';
import {scopedList,assertScoped} from '@/lib/scope';
import {inventoryOverview} from './inventoryPro';
import {todayIso} from './finance';
export function replenishmentDraft(company:string,item:string,warehouse:string,user:string):Doc {
 const overview=inventoryOverview(company,user);
 if(overview.reorder.status!=='ok')throw new Error('Replenishment source unavailable');
 const row=overview.reorder.rows.find(r=>r.item===item&&r.warehouse===warehouse);
 const master=scopedList('Item',user).find(d=>d.name===item),wh=scopedList('Warehouse',user).find(d=>d.name===warehouse&&d['company']===company);
 if(!row||!master||!wh||!master['stock_uom']||Number(master['disabled'])||!['Purchase','Material Transfer','Manufacture'].includes(row.requestType)||!(row.reorderQty>0))throw new Error('Replenishment basis unavailable');
 assertScoped('Material Request','create',{name:'new',doctype:'Material Request',company},user);
 // Reopen any existing matching draft for human review rather than duplicate demand.
 const existing=scopedList('Material Request',user).find(d=>d['company']===company&&Number(d.docstatus)===0&&d['material_request_type']===row.requestType&&Array.isArray(d['items'])&&d['items'].some((r:Record<string,unknown>)=>r['item_code']===item&&r['warehouse']===warehouse));
 if(existing)return existing;
 const date=todayIso(),uom=String(master['stock_uom']);
 const data={company,material_request_type:row.requestType,transaction_date:date,schedule_date:date,status:'Draft',items:[{name:`MRL-${crypto.randomUUID()}`,doctype:'Material Request Item',idx:1,item_code:item,item_name:master['item_name']||item,qty:row.reorderQty,uom,stock_uom:uom,conversion_factor:1,warehouse,schedule_date:date}]};
 assertScoped('Material Request','create',{...data,name:'new',doctype:'Material Request'},user);
 return adapter.insertDoc('Material Request',data);
}
/** An open draft Material Request that already carries this item × warehouse line (reused, never duplicated). */
export function openRequestFor(company:string,item:string,warehouse:string,requestType:string,user:string):Doc|undefined{
 return scopedList('Material Request',user).find(d=>d['company']===company&&Number(d.docstatus)===0&&d['material_request_type']===requestType&&Array.isArray(d['items'])&&d['items'].some((r:Record<string,unknown>)=>r['item_code']===item&&r['warehouse']===warehouse));
}

export interface BulkPick {item:string;warehouse:string}
export interface BulkResult {created:Doc[];reused:{item:string;warehouse:string;request:string}[];skipped:{item:string;warehouse:string;reason:'basis'|'item'|'warehouse'}[]}
/**
 * IN7 / INV-010 — below-reorder list → Material Request drafts in one action. Each picked Item Reorder row is re-read from the
 * same basis as the list (Item Reorder level vs Bin); rows already on an open draft are reused; the rest are grouped into one
 * native draft per request type (Material Request has one type per document), written in one adapter batch. Nothing is
 * submitted, ordered or posted: the list clears on ERPNext when the submitted requests raise the projected quantity.
 */
export function bulkReplenishmentDrafts(company:string,picks:BulkPick[],user:string):BulkResult{
 assertScoped('Material Request','create',{name:'new',doctype:'Material Request',company},user);
 const overview=inventoryOverview(company,user);
 if(overview.reorder.status!=='ok')throw new Error('Replenishment source unavailable');
 const rows=overview.reorder.all;
 const res:BulkResult={created:[],reused:[],skipped:[]};
 const groups=new Map<string,{item:string;warehouse:string;qty:number;master:Doc}[]>();
 const seen=new Set<string>();
 for(const p of picks){
  const key=`${p.item}\u0000${p.warehouse}`;if(seen.has(key))continue;seen.add(key);
  const row=rows.find(r=>r.item===p.item&&r.warehouse===p.warehouse);
  const master=scopedList('Item',user).find(d=>d.name===p.item);
  const wh=scopedList('Warehouse',user).find(d=>d.name===p.warehouse&&d['company']===company);
  if(!row||!['Purchase','Material Transfer','Manufacture'].includes(row.requestType)||!(row.reorderQty>0)){res.skipped.push({...p,reason:'basis'});continue;}
  if(!master||!master['stock_uom']||Number(master['disabled'])){res.skipped.push({...p,reason:'item'});continue;}
  if(!wh){res.skipped.push({...p,reason:'warehouse'});continue;}
  const open=openRequestFor(company,p.item,p.warehouse,row.requestType,user);
  if(open){res.reused.push({...p,request:open.name});continue;}
  const g=groups.get(row.requestType)??[];g.push({item:p.item,warehouse:p.warehouse,qty:row.reorderQty,master});groups.set(row.requestType,g);
 }
 if(!groups.size)return res;
 const date=todayIso();
 adapter.batch(()=>{
  for(const [type,lines] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
   const items=lines.map((l,i)=>{const uom=String(l.master['stock_uom']);return {name:`MRL-${crypto.randomUUID()}`,doctype:'Material Request Item',idx:i+1,item_code:l.item,item_name:l.master['item_name']||l.item,qty:l.qty,uom,stock_uom:uom,conversion_factor:1,warehouse:l.warehouse,schedule_date:date};});
   const data={company,material_request_type:type,transaction_date:date,schedule_date:date,status:'Draft',items};
   assertScoped('Material Request','create',{...data,name:'new',doctype:'Material Request'},user);
   res.created.push(adapter.insertDoc('Material Request',data));
  }
 });
 return res;
}
