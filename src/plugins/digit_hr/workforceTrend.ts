/**
 * NB-4 monthly workforce trend reconstructed from Employee source history only: hires = date_of_joining in the month,
 * exits = relieving_date in the month for status Left (the same rules as the Joiners/Exits metrics, so the month sums
 * reconcile with those KPIs), month-end headcount = joined on/before the month end and not exited by then. Records
 * that cannot be placed in time are never guessed: missing joining date or a Left status without relieving date are
 * counted separately. The reconciliation explains the gap between the reconstructed headcount "as of" a date and the
 * Active Headcount metric (status = Active), bucket by bucket. No forecasting.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- adapter rows are untyped JSON documents
type Row = Record<string, any>;
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const day = (v: unknown) => { const d = s(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
const pad = (n: number) => String(n).padStart(2, "0");

export interface MonthPoint { month: string; start: string; end: string; hires: number; exits: number; net: number; headcount: number }
export interface TrendResult {
  months: MonthPoint[]; hires: number; exits: number; openingHeadcount: number;
  undatedJoin: number; undatedExit: number; truncated: boolean;
}

/** Inclusive month list between two ISO dates (max `cap` months, newest kept). */
export function monthRange(from: string, to: string, cap = 36): { months: { month: string; start: string; end: string }[]; truncated: boolean } {
  if (!day(from) || !day(to) || from > to) return { months: [], truncated: false };
  const out: { month: string; start: string; end: string }[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({ month: `${y}-${pad(m)}`, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  const truncated = out.length > cap;
  return { months: truncated ? out.slice(out.length - cap) : out, truncated };
}

const exitDate = (e: Row) => (s(e["status"]) === "Left" ? day(e["relieving_date"]) : "");
/** On the books at the end of `date`: joined on/before it and not exited on/before it (undated records excluded). */
export function onBooks(e: Row, date: string): boolean {
  const j = day(e["date_of_joining"]);
  if (!j || j > date) return false;
  if (s(e["status"]) === "Left") { const x = exitDate(e); return !!x && x > date; }
  return true;
}

/** Monthly hires/exits/headcount for the given period; period bounds clip the first/last month like the metrics. */
export function workforceTrend(employees: Row[], from: string, to: string, cap = 36): TrendResult {
  const rows = employees.filter((e) => Number(e["docstatus"] ?? 0) !== 2);
  const { months, truncated } = monthRange(from, to, cap);
  const points: MonthPoint[] = months.map((mo) => {
    const a = mo.start < from ? from : mo.start, b = mo.end > to ? to : mo.end;
    const hires = rows.filter((e) => { const j = day(e["date_of_joining"]); return !!j && j >= a && j <= b; }).length;
    const exits = rows.filter((e) => { const x = exitDate(e); return !!x && x >= a && x <= b; }).length;
    return { month: mo.month, start: a, end: b, hires, exits, net: hires - exits, headcount: rows.filter((e) => onBooks(e, b)).length };
  });
  const first = points[0];
  const before = first ? new Date(Date.parse(`${first.start}T00:00:00Z`) - 864e5).toISOString().slice(0, 10) : "";
  return {
    months: points,
    hires: points.reduce((n, p) => n + p.hires, 0), exits: points.reduce((n, p) => n + p.exits, 0),
    openingHeadcount: before ? rows.filter((e) => onBooks(e, before)).length : 0,
    undatedJoin: rows.filter((e) => !day(e["date_of_joining"])).length,
    undatedExit: rows.filter((e) => s(e["status"]) === "Left" && !day(e["relieving_date"])).length,
    truncated,
  };
}

export interface HeadcountReconciliation {
  asOf: string; reconstructed: number; active: number;
  /** on the books but status is not Active (Inactive/Suspended) */ nonActiveOnBooks: number;
  /** status Left with a relieving date after asOf (still on the books) */ leavingLater: number;
  /** status Active but joining date after asOf, or missing */ activeNotOnBooks: number;
  balanced: boolean;
}

/** Explains reconstructed headcount vs Active Headcount: reconstructed − active = nonActive + leavingLater − activeNotOnBooks. */
export function reconcileHeadcount(employees: Row[], asOf: string): HeadcountReconciliation {
  const rows = employees.filter((e) => Number(e["docstatus"] ?? 0) !== 2);
  const books = rows.filter((e) => onBooks(e, asOf));
  const active = rows.filter((e) => s(e["status"] || "Active") === "Active").length;
  const nonActiveOnBooks = books.filter((e) => !["Active", "Left", ""].includes(s(e["status"]))).length;
  const leavingLater = books.filter((e) => s(e["status"]) === "Left").length;
  const activeNotOnBooks = rows.filter((e) => s(e["status"] || "Active") === "Active" && !onBooks(e, asOf)).length;
  return { asOf, reconstructed: books.length, active, nonActiveOnBooks, leavingLater, activeNotOnBooks, balanced: books.length - active === nonActiveOnBooks + leavingLater - activeNotOnBooks };
}
