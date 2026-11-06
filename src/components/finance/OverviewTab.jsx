import React from 'react';
import { TrendingUp, TrendingDown, Landmark, Clock, AlertTriangle, CheckCircle2, Circle, FileText, ReceiptText } from 'lucide-react';
import { useReport, useRecords } from './financeApi';
import { Btn, Card, Stat, Loading, Notice, Table, Badge, money, fmtDate, displayStatus } from './ui';
import { VatThreshold } from './ReportsTab';

export default function OverviewTab({ company, go, onNewInvoice, onNewCost, refreshKey }) {
  const ov = useReport(company.id, 'overview', {}, [refreshKey]);
  const invoices = useRecords('FinanceInvoice', company.id, '-issue_date', { document_type: 'sales_invoice', status: { $in: ['issued', 'part_paid'] } });
  const items = useRecords('FinanceItem', company.id, 'name');
  const customers = useRecords('FinanceCustomer', company.id, 'name');
  const d = ov.data;
  const steps = [
    ['Company details & registered office', !!(company.company_number && company.address?.line_1), 'settings'],
    ['Bank details for getting paid', !!company.bank_account_number, 'settings'],
    ['Chart of accounts', !!company.chart_seeded, 'settings'],
    ['Price list (products & services)', items.rows.some((i) => Number(i.unit_price) > 0), 'items'],
    ['Customers', customers.rows.length > 0, 'customers'],
  ];
  const setupDone = steps.every((s) => s[1]);
  return (
    <div className="space-y-4">
      {!setupDone && (
        <Card title="Finish setting up" subtitle="A few things before your first invoice.">
          <div className="grid gap-2 sm:grid-cols-2">{steps.map(([label, done, tab]) => (
            <button key={label} type="button" onClick={() => go(tab)} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-left text-sm hover:bg-slate-50">
              {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
              <span className={done ? 'text-slate-500 line-through' : 'font-medium text-slate-900'}>{label}</span>
            </button>
          ))}</div>
        </Card>
      )}
      <div className="flex flex-wrap gap-2"><Btn variant="primary" onClick={onNewInvoice}><FileText className="h-4 w-4" />New invoice</Btn><Btn onClick={onNewCost}><ReceiptText className="h-4 w-4" />Record cost</Btn></div>
      {ov.loading ? <Loading /> : ov.error ? <Notice tone="bad">{ov.error}</Notice> : d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Income this year" value={money(d.income)} note={`Since ${fmtDate(d.fy_start)}`} icon={TrendingUp} />
            <Stat label="Costs this year" value={money(d.expenses)} icon={TrendingDown} />
            <Stat label="Profit this year" value={money(d.net_profit)} tone={d.net_profit >= 0 ? 'good' : 'bad'} note="Before corporation tax" />
            <Stat label="Cash in bank" value={money(d.cash_total)} icon={Landmark} note={d.banks.filter((b) => b.balance).map((b) => `${b.name.replace('Business ', '')}: ${money(b.balance)}`).join(' · ') || 'Per your books'} />
            <Stat label="Customers owe you" value={money(d.debtors)} icon={Clock} />
            <Stat label="Overdue" value={money(d.overdue)} tone={d.overdue > 0 ? 'bad' : 'default'} icon={AlertTriangle} />
            <Stat label="You owe suppliers" value={money(d.creditors)} />
            <Stat label="VAT threshold used" value={`${d.vat.percent}%`} tone={d.vat.status === 'must_register' ? 'bad' : d.vat.status === 'warning' ? 'warn' : 'default'} note={`${money(d.vat.rolling_12_months)} of ${money(d.vat.threshold)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Unpaid invoices" className="lg:col-span-2" actions={<Btn size="sm" variant="ghost" onClick={() => go('invoices')}>View all</Btn>}>
              <Table minWidth={480} rows={invoices.rows.slice(0, 8)} onRowClick={() => go('invoices')} empty="All invoices are paid." columns={[
                { key: 'invoice_number', label: 'Invoice', render: (i) => <span className="font-medium">{i.invoice_number}</span> },
                { key: 'customer_name', label: 'Customer' },
                { key: 'due_date', label: 'Due', render: (i) => fmtDate(i.due_date) },
                { key: 'balance_due', label: 'Owed', right: true, render: (i) => money(i.balance_due) },
                { key: 's', label: '', render: (i) => <Badge status={displayStatus(i)} /> },
              ]} />
            </Card>
            <Card title="VAT registration watch"><VatThreshold d={d.vat} compact /><p className="mt-3 text-xs text-slate-500">Counts sales in the last 12 months. You must register if it goes over the threshold, or if you expect sales over the threshold in the next 30 days alone.</p></Card>
          </div>
        </>
      )}
    </div>
  );
}
