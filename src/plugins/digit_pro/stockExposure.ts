/** Read-only item/warehouse exposure and inactivity, not FIFO ageing or a turnover forecast. */
import {type Doc} from '@/lib/adapter';
import {postedStockSources} from './stockSources';
export const STOCK_EXPOSURE_SOURCES=['Stock Ledger Entry','Warehouse','Item'];
export function selectStockExposure(ledger:Doc[],warehouses:Doc[],company:string,asOn:string,days:number) {
 const dateCheck=new Date(`${asOn}T00:00:00Z`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(asOn)||!Number.isFinite(dateCheck.getTime())||dateCheck.toISOString().slice(0,10)!==asOn||!Number.isFinite(days)||days<0)return {rows:[],total:0,cutoff:''};
 const owners=new Map(warehouses.map(w=>[w.name,String(w['company']||'')]));
 const cutoff=new Date(`${asOn}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-days);
 const before=Number.isFinite(cutoff.getTime())?cutoff.toISOString().slice(0,10):'';
 const groups=new Map<string,{item:string;warehouse:string;quantity:number;value:number;lastMovement:string;inactive:boolean}>();
 for(const s of ledger) {
  const warehouse=String(s['warehouse']||''),date=String(s['posting_date']||'');
  if(owners.get(warehouse)!==company||s['company']&&s['company']!==company||Number(s.docstatus)!==1||Number(s['is_cancelled'])||!date||date>asOn)continue;
  const item=String(s['item_code']||''),key=JSON.stringify([item,warehouse]),r=groups.get(key)||{item,warehouse,quantity:0,value:0,lastMovement:'',inactive:false};
  r.quantity+=Number(s['actual_qty'])||0;r.value+=Number(s['stock_value_difference'])||0;
  if(Number(s['actual_qty'])!==0&&date>r.lastMovement)r.lastMovement=date;
  groups.set(key,r);
 }
 const rows=[...groups.values()].filter(r=>Math.abs(r.quantity)>0.000001||Math.abs(r.value)>0.005).map(r=>({...r,value:Math.round(r.value*100)/100,inactive:!!before&&!!r.lastMovement&&r.lastMovement<before}));
 return {rows,total:Math.round(rows.reduce((s,r)=>s+r.value,0)*100)/100,cutoff:before};
}
export function stockExposure(company:string,asOn:string,days:number,user:string) {
 const source=postedStockSources(company,user);
 return {status:source.status,...(source.status==='ok'?selectStockExposure(source.rows,source.warehouses,company,asOn,days):{rows:[],total:0,cutoff:''})};
}