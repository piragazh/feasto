import React, { useEffect, useMemo, useState } from 'react';
import { FileText, ReceiptText, Calculator, Wallet, Plus, Search, Download, ShieldCheck, Info } from 'lucide-react';
import { calculateVat, formatGBP } from './financeMath';
import { base44 } from '@/api/base44Client';

const TEST_COMPANY_ID = '6ac0a36e45827ca2bfaef6e9';

const demoInvoices = [
  { id: 'MD-DEMO-001', customer: 'Example Catering Ltd', date: '2026-09-22', due: '2026-10-06', net: 480, vat: 96, total: 576, status: 'Awaiting payment' },
  { id: 'MD-DEMO-002', customer: 'Sample Events Co', date: '2026-09-18', due: '2026-10-02', net: 225, vat: 45, total: 270, status: 'Paid' },
  { id: 'MD-DEMO-003', customer: 'Demo Customer', date: '2026-09-10', due: '2026-09-24', net: 160, vat: 32, total: 192, status: 'Overdue' },
];

const money = (n) => formatGBP(n);
const tabs = [
  { id: 'overview', label: 'Overview', icon: Wallet },
  { id: 'invoices', label: 'Sales invoices', icon: FileText },
  { id: 'expenses', label: 'Expenses', icon: ReceiptText },
  { id: 'vat', label: 'VAT workspace', icon: Calculator },
];

function Stat({ label, value, note, icon: Icon }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-400" /></div>
    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{note}</p>
  </div>;
}

/**
 * Isolated Finance module preview.
 * All displayed records are demo/local component state only. This component deliberately
 * does not read or mutate existing POS entities, routes, payment flows, or HMRC services.
 */
export default function FinanceDashboard() {
  const [tab, setTab] = useState('overview');
  const [invoices, setInvoices] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ customer: '', net: '', rate: '20', due: '' });
  const [notice, setNotice] = useState('');
  const totals = useMemo(() => ({
    invoiced: invoices.reduce((sum, inv) => sum + inv.total, 0),
    outstanding: invoices.filter(i => i.status !== 'Paid').reduce((sum, inv) => sum + inv.total, 0),
    paid: invoices.filter(i => i.status === 'Paid').reduce((sum, inv) => sum + inv.total, 0),
  }), [invoices]);
  const visibleInvoices = invoices.filter(i => (i.invoice_number + ' ' + i.customer_name).toLowerCase().includes(search.toLowerCase()));

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      const [companyRecord, invoiceRecords] = await Promise.all([
        base44.entities.FinanceCompany.get(TEST_COMPANY_ID),
        base44.entities.FinanceInvoice.filter({ company_id: TEST_COMPANY_ID }, '-created_date', 100, 0),
      ]);
      setCompany(companyRecord);
      setInvoices(invoiceRecords || []);
      setNotice('');
    } catch (error) {
      console.error('Unable to load PK Store Finance data:', error);
      setNotice('Could not load PK Store data. Check your access and try refreshing.');
    } finally { setLoading(false); }
  };
  useEffect(() => { loadFinanceData(); }, []);

  const createDraft = async (event) => {
    event.preventDefault();
    const net = Number(draft.net);
    if (!draft.customer.trim() || !Number.isFinite(net) || net <= 0 || !draft.due || saving) return;
    setSaving(true);
    try {
      const issueDate = new Date().toISOString().slice(0, 10);
      const response = await base44.functions.invoke('finance-operations', {
        action: 'create_invoice', company_id: TEST_COMPANY_ID,
        invoice_number: `PK-TEST-${Date.now()}`, document_type: 'sales_invoice',
        customer_name: draft.customer.trim(), issue_date: issueDate, due_date: draft.due,
        notes: 'TEST RECORD — created in PK Store Finance testing company.',
        lines: [{ description: 'Test invoice item', quantity: 1, unit_price: net, vat_rate: Number(draft.rate) }],
      });
      if (!response?.data?.success) throw new Error(response?.data?.error || 'Invoice creation failed');
      setDraft({ customer: '', net: '', rate: '20', due: '' });
      setShowCreate(false);
      setNotice('Test draft saved to PK Store. It has not been issued or sent to a customer.');
      await loadFinanceData();
    } catch (error) {
      console.error('Unable to create PK Store test invoice:', error);
      setNotice(error?.response?.data?.error || error.message || 'Could not save the draft invoice.');
    } finally { setSaving(false); }
  };

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-900">Mealdrop Finance</h1><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Preview</span></div>
          <p className="mt-1 text-sm text-slate-500">Invoicing and accounting workspace foundation</p></div>
        <button onClick={() => { setShowCreate(true); setNotice(''); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-700"><Plus className="h-4 w-4" /> New invoice draft</button>
      </header>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Isolated preview:</strong> figures and invoices shown here are sample data stored only in this component's temporary state. No existing MealDrop records are read or changed. This is not an HMRC-connected or filing-ready system.</p></div>
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="Finance sections">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </nav>

      {tab === 'overview' && <section className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Demo invoiced" value={money(totals.invoiced)} note="Sample invoices only" icon={FileText} />
          <Stat label="Demo paid" value={money(totals.paid)} note="Marked paid in sample data" icon={Wallet} />
          <Stat label="Demo outstanding" value={money(totals.outstanding)} note="Includes draft and overdue" icon={ReceiptText} />
          <Stat label="VAT workspace" value="Not filed" note="No HMRC connection configured" icon={ShieldCheck} />
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2"><h2 className="font-semibold text-slate-900">Recent invoices</h2><p className="mt-1 text-sm text-slate-500">Illustrative records to demonstrate the workspace</p><InvoiceTable invoices={invoices.slice(0, 4)} /></div>
          <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Next steps</h2><ul className="mt-4 space-y-3 text-sm text-slate-600">{['Confirm legal company and restaurant boundaries','Approve isolated finance data models and access rules','Review VAT treatment and accounting mappings','Test HMRC sandbox integration before any live use'].map((x,i)=><li key={x} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{i+1}</span><span>{x}</span></li>)}</ul></div>
        </div>
      </section>}

      {tab === 'invoices' && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Sales invoices</h2><p className="text-sm text-slate-500">Sample data and local-only draft creation</p></div><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm sm:w-64" /></div></div><InvoiceTable invoices={visibleInvoices} /></section>}

      {tab === 'expenses' && <section className="rounded-xl border border-slate-200 bg-white p-8 text-center"><ReceiptText className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold text-slate-900">Expense management foundation</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">Supplier bills, receipts, approvals and expense ledger posting are not connected yet. No expenses are imported or stored in this preview.</p></section>}

      {tab === 'vat' && <section className="space-y-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Preparation only — not a VAT return.</strong> Sample invoice values below are not complete digital VAT records. VAT treatment must be confirmed per supply, including any adjustments, before filing.</div><div className="grid gap-4 sm:grid-cols-3"><Stat label="Sample output VAT" value={money(invoices.reduce((s,i)=>s+i.vat,0))} note="Demo invoices only" icon={Calculator}/><Stat label="Input VAT" value="—" note="Purchase records not configured" icon={ReceiptText}/><Stat label="HMRC submission" value="Not connected" note="No live filing available" icon={ShieldCheck}/></div><div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">VAT workflow</h2><p className="mt-2 text-sm text-slate-600">Digital source records → reviewed VAT codes → period reconciliation → return validation → user approval → HMRC sandbox tests → production approval.</p></div></section>}

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false);}}><section role="dialog" aria-modal="true" aria-labelledby="finance-create-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 id="finance-create-title" className="text-lg font-semibold">New invoice draft</h2><button onClick={()=>setShowCreate(false)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button></div><p className="mt-1 text-sm text-slate-500">This creates a temporary preview record only.</p><form onSubmit={createDraft} className="mt-5 space-y-4"><label className="block text-sm font-medium text-slate-700">Customer<input required value={draft.customer} onChange={e=>setDraft(d=>({...d,customer:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium text-slate-700">Net amount (£)<input required min="0.01" step="0.01" type="number" value={draft.net} onChange={e=>setDraft(d=>({...d,net:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="block text-sm font-medium text-slate-700">VAT rate<select value={draft.rate} onChange={e=>setDraft(d=>({...d,rate:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="20">20% (demo)</option><option value="5">5% (demo)</option><option value="0">0% (demo)</option></select></label></div><label className="block text-sm font-medium text-slate-700">Due date<input required type="date" value={draft.due} onChange={e=>setDraft(d=>({...d,due:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">VAT: {money(draft.net && Number(draft.net)>0 ? calculateVat(Number(draft.net),Number(draft.rate)).vat : 0)} · Total: {money(draft.net && Number(draft.net)>0 ? calculateVat(Number(draft.net),Number(draft.rate)).gross : 0)}</div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowCreate(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">Create local draft</button></div></form></section></div>}
      <footer className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500"><span>Mealdrop Finance · Isolated prototype</span><span>GBP · UK workspace</span></footer>
    </div>
  </main>;
}

function InvoiceTable({ invoices }) {
  if (!invoices.length) return <p className="py-8 text-center text-sm text-slate-500">No matching invoices.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="py-3 pr-3 font-medium">Invoice</th><th className="py-3 pr-3 font-medium">Customer</th><th className="py-3 pr-3 font-medium">Due</th><th className="py-3 pr-3 text-right font-medium">Total</th><th className="py-3 pl-3 text-right font-medium">Status</th></tr></thead><tbody>{invoices.map(inv=><tr key={inv.id} className="border-b border-slate-100 last:border-0"><td className="py-3 pr-3 font-medium text-slate-800">{inv.id}</td><td className="py-3 pr-3 text-slate-600">{inv.customer}</td><td className="py-3 pr-3 text-slate-600">{inv.due}</td><td className="py-3 pr-3 text-right tabular-nums text-slate-800">{money(inv.total)}</td><td className="py-3 pl-3 text-right"><span className={`rounded-full px-2.5 py-1 text-xs ${inv.status==='Paid'?'bg-emerald-50 text-emerald-700':inv.status==='Overdue'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-700'}`}>{inv.status}</span></td></tr>)}</tbody></table></div>;
}
