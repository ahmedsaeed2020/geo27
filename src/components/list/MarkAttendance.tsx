/**
 * Port of hrms/hr/doctype/attendance/attendance_list.js "Mark Attendance" + attendance.py get_unmarked_days / mark_bulk_attendance
 * over adapter records (Holiday List of the employee, existing Attendance). Creates submitted Attendance rows.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { adapter, type Doc } from "@/lib/adapter";
import { fmtDate, sysFormat } from "@/lib/format";
import { useLang } from "@/i18n";

/** Date entry in the System Settings date format (dd-mm-yyyy); stores ISO. */
function DateText({ value, onChange, ...rest }: { value: string; onChange: (iso: string) => void; [k: string]: unknown }) {
  const [txt, setTxt] = useState(fmtDate(value));
  const parse = (t: string) => { const f = sysFormat().date_format; const p = t.split(/[-/.]/); const o = f.split(/[-/.]/); if (p.length !== 3) return ""; const g = (k: string) => p[o.indexOf(k)] ?? ""; const y = g("yyyy"), m = g("mm").padStart(2, "0"), d = g("dd").padStart(2, "0"); return /^\d{4}$/.test(y) ? `${y}-${m}-${d}` : ""; };
  return <input type="text" inputMode="numeric" dir="ltr" className="input mt-1 w-full" placeholder={sysFormat().date_format} value={txt} onChange={(e) => { setTxt(e.target.value); const iso = parse(e.target.value); if (iso) onChange(iso); }} onBlur={() => setTxt(fmtDate(value))} {...rest} />;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
export function unmarkedDays(employee: string, from: string, to: string, excludeHolidays: boolean): string[] {
  if (!employee || !from || !to || from > to) return [];
  const emp = adapter.get("Employee", employee);
  const joined = String(emp?.["date_of_joining"] ?? ""), relieved = String(emp?.["relieving_date"] ?? "");
  const marked = new Set(adapter.list("Attendance").filter((a) => a["employee"] === employee && Number(a.docstatus ?? 0) !== 2).map((a) => String(a["attendance_date"])));
  const hl = String(emp?.["holiday_list"] ?? adapter.get("Company", String(emp?.["company"] ?? ""))?.["default_holiday_list"] ?? "");
  const holidays = new Set(((adapter.get("Holiday List", hl)?.["holidays"] as Doc[]) ?? []).map((h) => String(h["holiday_date"])));
  const out: string[] = [];
  for (let d = new Date(from + "T00:00:00Z"); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = iso(d);
    if (joined && s < joined) continue; if (relieved && s > relieved) continue;
    if (marked.has(s)) continue; if (excludeHolidays && holidays.has(s)) continue;
    out.push(s);
  }
  return out;
}
export function markBulkAttendance(employee: string, dates: string[], status: string, shift?: string) {
  const emp = adapter.get("Employee", employee);
  for (const dt of dates) adapter.insertDoc("Attendance", { employee, employee_name: emp?.["employee_name"], company: emp?.["company"], department: emp?.["department"], attendance_date: dt, status, shift: shift || undefined, docstatus: 1 });
  return dates.length;
}

export function MarkAttendanceButton() {
  const [open, setOpen] = useState(false);
  const today = new Date(); const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (today.getUTCDate() === 1 ? 1 : 0), 1));
  const lang = useLang();
  const [f, setF] = useState({ employee: "", from_date: iso(first), to_date: iso(today), status: "Present", shift: "", exclude_holidays: false });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const days = useMemo(() => unmarkedDays(f.employee, f.from_date, f.to_date, f.exclude_holidays), [f, open]);
  const emps = open ? adapter.list("Employee") : []; const shifts = open ? adapter.list("Shift Type") : [];
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setSel(new Set()); };
  function submit() {
    if (!f.employee) { toast.error("For Employee is mandatory"); return; }
    if (!days.length) { toast.message(`Attendance from ${fmtDate(f.from_date)} to ${fmtDate(f.to_date)} has already been marked for the Employee ${f.employee}`); return; }
    const chosen = days.filter((d) => sel.has(d)); if (!chosen.length) { toast.error("Please select dates"); return; }
    if (!confirm(`Mark attendance as ${f.status} for ${f.employee} on selected dates?`)) return;
    const n = markBulkAttendance(f.employee, chosen, f.status, f.shift); toast.success(`${n} Attendance marked`); setOpen(false);
  }
  return (<>
    <button type="button" className="btn-ghost border border-border" onClick={() => setOpen(true)} data-mark-attendance>Mark Attendance</button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30" role="dialog" aria-label="Mark Attendance">
      <div className="panel w-[560px] max-w-[95vw] space-y-3 p-5">
        <h3 className="text-base font-semibold">Mark Attendance</h3>
        <label className="block text-sm"><span data-no-i18n>{lang === "ar" ? "الموظف" : "For Employee"}</span> *<select className="input mt-1 w-full" value={f.employee} onChange={(e) => set({ employee: e.target.value })} data-ma="employee"><option value="" />{emps.map((e) => <option key={e.name} value={e.name} data-no-i18n>{e.name}: {String(e["employee_name"] ?? "")}</option>)}</select></label>
        {f.employee && <div className="grid grid-cols-2 gap-3 text-sm">
          <label><span>Start</span><DateText value={f.from_date} onChange={(v) => set({ from_date: v })} data-ma="from" /></label>
          <label><span>End</span><DateText value={f.to_date} onChange={(v) => set({ to_date: v })} data-ma="to" /></label>
          <label><span>Status</span><select className="input mt-1 w-full" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} data-ma="status">{["Present", "Absent", "Half Day", "Work From Home"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label><span>Shift</span><select className="input mt-1 w-full" value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}><option value="" />{shifts.map((s) => <option key={s.name} value={s.name} data-no-i18n>{s.name}</option>)}</select></label>
          <label className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={f.exclude_holidays} onChange={(e) => set({ exclude_holidays: e.target.checked })} data-ma="holidays" /><span data-no-i18n>{lang === "ar" ? "استبعاد العطلات" : "Exclude Holidays"}</span></label>
          <div className="col-span-2"><div className="mb-1 flex items-center justify-between"><span>Unmarked Attendance for days</span>
            <button type="button" className="btn-ghost py-0.5 text-xs" onClick={() => setSel(sel.size === days.length ? new Set() : new Set(days))} data-ma="all">{sel.size === days.length && days.length ? "Unselect All" : "Select All"}</button></div>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-auto rounded border border-border p-2" data-ma="days">
              {days.length ? days.map((d) => <label key={d} className="flex items-center gap-2"><input type="checkbox" checked={sel.has(d)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(d); else s.delete(d); setSel(s); }} /><span data-no-i18n dir="ltr">{fmtDate(d)}</span></label>) : <span className="text-muted-foreground">No unmarked days</span>}
            </div></div>
        </div>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn-primary" onClick={submit} data-ma="submit">Mark Attendance</button></div>
      </div></div>}
  </>);
}
