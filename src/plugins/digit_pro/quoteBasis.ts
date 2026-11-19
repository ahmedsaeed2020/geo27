import type { QuoteRow } from "./docFlow";
/** Compare like quoted bases only; never calculate a winner or normalize unknown taxes/currencies. */
export function quoteBasisGroups(rows:QuoteRow[],today:string) {
  const groups=new Map<string,{key:string;item:string;currency:string;uom:string;qty:number;taxes:string;rows:QuoteRow[];eligible:QuoteRow[]}>();
  for(const row of rows) {
    const key=JSON.stringify([row.item,row.currency,row.uom,row.qty,row.taxes]);
    const g=groups.get(key)||{key,item:row.item,currency:row.currency,uom:row.uom,qty:row.qty,taxes:row.taxes,rows:[],eligible:[]};
    g.rows.push(row);
    if(row.docstatus===1 && row.currency && row.uom && row.qty>0 && row.rate>=0 && (!row.validTill || row.validTill>=today) && !["Expired","Stopped","Cancelled"].includes(row.status)) g.eligible.push(row);
    groups.set(key,g);
  }
  return [...groups.values()].map(g=>{
    const leads=g.eligible.map(r=>r.leadDays).filter((x):x is number=>typeof x==="number");
    const dates=g.eligible.map(r=>r.delivery).filter(Boolean).sort();
    // lead time beside currency/UOM: the earliest delivery among valid like-for-like quotes; never folded into the rate
    return {...g,min:g.eligible.length>1?Math.min(...g.eligible.map(r=>r.rate)):null,max:g.eligible.length>1?Math.max(...g.eligible.map(r=>r.rate)):null,
      leadMin:leads.length?Math.min(...leads):null,leadMax:leads.length?Math.max(...leads):null,earliest:dates[0]??"",
      fastest:dates.length?g.eligible.filter(r=>r.delivery===dates[0]).map(r=>r.quotation):[]};
  });
}