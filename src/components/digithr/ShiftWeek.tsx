import { shiftWeek } from '@/plugins/digit_hr/review';
import { Native, arLabel } from './workspaces/shared';
export function ShiftWeek({ rows, day, tx }: { rows: Record<string, unknown>[]; day: string; tx: (ar: string, en: string) => string }) {
  const week = shiftWeek(rows, day);
  return <section className="space-y-2" data-shift-week>
    <h2 className="text-sm font-semibold">{tx('جدول الورديات — سبعة أيام', 'Shift schedule — seven days')}</h2>
    <div className="overflow-x-auto"><div className="grid min-w-[700px] grid-cols-7 divide-x divide-border border border-border">
      {week.map(d => <div key={d.day} className="space-y-2 p-2"><h3 className="text-xs font-semibold" data-no-i18n>{d.day}</h3>{d.assignments.length ? d.assignments.map(r => <div key={String(r['name'])} className="border-t border-border pt-2 text-xs"><Native dt="Shift Assignment" name={String(r['name'])} module="03" className="text-primary hover:underline"><span data-no-i18n>{tx(arLabel(String(r['employee_name'] || r['employee'])), String(r['employee_name'] || r['employee']))}</span></Native><div data-no-i18n>{tx(arLabel(String(r['shift_type'])), String(r['shift_type']))}</div></div>) : <span className="text-xs text-muted-foreground">{tx('لا إسناد مسجّل', 'No recorded assignment')}</span>}</div>)}
    </div></div>
  </section>;
}