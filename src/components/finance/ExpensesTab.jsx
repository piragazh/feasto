import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Upload, Download, Paperclip } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fin, useRecords, downloadCsv } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, Search, Stat, inputClass, money, fmtDate, today } from './ui';

function ExpenseForm({ company, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({ supplier_name: '', supplier_invoice_number: '', expense_date: today(), description: '', account_code: '6000', gross_amount: '', vat_amount: '', paid: true, payment_date: today(), paid_from_account: '1200', receipt_url: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const costAccounts = accounts.filter((a) => a.status !== 'archived' && (a.type === 'expense' || a.subtype === 'fixed_asset' || a.code === '1000'));
  const payFrom = accounts.filter((a) => a.subtype === 'bank' || a.code === '2500');
  const upload = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); setForm((f) => ({ ...f, receipt_url: file_url })); toast.success('Receipt attached'); }
    catch { toast.error('Could not upload the receipt'); } finally { setUploading(false); }
  };
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await fin('save_expense', { company_id: company.id, ...form, vat_amount: Number(form.vat_amount || 0) }); toast.success('Expense recorded'); onSaved(); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Record a cost" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier *"><input required value={form.supplier_name} onChange={set('supplier_name')} className={inputClass} placeholder="e.g. Screwfix, AWS, Currys" /></Field>
          <Field label="Their invoice / receipt no."><input value={form.supplier_invoice_number} onChange={set('supplier_invoice_number')} className={inputClass} /></Field>
        </div>
        <Field label="What was it for? *"><input required value={form.description} onChange={set('description')} className={inputClass} placeholder="e.g. 43&quot; display for Tilbury Chicken install" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date *"><input type="date" required value={form.expense_date} onChange={set('expense_date')} className={inputClass} /></Field>
          <Field label="Category"><select value={form.account_code} onChange={set('account_code')} className={inputClass}>{costAccounts.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>
          <Field label="Total paid incl. any VAT (£) *"><input type="number" step="0.01" min="0.01" required value={form.gross_amount} onChange={set('gross_amount')} className={inputClass} /></Field>
          <Field label="VAT on receipt (£)" hint={company.vat_registered ? 'Reclaimable — recorded separately' : 'Not reclaimable while you are not VAT registered — included in the cost'}><input type="number" step="0.01" min="0" value={form.vat_amount} onChange={set('vat_amount')} className={inputClass} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.paid} onChange={set('paid')} />Already paid</label>
        {form.paid ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid on"><input type="date" value={form.payment_date} onChange={set('payment_date')} className={inputClass} /></Field>
            <Field label="Paid from" hint="Choose Director's loan if you paid personally"><select value={form.paid_from_account} onChange={set('paid_from_account')} className={inputClass}>{payFrom.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>
          </div>
        ) : <Notice>It will show as money you owe this supplier until you mark it paid.</Notice>}
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><Upload className="h-4 w-4" />{uploading ? 'Uploading…' : form.receipt_url ? 'Replace receipt' : 'Attach receipt'}<input type="file" accept="image/*,application/pdf" className="hidden" onChange={upload} /></label>
          {form.receipt_url && <a href={form.receipt_url} target="_blank" rel="noreferrer" className="text-sm text-orange-700 underline">View</a>}
        </div>
        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputClass} /></Field>
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn type="submit" variant="primary" busy={busy}>Save cost</Btn></div>
      </form>
    </Modal>
  );
}

function ExpenseDetail({ expense, accounts, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState('1200');
  const [date, setDate] = useState(today());
  const payFrom = accounts.filter((a) => a.subtype === 'bank' || a.code === '2500');
  const run = async (action, payload, msg) => { setBusy(true); try { await fin(action, payload); toast.success(msg); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <Modal title={expense.description} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between"><span className="text-2xl font-semibold">{money(expense.gross_amount)}</span><Badge status={expense.payment_status} /></div>
        <p className="text-slate-600">{expense.supplier_name}{expense.supplier_invoice_number ? ` · ${expense.supplier_invoice_number}` : ''} · {fmtDate(expense.expense_date)}</p>
        <p className="text-slate-600">{expense.account_code} · {expense.category}{expense.vat_amount > 0 ? ` · VAT on receipt ${money(expense.vat_amount)}${expense.vat_reclaimable ? ' (reclaimed)' : ' (in cost)'}` : ''}</p>
        {expense.payment_status === 'paid' && <p className="text-slate-600">Paid {fmtDate(expense.payment_date)} from {accounts.find((a) => a.code === expense.paid_from_account)?.name || expense.paid_from_account}</p>}
        {expense.receipt_url && <a href={expense.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-orange-700 underline"><Paperclip className="h-4 w-4" />Receipt</a>}
        {expense.notes && <p className="rounded bg-slate-50 p-2">{expense.notes}</p>}
        {expense.payment_status === 'unpaid' && (
          <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 sm:items-end">
            <Field label="Paid on"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
            <Field label="From"><select value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass}>{payFrom.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</select></Field>
            <Btn variant="primary" busy={busy} onClick={() => run('pay_expense', { id: expense.id, payment_date: date, from_account: from }, 'Marked paid')}>Mark paid</Btn>
          </div>
        )}
        {expense.payment_status !== 'void' && <div className="flex justify-end"><Btn variant="danger" busy={busy} onClick={() => { const reason = window.prompt('Why void this cost?'); if (reason) run('void_expense', { id: expense.id, reason }, 'Expense voided'); }}>Void</Btn></div>}
      </div>
    </Modal>
  );
}

export default function ExpensesTab({ company, onChanged }) {
  const expenses = useRecords('FinanceExpense', company.id, '-expense_date');
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState('');
  const live = expenses.rows.filter((e) => e.payment_status !== 'void');
  const totals = useMemo(() => ({ all: live.reduce((s, e) => s + Number(e.gross_amount || 0), 0), unpaid: live.filter((e) => e.payment_status === 'unpaid').reduce((s, e) => s + Number(e.gross_amount || 0), 0), missing: live.filter((e) => !e.receipt_url).length }), [live]);
  const rows = expenses.rows.filter((e) => [e.supplier_name, e.description, e.category].join(' ').toLowerCase().includes(search.toLowerCase()));
  const refresh = () => { expenses.reload(); onChanged?.(); setOpen(null); };
  const exportCsv = () => downloadCsv(`costs-${today()}.csv`, [['Date', 'Supplier', 'Ref', 'Description', 'Account', 'Category', 'Total', 'VAT on receipt', 'Status', 'Paid on', 'Receipt'], ...rows.map((e) => [e.expense_date, e.supplier_name, e.supplier_invoice_number, e.description, e.account_code, e.category, e.gross_amount, e.vat_amount, e.payment_status, e.payment_date, e.receipt_url])]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Costs recorded" value={money(totals.all)} note={`${live.length} item(s)`} />
        <Stat label="Unpaid bills" value={money(totals.unpaid)} tone={totals.unpaid > 0 ? 'warn' : 'default'} />
        <Stat label="Missing receipts" value={String(totals.missing)} tone={totals.missing ? 'warn' : 'good'} note="Keep receipts for 6 years" />
      </div>
      <Card title="Costs & bills" subtitle="Everything the business spends: equipment, hosting, fuel, software, subcontractors."
        actions={<><Btn onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />CSV</Btn><Btn variant="primary" onClick={() => setAdding(true)} disabled={!accounts.rows.length}><Plus className="h-4 w-4" />Record cost</Btn></>}>
        <div className="mb-3"><Search value={search} onChange={setSearch} placeholder="Search supplier or description" /></div>
        {expenses.loading ? <Loading /> : (
          <Table rows={rows} onRowClick={setOpen} empty="No costs yet."
            columns={[
              { key: 'expense_date', label: 'Date', render: (e) => fmtDate(e.expense_date) },
              { key: 'supplier_name', label: 'Supplier', render: (e) => <div><p>{e.supplier_name || '—'}</p><p className="text-xs text-slate-500">{e.description}</p></div> },
              { key: 'category', label: 'Category', render: (e) => <span className="text-xs">{e.category}</span> },
              { key: 'gross_amount', label: 'Amount', right: true, render: (e) => money(e.gross_amount) },
              { key: 'r', label: '', render: (e) => (e.receipt_url ? <Paperclip className="h-4 w-4 text-slate-400" /> : null) },
              { key: 'payment_status', label: 'Status', render: (e) => <Badge status={e.payment_status} /> },
            ]} />
        )}
      </Card>
      {adding && <ExpenseForm company={company} accounts={accounts.rows} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} />}
      {open && <ExpenseDetail expense={open} accounts={accounts.rows} onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  );
}
