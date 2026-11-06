import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { fin, useRecords } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, Search, inputClass, money, fmtDate, today } from './ui';
import { roundMoney } from './financeMath';

function JournalForm({ company, accounts, onClose, onSaved }) {
  const [form, setForm] = useState({ entry_date: today(), description: '', reference: '', source_type: 'journal' });
  const [lines, setLines] = useState([{ account_code: '', debit: '', credit: '', memo: '' }, { account_code: '', debit: '', credit: '', memo: '' }]);
  const [busy, setBusy] = useState(false);
  const td = roundMoney(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
  const tc = roundMoney(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
  const upd = (i, p) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const save = async () => {
    setBusy(true);
    try { await fin('post_journal', { company_id: company.id, ...form, lines: lines.filter((l) => l.account_code).map((l) => ({ ...l, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) }); toast.success('Journal posted'); onSaved(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Manual journal" onClose={onClose} wide>
      <div className="space-y-4">
        <Notice>Use journals for opening balances, share capital, depreciation, director's loan movements or corrections. Invoices, payments and costs post themselves.</Notice>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Date"><input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className={inputClass} /></Field>
          <Field label="Description" className="sm:col-span-2"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} placeholder="e.g. Opening balances at 1 April" /></Field>
          <Field label="Type"><select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })} className={inputClass}><option value="journal">Journal</option><option value="opening_balance">Opening balance</option></select></Field>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-12">
            <select value={l.account_code} onChange={(e) => upd(i, { account_code: e.target.value })} className={inputClass + ' col-span-2 sm:col-span-5'}><option value="">Account…</option>{accounts.filter((a) => a.status !== 'archived').map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select>
            <input type="number" step="0.01" min="0" placeholder="Debit" value={l.debit} onChange={(e) => upd(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className={inputClass + ' sm:col-span-2'} />
            <input type="number" step="0.01" min="0" placeholder="Credit" value={l.credit} onChange={(e) => upd(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className={inputClass + ' sm:col-span-2'} />
            <input placeholder="Memo" value={l.memo} onChange={(e) => upd(i, { memo: e.target.value })} className={inputClass + ' sm:col-span-2'} />
            <button type="button" onClick={() => lines.length > 2 && setLines(lines.filter((_, j) => j !== i))} className="mt-1 flex items-center justify-center rounded text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Btn size="sm" onClick={() => setLines([...lines, { account_code: '', debit: '', credit: '', memo: '' }])}><Plus className="h-4 w-4" />Line</Btn>
          <p className={'text-sm font-medium ' + (td === tc && td > 0 ? 'text-emerald-700' : 'text-red-700')}>Debits {money(td)} · Credits {money(tc)} {td === tc && td > 0 ? '✓ balanced' : '— must match'}</p>
        </div>
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy} disabled={td !== tc || td <= 0} onClick={save}>Post journal</Btn></div>
      </div>
    </Modal>
  );
}

function EntryDetail({ entry, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const reverse = async () => {
    const reason = window.prompt('Why reverse this journal?'); if (!reason) return;
    setBusy(true);
    try { await fin('reverse_entry', { entry_id: entry.id, reason }); toast.success('Journal reversed'); onChanged(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${entry.entry_number} · ${fmtDate(entry.entry_date)}`} onClose={onClose}>
      <p className="mb-1 text-sm text-slate-700">{entry.description}</p>
      <p className="mb-3 text-xs text-slate-500">{entry.source_type.replace('_', ' ')} · posted by {entry.posted_by || '—'} {entry.posted_at ? `on ${fmtDate(entry.posted_at)}` : ''}</p>
      <Table minWidth={420} rows={entry.lines.map((l, i) => ({ ...l, id: i }))} columns={[{ key: 'account', label: 'Account', render: (l) => <div><p>{l.account_code} {l.account_name}</p>{l.memo && <p className="text-xs text-slate-500">{l.memo}</p>}</div> }, { key: 'debit', label: 'Debit', right: true, render: (l) => (l.debit ? money(l.debit) : '') }, { key: 'credit', label: 'Credit', right: true, render: (l) => (l.credit ? money(l.credit) : '') }]} />
      <div className="mt-4 flex items-center justify-between"><Badge status={entry.status} />{['journal', 'opening_balance'].includes(entry.source_type) && entry.status === 'posted' && <Btn variant="danger" busy={busy} onClick={reverse}>Reverse</Btn>}</div>
    </Modal>
  );
}

export default function LedgerTab({ company }) {
  const entries = useRecords('FinanceLedgerEntry', company.id, '-entry_date');
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const auditLog = useRecords('FinanceAuditLog', company.id, '-changed_at');
  const [view, setView] = useState('journal');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => entries.rows.filter((e) => [e.entry_number, e.description, e.source_reference].join(' ').toLowerCase().includes(search.toLowerCase())), [entries.rows, search]);
  return (
    <Card title="Ledger" subtitle="Every posting in your books. Entries can't be edited or deleted — only reversed."
      actions={<><div className="flex rounded-lg bg-slate-100 p-0.5">{[['journal', 'Entries'], ['audit', 'Audit trail']].map(([v, l]) => <button key={v} type="button" onClick={() => setView(v)} className={'rounded-md px-3 py-1.5 text-xs font-medium ' + (view === v ? 'bg-white shadow-sm' : 'text-slate-600')}>{l}</button>)}</div><Btn variant="primary" onClick={() => setAdding(true)} disabled={!accounts.rows.length}><Plus className="h-4 w-4" />Journal</Btn></>}>
      {view === 'journal' ? (<>
        <div className="mb-3"><Search value={search} onChange={setSearch} placeholder="Search entries" /></div>
        {entries.loading ? <Loading /> : <Table rows={rows} onRowClick={setOpen} empty="No postings yet." columns={[
          { key: 'entry_number', label: 'Entry', render: (e) => <span className="font-mono text-xs">{e.entry_number}</span> },
          { key: 'entry_date', label: 'Date', render: (e) => fmtDate(e.entry_date) },
          { key: 'source_type', label: 'Type', render: (e) => <span className="capitalize">{e.source_type.replace('_', ' ')}</span> },
          { key: 'description', label: 'Description' },
          { key: 'total_debit', label: 'Amount', right: true, render: (e) => money(e.total_debit) },
          { key: 'status', label: '', render: (e) => <Badge status={e.source_type === 'reversal' ? 'reversal' : e.status} /> },
        ]} />}
      </>) : (auditLog.loading ? <Loading /> : <Table rows={auditLog.rows} empty="No activity yet." columns={[
        { key: 'changed_at', label: 'When', render: (a) => new Date(a.changed_at).toLocaleString('en-GB') },
        { key: 'changed_by_email', label: 'Who', render: (a) => a.changed_by_email || a.changed_by_user_id },
        { key: 'action', label: 'Action', render: (a) => <span className="capitalize">{a.action.replace('_', ' ')}</span> },
        { key: 'summary', label: 'Details' },
      ]} />)}
      {adding && <JournalForm company={company} accounts={accounts.rows} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); entries.reload(); auditLog.reload(); }} />}
      {open && <EntryDetail entry={open} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); entries.reload(); auditLog.reload(); }} />}
    </Card>
  );
}
