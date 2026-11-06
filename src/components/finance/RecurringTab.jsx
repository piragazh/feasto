import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Play } from 'lucide-react';
import { fin, useRecords } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, inputClass, money, fmtDate, today } from './ui';
import LineEditor, { emptyLine, lineNet, cleanLines } from './LineEditor';

function RecurringForm({ company, template, onClose, onSaved }) {
  const customers = useRecords('FinanceCustomer', company.id, 'name');
  const items = useRecords('FinanceItem', company.id, 'name');
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const [form, setForm] = useState({ customer_id: '', name: '', reference: '', frequency: 'monthly', next_run_date: today(), end_date: '', auto_issue: true, auto_email: false, status: 'active', notes: '', ...(template || {}) });
  const [lines, setLines] = useState(template?.lines?.length ? template.lines.map((l) => ({ ...emptyLine(), ...l })) : [emptyLine()]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const total = lines.reduce((s, l) => s + lineNet(l), 0);
  const save = async () => {
    setBusy(true);
    try { await fin('save_recurring', { company_id: company.id, ...form, end_date: form.end_date || undefined, id: template?.id, lines: cleanLines(lines) }); toast.success('Recurring invoice saved'); onSaved(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={template ? 'Edit recurring invoice' : 'New recurring invoice'} onClose={onClose} wide>
      {customers.loading ? <Loading /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Customer *"><select value={form.customer_id} onChange={set('customer_id')} className={inputClass}><option value="">Choose…</option>{customers.rows.filter((c) => c.status !== 'archived').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Name"><input value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. Media screen service" /></Field>
            <Field label="Reference"><input value={form.reference} onChange={set('reference')} className={inputClass} /></Field>
            <Field label="How often"><select value={form.frequency} onChange={set('frequency')} className={inputClass}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Yearly</option></select></Field>
            <Field label="Next invoice date"><input type="date" value={form.next_run_date} onChange={set('next_run_date')} className={inputClass} /></Field>
            <Field label="End date (optional)"><input type="date" value={form.end_date || ''} onChange={set('end_date')} className={inputClass} /></Field>
          </div>
          <LineEditor lines={lines} setLines={setLines} items={items.rows} accounts={accounts.rows} />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.auto_issue} onChange={set('auto_issue')} />Issue automatically (otherwise creates a draft)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.auto_email} onChange={set('auto_email')} disabled={!form.auto_issue} />Email to customer when issued</label>
          </div>
          {template && <Field label="Status"><select value={form.status} onChange={set('status')} className={inputClass + ' sm:max-w-xs'}><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></Field>}
          <Field label="Notes on each invoice"><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputClass} /></Field>
          <div className="flex items-center justify-between border-t border-slate-200 pt-4"><p className="text-sm">Each invoice: <strong>{money(total)}</strong></p><div className="flex gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy} onClick={save}>Save</Btn></div></div>
        </div>
      )}
    </Modal>
  );
}

export default function RecurringTab({ company, onChanged }) {
  const templates = useRecords('FinanceRecurringInvoice', company.id, 'next_run_date');
  const customers = useRecords('FinanceCustomer', company.id, 'name');
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState(false);
  const name = (id) => customers.rows.find((c) => c.id === id)?.name || '—';
  const due = templates.rows.filter((t) => t.status === 'active' && t.next_run_date <= today());
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await fin('run_recurring', { company_id: company.id });
      if (r.created.length) toast.success(`${r.created.length} invoice(s) created`);
      else toast.info('Nothing due today');
      r.errors.forEach((e) => toast.error(`${e.template}: ${e.error}`));
      templates.reload(); onChanged?.();
    } catch (e) { toast.error(e.message); } finally { setRunning(false); }
  };
  return (
    <Card title="Recurring invoices" subtitle="Monthly service fees and subscriptions, invoiced automatically."
      actions={<><Btn onClick={runNow} busy={running}><Play className="h-4 w-4" />Run due now{due.length ? ` (${due.length})` : ''}</Btn><Btn variant="primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />New recurring</Btn></>}>
      {due.length > 0 && <div className="mb-3"><Notice tone="warn">{due.length} recurring invoice(s) are due. Tap “Run due now” to create them.</Notice></div>}
      {templates.loading ? <Loading /> : (
        <Table rows={templates.rows} onRowClick={(t) => setEditing(t)} empty="No recurring invoices. Set one up for each restaurant's monthly service fee."
          columns={[
            { key: 'name', label: 'Name', render: (t) => <div><p className="font-medium">{t.name}</p><p className="text-xs text-slate-500">{name(t.customer_id)}</p></div> },
            { key: 'frequency', label: 'Every', render: (t) => <span className="capitalize">{t.frequency.replace('ly', '').replace('annual', 'year')}</span> },
            { key: 'amount', label: 'Amount', right: true, render: (t) => money((t.lines || []).reduce((s, l) => s + lineNet(l), 0)) },
            { key: 'next_run_date', label: 'Next', render: (t) => (t.status === 'active' ? fmtDate(t.next_run_date) : '—') },
            { key: 'invoices_generated', label: 'Sent', right: true },
            { key: 'status', label: 'Status', render: (t) => <Badge status={t.status} /> },
          ]} />
      )}
      <p className="mt-3 text-xs text-slate-500">Tip: ask me to add a daily scheduled run so these go out without pressing the button.</p>
      {editing && <RecurringForm company={company} template={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); templates.reload(); }} />}
    </Card>
  );
}
