import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Store } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { fin, useRecords } from './financeApi';
import { Btn, Card, Field, Modal, Search, Table, Badge, Loading, inputClass, money } from './ui';

export function CustomerForm({ companyId, customer, onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', billing_address: '', company_number: '', payment_terms_days: '', restaurant_id: '', notes: '', status: 'active', ...(customer || {}) });
  const [restaurants, setRestaurants] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { base44.entities.Restaurant.list('name', 500).then((r) => setRestaurants(r || [])).catch(() => {}); }, []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickRestaurant = (id) => {
    const r = restaurants.find((x) => x.id === id);
    setForm((f) => ({ ...f, restaurant_id: id, ...(r && !customer ? { name: f.name || r.name, billing_address: f.billing_address || r.address || '', phone: f.phone || r.alert_phone || '' } : {}) }));
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { customer: saved } = await fin('save_customer', { company_id: companyId, ...form, id: customer?.id });
      toast.success(customer ? 'Customer updated' : 'Customer added');
      onSaved?.(saved);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={customer ? 'Edit customer' : 'New customer'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Link to a MealDrop restaurant (optional)" hint="Fills in the name and address from the restaurant's profile.">
          <select value={form.restaurant_id || ''} onChange={(e) => pickRestaurant(e.target.value)} className={inputClass}>
            <option value="">Not linked</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name *"><input required value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. Tilbury Chicken Ltd" /></Field>
          <Field label="Contact name"><input value={form.contact_name} onChange={set('contact_name')} className={inputClass} /></Field>
          <Field label="Invoice email"><input type="email" value={form.email} onChange={set('email')} className={inputClass} placeholder="accounts@…" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={set('phone')} className={inputClass} /></Field>
        </div>
        <Field label="Billing address"><textarea rows={3} value={form.billing_address} onChange={set('billing_address')} className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company number" hint="If the customer is a limited company"><input value={form.company_number} onChange={set('company_number')} className={inputClass} /></Field>
          <Field label="Payment terms (days)" hint="Blank = your default"><input type="number" min="0" max="365" value={form.payment_terms_days ?? ''} onChange={set('payment_terms_days')} className={inputClass} /></Field>
        </div>
        <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} className={inputClass} /></Field>
        {customer && <Field label="Status"><select value={form.status} onChange={set('status')} className={inputClass}><option value="active">Active</option><option value="archived">Archived</option></select></Field>}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn type="submit" variant="primary" busy={busy}>Save customer</Btn></div>
      </form>
    </Modal>
  );
}

export default function CustomersTab({ companyId }) {
  const customers = useRecords('FinanceCustomer', companyId, 'name');
  const invoices = useRecords('FinanceInvoice', companyId, '-issue_date');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const owed = useMemo(() => {
    const m = new Map();
    for (const i of invoices.rows) if (i.document_type === 'sales_invoice' && ['issued', 'part_paid'].includes(i.status)) m.set(i.customer_id, (m.get(i.customer_id) || 0) + Number(i.balance_due || 0));
    return m;
  }, [invoices.rows]);
  const billed = useMemo(() => {
    const m = new Map();
    for (const i of invoices.rows) if (i.document_type === 'sales_invoice' && i.status !== 'draft' && i.status !== 'void') m.set(i.customer_id, (m.get(i.customer_id) || 0) + Number(i.gross_total || 0));
    return m;
  }, [invoices.rows]);
  const rows = customers.rows.filter((c) => [c.name, c.email, c.contact_name].join(' ').toLowerCase().includes(search.toLowerCase()));
  const importRestaurants = async () => {
    setImporting(true);
    try { const r = await fin('import_restaurants', { company_id: companyId }); toast.success(`${r.imported} restaurant(s) added as customers`); customers.reload(); }
    catch (e) { toast.error(e.message); } finally { setImporting(false); }
  };
  return (
    <Card title="Customers" subtitle="Restaurants and businesses you invoice."
      actions={<><Btn onClick={importRestaurants} busy={importing}><Store className="h-4 w-4" />Import restaurants</Btn><Btn variant="primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />New customer</Btn></>}>
      <div className="mb-3"><Search value={search} onChange={setSearch} placeholder="Search customers" /></div>
      {customers.loading ? <Loading /> : (
        <Table rows={rows} onRowClick={(c) => setEditing(c)} empty="No customers yet. Import your MealDrop restaurants or add one."
          columns={[
            { key: 'name', label: 'Customer', render: (c) => <div><p className="font-medium text-slate-900">{c.name}</p><p className="text-xs text-slate-500">{c.email || 'No invoice email'}</p></div> },
            { key: 'link', label: 'Restaurant', render: (c) => (c.restaurant_id ? <span className="text-xs text-emerald-700">Linked</span> : <span className="text-xs text-slate-400">—</span>) },
            { key: 'billed', label: 'Billed', right: true, render: (c) => money(billed.get(c.id)) },
            { key: 'owed', label: 'Owes you', right: true, render: (c) => <span className={owed.get(c.id) ? 'font-semibold text-slate-900' : 'text-slate-400'}>{money(owed.get(c.id))}</span> },
            { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
          ]} />
      )}
      {editing && <CustomerForm companyId={companyId} customer={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); customers.reload(); }} />}
    </Card>
  );
}
