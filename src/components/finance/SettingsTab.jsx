import React, { useState } from 'react';
import { toast } from 'sonner';
import { Lock, Unlock, Plus } from 'lucide-react';
import { fin, useRecords } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, inputClass, fmtDate } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function AccountForm({ company, account, onClose, onSaved }) {
  const [f, setF] = useState({ code: '', name: '', type: 'expense', subtype: 'overhead', description: '', status: 'active', ...(account || {}) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const SUB = { asset: ['current_asset', 'fixed_asset', 'bank'], liability: ['current_liability', 'long_term_liability'], equity: ['equity'], income: ['sales', 'other_income'], expense: ['overhead', 'cost_of_sales', 'tax'] };
  const save = async () => { setBusy(true); try { await fin('save_account', { company_id: company.id, ...f, id: account?.id }); toast.success('Account saved'); onSaved(); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <Modal title={account ? `Account ${account.code}` : 'New account'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code (4 digits)"><input value={f.code} disabled={!!account} onChange={set('code')} className={inputClass} /></Field>
          <Field label="Name" className="sm:col-span-2"><input value={f.name} onChange={set('name')} className={inputClass} /></Field>
          <Field label="Type"><select value={f.type} disabled={!!account} onChange={(e) => setF((x) => ({ ...x, type: e.target.value, subtype: SUB[e.target.value][0] }))} className={inputClass}>{Object.keys(SUB).map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Group"><select value={f.subtype} onChange={set('subtype')} className={inputClass}>{SUB[f.type].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></Field>
          {account && !account.is_system && <Field label="Status"><select value={f.status} onChange={set('status')} className={inputClass}><option value="active">Active</option><option value="archived">Archived</option></select></Field>}
        </div>
        <Field label="Description"><input value={f.description || ''} onChange={set('description')} className={inputClass} /></Field>
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" busy={busy} onClick={save}>Save</Btn></div>
      </div>
    </Modal>
  );
}

export default function SettingsTab({ company, onCompanyChange }) {
  const accounts = useRecords('FinanceAccount', company.id, 'code');
  const [f, setF] = useState(() => ({
    legal_name: company.legal_name || '', trading_name: company.trading_name || '', company_number: company.company_number || '', registered_in: company.registered_in || 'England and Wales', utr: company.utr || '',
    email: company.email || '', phone: company.phone || '', website: company.website || '', logo_url: company.logo_url || '',
    address: { line_1: '', line_2: '', city: '', postcode: '', country: 'United Kingdom', ...(company.address || {}) },
    bank_account_name: company.bank_account_name || '', bank_sort_code: company.bank_sort_code || '', bank_account_number: company.bank_account_number || '',
    invoice_prefix: company.invoice_prefix || 'INV-', next_invoice_number: company.next_invoice_number || 1, credit_note_prefix: company.credit_note_prefix || 'CN-',
    payment_terms_days: company.payment_terms_days ?? 14, invoice_footer: company.invoice_footer || '',
    accounting_year_start_month: company.accounting_year_start_month || 4, accounting_year_start_day: company.accounting_year_start_day || 1,
    vat_registered: !!company.vat_registered, vat_number: company.vat_number || '', vat_registration_date: company.vat_registration_date || '', vat_threshold: company.vat_threshold || 90000,
  }));
  const [busy, setBusy] = useState('');
  const [lockDate, setLockDate] = useState(company.locked_until || '');
  const [editAcc, setEditAcc] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setAddr = (k) => (e) => setF((x) => ({ ...x, address: { ...x.address, [k]: e.target.value } }));

  const save = async () => {
    setBusy('save');
    try {
      const fields = { ...f, payment_terms_days: Number(f.payment_terms_days), next_invoice_number: Number(f.next_invoice_number), accounting_year_start_month: Number(f.accounting_year_start_month), accounting_year_start_day: Number(f.accounting_year_start_day), vat_threshold: Number(f.vat_threshold) };
      if (fields.vat_registered === !!company.vat_registered) { delete fields.vat_registered; delete fields.vat_number; delete fields.vat_registration_date; }
      if (fields.next_invoice_number === Number(company.next_invoice_number || 1)) delete fields.next_invoice_number;
      const { company: updated } = await fin('save_company', { company_id: company.id, fields });
      toast.success('Settings saved'); onCompanyChange(updated);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const lock = async (date) => {
    setBusy('lock');
    try { const { company: updated } = await fin('lock_period', { company_id: company.id, locked_until: date || null }); toast.success(date ? `Books locked up to ${fmtDate(date)}` : 'Books unlocked'); onCompanyChange(updated); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const seed = async () => { setBusy('seed'); try { const r = await fin('seed_chart', { company_id: company.id }); toast.success(`${r.added} account(s) added`); accounts.reload(); onCompanyChange({ ...company, chart_seeded: true }); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };

  const missing = [!f.company_number && 'company number', !f.address.line_1 && 'registered office address', !f.bank_account_number && 'bank details'].filter(Boolean);
  return (
    <div className="space-y-4">
      {missing.length > 0 && <Notice tone="warn">Add your {missing.join(', ')} — UK limited companies must show their registered name, number, place of registration and registered office address on invoices.</Notice>}
      <Card title="Company details" subtitle="Printed on every invoice. Issued invoices keep the details they were issued with.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Registered company name *"><input value={f.legal_name} onChange={set('legal_name')} className={inputClass} placeholder="MealDrop LTD" /></Field>
          <Field label="Trading name"><input value={f.trading_name} onChange={set('trading_name')} className={inputClass} placeholder="MealDrop" /></Field>
          <Field label="Company number"><input value={f.company_number} onChange={set('company_number')} className={inputClass} placeholder="8 digits" /></Field>
          <Field label="Registered in"><select value={f.registered_in} onChange={set('registered_in')} className={inputClass}>{['England and Wales', 'Scotland', 'Northern Ireland', 'Wales'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Registered office — line 1"><input value={f.address.line_1} onChange={setAddr('line_1')} className={inputClass} /></Field>
          <Field label="Line 2"><input value={f.address.line_2} onChange={setAddr('line_2')} className={inputClass} /></Field>
          <Field label="Town / city"><input value={f.address.city} onChange={setAddr('city')} className={inputClass} placeholder="Rainham" /></Field>
          <Field label="Postcode"><input value={f.address.postcode} onChange={setAddr('postcode')} className={inputClass} /></Field>
          <Field label="Email on invoices"><input type="email" value={f.email} onChange={set('email')} className={inputClass} /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} className={inputClass} /></Field>
          <Field label="Website"><input value={f.website} onChange={set('website')} className={inputClass} /></Field>
          <Field label="Logo URL" hint="PNG or JPG"><input value={f.logo_url} onChange={set('logo_url')} className={inputClass} /></Field>
          <Field label="Corporation Tax UTR" hint="For your records — not shown on invoices"><input value={f.utr} onChange={set('utr')} className={inputClass} /></Field>
        </div>
      </Card>

      <Card title="Getting paid">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Account name"><input value={f.bank_account_name} onChange={set('bank_account_name')} className={inputClass} /></Field>
          <Field label="Sort code"><input value={f.bank_sort_code} onChange={set('bank_sort_code')} className={inputClass} placeholder="00-00-00" /></Field>
          <Field label="Account number"><input value={f.bank_account_number} onChange={set('bank_account_number')} className={inputClass} /></Field>
          <Field label="Invoice prefix"><input value={f.invoice_prefix} onChange={set('invoice_prefix')} className={inputClass} /></Field>
          <Field label="Next invoice number" hint="Can only go up — numbers are never reused"><input type="number" min={company.next_invoice_number || 1} value={f.next_invoice_number} onChange={set('next_invoice_number')} className={inputClass} /></Field>
          <Field label="Credit note prefix"><input value={f.credit_note_prefix} onChange={set('credit_note_prefix')} className={inputClass} /></Field>
          <Field label="Default payment terms (days)"><input type="number" min="0" max="365" value={f.payment_terms_days} onChange={set('payment_terms_days')} className={inputClass} /></Field>
          <Field label="Invoice footer" className="sm:col-span-2"><input value={f.invoice_footer} onChange={set('invoice_footer')} className={inputClass} placeholder="e.g. Thank you for your business" /></Field>
        </div>
      </Card>

      <Card title="Tax & financial year">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Financial year starts — month"><select value={f.accounting_year_start_month} onChange={set('accounting_year_start_month')} className={inputClass}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          <Field label="Day"><input type="number" min="1" max="31" value={f.accounting_year_start_day} onChange={set('accounting_year_start_day')} className={inputClass} /></Field>
          <Field label="VAT threshold (£)"><input type="number" value={f.vat_threshold} onChange={set('vat_threshold')} className={inputClass} /></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.vat_registered} onChange={set('vat_registered')} />Registered for VAT</label>
        {f.vat_registered && !company.vat_registered && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="VAT number"><input value={f.vat_number} onChange={set('vat_number')} className={inputClass} placeholder="GB123456789" /></Field>
            <Field label="Effective date"><input type="date" value={f.vat_registration_date} onChange={set('vat_registration_date')} className={inputClass} /></Field>
            <div className="sm:col-span-3"><Notice tone="warn">Only switch this on once HMRC has confirmed your registration. From then, new invoices charge VAT and you'll need to file quarterly VAT returns through Making Tax Digital.</Notice></div>
          </div>
        )}
        {!f.vat_registered && <p className="mt-2 text-sm text-slate-500">Not VAT registered: invoices show no VAT, and VAT you pay on costs is part of the cost.</p>}
        <div className="mt-4 flex justify-end"><Btn variant="primary" busy={busy === 'save'} onClick={save}>Save all settings</Btn></div>
      </Card>

      <Card title="Lock the books" subtitle="After your accountant signs off a period, lock it so nothing on or before that date can be changed.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Locked up to and including"><input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} className={inputClass} /></Field>
          <Btn variant="dark" busy={busy === 'lock'} disabled={!lockDate} onClick={() => lock(lockDate)}><Lock className="h-4 w-4" />Lock</Btn>
          {company.locked_until && <Btn busy={busy === 'lock'} onClick={() => { if (window.confirm('Unlock the books? This is recorded in the audit trail.')) { setLockDate(''); lock(null); } }}><Unlock className="h-4 w-4" />Unlock</Btn>}
        </div>
        <p className="mt-2 text-sm text-slate-600">{company.locked_until ? `Currently locked up to ${fmtDate(company.locked_until)}.` : 'Nothing is locked.'}</p>
      </Card>

      <Card title="Chart of accounts" subtitle="The categories your money is sorted into." actions={<><Btn busy={busy === 'seed'} onClick={seed}>{accounts.rows.length ? 'Add missing standard accounts' : 'Set up standard UK accounts'}</Btn>{accounts.rows.length > 0 && <Btn variant="primary" onClick={() => setEditAcc({})}><Plus className="h-4 w-4" />Account</Btn>}</>}>
        {accounts.loading ? <Loading /> : <Table rows={accounts.rows} onRowClick={setEditAcc} empty="No accounts yet — set up the standard UK chart to start." columns={[
          { key: 'code', label: 'Code', render: (a) => <span className="font-mono">{a.code}</span> }, { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type', render: (a) => <span className="capitalize">{a.type}</span> }, { key: 'subtype', label: 'Group', render: (a) => (a.subtype || '').replace(/_/g, ' ') },
          { key: 'status', label: '', render: (a) => (a.is_system ? <span className="text-xs text-slate-400">System</span> : <Badge status={a.status} />) },
        ]} />}
      </Card>
      {editAcc && <AccountForm company={company} account={editAcc.id ? editAcc : null} onClose={() => setEditAcc(null)} onSaved={() => { setEditAcc(null); accounts.reload(); }} />}
    </div>
  );
}
