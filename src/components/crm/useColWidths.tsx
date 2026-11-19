import { useEffect, useState } from "react";

/** Column resize as in frappe-ui ListView (ListHeaderItem resizer); widths persist per list. */
export function useColWidths(list: string) {
  const key = `crm-col-widths:${list}`;
  const [w, setW] = useState<Record<string, number>>({});
  useEffect(() => { try { setW(JSON.parse(localStorage.getItem(key) || "{}")); } catch { setW({}); } }, [key]);
  const start = (col: string) => (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).parentElement!; const x0 = e.clientX; const w0 = th.offsetWidth;
    const move = (ev: MouseEvent) => setW(p => ({ ...p, [col]: Math.max(60, w0 + (document.dir === "rtl" ? x0 - ev.clientX : ev.clientX - x0)) }));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); setW(p => { localStorage.setItem(key, JSON.stringify(p)); return p; }); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const th = (col: string) => ({ style: w[col] ? { width: w[col], minWidth: w[col] } : undefined, className: "relative" });
  const handle = (col: string) => <span role="separator" aria-orientation="vertical" data-col={col} onMouseDown={start(col)} className="absolute inset-y-0 end-0 w-1.5 cursor-col-resize hover:bg-crm-line" />;
  return { th, handle };
}
