import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, BookCheck, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { fin, useRecords, useReport, listAll } from './financeApi';
import { Btn, Card, Field, Table, Stat, Notice, Loading, Badge, inputClass, money, fmtDate } from './ui';

export const MEALDROP_COMPANY_ID = '6adb27b5c246acfa7f3c9b9a';

function MoneyFlow() {
  const steps = [
    ['Customer pays online', 'Card money lands in your Stripe balance and is held for the restaurant'],
    ['Payout statement', 'Your commission moves from “held” to your income'],
    ['You pay the restaurant', 'Bank transfer from Super Admin → Payouts'],
    ['Stripe pays you', 'Stripe sends the balance to your bank, minus its fees'],
  ];
  return <div className="grid gap-2 sm:grid-cols-4">{steps.map(([t, d], i) => <div key={t} className="rounded-lg bg-slate-50 p-3"><span className="text-xs font-semibold text-orange-700">{i + 1}</span><p className="text-sm font-medium text-slate-900">{t}</p><p className="mt-0.5 text-xs text-slate-500">{d}</p></div>)}</div>;
}

export default function MarketplaceTab({ company, onCompanyChange }) {
  const [view, setView] = useState('balances');
  const [refresh, setRefresh] = useState(0);
  const balances = useReport(company.id, 'restaurant_balances', {}, [refresh]);
  const commissions = useRecords('FinanceOrderCommission', company.id, '-order_date');
  const stripe = useRecords('FinanceStripeSettlement', company.id, '-payout_date');
  const [payouts, setPayouts] = useState(null);
  const [busy, setBusy] = useState('');
  const [fromDate, setFromDate] = useState(company.marketplace_from || '');
  const isMealDrop = company.id === MEALDROP_COMPANY_ID;
  useEffect(() => { listAll('Payout', {}, '-period_end').then(setPayouts).catch(() => setPayouts([])); }, [refresh]);

  const unposted = useMemo(() => {
    if (!company.marketplace_from) return null;
    const from = company.marketplace_from;
    const d = (x) => String(x || '').slice(0, 10);
    return {
      orders: commissions.rows.filter((o) => !o.ledger_entry_id && o.reconciliation_status !== 'excluded' && d(o.order_date) >= from).length,
      payouts: (payouts || []).filter((p) => !['voided', 'failed'].includes(p.status) && ((!p.finance_commission_entry_id && d(p.period_end) >= from) || (p.status === 'paid' && !p.finance_payment_entry_id && d(p.paid_date) >= from))).length,
      settlements: stripe.rows.filter((s) => !s.ledger_entry_id && d(s.arrival_date || s.payout_date) >= from).length,
    };
  }, [company.marketplace_from, commissions.rows, payouts, stripe.rows]);

  const saveFrom = async () => {
    setBusy('from');
    try { const { company: c } = await fin('save_company', { company_id: company.id, fields: { marketplace_from: fromDate } }); onCompanyChange(c); toast.success('Start date saved'); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const sync = async (action) => {
    setBusy(action);
    try {
      const res = await base44.functions.invoke('finance-stripe-reconciliation', { action, company_id: company.id });
      const data = res?.data ?? res; if (!data?.success) throw new Error(data?.error || 'Sync failed');
      toast.success(data.message || 'Synced');
      commissions.reload(); stripe.reload();
    } catch (e) { toast.error(e?.response?.data?.error || e.message); } finally { setBusy(''); }
  };
  const post = async () => {
    setBusy('post');
    try {
      const tot = { receipts: 0, refunds: 0, commissions: 0, payouts_paid: 0, settlements: 0, skipped_locked: 0, errors: [] };
      for (let i = 0; i < 25; i++) {
        const r = await fin('post_marketplace', { company_id: company.id, limit: 200 });
        for (const k of Object.keys(tot)) tot[k] = k === 'errors' ? [...tot.errors, ...r.errors] : tot[k] + r[k];
        if (!r.has_more) break;
      }
      toast.success(`Posted ${tot.receipts} orders, ${tot.refunds} refunds, ${tot.commissions} commission statements, ${tot.payouts_paid} payouts, ${tot.settlements} Stripe payouts`);
      if (tot.skipped_locked) toast.warning(`${tot.skipped_locked} item(s) fall in a locked period and were skipped`);
      [...new Set(tot.errors)].slice(0, 3).forEach((e) => toast.error(e));
      commissions.reload(); stripe.reload(); setRefresh((x) => x + 1);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const b = balances.data;
  const pendingTotal = (payouts || []).filter((p) => ['pending', 'processing'].includes(p.status)).reduce((s, p) => s + Number(p.net_payout || 0), 0);
  const totalUnposted = unposted ? unposted.orders + unposted.payouts + unposted.settlements : 0;

  return (
    <div className="space-y-4">
      <Card title="Online ordering money" subtitle="Customers pay into your Stripe account; you keep your commission and pay restaurants from Super Admin → Payouts.">
        <MoneyFlow />
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Post to the books from" hint="Usually your books start date. Anything earlier belongs in opening balances."><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} /></Field>
            <Btn busy={busy === 'from'} disabled={!fromDate || fromDate === company.marketplace_from} onClick={saveFrom}>Save</Btn>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn busy={busy === 'sync_order_commissions'} disabled={!isMealDrop} onClick={() => sync('sync_order_commissions')}><RefreshCw className="h-4 w-4" />Sync orders</Btn>
            <Btn busy={busy === 'sync_stripe_payouts'} disabled={!isMealDrop} onClick={() => sync('sync_stripe_payouts')}><RefreshCw className="h-4 w-4" />Import Stripe payouts</Btn>
            <Btn variant="primary" busy={busy === 'post'} disabled={!company.marketplace_from || !company.chart_seeded} onClick={post}><BookCheck className="h-4 w-4" />Post to books{totalUnposted ? ` (${totalUnposted})` : ''}</Btn>
          </div>
        </div>
        {!company.marketplace_from && <div className="mt-3"><Notice tone="warn">Choose the date to start posting from, then Sync orders → Import Stripe payouts → Post to books.</Notice></div>}
        {unposted && totalUnposted > 0 && <p className="mt-2 text-xs text-slate-500">Waiting to post: {unposted.orders} order(s), {unposted.payouts} payout item(s), {unposted.settlements} Stripe payout(s).</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held for restaurants" value={b ? money(b.total_held) : '—'} note="Per your books" />
        <Stat label="Pending payouts" value={money(pendingTotal)} note="Generated, not yet paid" tone={pendingTotal > 0 ? 'warn' : 'default'} />
        <Stat label="Stripe balance (books)" value={b ? money(b.stripe_balance_per_books) : '—'} note="Compare with your Stripe dashboard" />
        <Stat label="Commission synced" value={money(commissions.rows.filter((c) => c.reconciliation_status !== 'excluded').reduce((s, c) => s + Number(c.commission_amount || 0), 0))} note="Estimate from orders" />
      </div>

      <div className="flex gap-1 overflow-x-auto">{[['balances', 'Restaurant balances'], ['payouts', 'Payouts'], ['orders', 'Orders'], ['stripe', 'Stripe payouts']].map(([v, l]) => <button key={v} type="button" onClick={() => setView(v)} className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ' + (view === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>)}</div>

      {view === 'balances' && <Card title="What you hold for each restaurant" subtitle="Card takings, minus refunds, minus your commission, minus what you've paid them. Should match their pending payouts.">
        {balances.loading ? <Loading /> : balances.error ? <Notice tone="bad">{balances.error}</Notice> : <>
          <Table rows={b.rows.map((r) => ({ ...r, id: r.restaurant_id }))} empty="Nothing posted yet." minWidth={760} columns={[
            { key: 'restaurant_name', label: 'Restaurant' },
            { key: 'takings', label: 'Card takings', right: true, render: (r) => money(r.takings) },
            { key: 'refunds', label: 'Refunds', right: true, render: (r) => money(r.refunds) },
            { key: 'commission', label: 'Commission', right: true, render: (r) => money(r.commission) },
            { key: 'paid_out', label: 'Paid out', right: true, render: (r) => money(r.paid_out) },
            { key: 'balance', label: 'Held', right: true, render: (r) => <strong className={r.balance < 0 ? 'text-red-700' : ''}>{money(r.balance)}</strong> },
            { key: 'pending_payouts', label: 'Pending payouts', right: true, render: (r) => money(r.pending_payouts) },
            { key: 'diff', label: '', render: (r) => { const d = Math.round((r.balance - (r.pending_payouts || 0)) * 100) / 100; return Math.abs(d) < 0.01 ? <span className="text-xs text-emerald-700">✓ matches</span> : <span className="text-xs text-amber-700">{d > 0 ? `${money(d)} not yet in a payout` : `${money(-d)} over`}</span>; } },
          ]} />
          <p className="mt-3 text-xs text-slate-500">A negative balance means the restaurant owes you (commission or refunds bigger than their card takings). “Not yet in a payout” is normal for days after the last payout period.</p>
        </>}
      </Card>}

      {view === 'payouts' && <Card title="Restaurant payouts" subtitle="Generated and paid in Super Admin. Marking one paid there posts it here automatically." actions={<Link to={createPageUrl('SuperAdmin')} className="inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:underline">Open Super Admin<ExternalLink className="h-4 w-4" /></Link>}>
        {payouts === null ? <Loading /> : <Table rows={payouts} empty="No payouts generated yet." minWidth={760} columns={[
          { key: 'restaurant_name', label: 'Restaurant' },
          { key: 'period', label: 'Period', render: (p) => `${fmtDate(String(p.period_start).slice(0, 10))} – ${fmtDate(String(p.period_end).slice(0, 10))}` },
          { key: 'card_payment_amount', label: 'Card takings', right: true, render: (p) => money(p.card_payment_amount) },
          { key: 'platform_commission', label: 'Commission', right: true, render: (p) => money(p.platform_commission) },
          { key: 'net_payout', label: 'Payout', right: true, render: (p) => <strong>{money(p.net_payout)}</strong> },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
          { key: 'books', label: 'Books', render: (p) => <span className="text-xs text-slate-500">{p.finance_payment_entry_id ? 'Paid ✓' : p.finance_commission_entry_id ? 'Commission ✓' : '—'}</span> },
        ]} />}
      </Card>}

      {view === 'orders' && <Card title="Online card orders" subtitle="Only online card payments — POS, kiosk, cash and Uber/Deliveroo/Just Eat orders are excluded.">
        {commissions.loading ? <Loading /> : <Table rows={commissions.rows} empty="No orders synced yet." columns={[
          { key: 'order_number', label: 'Order', render: (c) => c.order_number || c.order_id },
          { key: 'order_date', label: 'Date', render: (c) => fmtDate(c.order_date) },
          { key: 'restaurant_name', label: 'Restaurant' },
          { key: 'gross_order_value', label: 'Value', right: true, render: (c) => money(c.gross_order_value) },
          { key: 'refund_amount', label: 'Refund', right: true, render: (c) => (c.refund_amount ? `-${money(c.refund_amount)}` : '') },
          { key: 'state', label: '', render: (c) => (c.reconciliation_status === 'excluded' ? <Badge status="excluded" /> : c.ledger_entry_id ? <span className="text-xs text-emerald-700">Posted</span> : <span className="text-xs text-slate-400">Not posted</span>) },
        ]} />}
      </Card>}

      {view === 'stripe' && <Card title="Stripe payouts to your bank">
        {stripe.loading ? <Loading /> : <Table rows={stripe.rows} empty="Nothing imported yet." columns={[
          { key: 'stripe_payout_id', label: 'Payout', render: (s) => <span className="font-mono text-xs">{s.stripe_payout_id}</span> },
          { key: 'arrival_date', label: 'Arrived', render: (s) => fmtDate(s.arrival_date) },
          { key: 'amount', label: 'To bank', right: true, render: (s) => money(s.amount) },
          { key: 'stripe_fees', label: 'Stripe fees', right: true, render: (s) => money(s.stripe_fees) },
          { key: 'state', label: '', render: (s) => (s.ledger_entry_id ? <span className="text-xs text-emerald-700">Posted</span> : <Badge status={s.reconciliation_status} />) },
        ]} />}
      </Card>}
    </div>
  );
}
