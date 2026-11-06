import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Wallet, LayoutDashboard, FileText, Repeat, Users, Package, ReceiptText, BarChart3, BookOpen, Store, Settings, ShieldAlert, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fin } from './financeApi';
import { Btn, Card, Field, Loading, Notice, inputClass, fmtDate } from './ui';
import OverviewTab from './OverviewTab';
import InvoicesTab, { InvoiceEditor } from './InvoicesTab';
import RecurringTab from './RecurringTab';
import CustomersTab from './CustomersTab';
import ItemsTab from './ItemsTab';
import ExpensesTab from './ExpensesTab';
import ReportsTab from './ReportsTab';
import LedgerTab from './LedgerTab';
import SettingsTab from './SettingsTab';
import MarketplaceTab, { MEALDROP_COMPANY_ID } from './MarketplaceTab';

const TABS = [
  ['overview', 'Overview', LayoutDashboard], ['invoices', 'Invoices', FileText], ['recurring', 'Recurring', Repeat],
  ['customers', 'Customers', Users], ['items', 'Price list', Package], ['costs', 'Costs', ReceiptText],
  ['reports', 'Reports', BarChart3], ['ledger', 'Ledger', BookOpen], ['marketplace', 'Marketplace', Store], ['settings', 'Settings', Settings],
];

function CreateCompany({ onCreated }) {
  const [name, setName] = useState('MealDrop LTD');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try { const { company } = await fin('save_company', { fields: { legal_name: name, trading_name: 'MealDrop' } }); await fin('seed_chart', { company_id: company.id }); onCreated(company.id); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return <Card title="Set up your books"><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><Field label="Registered company name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field><Btn variant="primary" busy={busy} onClick={create}>Create</Btn></div></Card>;
}

export default function FinanceDashboard() {
  const [user, setUser] = useState(undefined);
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(() => { try { return localStorage.getItem('finance_company_id') || MEALDROP_COMPANY_ID; } catch { return MEALDROP_COMPANY_ID; } });
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newInvoice, setNewInvoice] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => { base44.auth.me().then(setUser).catch(() => setUser(null)); }, []);
  const loadCompanies = useCallback(async () => {
    try { const rows = await base44.entities.FinanceCompany.filter({ status: 'active' }, '-created_date', 50, 0); setCompanies(rows || []); }
    catch { setCompanies([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (user?.role === 'admin') loadCompanies(); }, [user, loadCompanies]);
  useEffect(() => { try { localStorage.setItem('finance_company_id', companyId); } catch { /* ignore */ } }, [companyId]);

  const company = companies.find((c) => c.id === companyId) || companies[0];
  const changed = () => { setRefreshKey((k) => k + 1); loadCompanies(); };
  const updateCompany = (c) => setCompanies((list) => list.map((x) => (x.id === c.id ? { ...x, ...c } : x)));

  if (user === undefined) return <main className="p-6"><Loading /></main>;
  if (!user || user.role !== 'admin') {
    return <main className="flex min-h-[60vh] items-center justify-center p-6"><div className="max-w-sm text-center"><ShieldAlert className="mx-auto h-10 w-10 text-slate-400" /><h1 className="mt-3 text-lg font-semibold">Finance is for MealDrop admins</h1><p className="mt-1 text-sm text-slate-500">You don't have access to this area.</p></div></main>;
  }
  const seed = async () => { setSeeding(true); try { await fin('seed_chart', { company_id: company.id }); toast.success('Chart of accounts ready'); changed(); } catch (e) { toast.error(e.message); } finally { setSeeding(false); } };

  return (
    <main className="min-h-screen bg-slate-50 p-3 pb-24 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-100 p-2.5 text-orange-700"><Wallet className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Finance</h1>
              <p className="text-xs text-slate-500 sm:text-sm">{company ? `${company.legal_name} · ${company.vat_registered ? `VAT ${company.vat_number}` : 'Not VAT registered'} · GBP` : 'Accounts, invoicing and reports'}</p>
            </div>
          </div>
          {companies.length > 1 && <select aria-label="Company" value={company?.id || ''} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{companies.map((c) => <option key={c.id} value={c.id}>{c.trading_name || c.legal_name}</option>)}</select>}
        </header>

        {loading ? <Loading /> : !company ? <CreateCompany onCreated={(id) => { setCompanyId(id); loadCompanies(); }} /> : (
          <>
            {company.locked_until && <p className="flex items-center gap-1.5 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" />Books locked up to {fmtDate(company.locked_until)}</p>}
            {!company.chart_seeded && <Notice tone="warn"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span>Your chart of accounts isn't set up yet. It's needed before anything can be posted.</span><Btn variant="primary" size="sm" busy={seeding} onClick={seed}>Set up standard UK accounts</Btn></div></Notice>}
            <nav className="-mx-3 flex gap-1 overflow-x-auto border-b border-slate-200 px-3 sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:p-1" aria-label="Finance sections">
              {TABS.map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium sm:rounded-lg ' + (tab === id ? 'border-b-2 border-orange-600 text-orange-700 sm:border-0 sm:bg-slate-900 sm:text-white' : 'text-slate-600 hover:text-slate-900 sm:hover:bg-slate-100')}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </nav>
            <div key={company.id}>
              {tab === 'overview' && <OverviewTab company={company} go={setTab} onNewInvoice={() => setNewInvoice(true)} onNewCost={() => setTab('costs')} refreshKey={refreshKey} />}
              {tab === 'invoices' && <InvoicesTab company={company} onChanged={changed} />}
              {tab === 'recurring' && <RecurringTab company={company} onChanged={changed} />}
              {tab === 'customers' && <CustomersTab companyId={company.id} />}
              {tab === 'items' && <ItemsTab companyId={company.id} />}
              {tab === 'costs' && <ExpensesTab company={company} onChanged={changed} />}
              {tab === 'reports' && <ReportsTab company={company} />}
              {tab === 'ledger' && <LedgerTab company={company} />}
              {tab === 'marketplace' && <MarketplaceTab company={company} onCompanyChange={updateCompany} />}
              {tab === 'settings' && <SettingsTab company={company} onCompanyChange={(c) => { updateCompany(c); }} />}
            </div>
            {newInvoice && <InvoiceEditor company={company} onClose={() => setNewInvoice(false)} onSaved={() => { setNewInvoice(false); changed(); setTab('invoices'); }} />}
          </>
        )}
        <p className="pt-4 text-center text-xs text-slate-400">Double-entry books · every change is recorded in the audit trail · not a substitute for advice from your accountant</p>
      </div>
    </main>
  );
}
