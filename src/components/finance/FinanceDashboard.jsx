import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Wallet, ReceiptText, Calculator, Plus, Search, ShieldCheck, Info, Store, ArrowDownToLine, Upload, RefreshCw, FileText, Landmark, BadgePoundSterling } from 'lucide-react';
import { calculateVat, formatGBP } from './financeMath';
import { base44 } from '@/api/base44Client';

const MEALDROP_COMPANY_ID = '6adb27b5c246acfa7f3c9b9a';
const PK_TEST_COMPANY_ID = '6ac0a36e45827ca2bfaef6e9';
const money = (n) => formatGBP(Number(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const tabs = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'payouts', label: 'Restaurant payouts', icon: Store },
  { id: 'commissions', label: 'Commission ledger', icon: BadgePoundSterling },
  { id: 'stripe', label: 'Stripe settlements', icon: Landmark },
  { id: 'expenses', label: 'Expenses', icon: ReceiptText },
  { id: 'invoices', label: 'Sales invoices', icon: FileText },
  { id: 'vat', label: 'VAT workspace', icon: Calculator },
];

function Stat({ label, value, note, icon: Icon }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>;
}
function Field({ label, children }) { return <label className="block text-sm font-medium text-slate-700">{label}{children}</label>; }
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export default function FinanceDashboard() {
  const [tab, setTab] = useState('overview');
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(MEALDROP_COMPANY_ID);
  const [payouts, setPayouts] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [stripeSettlements, setStripeSettlements] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState('');
  const [expense, setExpense] = useState({ supplier_name:'', description:'', category:'Software and technology', expense_date:today(), net_amount:'', vat_rate:'0', notes:'' });
  const [payout, setPayout] = useState({ payout_reference:'', payout_date:today(), period_start:'', period_end:'', payment_provider:'', restaurant_name:'', gross_order_value:'', commission_rate:'15', commission_amount:'', commission_vat:'0', refunds_and_chargebacks:'0', other_deductions:'0', net_payout:'', status:'paid', external_reference:'', notes:'' });
  const uploadRef = useRef(null);
  const company = companies.find(c => c.id === companyId);
  const isMealDrop = companyId === MEALDROP_COMPANY_ID;

  const loadData = async (selectedId = companyId) => {
    setLoading(true);
    try {
      const [companyRecords, payoutRecords, commissionRecords, stripeRecords, expenseRecords, invoiceRecords] = await Promise.all([
        base44.entities.FinanceCompany.list('-created_date', 100),
        base44.entities.FinancePayout.filter({ company_id: selectedId }, '-payout_date', 500, 0),
        base44.entities.FinanceOrderCommission.filter({ company_id: selectedId }, '-created_date', 500, 0),
        base44.entities.FinanceStripeSettlement.filter({ company_id: selectedId }, '-payout_date', 500, 0),
        base44.entities.FinanceExpense.filter({ company_id: selectedId }, '-expense_date', 500, 0),
        base44.entities.FinanceInvoice.filter({ company_id: selectedId }, '-issue_date', 500, 0),
      ]);
      setCompanies(companyRecords || []);
      setPayouts(payoutRecords || []);
      setCommissions(commissionRecords || []);
      setStripeSettlements(stripeRecords || []);
      setExpenses(expenseRecords || []);
      setInvoices(invoiceRecords || []);
      setNotice('');
    } catch (error) {
      console.error('Finance data load failed:', error);
      setNotice('Could not load finance records. Check your access and refresh.');
    } finally { setLoading(false); }
  };
  useEffect(() => { loadData(companyId); }, [companyId]);

  const payoutTotals = useMemo(() => ({
    sales: payouts.reduce((s,p)=>s+Number(p.gross_order_value||0),0),
    commission: payouts.reduce((s,p)=>s+Number(p.commission_amount||0),0),
    payout: payouts.reduce((s,p)=>s+Number(p.net_payout||0),0),
    pending: payouts.filter(p=>!['paid','reconciled'].includes(p.status)).reduce((s,p)=>s+Number(p.net_payout||0),0),
    commissionVat: payouts.reduce((s,p)=>s+Number(p.commission_vat||0),0),
  }), [payouts]);
  const commissionTotals = useMemo(() => ({
    gross: commissions.reduce((s,c)=>s+Number(c.gross_order_value||0),0),
    commission: commissions.reduce((s,c)=>s+Number(c.commission_amount||0),0),
    restaurantDue: commissions.reduce((s,c)=>s+Number(c.restaurant_earnings||0),0),
    count: commissions.length,
  }), [commissions]);
  const stripeTotals = useMemo(() => ({
    payouts: stripeSettlements.reduce((s,p)=>s+Number(p.amount||0),0),
    fees: stripeSettlements.reduce((s,p)=>s+Number(p.stripe_fees||0),0),
    unmatched: stripeSettlements.filter(p=>p.reconciliation_status!=='matched').length,
  }), [stripeSettlements]);
  const expenseTotals = useMemo(() => ({
    gross: expenses.filter(e=>e.payment_status!=='void').reduce((s,e)=>s+Number(e.gross_amount||0),0),
    paid: expenses.filter(e=>e.payment_status==='paid').reduce((s,e)=>s+Number(e.gross_amount||0),0),
    vat: expenses.filter(e=>e.payment_status!=='void').reduce((s,e)=>s+Number(e.vat_amount||0),0),
  }), [expenses]);
  const filteredPayouts = payouts.filter(p => [p.payout_reference,p.restaurant_name,p.payment_provider,p.external_reference].join(' ').toLowerCase().includes(search.toLowerCase()));
  const filteredExpenses = expenses.filter(e => [e.supplier_name,e.description,e.category].join(' ').toLowerCase().includes(search.toLowerCase()));

  const calcPayout = (draft) => {
    const gross = Number(draft.gross_order_value || 0);
    const rate = Number(draft.commission_rate || 0);
    const commission = draft.commission_amount !== '' ? Number(draft.commission_amount) : Math.round(gross * rate) / 100;
    const commissionVat = Number(draft.commission_vat || 0);
    const refunds = Number(draft.refunds_and_chargebacks || 0);
    const deductions = Number(draft.other_deductions || 0);
    return { commission, net: Math.round((gross - commission - commissionVat - refunds - deductions + Number.EPSILON) * 100) / 100 };
  };
  const syncFinance = async (action) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const response = await base44.functions.invoke('finance-stripe-reconciliation', { action, company_id: companyId });
      const data = response?.data ?? response;
      if (!data?.success) throw new Error(data?.error || 'Finance sync failed');
      const summary = action === 'sync_order_commissions'
        ? `Commission sync complete: ${data.created} new order record(s), ${data.skipped} already recorded.`
        : `Stripe sync complete: ${data.imported} payout(s) imported, ${data.skipped} already recorded${data.stripe_mode ? ` (${data.stripe_mode} mode)` : ''}.`;
      await loadData(companyId);
      setNotice(summary + ' Stripe bank settlements are separate from restaurant payouts.');
    } catch (error) {
      console.error('Finance reconciliation sync failed:', error);
      setNotice(error?.response?.data?.error || error.message || 'Finance sync failed. Check Stripe configuration and access.');
    } finally { setSyncing(false); }
  };
  const createExpense = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const response = await base44.functions.invoke('finance-operations', {
        action:'create_expense', company_id:companyId, supplier_name:expense.supplier_name,
        description:expense.description, category:expense.category, expense_date:expense.expense_date,
        net_amount:Number(expense.net_amount), vat_rate:Number(expense.vat_rate), notes:expense.notes,
      });
      if (!response?.data?.success) throw new Error(response?.data?.error || 'Could not save expense');
      setModal('');
      setExpense({ supplier_name:'', description:'', category:'Software and technology', expense_date:today(), net_amount:'', vat_rate:'0', notes:'' });
      setNotice('Expense saved. Check the supplier receipt and VAT treatment before closing the period.');
      await loadData(companyId);
    } catch (error) {
      console.error('Expense save failed:', error);
      setNotice(error?.response?.data?.error || error.message || 'Could not save expense.');
    } finally { setSaving(false); }
  };
  const createPayout = async (event) => {
    event.preventDefault();
    if (saving) return;
    const totals = calcPayout(payout);
    if (!payout.payout_reference.trim() || !payout.restaurant_name.trim() || Number(payout.gross_order_value) < 0 || totals.net < 0) {
      setNotice('Check the payout reference, restaurant, gross sales and deductions. Net payout cannot be negative.');
      return;
    }
    setSaving(true);
    try {
      await base44.entities.FinancePayout.create({
        company_id:companyId, payout_reference:payout.payout_reference.trim(), payout_date:payout.payout_date,
        ...(payout.period_start ? {period_start:payout.period_start}:{}), ...(payout.period_end ? {period_end:payout.period_end}:{}),
        payment_provider:payout.payment_provider, restaurant_name:payout.restaurant_name.trim(), currency:'GBP',
        gross_order_value:Number(payout.gross_order_value), commission_rate:Number(payout.commission_rate),
        commission_amount:totals.commission, commission_vat:Number(payout.commission_vat||0),
        refunds_and_chargebacks:Number(payout.refunds_and_chargebacks||0), other_deductions:Number(payout.other_deductions||0),
        net_payout:totals.net, status:payout.status, source_type:'manual',
        external_reference:payout.external_reference, notes:payout.notes,
      });
      setModal('');
      setPayout({ payout_reference:'', payout_date:today(), period_start:'', period_end:'', payment_provider:'', restaurant_name:'', gross_order_value:'', commission_rate:'15', commission_amount:'', commission_vat:'0', refunds_and_chargebacks:'0', other_deductions:'0', net_payout:'', status:'paid', external_reference:'', notes:'' });
      setNotice('Payout record saved. Reconcile it to the payment provider or bank statement before marking it final.');
      await loadData(companyId);
    } catch (error) {
      console.error('Payout save failed:', error);
      setNotice(error.message || 'Could not save payout record.');
    } finally { setSaving(false); }
  };
  const importPayoutCsv = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      const raw = await file.text();
      const rows = parseCsv(raw);
      if (rows.length < 2) throw new Error('CSV needs a header row and at least one payout row.');
      const headers = rows[0].map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
      const idx = (key) => headers.indexOf(key);
      const get = (row,key) => idx(key) >= 0 ? String(row[idx(key)] ?? '').trim() : '';
      const required = ['payout_reference','payout_date','restaurant_name','net_payout'];
      const missing = required.filter(k=>idx(k)<0);
      if (missing.length) throw new Error('Missing CSV columns: '+missing.join(', '));
      const records = rows.slice(1).filter(row=>row.some(v=>String(v||'').trim())).map((row,i)=>{
        const gross = toNumber(get(row,'gross_order_value'));
        const rate = toNumber(get(row,'commission_rate'));
        const commission = get(row,'commission_amount') ? toNumber(get(row,'commission_amount')) : Math.round(gross*rate)/100;
        const date = get(row,'payout_date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Row '+(i+2)+': payout_date must be YYYY-MM-DD.');
        return {
          company_id:companyId, payout_reference:get(row,'payout_reference'), payout_date:date,
          period_start:get(row,'period_start'), period_end:get(row,'period_end'),
          payment_provider:get(row,'payment_provider'), restaurant_name:get(row,'restaurant_name'), currency:'GBP',
          gross_order_value:gross, commission_rate:rate, commission_amount:commission,
          commission_vat:toNumber(get(row,'commission_vat')), refunds_and_chargebacks:toNumber(get(row,'refunds_and_chargebacks')),
          other_deductions:toNumber(get(row,'other_deductions')), net_payout:toNumber(get(row,'net_payout')),
          status:['expected','processing','paid','reconciled','query'].includes(get(row,'status'))?get(row,'status'):'paid',
          source_type:'csv_import', external_reference:get(row,'external_reference'), notes:get(row,'notes') || 'Imported from CSV; reconcile against provider/bank statement.',
        };
      });
      for (let i=0;i<records.length;i+=100) await base44.entities.FinancePayout.bulkCreate(records.slice(i,i+100));
      setNotice(records.length+' payout record(s) imported. These are imported statements, not a live payment-provider connection.');
      await loadData(companyId);
    } catch (error) {
      console.error('Payout CSV import failed:', error);
      setNotice(error.message || 'Could not import payout CSV. No provider connection was made.');
    } finally { setSaving(false); }
  };

  const downloadPayoutTemplate = () => {
    const csv = 'payout_reference,payout_date,period_start,period_end,payment_provider,restaurant_name,gross_order_value,commission_rate,commission_amount,commission_vat,refunds_and_chargebacks,other_deductions,net_payout,status,external_reference,notes\n';
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='mealdrop-payout-import-template.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><div className="rounded-xl bg-orange-100 p-3 text-orange-700"><Wallet className="h-6 w-6"/></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-900">Finance & Payouts</h1><span className={'rounded-full px-2.5 py-1 text-xs font-medium '+(isMealDrop?'bg-orange-100 text-orange-800':'bg-amber-100 text-amber-800')}>{isMealDrop?'MealDrop marketplace':'Test company'}</span></div><p className="mt-1 text-sm text-slate-500">Commission income, restaurant settlements, operating expenses and records · GBP</p></div></div>
      <div className="flex flex-wrap gap-2"><select aria-label="Finance company" value={companyId} onChange={e=>setCompanyId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{companies.map(c=><option key={c.id} value={c.id}>{c.trading_name || c.legal_name}</option>)}</select><button onClick={()=>loadData(companyId)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"><RefreshCw className="h-4 w-4"/> Refresh</button></div>
    </header>
    <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><Info className="mt-0.5 h-4 w-4 shrink-0"/><p><strong>Commission marketplace accounting:</strong> gross order value is not automatically MealDrop revenue. Commission sync reads eligible existing orders without modifying POS records. Stripe sync reads MealDrop account-to-bank payouts only; restaurant transfers remain a separate register. Confirm legal entity and VAT status before formal accounting.</p></div>
    {notice && <div role="status" className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">{notice}</div>}
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="Finance sections">{tabs.map(({id,label,icon:Icon})=><button key={id} onClick={()=>{setTab(id);setSearch('');}} className={'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium '+(tab===id?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}><Icon className="h-4 w-4"/>{label}</button>)}</nav>
    {loading && <p role="status" className="rounded-lg bg-white p-3 text-sm text-slate-600">Loading finance records…</p>}
    {tab==='overview' && <section className="space-y-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Gross order value" value={money(commissionTotals.gross)} note="Eligible orders synced from POS records" icon={Store}/><Stat label="Commission income" value={money(commissionTotals.commission)} note="Recorded commission from orders" icon={Wallet}/><Stat label="Restaurant payouts" value={money(payoutTotals.payout)} note="Net settlement values recorded" icon={ArrowDownToLine}/><Stat label="Operating expenses" value={money(expenseTotals.gross)} note="Saved expense records" icon={ReceiptText}/></div>
      <div className="grid gap-5 lg:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Latest restaurant payouts</h2><p className="mt-1 text-sm text-slate-500">Records for {company?.trading_name || company?.legal_name || 'selected company'}</p></div><button onClick={()=>setTab('payouts')} className="text-sm font-medium text-orange-700 hover:underline">View all</button></div><PayoutTable payouts={payouts.slice(0,5)}/></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Finance snapshot</h2><dl className="mt-4 space-y-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Payouts awaiting reconciliation</dt><dd className="font-semibold">{money(payoutTotals.pending)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Expenses marked paid</dt><dd className="font-semibold">{money(expenseTotals.paid)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Commission VAT recorded</dt><dd className="font-semibold">{money(payoutTotals.commissionVat)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Input VAT on expenses</dt><dd className="font-semibold">{money(expenseTotals.vat)}</dd></div></dl><p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Use provider/bank statements to reconcile payout amounts. These figures do not establish cash received or VAT recoverability.</p></div></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Reconciliation actions</h2><p className="mt-1 text-sm text-slate-500">Read-only order sync and Stripe bank payout import.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>syncFinance("sync_order_commissions")} disabled={syncing||!isMealDrop} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">{syncing?"Working…":"Sync order commissions"}</button><button onClick={()=>syncFinance("sync_stripe_payouts")} disabled={syncing||!isMealDrop} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{syncing?"Working…":"Import Stripe payouts"}</button></div></div><p className="mt-3 text-xs text-slate-500">Stripe imports are money paid out from the Stripe balance to MealDrop’s bank account. They do not record transfers from MealDrop to restaurants.</p></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">How MealDrop records money</h2><div className="mt-4 grid gap-3 md:grid-cols-4">{[['1','Order value','Track sales handled for restaurants'],['2','Commission','Record MealDrop’s agreed fee'],['3','Deductions','Record refunds and agreed charges'],['4','Payout','Compare net settlement to provider/bank']].map(([n,t,d])=><div key={n} className="rounded-lg bg-slate-50 p-4"><span className="text-xs font-semibold text-orange-700">STEP {n}</span><h3 className="mt-1 font-semibold text-slate-900">{t}</h3><p className="mt-1 text-sm text-slate-500">{d}</p></div>)}</div></div></section>}
    {tab==='commissions' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Order commission ledger</h2><p className="text-sm text-slate-500">Read-only snapshots of eligible completed orders and MealDrop commission.</p></div><button onClick={()=>syncFinance('sync_order_commissions')} disabled={syncing||!isMealDrop} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{syncing?'Syncing…':'Sync orders'}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Eligible gross value" value={money(commissionTotals.gross)} note={commissionTotals.count+' order records'} icon={Store}/><Stat label="Commission total" value={money(commissionTotals.commission)} note="Stored commission amounts" icon={BadgePoundSterling}/><Stat label="Restaurant earnings" value={money(commissionTotals.restaurantDue)} note="Stored or calculated order earnings" icon={Wallet}/></div><CommissionTable commissions={commissions}/></section>}
    {tab==='stripe' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Stripe account settlements</h2><p className="text-sm text-slate-500">Payouts Stripe sent from MealDrop’s Stripe balance to its bank account.</p></div><button onClick={()=>syncFinance('sync_stripe_payouts')} disabled={syncing||!isMealDrop} className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{syncing?'Importing…':'Import from Stripe'}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Stripe bank payouts" value={money(stripeTotals.payouts)} note={stripeSettlements.length+' settlement records'} icon={Landmark}/><Stat label="Stripe fees" value={money(stripeTotals.fees)} note="From imported balance transactions" icon={ReceiptText}/><Stat label="Needs review" value={String(stripeTotals.unmatched)} note="Payouts with net mismatch" icon={ShieldCheck}/></div><p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This is not the restaurant payout register. Use Restaurant payouts to record transfers MealDrop actually makes to restaurants.</p><StripeTable settlements={stripeSettlements}/></section>}
    {tab==='payouts' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-semibold text-slate-900">Restaurant payout records</h2><p className="text-sm text-slate-500">Import a payout CSV or enter a settlement manually.</p></div><div className="flex flex-wrap gap-2"><button onClick={downloadPayoutTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><ArrowDownToLine className="h-4 w-4"/>CSV template</button><button onClick={()=>uploadRef.current?.click()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Upload className="h-4 w-4"/>Import CSV</button><input ref={uploadRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importPayoutCsv}/><button onClick={()=>setModal('payout')} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"><Plus className="h-4 w-4"/>Add payout</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Gross order value" value={money(payoutTotals.sales)} note="Imported or manually entered" icon={Store}/><Stat label="Commission" value={money(payoutTotals.commission)} note="Recorded MealDrop fee" icon={Wallet}/><Stat label="Net payouts" value={money(payoutTotals.payout)} note="Restaurant settlement amount" icon={ArrowDownToLine}/></div><div className="relative mt-5 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurant or payout ref" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"/></div><PayoutTable payouts={filteredPayouts}/></section>}
    {tab==='expenses' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Operating expenses</h2><p className="text-sm text-slate-500">Record hosting, software, marketing, bank fees, insurance and other business costs.</p></div><button onClick={()=>setModal('expense')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white"><Plus className="h-4 w-4"/>Add expense</button></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="Total expenses" value={money(expenseTotals.gross)} note="Excluding void records" icon={ReceiptText}/><Stat label="Paid expenses" value={money(expenseTotals.paid)} note="Marked paid" icon={Wallet}/><Stat label="VAT recorded" value={money(expenseTotals.vat)} note="Not automatically reclaimable" icon={Calculator}/></div><div className="relative mt-5 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search supplier, category or description" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"/></div><ExpenseTable expenses={filteredExpenses}/></section>}
    {tab==='invoices' && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Sales invoices</h2><p className="text-sm text-slate-500">Finance invoices for the selected company.</p><InvoiceTable invoices={invoices}/></section>}
    {tab==='vat' && <section className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Preparation only — not a VAT return.</strong> Confirm MealDrop’s VAT registration and commission VAT treatment with an accountant before using these figures for filing.</div><div className="grid gap-4 sm:grid-cols-3"><Stat label="Commission VAT" value={money(payoutTotals.commissionVat)} note="From payout records" icon={Calculator}/><Stat label="Expense VAT" value={money(expenseTotals.vat)} note="Review receipts and eligibility" icon={ReceiptText}/><Stat label="HMRC submission" value="Not connected" note="No live filing available" icon={ShieldCheck}/></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">VAT review checklist</h2><p className="mt-2 text-sm text-slate-600">Confirm legal entity and VAT status → classify commission and other fees → review refunds/credit notes → verify expense receipts → reconcile source statements → accountant review. No return is generated or submitted here.</p></div></section>}
    {modal==='expense' && <Modal title="Add business expense" close={()=>setModal('')}><form onSubmit={createExpense} className="space-y-4"><Field label="Supplier"><input required value={expense.supplier_name} onChange={e=>setExpense({...expense,supplier_name:e.target.value})} className={inputClass} placeholder="e.g. Hosting provider"/></Field><Field label="Description"><input required value={expense.description} onChange={e=>setExpense({...expense,description:e.target.value})} className={inputClass} placeholder="What was purchased?"/></Field><div className="grid grid-cols-2 gap-3"><Field label="Category"><select value={expense.category} onChange={e=>setExpense({...expense,category:e.target.value})} className={inputClass}>{['Software and technology','Marketing and advertising','Payment processing fees','Delivery and logistics','Insurance','Professional fees','Office and supplies','Travel','Bank charges','Other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Expense date"><input required type="date" value={expense.expense_date} onChange={e=>setExpense({...expense,expense_date:e.target.value})} className={inputClass}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Net amount (£)"><input required min="0" step="0.01" type="number" value={expense.net_amount} onChange={e=>setExpense({...expense,net_amount:e.target.value})} className={inputClass}/></Field><Field label="VAT rate"><select value={expense.vat_rate} onChange={e=>setExpense({...expense,vat_rate:e.target.value})} className={inputClass}><option value="0">0% / not confirmed</option><option value="5">5%</option><option value="20">20%</option></select></Field></div><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Estimated VAT: {money(expense.net_amount ? calculateVat(Number(expense.net_amount),Number(expense.vat_rate)).vat : 0)} · Gross: {money(expense.net_amount ? calculateVat(Number(expense.net_amount),Number(expense.vat_rate)).gross : 0)}</div><Field label="Notes / receipt reference"><textarea value={expense.notes} onChange={e=>setExpense({...expense,notes:e.target.value})} className={inputClass} rows="2"/></Field><div className="flex justify-end gap-2"><button type="button" onClick={()=>setModal('')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Saving…':'Save expense'}</button></div></form></Modal>}
    {modal==='payout' && <Modal title="Add restaurant payout" close={()=>setModal('')}><form onSubmit={createPayout} className="space-y-4"><div className="grid grid-cols-2 gap-3"><Field label="Payout reference"><input required value={payout.payout_reference} onChange={e=>setPayout({...payout,payout_reference:e.target.value})} className={inputClass}/></Field><Field label="Payout date"><input required type="date" value={payout.payout_date} onChange={e=>setPayout({...payout,payout_date:e.target.value})} className={inputClass}/></Field></div><Field label="Restaurant"><input required value={payout.restaurant_name} onChange={e=>setPayout({...payout,restaurant_name:e.target.value})} className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Payment provider"><input value={payout.payment_provider} onChange={e=>setPayout({...payout,payment_provider:e.target.value})} className={inputClass} placeholder="e.g. Stripe / bank"/></Field><Field label="Status"><select value={payout.status} onChange={e=>setPayout({...payout,status:e.target.value})} className={inputClass}><option value="expected">Expected</option><option value="processing">Processing</option><option value="paid">Paid (reported)</option><option value="reconciled">Reconciled</option><option value="query">Query</option></select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Gross order value (£)"><input required min="0" step="0.01" type="number" value={payout.gross_order_value} onChange={e=>setPayout({...payout,gross_order_value:e.target.value,commission_amount:''})} className={inputClass}/></Field><Field label="Commission rate (%)"><input required min="0" max="100" step="0.01" type="number" value={payout.commission_rate} onChange={e=>setPayout({...payout,commission_rate:e.target.value,commission_amount:''})} className={inputClass}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Commission amount (£) (optional override)"><input min="0" step="0.01" type="number" value={payout.commission_amount} onChange={e=>setPayout({...payout,commission_amount:e.target.value})} className={inputClass}/></Field><Field label="VAT on commission (£)"><input min="0" step="0.01" type="number" value={payout.commission_vat} onChange={e=>setPayout({...payout,commission_vat:e.target.value})} className={inputClass}/></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Refunds / chargebacks (£)"><input min="0" step="0.01" type="number" value={payout.refunds_and_chargebacks} onChange={e=>setPayout({...payout,refunds_and_chargebacks:e.target.value})} className={inputClass}/></Field><Field label="Other deductions (£)"><input min="0" step="0.01" type="number" value={payout.other_deductions} onChange={e=>setPayout({...payout,other_deductions:e.target.value})} className={inputClass}/></Field></div><div className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-500">Calculated net payout (before any other unlisted adjustments)</p><p className="mt-1 text-xl font-semibold">{money(calcPayout(payout).net)}</p></div><Field label="External reference / notes"><textarea value={payout.notes} onChange={e=>setPayout({...payout,notes:e.target.value})} className={inputClass} rows="2"/></Field><div className="flex justify-end gap-2"><button type="button" onClick={()=>setModal('')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving?'Saving…':'Save payout record'}</button></div></form></Modal>}
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500"><span>{company?.trading_name || 'Finance'} · {isMealDrop?'Marketplace finance':'Test workspace'}</span><span>GBP · No live payout integration</span></footer>
  </div></main>;
}

function toNumber(value) { const n = Number(String(value || '0').replace(/[£,]/g,'')); if (!Number.isFinite(n)) throw new Error('Invalid numeric value in payout CSV.'); return Math.round((n + Number.EPSILON)*100)/100; }
function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i]; if(ch==='"' && quoted && text[i+1]==='"'){cell+='"';i++;} else if(ch==='"'){quoted=!quoted;} else if(ch===',' && !quoted){row.push(cell);cell='';} else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';} else cell+=ch;}
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
function Modal({title,close,children}) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">{title}</h2><button onClick={close} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button></div>{children}</section></div>; }
function PayoutTable({payouts}) {
  if(!payouts.length)return <p className="py-8 text-center text-sm text-slate-500">No payout records yet. Add a payout or import a CSV statement.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{['Payout ref','Date','Restaurant','Gross sales','Commission','Net payout','Status','Source'].map(x=><th key={x} className="py-3 pr-3 font-medium">{x}</th>)}</tr></thead><tbody>{payouts.map(p=><tr key={p.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3 font-medium">{p.payout_reference}</td><td className="py-3 pr-3">{p.payout_date}</td><td className="py-3 pr-3">{p.restaurant_name}</td><td className="py-3 pr-3">{money(p.gross_order_value)}</td><td className="py-3 pr-3">{money(p.commission_amount)}</td><td className="py-3 pr-3 font-semibold">{money(p.net_payout)}</td><td className="py-3 pr-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{p.status}</span></td><td className="py-3 pr-3 text-slate-500">{p.source_type||'manual'}</td></tr>)}</tbody></table></div>;
}
function CommissionTable({commissions}) {
  if(!commissions.length)return <p className="py-8 text-center text-sm text-slate-500">No order commissions synced yet. Use Sync orders to read eligible order records.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{['Order','Date','Restaurant','Gross value','Rate','Commission','Restaurant earnings','Status'].map(x=><th key={x} className="py-3 pr-3 font-medium">{x}</th>)}</tr></thead><tbody>{commissions.map(c=><tr key={c.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3 font-medium">{c.order_number||c.order_id}</td><td className="py-3 pr-3">{c.order_date?new Date(c.order_date).toLocaleDateString('en-GB'):'—'}</td><td className="py-3 pr-3">{c.restaurant_name||'—'}</td><td className="py-3 pr-3">{money(c.gross_order_value)}</td><td className="py-3 pr-3">{Number(c.commission_rate||0)}%</td><td className="py-3 pr-3 font-semibold">{money(c.commission_amount)}</td><td className="py-3 pr-3">{money(c.restaurant_earnings)}</td><td className="py-3 pr-3">{c.reconciliation_status}</td></tr>)}</tbody></table></div>;
}
function StripeTable({settlements}) {
  if(!settlements.length)return <p className="py-8 text-center text-sm text-slate-500">No Stripe settlement records imported yet. Import from Stripe after confirming the configured secret key.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{['Stripe payout ID','Created','Arrival','Amount','Fees','Transaction net','Status','Reconciliation'].map(x=><th key={x} className="py-3 pr-3 font-medium">{x}</th>)}</tr></thead><tbody>{settlements.map(s=><tr key={s.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3 font-medium">{s.stripe_payout_id}</td><td className="py-3 pr-3">{s.payout_date?new Date(s.payout_date).toLocaleDateString('en-GB'):'—'}</td><td className="py-3 pr-3">{s.arrival_date?new Date(s.arrival_date).toLocaleDateString('en-GB'):'—'}</td><td className="py-3 pr-3">{money(s.amount)}</td><td className="py-3 pr-3">{money(s.stripe_fees)}</td><td className="py-3 pr-3">{money(s.net_balance_transactions)}</td><td className="py-3 pr-3">{s.status}</td><td className="py-3 pr-3">{s.reconciliation_status}</td></tr>)}</tbody></table></div>;
}
function ExpenseTable({expenses}) {
  if(!expenses.length)return <p className="py-8 text-center text-sm text-slate-500">No expense records yet. Use Add expense to record a business cost.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{['Date','Supplier','Description','Category','Gross amount','Payment status'].map(x=><th key={x} className="py-3 pr-3 font-medium">{x}</th>)}</tr></thead><tbody>{expenses.map(e=><tr key={e.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3">{e.expense_date}</td><td className="py-3 pr-3">{e.supplier_name||'—'}</td><td className="py-3 pr-3">{e.description}</td><td className="py-3 pr-3">{e.category||'Uncategorised'}</td><td className="py-3 pr-3 font-medium">{money(e.gross_amount)}</td><td className="py-3 pr-3">{e.payment_status}</td></tr>)}</tbody></table></div>;
}
function InvoiceTable({invoices}) {
  if(!invoices.length)return <p className="py-8 text-center text-sm text-slate-500">No invoice records for this company.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{['Invoice','Customer','Issue date','Total','Status'].map(x=><th key={x} className="py-3 pr-3 font-medium">{x}</th>)}</tr></thead><tbody>{invoices.map(i=><tr key={i.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3 font-medium">{i.invoice_number}</td><td className="py-3 pr-3">{i.customer_name||'—'}</td><td className="py-3 pr-3">{i.issue_date}</td><td className="py-3 pr-3">{money(i.gross_total)}</td><td className="py-3 pr-3">{i.status}</td></tr>)}</tbody></table></div>;
}
