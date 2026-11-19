/** URL-only presentation preferences; never persist financial values or alter report rows. */
export function reportColumns(raw:string|undefined,available:readonly string[]):string[] {
 if(raw===undefined)return [...available];
 const selected=[...new Set(raw.split(',').filter(k=>available.includes(k)))];
 return selected.length?selected:[available[0]||'current'];
}
export function moveColumn(columns:string[],key:string,direction:-1|1):string[] {
 const i=columns.indexOf(key),j=i+direction;if(i<0||j<0||j>=columns.length)return columns;
 const next=[...columns],other=next[j];if(other===undefined)return columns;next[j]=key;next[i]=other;return next;
}