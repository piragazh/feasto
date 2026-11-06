import React, { useState } from 'react';
import { Download, Package } from 'lucide-react';
import { toast } from 'sonner';
import { fin, useReport, useRecords, listAll, downloadCsv } from './financeApi';
import { Btn, Card, Field, Loading, Notice, Table, inputClass, money, fmtDate, today } from './ui';

const REPORTS = [['profit_and_loss', 'Profit & loss'], ['balance_sheet', 'Balance sheet'], ['aged_debtors', 'Who owes you'], ['trial_balance', 'Trial balance'], ['general_ledger', 'Account history'], ['vat_threshold', 'VAT threshold']];

function fyStart(company, asOf) {
  const m = String(company.accounting_year_start_month || 4).padStart(2, '0'), d = String(company.accounting_year_start_day || 1).padStart(2, '0');
  const y = Number(asOf.slice(0, 4)); const c = `${y}-${m}-${d}`;
  return c <= asOf ? c : `${y - 1}-${m}-${d}`;
}

function Section({ title, section, negative }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {section.rows.length === 0 && <p className="text-sm text-slate-400">None</p>}
      {section.rows.map((r) => <div key={r.code} className="flex justify-between text-sm"><span className="text-slate-700">{r.code} {r.name}</span><span className="tabular-nums">{negative ? `(${money(r.amount)})` : money(r.amount)}</span></div>)}
      <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-medium"><span>Total {title.toLowerCase()}</span><span className="tabular-nums">{money(section.total)}</span></div>
    </div>
  );
}
const Total = ({ label, value, strong }) => <div className={'flex justify-between rounded-lg px-3 py-2 ' + (strong ? 'bg-slate-900 text-white' : 'bg-slate-100')}><span className="font-semibold">{label}</span><span className="font-semibold tabular-nums">{money(value)}</span></div>;

function sectionRows(name, s) { return [[name, '', ''], ...s.rows.map((r) => ['', `${r.code} ${r.name}`, r.amount]), ['', `Total ${name}`, s.total]]; }

export default function ReportsTab({ company }) {
  const [type, setType] = useState('profit_and_loss');
  const [asOf, setAsOf] = useState(today());
  const [from, setFrom] = useState(fyStart(company, today()));
  const [account, setAccount] = useState('1200');
  const [packing, setPacking] = useState(false);
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const params = { as_of: asOf, ...(['profit_and_loss', 'general_ledger'].includes(type) ? { from } : {}), ...(type === 'general_ledger' ? { account_code: account } : {}) };
  const rep = useReport(company.id, type, params);
  const d = rep.data;

  const exportCsv = () => {
    if (!d) return;
    let rows = [];
    if (type === 'profit_and_loss') rows = [['Profit and loss', `${d.from} to ${d.to}`, ''], ...sectionRows('Sales', d.sales), ...sectionRows('Cost of sales', d.cost_of_sales), ['', 'Gross profit', d.gross_profit], ...sectionRows('Other income', d.other_income), ...sectionRows('Overheads', d.overheads), ['', 'Profit before tax', d.profit_before_tax], ...sectionRows('Tax', d.tax), ['', 'Net profit', d.net_profit]];
    if (type === 'balance_sheet') rows = [['Balance sheet', d.as_of, ''], ...sectionRows('Fixed assets', d.fixed_assets), ...sectionRows('Current assets', d.current_assets), ...sectionRows('Liabilities', d.liabilities), ['', 'Net assets', d.net_assets], ...sectionRows('Equity', d.equity), ['', 'Profit to date', d.profit_to_date], ['', 'Total equity', d.total_equity]];
    if (type === 'trial_balance') rows = [['Code', 'Account', 'Debit', 'Credit'], ...d.rows.map((r) => [r.code, r.name, r.debit, r.credit]), ['', 'Total', d.total_debit, d.total_credit]];
    if (type === 'aged_debtors') rows = [['Customer', 'Current', '1-30', '31-60', '61-90', '90+', 'Total'], ...d.rows.map((r) => [r.customer_name, r.current, r['1_30'], r['31_60'], r['61_90'], r.over_90, r.total])];
    if (type === 'general_ledger') rows = [['Date', 'Entry', 'Description', 'Debit', 'Credit', 'Balance'], ['', '', 'Opening balance', '', '', d.opening], ...d.rows.map((r) => [r.date, r.entry_number, r.description, r.debit, r.credit, r.balance])];
    if (type === 'vat_threshold') rows = [['Month', 'Taxable turnover'], ...d.months.map((m) => [m.month, m.turnover]), ['Rolling 12 months', d.rolling_12_months], ['Threshold', d.threshold]];
    downloadCsv(`${type}-${asOf}.csv`, rows);
  };

  const accountantPack = async () => {
    setPacking(true);
    try {
      const start = fyStart(company, asOf);
      const [tb, pnl, bs] = await Promise.all(['trial_balance', 'profit_and_loss', 'balance_sheet'].map((t) => fin('report', { company_id: company.id, type: t, as_of: asOf, from: start }).then((r) => r.report)));
      const entries = (await listAll('FinanceLedgerEntry', { company_id: company.id }, 'entry_date')).filter((e) => e.entry_date <= asOf);
      downloadCsv(`trial-balance-${asOf}.csv`, [['Code', 'Account', 'Debit', 'Credit'], ...tb.rows.map((r) => [r.code, r.name, r.debit, r.credit]), ['', 'Total', tb.total_debit, tb.total_credit]]);
      downloadCsv(`profit-and-loss-${start}-to-${asOf}.csv`, [['Section', 'Account', 'Amount'], ...sectionRows('Sales', pnl.sales), ...sectionRows('Cost of sales', pnl.cost_of_sales), ...sectionRows('Other income', pnl.other_income), ...sectionRows('Overheads', pnl.overheads), ['', 'Net profit', pnl.net_profit]]);
      downloadCsv(`balance-sheet-${asOf}.csv`, [['Section', 'Account', 'Amount'], ...sectionRows('Fixed assets', bs.fixed_assets), ...sectionRows('Current assets', bs.current_assets), ...sectionRows('Liabilities', bs.liabilities), ...sectionRows('Equity', bs.equity), ['', 'Profit to date', bs.profit_to_date]]);
      downloadCsv(`journal-${asOf}.csv`, [['Date', 'Entry', 'Type', 'Reference', 'Description', 'Account code', 'Account', 'Debit', 'Credit', 'Memo'], ...entries.flatMap((e) => (e.lines || []).map((l) => [e.entry_date, e.entry_number, e.source_type, e.source_reference, e.description, l.account_code, l.account_name, l.debit, l.credit, l.memo]))]);
      toast.success('Accountant pack downloaded (4 CSV files)');
    } catch (e) { toast.error(e.message); } finally { setPacking(false); }
  };

  return (
    <div className="space-y-4">
      <Card title="Reports" subtitle="Built from your posted ledger — every invoice, payment and cost."
        actions={<><Btn onClick={exportCsv} disabled={!d}><Download className="h-4 w-4" />CSV</Btn><Btn variant="dark" onClick={accountantPack} busy={packing}><Package className="h-4 w-4" />Accountant pack</Btn></>}>
        <div className="mb-4 flex gap-1 overflow-x-auto">{REPORTS.map(([v, l]) => <button key={v} type="button" onClick={() => setType(v)} className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ' + (type === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{l}</button>)}</div>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {['profit_and_loss', 'general_ledger'].includes(type) && <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} /></Field>}
          <Field label={['profit_and_loss', 'general_ledger'].includes(type) ? 'To' : 'As at'}><input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputClass} /></Field>
          {type === 'general_ledger' && <Field label="Account"><select value={account} onChange={(e) => setAccount(e.target.value)} className={inputClass}>{accounts.rows.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></Field>}
        </div>
        {rep.loading ? <Loading /> : rep.error ? <Notice tone="bad">{rep.error}</Notice> : d && (
          <>
            {type === 'profit_and_loss' && <div className="max-w-2xl space-y-4">
              <Section title="Sales" section={d.sales} /><Section title="Cost of sales" section={d.cost_of_sales} negative />
              <Total label="Gross profit" value={d.gross_profit} />
              <Section title="Other income" section={d.other_income} /><Section title="Overheads" section={d.overheads} negative />
              <Total label="Profit before tax" value={d.profit_before_tax} />
              {d.tax.rows.length > 0 && <Section title="Tax" section={d.tax} negative />}
              <Total label="Net profit" value={d.net_profit} strong />
            </div>}
            {type === 'balance_sheet' && <div className="max-w-2xl space-y-4">
              {!d.balanced && <Notice tone="bad">The balance sheet doesn't balance — check opening balances.</Notice>}
              <Section title="Fixed assets" section={d.fixed_assets} /><Section title="Current assets" section={d.current_assets} /><Section title="Liabilities" section={d.liabilities} negative />
              <Total label="Net assets" value={d.net_assets} strong />
              <Section title="Equity" section={d.equity} />
              <div className="flex justify-between text-sm"><span>Profit to date (not yet moved to retained earnings)</span><span className="tabular-nums">{money(d.profit_to_date)}</span></div>
              <Total label="Total equity" value={d.total_equity} strong />
            </div>}
            {type === 'trial_balance' && <>
              <Table rows={[...d.rows, { code: '', name: 'Total', debit: d.total_debit, credit: d.total_credit, id: 'total' }]} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'debit', label: 'Debit', right: true, render: (r) => (r.debit ? money(r.debit) : '') }, { key: 'credit', label: 'Credit', right: true, render: (r) => (r.credit ? money(r.credit) : '') }]} empty="No postings yet." />
              <p className={'mt-2 text-sm ' + (d.total_debit === d.total_credit ? 'text-emerald-700' : 'text-red-700')}>{d.total_debit === d.total_credit ? 'Debits equal credits — the books balance.' : 'Out of balance!'}</p>
            </>}
            {type === 'aged_debtors' && <Table rows={d.rows.map((r) => ({ ...r, id: r.customer_id }))} empty="Nobody owes you money." columns={[
              { key: 'customer_name', label: 'Customer' }, { key: 'current', label: 'Not due', right: true, render: (r) => money(r.current) }, { key: '1_30', label: '1–30 days', right: true, render: (r) => money(r['1_30']) },
              { key: '31_60', label: '31–60', right: true, render: (r) => money(r['31_60']) }, { key: '61_90', label: '61–90', right: true, render: (r) => money(r['61_90']) }, { key: 'over_90', label: '90+', right: true, render: (r) => <span className={r.over_90 ? 'font-semibold text-red-700' : ''}>{money(r.over_90)}</span> }, { key: 'total', label: 'Total', right: true, render: (r) => <strong>{money(r.total)}</strong> },
            ]} />}
            {type === 'general_ledger' && <>
              <p className="mb-2 text-sm text-slate-600">Opening balance {money(d.opening)} · Closing {money(d.closing)}</p>
              <Table rows={d.rows.map((r, i) => ({ ...r, id: i }))} empty="No movements in this period." columns={[{ key: 'date', label: 'Date', render: (r) => fmtDate(r.date) }, { key: 'entry_number', label: 'Entry' }, { key: 'description', label: 'Description', render: (r) => <div><p>{r.description}</p>{r.memo && <p className="text-xs text-slate-500">{r.memo}</p>}</div> }, { key: 'debit', label: 'Debit', right: true, render: (r) => (r.debit ? money(r.debit) : '') }, { key: 'credit', label: 'Credit', right: true, render: (r) => (r.credit ? money(r.credit) : '') }, { key: 'balance', label: 'Balance', right: true, render: (r) => money(r.balance) }]} />
            </>}
            {type === 'vat_threshold' && <VatThreshold d={d} />}
          </>
        )}
      </Card>
      <Card title="Filing with HMRC and Companies House">
        <div className="space-y-2 text-sm text-slate-600">
          <p><strong>VAT:</strong> you're not VAT registered, so there's no VAT return to file. Keep an eye on the VAT threshold report. You must register within 30 days of the end of the month your rolling 12-month sales pass the threshold.</p>
          <p><strong>Year end:</strong> after your year end, lock the period in Settings and download the Accountant pack. Your accountant (or filing software) uses it to prepare the Corporation Tax return (CT600) and the annual accounts for Companies House.</p>
          <p><strong>Records:</strong> keep invoices, receipts and bank statements for at least 6 years.</p>
        </div>
      </Card>
    </div>
  );
}

export function VatThreshold({ d, compact }) {
  const tone = d.status === 'must_register' ? 'bad' : d.status === 'warning' ? 'warn' : 'good';
  const max = Math.max(...d.months.map((m) => m.turnover), 1);
  return (
    <div className="space-y-3">
      {d.status === 'registered' ? <Notice tone="good">VAT registered.</Notice> : (
        <Notice tone={tone}>
          {d.status === 'must_register' ? <>Your sales in the last 12 months are <strong>{money(d.rolling_12_months)}</strong>, over the {money(d.threshold)} VAT threshold. You must register with HMRC within 30 days of the end of the month you went over. Speak to your accountant now.</> :
            d.status === 'warning' ? <>Rolling 12-month sales are {money(d.rolling_12_months)} ({d.percent}% of the threshold). You have {money(d.headroom)} of room left.</> :
              <>Rolling 12-month sales: {money(d.rolling_12_months)} — {d.percent}% of the {money(d.threshold)} VAT threshold. {money(d.headroom)} of room left.</>}
        </Notice>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className={'h-full ' + (tone === 'bad' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, d.percent)}%` }} /></div>
      {!compact && <div className="flex h-32 items-end gap-1">{d.months.map((m) => <div key={m.month} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-orange-400" style={{ height: `${(m.turnover / max) * 100}%`, minHeight: m.turnover ? 2 : 0 }} title={`${m.month}: ${money(m.turnover)}`} /><span className="text-[10px] text-slate-500">{m.month.slice(5)}</span></div>)}</div>}
    </div>
  );
}
