/**
 * Receivable exposure concentration / payable due-date schedule (owner 2026-11-12 evening §7–§8): drawn only with the
 * shared Enterprise cards — the customer list is a half-width ranked card (top 8 by NAME, bars scaled, "Show all" opens
 * the side panel), the due-date schedule a fixed-height card — so nothing runs down the page. Figures are unchanged
 * (paymentPriorities.ts).
 */
import { Link, useNavigate } from '@tanstack/react-router';
import { useLang } from '@/i18n';
import { adapter } from '@/lib/adapter';
import { fmtCurrency } from '@/lib/format';
import { FixedPanel, RankCard, RankPair } from '@/components/enterprise/kit';
import type { Side } from './aging';
import { scopedPaymentPriorities } from './paymentPriorities';
import { SourceState } from './ProFrame';
import { todayIso } from './finance';

const partyName = (side: Side, party: string) => {
  const d = party ? adapter.get(side === 'payable' ? 'Supplier' : 'Customer', party) : undefined;
  return String((d && (d[side === 'payable' ? 'supplier_name' : 'customer_name'] || d['title'])) || party || '—');
};

export function PaymentPriorities({ side, company, user }: { side: Side; company: string; user: string }) {
  const ar = useLang() === 'ar', t = (en: string, a: string) => (ar ? a : en), nav = useNavigate();
  const r = scopedPaymentPriorities(side, company, todayIso(), user), path = side === 'payable' ? '/pro/payables' : '/pro/receivables';
  const note = t('Current submitted invoice outstanding by original currency; not a cash forecast or payment-term installment plan. Missing due dates remain unknown.', 'أرصدة الفواتير المرحّلة الحالية حسب العملة الأصلية؛ ليست توقعًا نقديًا أو خطة أقساط. التواريخ الناقصة غير معروفة.');
  if (r.status !== 'ok' || !r.groups.length) return <section className="ek-card mt-5" data-dp-payment-priorities><header className="ek-card-head"><h3 className="ek-h3">{side === 'payable' ? t('Invoice due-date schedule', 'جدول استحقاق الفواتير') : t('Customer exposure concentration', 'تركز انكشاف العملاء')}</h3></header><div className="ek-card-pad">{r.status !== 'ok' ? <SourceState status={r.status} /> : <SourceState status="empty" />}</div></section>;
  if (side === 'receivable') return <div className="mt-5" data-dp-payment-priorities><RankPair>
    {r.groups.map((g) => <RankCard key={g.currency} id={`exposure-${g.currency}`} ar={ar} title={t('Customer exposure concentration', 'تركز انكشاف العملاء')} sub={note}
      total={<span data-no-i18n>{g.currency || '—'} · {fmtCurrency(g.total, g.currency)}</span>}
      rows={g.parties.map((p) => ({ key: p.party || '—', label: <bdi data-no-i18n>{partyName(side, p.party)}</bdi>, title: p.party, value: p.total, shown: fmtCurrency(p.total, g.currency), share: p.share,
        onOpen: () => { void nav({ to: path as never, search: { company, party: p.party } as never }); }, attrs: { 'data-dp-exposure': p.party } }))} />)}
  </RankPair></div>;
  return <div className="mt-5" data-dp-payment-priorities><RankPair>
    {r.groups.map((g) => <FixedPanel key={g.currency} id={`due-schedule-${g.currency}`} height={360} title={t('Invoice due-date schedule', 'جدول استحقاق الفواتير')} sub={note}
      actions={<span className="text-xs font-semibold" data-no-i18n>{g.currency || '—'} · {fmtCurrency(g.total, g.currency)}</span>}>
      <ul className="divide-y divide-border px-4">{g.dates.map((d) => <li key={d.date} className="py-2 text-sm">
        <div className="flex justify-between gap-3"><span className={d.date === 'overdue' ? 'font-semibold text-destructive' : ''}>{d.date === 'overdue' ? t('Overdue', 'متأخر') : d.date === 'unknown' ? t('Due date unknown', 'تاريخ الاستحقاق غير معروف') : <span data-no-i18n>{d.date}</span>}</span><span className="font-semibold tabular-nums" data-no-i18n>{fmtCurrency(d.total, g.currency)}</span></div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{d.invoices.map((name) => <Link key={name} to="/app/$app/$doctype/$name" params={{ app: 'erpnext', doctype: 'purchase_invoice', name }} className="text-primary hover:underline" data-no-i18n>{name}</Link>)}</div>
      </li>)}</ul>
    </FixedPanel>)}
  </RankPair></div>;
}
