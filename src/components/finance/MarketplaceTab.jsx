import React, { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, ArrowDownToLine, Plus, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fin, useRecords, downloadCsv } from './financeApi';
import { Btn, Card, Field, Modal, Table, Stat, Notice, Loading, Badge, inputClass, money, fmtDate, today } from './ui';

export const MEALDROP_COMPANY_ID = '6adb27b5c246acfa7f3c9b9a';
const TEMPLATE = ['payout_reference', 'payout_date', 'period_start', 'period_end', 'payment_provider', 'restaurant_name', 'gross_order_value', 'commission_rate', 'commission_amount', 'refunds_and_chargebacks', 'other_deductions', 'net_payout', 'status', 'external_reference', 'notes'];

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && q && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = !q;
    else if (ch === ',' && !q) { row.push(cell); cell = ''; } else if ((ch === '\n' || ch === '\r') && !q) { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some((v) => v.trim())) rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  row.push(cell); if (row.some((v) => v.trim())) rows.push(row); return rows;
}
const num = (v) => { const n = Number(String(v || '0').replace(/[£,]/g, '')); if (!Number.isFinite(n)) throw new Error('Invalid number in CSV'); return n; };

export default function MarketplaceTab({ company }) {
  const [view, setView] = useState('commissions');
  const payouts = useRecords('FinancePayout', company.id, '-payout_date');
  const commissions = useRecords('FinanceOrderCommission', company.id, '-order_date');
  const stripe = useRecords('FinanceStripeSettlement', company.id, '-payout_date');
  const [syncing, setSyncing] = useState('');
  const [adding, setAdding] = useState(false);
  const [p, setP] = useState({ payout_reference: '', payout_date: today(), restaurant_name: '', payment_provider: 'Bank transfer', gross_order_value: '', commission_rate: '15', commission_amount: '', refunds_and_chargebacks: '0', other_deductions: '0', status: 'paid', notes: '' });
  const fileRef = useRef(null);
  const isMealDrop = company.id === MEALDROP_COMPANY_ID;
  const commissionCalc = p.commission_amount !== '' ? Number(p.commission_amount) : Math.round(Number(p.gross_order_value || 0) * Number(p.commission_rate || 0)) / 100;
  const net = Math.round((Number(p.gross_order_value || 0) - commissionCalc - Number(p.refunds_and_chargebacks || 0) - Number(p.other_deductions || 0)) * 100) / 100;
  const ct = useMemo(() => ({ gross: commissions.rows.reduce((s, c) => s + Number(c.gross_order_value || 0), 0), commission: commissions.rows.reduce((s, c) => s + Number(c.commission_amount || 0), 0), owed: commissions.rows.reduce((s, c) => s + Number(c.restaurant_earnings || 0), 0) }), [commissions.rows]);
  const paidOut = payouts.rows.reduce((s, x) => s + Number(x.net_payout || 0), 0);

  const sync = async (action) => {
    setSyncing(action);
    try {
      const res = await base44.functions.invoke('finance-stripe-reconciliation', { action, company_id: company.id });
      const data = res?.data ?? res; if (!data?.success) throw new Error(data?.error || 'Sync failed');
      toast.success(action === 'sync_order_commissions' ? `${data.created} new order(s) recorded` : `${data.imported} Stripe payout(s) imported`);
      commissions.reload(); stripe.reload();
    } catch (e) { toast.error(e?.response?.data?.error || e.message); } finally { setSyncing(''); }
  };
  const savePayout = async () => {
    try { await fin('save_payouts', { company_id: company.id, records: [{ ...p, commission_amount: commissionCalc, net_payout: net, source_type: 'manual' }] }); toast.success('Payout saved'); setAdding(false); payouts.reload(); }
    catch (e) { toast.error(e.message); }
  };
  const importCsv = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      const h = rows[0].map((x) => x.trim().toLowerCase().replace(/\s+/g, '_'));
      const get = (r, k) => (h.indexOf(k) >= 0 ? String(r[h.indexOf(k)] ?? '').trim() : '');
      const records = rows.slice(1).map((r) => { const gross = num(get(r, 'gross_order_value')); const rate = num(get(r, 'commission_rate')); return { ...Object.fromEntries(TEMPLATE.map((k) => [k, get(r, k)])), gross_order_value: gross, commission_rate: rate, commission_amount: get(r, 'commission_amount') ? num(get(r, 'commission_amount')) : Math.round(gross * rate) / 100, refunds_and_chargebacks: num(get(r, 'refunds_and_chargebacks')), other_deductions: num(get(r, 'other_deductions')), net_payout: num(get(r, 'net_payout')), source_type: 'csv_import' }; });
      const r = await fin('save_payouts', { company_id: company.id, records }); toast.success(`${r.saved} payout(s) imported`); payouts.reload();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      <Notice>These registers track online-ordering money handled for restaurants (order value, MealDrop commission, payouts). They aren't posted to your ledger automatically yet — how they post depends on whether customer payments land in MealDrop's Stripe account or go straight to each restaurant.</Notice>
      <div className="flex gap-1 overflow-x-auto">{[['commissions', 'Order commissions'], ['payouts', 'Restaurant payouts'], ['stripe', 'Stripe settlements']].map(([v, l]) => <button key={v} type="button" onClick={() => setView(v)} className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ' + (view === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')}>{l}</button>)}</div>
      {view === 'commissions' && <Card title="Order commissions" actions={<Btn variant="primary" busy={syncing === 'sync_order_commissions'} disabled={!isMealDrop} onClick={() => sync('sync_order_commissions')}><RefreshCw className="h-4 w-4" />Sync orders</Btn>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="Order value" value={money(ct.gross)} note={`${commissions.rows.length} orders`} /><Stat label="MealDrop commission" value={money(ct.commission)} /><Stat label="Restaurant earnings" value={money(ct.owed)} note={`Paid out: ${money(paidOut)}`} /></div>
        {commissions.loading ? <Loading /> : <Table rows={commissions.rows} empty="No orders synced yet." columns={[{ key: 'order_number', label: 'Order', render: (c) => c.order_number || c.order_id }, { key: 'order_date', label: 'Date', render: (c) => fmtDate(c.order_date) }, { key: 'restaurant_name', label: 'Restaurant' }, { key: 'gross_order_value', label: 'Value', right: true, render: (c) => money(c.gross_order_value) }, { key: 'commission_amount', label: 'Commission', right: true, render: (c) => money(c.commission_amount) }, { key: 'reconciliation_status', label: '', render: (c) => <Badge status={c.reconciliation_status} /> }]} />}
      </Card>}
      {view === 'payouts' && <Card title="Restaurant payouts" actions={<><Btn onClick={() => downloadCsv('payout-template.csv', [TEMPLATE])}><ArrowDownToLine className="h-4 w-4" />Template</Btn><Btn onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Import CSV</Btn><input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={importCsv} /><Btn variant="primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add payout</Btn></>}>
        {payouts.loading ? <Loading /> : <Table rows={payouts.rows} empty="No payouts recorded." columns={[{ key: 'payout_reference', label: 'Ref' }, { key: 'payout_date', label: 'Date', render: (x) => fmtDate(x.payout_date) }, { key: 'restaurant_name', label: 'Restaurant' }, { key: 'gross_order_value', label: 'Sales', right: true, render: (x) => money(x.gross_order_value) }, { key: 'commission_amount', label: 'Commission', right: true, render: (x) => money(x.commission_amount) }, { key: 'net_payout', label: 'Paid', right: true, render: (x) => <strong>{money(x.net_payout)}</strong> }, { key: 'status', label: '', render: (x) => <Badge status={x.status} /> }]} />}
      </Card>}
      {view === 'stripe' && <Card title="Stripe settlements" subtitle="Money Stripe paid from MealDrop's Stripe balance into the bank." actions={<Btn variant="primary" busy={syncing === 'sync_stripe_payouts'} disabled={!isMealDrop} onClick={() => sync('sync_stripe_payouts')}><RefreshCw className="h-4 w-4" />Import from Stripe</Btn>}>
        {stripe.loading ? <Loading /> : <Table rows={stripe.rows} empty="Nothing imported yet." columns={[{ key: 'stripe_payout_id', label: 'Payout', render: (s) => <span className="font-mono text-xs">{s.stripe_payout_id}</span> }, { key: 'arrival_date', label: 'Arrived', render: (s) => fmtDate(s.arrival_date) }, { key: 'amount', label: 'Amount', right: true, render: (s) => money(s.amount) }, { key: 'stripe_fees', label: 'Fees', right: true, render: (s) => money(s.stripe_fees) }, { key: 'reconciliation_status', label: '', render: (s) => <Badge status={s.reconciliation_status} /> }]} />}
      </Card>}
      {adding && <Modal title="Add restaurant payout" onClose={() => setAdding(false)}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reference"><input value={p.payout_reference} onChange={(e) => setP({ ...p, payout_reference: e.target.value })} className={inputClass} /></Field>
            <Field label="Date"><input type="date" value={p.payout_date} onChange={(e) => setP({ ...p, payout_date: e.target.value })} className={inputClass} /></Field>
            <Field label="Restaurant"><input value={p.restaurant_name} onChange={(e) => setP({ ...p, restaurant_name: e.target.value })} className={inputClass} /></Field>
            <Field label="Status"><select value={p.status} onChange={(e) => setP({ ...p, status: e.target.value })} className={inputClass}>{['expected', 'processing', 'paid', 'reconciled', 'query'].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Order value (£)"><input type="number" step="0.01" value={p.gross_order_value} onChange={(e) => setP({ ...p, gross_order_value: e.target.value, commission_amount: '' })} className={inputClass} /></Field>
            <Field label="Commission %"><input type="number" step="0.01" value={p.commission_rate} onChange={(e) => setP({ ...p, commission_rate: e.target.value, commission_amount: '' })} className={inputClass} /></Field>
            <Field label="Refunds (£)"><input type="number" step="0.01" value={p.refunds_and_chargebacks} onChange={(e) => setP({ ...p, refunds_and_chargebacks: e.target.value })} className={inputClass} /></Field>
            <Field label="Other deductions (£)"><input type="number" step="0.01" value={p.other_deductions} onChange={(e) => setP({ ...p, other_deductions: e.target.value })} className={inputClass} /></Field>
          </div>
          <p className="rounded-lg bg-slate-50 p-3 text-sm">Commission {money(commissionCalc)} · Net payout <strong>{money(net)}</strong></p>
          <div className="flex justify-end gap-2"><Btn onClick={() => setAdding(false)}>Cancel</Btn><Btn variant="primary" disabled={net < 0 || !p.payout_reference || !p.restaurant_name} onClick={savePayout}>Save</Btn></div>
        </div>
      </Modal>}
    </div>
  );
}
