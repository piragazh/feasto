import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Download, Send, Ban, CreditCard, FileMinus, Pencil, Trash2, Undo2, CheckCircle2, UserPlus } from 'lucide-react';
import { fin, useRecords, listAll, downloadCsv } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, Search, inputClass, money, fmtDate, today, displayStatus, isOverdue } from './ui';
import LineEditor, { emptyLine, lineNet, cleanLines } from './LineEditor';
import { CustomerForm } from './CustomersTab';
import { downloadInvoicePdf } from './invoicePdf';
import { roundMoney } from './financeMath';

const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export function InvoiceEditor({ company, invoice, onClose, onSaved }) {
  const customers = useRecords('FinanceCustomer', company.id, 'name');
  const items = useRecords('FinanceItem', company.id, 'name');
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const [form, setForm] = useState(() => ({
    customer_id: invoice?.customer_id || '', issue_date: invoice?.issue_date || today(), due_date: invoice?.due_date || '',
    supply_date: invoice?.supply_date || '', reference: invoice?.reference || '', notes: invoice?.notes || '', internal_notes: invoice?.internal_notes || '',
  }));
  const [lines, setLines] = useState(invoice?.lines?.length ? invoice.lines.map((l) => ({ ...emptyLine(), ...l })) : [emptyLine()]);
  const [busy, setBusy] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const customer = customers.rows.find((c) => c.id === form.customer_id);
  const terms = Number(customer?.payment_terms_days ?? company.payment_terms_days ?? 14);
  const due = form.due_date || addDays(form.issue_date || today(), terms);
  const total = roundMoney(lines.reduce((s, l) => s + lineNet(l), 0));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  useEffect(() => { if (!invoice && !form.customer_id && customers.rows.length === 1) setForm((f) => ({ ...f, customer_id: customers.rows[0].id })); }, [customers.rows]); // eslint-disable-line

  const save = async (mode) => {
    if (!form.customer_id) return toast.error('Choose a customer');
    const clean = cleanLines(lines);
    if (!clean.length) return toast.error('Add at least one line');
    if (mode !== 'draft' && !(total > 0)) return toast.error('Invoice total must be above £0');
    if (mode === 'send' && !customer?.email) return toast.error('This customer has no invoice email — add one first');
    setBusy(mode);
    try {
      const { invoice: saved } = await fin('save_draft', { company_id: company.id, id: invoice?.id, ...form, due_date: form.due_date || undefined, lines: clean, issue: mode !== 'draft', send: mode === 'send' });
      toast.success(mode === 'draft' ? 'Draft saved' : mode === 'send' ? `Invoice ${saved.invoice_number} issued and emailed` : `Invoice ${saved.invoice_number} issued`);
      onSaved(saved);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <Modal title={invoice ? 'Edit draft invoice' : 'New invoice'} onClose={onClose} wide>
      {customers.loading || accounts.loading ? <Loading /> : !accounts.rows.length ? <Notice tone="warn">Set up your chart of accounts in Settings first.</Notice> : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Customer *" className="sm:col-span-2">
              <div className="flex gap-2">
                <select value={form.customer_id} onChange={set('customer_id')} className={inputClass}>
                  <option value="">Choose customer…</option>
                  {customers.rows.filter((c) => c.status !== 'archived').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Btn className="mt-1 shrink-0" onClick={() => setNewCustomer(true)} aria-label="New customer"><UserPlus className="h-4 w-4" /></Btn>
              </div>
              {customer && <span className="mt-1 block text-xs font-normal text-slate-500">{customer.email || 'No email on file'} · {terms} day terms</span>}
            </Field>
            <Field label="Job / PO reference"><input value={form.reference} onChange={set('reference')} className={inputClass} placeholder="e.g. Media screen install – Tilbury" /></Field>
            <Field label="Invoice date"><input type="date" value={form.issue_date} onChange={set('issue_date')} className={inputClass} /></Field>
            <Field label="Due date" hint={form.due_date ? '' : `Auto: ${fmtDate(due)}`}><input type="date" value={form.due_date} onChange={set('due_date')} className={inputClass} /></Field>
            <Field label="Work done on" hint="If different from invoice date"><input type="date" value={form.supply_date} onChange={set('supply_date')} className={inputClass} /></Field>
          </div>

          <LineEditor lines={lines} setLines={setLines} items={items.rows} accounts={accounts.rows} />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid flex-1 gap-3 sm:max-w-md">
              <Field label="Notes on invoice"><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputClass} placeholder="e.g. 12-month warranty on equipment" /></Field>
              <Field label="Internal notes (not shown)"><textarea rows={2} value={form.internal_notes} onChange={set('internal_notes')} className={inputClass} /></Field>
            </div>
            <div className="rounded-xl bg-slate-900 p-4 text-white sm:min-w-[240px]">
              <p className="text-sm text-slate-300">Total</p>
              <p className="text-3xl font-semibold tabular-nums">{money(total)}</p>
              <p className="mt-1 text-xs text-slate-400">{company.vat_registered ? 'VAT added per line' : 'No VAT — not VAT registered'}</p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn onClick={() => save('draft')} busy={busy === 'draft'} disabled={!!busy}>Save draft</Btn>
            <Btn variant="dark" onClick={() => save('issue')} busy={busy === 'issue'} disabled={!!busy}><CheckCircle2 className="h-4 w-4" />Issue</Btn>
            <Btn variant="primary" onClick={() => save('send')} busy={busy === 'send'} disabled={!!busy}><Send className="h-4 w-4" />Issue & email</Btn>
          </div>
          <p className="text-right text-xs text-slate-500">Issuing gives it the next number ({company.invoice_prefix || 'INV-'}{String(company.next_invoice_number || 1).padStart(4, '0')}) and posts it to your accounts. Issued invoices can't be edited — use a credit note.</p>
        </div>
      )}
      {newCustomer && <CustomerForm companyId={company.id} onClose={() => setNewCustomer(false)} onSaved={(c) => { setNewCustomer(false); customers.reload(); setForm((f) => ({ ...f, customer_id: c.id })); }} />}
    </Modal>
  );
}

function ActionForm({ title, onClose, onSubmit, busy, children, submitLabel, danger }) {
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
        {children}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn type="submit" variant={danger ? 'danger' : 'primary'} busy={busy}>{submitLabel}</Btn></div>
      </form>
    </Modal>
  );
}

export function InvoiceDetail({ company, invoiceId, onClose, onChanged }) {
  const [inv, setInv] = useState(null);
  const [payments, setPayments] = useState([]);
  const [credits, setCredits] = useState([]);
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({});
  const load = async () => {
    const [rows, pays, cns] = await Promise.all([
      listAll('FinanceInvoice', { id: invoiceId }),
      listAll('FinancePayment', { invoice_id: invoiceId }, '-payment_date'),
      listAll('FinanceInvoice', { credit_of_invoice_id: invoiceId }, '-issue_date'),
    ]);
    setInv(rows[0] || null); setPayments(pays); setCredits(cns);
  };
  useEffect(() => { load(); }, [invoiceId]); // eslint-disable-line
  const run = async (name, payload, msg) => {
    setBusy(true);
    try { await fin(name, payload); toast.success(msg); setAction(''); await load(); onChanged?.(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (!inv) return <Modal title="Invoice" onClose={onClose}><Loading /></Modal>;
  if (action === 'edit') return <InvoiceEditor company={company} invoice={inv} onClose={() => setAction('')} onSaved={() => { setAction(''); load(); onChanged?.(); }} />;
  const isCN = inv.document_type === 'credit_note';
  const open = ['issued', 'part_paid'].includes(inv.status);
  const st = displayStatus(inv);
  const setField = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal title={`${isCN ? 'Credit note' : inv.status === 'draft' ? 'Draft invoice' : 'Invoice'} ${inv.invoice_number || ''}`} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><p className="text-lg font-semibold text-slate-900">{inv.customer_name}</p><Badge status={st} /></div>
            <p className="text-sm text-slate-500">{fmtDate(inv.issue_date)}{!isCN && inv.due_date ? ` · due ${fmtDate(inv.due_date)}` : ''}{inv.reference ? ` · ${inv.reference}` : ''}</p>
            {isCN && inv.credit_of_invoice_number && <p className="text-sm text-slate-500">Credits invoice {inv.credit_of_invoice_number}</p>}
            {inv.sent_at && <p className="text-xs text-slate-500">Emailed to {inv.sent_to} on {fmtDate(inv.sent_at)}</p>}
            {inv.status === 'void' && <p className="text-sm text-red-700">Voided: {inv.void_reason}</p>}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-3xl font-semibold tabular-nums">{money(inv.gross_total)}</p>
            {!isCN && inv.status !== 'draft' && inv.status !== 'void' && <p className={'text-sm ' + (inv.balance_due > 0 ? (isOverdue(inv) ? 'text-red-700' : 'text-slate-600') : 'text-emerald-700')}>{inv.balance_due > 0 ? `${money(inv.balance_due)} still owed` : 'Fully settled'}</p>}
            {isCN && inv.balance_due > 0 && <p className="text-sm text-amber-700">{money(inv.balance_due)} credit to refund</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => downloadInvoicePdf(inv, company)}><Download className="h-4 w-4" />PDF</Btn>
          {inv.status === 'draft' && <>
            <Btn onClick={() => setAction('edit')}><Pencil className="h-4 w-4" />Edit</Btn>
            <Btn variant="dark" busy={busy} onClick={() => run('issue_invoice', { id: inv.id }, 'Invoice issued')}><CheckCircle2 className="h-4 w-4" />Issue</Btn>
            <Btn variant="danger" onClick={() => { if (window.confirm('Delete this draft?')) run('delete_draft', { id: inv.id }, 'Draft deleted').then(onClose); }}><Trash2 className="h-4 w-4" />Delete</Btn>
          </>}
          {inv.status !== 'draft' && inv.status !== 'void' && <Btn onClick={() => { setF({ to: inv.sent_to || inv.customer_email || '', message: '' }); setAction('send'); }}><Send className="h-4 w-4" />{inv.sent_at ? 'Resend' : 'Email'}</Btn>}
          {!isCN && open && <Btn variant="primary" onClick={() => { setF({ amount: inv.balance_due, payment_date: today(), method: 'bank_transfer', reference: '' }); setAction('pay'); }}><CreditCard className="h-4 w-4" />Record payment</Btn>}
          {!isCN && ['issued', 'part_paid', 'paid'].includes(inv.status) && roundMoney(inv.gross_total - (inv.credited_amount || 0)) > 0 && <Btn onClick={() => { setF({ amount: roundMoney(inv.gross_total - (inv.credited_amount || 0)), reason: '', date: today() }); setAction('credit'); }}><FileMinus className="h-4 w-4" />Credit note</Btn>}
          {!isCN && inv.status === 'issued' && !(inv.amount_paid > 0) && !(inv.credited_amount > 0) && <Btn variant="danger" onClick={() => { setF({ reason: '' }); setAction('void'); }}><Ban className="h-4 w-4" />Void</Btn>}
          {isCN && inv.balance_due > 0 && <Btn variant="primary" onClick={() => { setF({ amount: inv.balance_due, date: today(), method: 'bank_transfer', reference: '' }); setAction('refund'); }}><Undo2 className="h-4 w-4" />Record refund</Btn>}
        </div>

        <Table minWidth={560} rows={inv.lines || []} columns={[
          { key: 'description', label: 'Description', className: 'whitespace-pre-line' },
          { key: 'quantity', label: 'Qty', right: true, render: (l) => `${l.quantity} ${l.unit || ''}` },
          { key: 'unit_price', label: 'Price', right: true, render: (l) => money(l.unit_price) },
          { key: 'discount_percent', label: 'Disc', right: true, render: (l) => (l.discount_percent ? `${l.discount_percent}%` : '') },
          { key: 'net_amount', label: 'Amount', right: true, render: (l) => money(l.net_amount) },
        ]} />
        <div className="ml-auto max-w-xs space-y-1 text-sm">
          {company.vat_registered && <><div className="flex justify-between"><span className="text-slate-500">Net</span><span>{money(inv.net_total)}</span></div><div className="flex justify-between"><span className="text-slate-500">VAT</span><span>{money(inv.vat_total)}</span></div></>}
          <div className="flex justify-between font-semibold"><span>Total</span><span>{money(inv.gross_total)}</span></div>
          {inv.amount_paid > 0 && <div className="flex justify-between"><span className="text-slate-500">{isCN ? 'Refunded' : 'Paid'}</span><span>-{money(inv.amount_paid)}</span></div>}
          {!isCN && inv.credited_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">Credited</span><span>-{money(inv.credited_amount)}</span></div>}
        </div>
        {inv.notes && <p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{inv.notes}</p>}
        {inv.internal_notes && <p className="text-xs text-slate-500">Internal: {inv.internal_notes}</p>}

        {(payments.length > 0 || credits.length > 0) && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">History</h3>
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <span>{fmtDate(p.payment_date)} · Payment {money(p.amount)} · {p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                {p.status === 'reversed' ? <Badge status="reversed" /> : <Btn size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Why reverse this payment? (e.g. bounced, entered in error)'); if (reason) run('reverse_payment', { payment_id: p.id, reason }, 'Payment reversed'); }}>Reverse</Btn>}
              </div>
            ))}
            {credits.map((c) => <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">{fmtDate(c.issue_date)} · Credit note {c.invoice_number} {money(c.gross_total)} — {c.notes}</div>)}
          </div>
        )}
      </div>

      {action === 'pay' && (
        <ActionForm title="Record payment received" onClose={() => setAction('')} busy={busy} submitLabel="Save payment" onSubmit={() => run('record_payment', { invoice_id: inv.id, ...f }, 'Payment recorded')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (£)"><input type="number" step="0.01" min="0.01" max={inv.balance_due} required value={f.amount} onChange={setField('amount')} className={inputClass} /></Field>
            <Field label="Date received"><input type="date" required value={f.payment_date} onChange={setField('payment_date')} className={inputClass} /></Field>
            <Field label="Method"><select value={f.method} onChange={setField('method')} className={inputClass}><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="direct_debit">Direct debit</option><option value="stripe">Stripe</option><option value="cash">Cash</option><option value="other">Other</option></select></Field>
            <Field label="Reference"><input value={f.reference} onChange={setField('reference')} className={inputClass} placeholder="Bank statement ref" /></Field>
          </div>
        </ActionForm>
      )}
      {action === 'credit' && (
        <ActionForm title="Raise a credit note" onClose={() => setAction('')} busy={busy} submitLabel="Issue credit note" onSubmit={() => run('create_credit_note', { invoice_id: inv.id, reason: f.reason, date: f.date, lines: [{ description: `Credit against ${inv.invoice_number}: ${f.reason}`, quantity: 1, unit_price: Number(f.amount), account_code: inv.lines?.[0]?.account_code || '4020' }] }, 'Credit note issued')}>
          <Notice>Use a credit note to cancel or reduce an issued invoice. If the customer has already paid, the credit becomes a refund you owe them.</Notice>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Credit amount (£)" hint={`Max ${money(roundMoney(inv.gross_total - (inv.credited_amount || 0)))}`}><input type="number" step="0.01" min="0.01" required value={f.amount} onChange={setField('amount')} className={inputClass} /></Field>
            <Field label="Date"><input type="date" required value={f.date} onChange={setField('date')} className={inputClass} /></Field>
          </div>
          <Field label="Reason (shown on credit note)"><input required value={f.reason} onChange={setField('reason')} className={inputClass} placeholder="e.g. Faulty bracket returned" /></Field>
        </ActionForm>
      )}
      {action === 'void' && (
        <ActionForm danger title={`Void ${inv.invoice_number}`} onClose={() => setAction('')} busy={busy} submitLabel="Void invoice" onSubmit={() => run('void_invoice', { id: inv.id, reason: f.reason }, 'Invoice voided')}>
          <Notice tone="warn">Voiding keeps the number in your records (marked void) and reverses it in your accounts. Only use it for invoices issued in error.</Notice>
          <Field label="Reason"><input required value={f.reason} onChange={setField('reason')} className={inputClass} /></Field>
        </ActionForm>
      )}
      {action === 'send' && (
        <ActionForm title="Email invoice" onClose={() => setAction('')} busy={busy} submitLabel="Send" onSubmit={() => run('send_invoice', { id: inv.id, to: f.to, message: f.message }, 'Invoice emailed')}>
          <Field label="To"><input type="email" required value={f.to} onChange={setField('to')} className={inputClass} /></Field>
          <Field label="Message (optional)"><textarea rows={3} value={f.message} onChange={setField('message')} className={inputClass} placeholder="Hi, please find your invoice below. Thanks!" /></Field>
          <p className="text-xs text-slate-500">The invoice is included in the email body. Download the PDF if you also want to attach it yourself.</p>
        </ActionForm>
      )}
      {action === 'refund' && (
        <ActionForm title="Record refund paid to customer" onClose={() => setAction('')} busy={busy} submitLabel="Save refund" onSubmit={() => run('refund_credit', { credit_note_id: inv.id, ...f }, 'Refund recorded')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount (£)"><input type="number" step="0.01" min="0.01" max={inv.balance_due} required value={f.amount} onChange={setField('amount')} className={inputClass} /></Field>
            <Field label="Date paid"><input type="date" required value={f.date} onChange={setField('date')} className={inputClass} /></Field>
            <Field label="Paid from"><select value={f.method} onChange={setField('method')} className={inputClass}><option value="bank_transfer">Bank account</option><option value="stripe">Stripe</option><option value="cash">Cash</option></select></Field>
            <Field label="Reference"><input value={f.reference} onChange={setField('reference')} className={inputClass} /></Field>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

const FILTERS = [['all', 'All'], ['draft', 'Drafts'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['credit', 'Credit notes'], ['void', 'Void']];

export default function InvoicesTab({ company, onChanged }) {
  const invoices = useRecords('FinanceInvoice', company.id, '-created_date');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const rows = useMemo(() => invoices.rows.filter((i) => {
    const isCN = i.document_type === 'credit_note';
    if (filter === 'credit') { if (!isCN) return false; } else if (isCN && filter !== 'all') return false;
    if (filter === 'draft' && i.status !== 'draft') return false;
    if (filter === 'unpaid' && !['issued', 'part_paid'].includes(i.status)) return false;
    if (filter === 'overdue' && !isOverdue(i)) return false;
    if (filter === 'paid' && i.status !== 'paid') return false;
    if (filter === 'void' && i.status !== 'void') return false;
    return [i.invoice_number, i.customer_name, i.reference].join(' ').toLowerCase().includes(search.toLowerCase());
  }), [invoices.rows, filter, search]);
  const unpaid = invoices.rows.filter((i) => i.document_type === 'sales_invoice' && ['issued', 'part_paid'].includes(i.status));
  const refresh = () => { invoices.reload(); onChanged?.(); };
  const exportCsv = () => downloadCsv(`invoices-${today()}.csv`, [['Number', 'Type', 'Customer', 'Reference', 'Issue date', 'Due date', 'Status', 'Net', 'VAT', 'Total', 'Paid', 'Credited', 'Balance'], ...rows.map((i) => [i.invoice_number || 'DRAFT', i.document_type, i.customer_name, i.reference, i.issue_date, i.due_date, displayStatus(i), i.net_total, i.vat_total, i.gross_total, i.amount_paid, i.credited_amount, i.balance_due])]);

  return (
    <Card title="Invoices" subtitle={`${unpaid.length} unpaid · ${money(unpaid.reduce((s, i) => s + Number(i.balance_due || 0), 0))} owed to you`}
      actions={<><Btn onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />CSV</Btn><Btn variant="primary" onClick={() => setEditing(true)}><Plus className="h-4 w-4" />New invoice</Btn></>}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">{FILTERS.map(([v, l]) => <button key={v} type="button" onClick={() => setFilter(v)} className={'shrink-0 rounded-full px-3 py-1 text-xs font-medium ' + (filter === v ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{l}</button>)}</div>
        <Search value={search} onChange={setSearch} placeholder="Search number, customer, ref" />
      </div>
      {invoices.loading ? <Loading /> : (
        <Table rows={rows} onRowClick={(i) => setOpenId(i.id)} empty={invoices.rows.length ? 'No invoices match this filter.' : 'No invoices yet. Create your first one.'}
          columns={[
            { key: 'invoice_number', label: 'Number', render: (i) => <span className="font-medium">{i.invoice_number || <span className="text-slate-400">Draft</span>}</span> },
            { key: 'customer_name', label: 'Customer', render: (i) => <div><p>{i.customer_name}</p>{i.reference && <p className="text-xs text-slate-500">{i.reference}</p>}</div> },
            { key: 'issue_date', label: 'Date', render: (i) => fmtDate(i.issue_date) },
            { key: 'due_date', label: 'Due', render: (i) => (i.document_type === 'credit_note' ? '—' : fmtDate(i.due_date)) },
            { key: 'gross_total', label: 'Total', right: true, render: (i) => (i.document_type === 'credit_note' ? `-${money(i.gross_total)}` : money(i.gross_total)) },
            { key: 'balance_due', label: 'Owed', right: true, render: (i) => (i.document_type === 'sales_invoice' && ['issued', 'part_paid'].includes(i.status) ? <span className="font-semibold">{money(i.balance_due)}</span> : '—') },
            { key: 'status', label: 'Status', render: (i) => <Badge status={displayStatus(i)} /> },
          ]} />
      )}
      {editing && <InvoiceEditor company={company} onClose={() => setEditing(false)} onSaved={(inv) => { setEditing(false); refresh(); setOpenId(inv.id); }} />}
      {openId && <InvoiceDetail company={company} invoiceId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </Card>
  );
}
