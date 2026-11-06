import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Sparkles } from 'lucide-react';
import { fin, useRecords } from './financeApi';
import { Btn, Card, Field, Modal, Table, Badge, Loading, Notice, inputClass, money } from './ui';

const TYPES = [
  ['equipment', 'Equipment (screens, tablets, printers…)', 'each', '4000'],
  ['labour', 'Labour / installation', 'hour', '4010'],
  ['service', 'One-off service or fee', 'each', '4020'],
  ['subscription', 'Monthly subscription', 'month', '4020'],
  ['other', 'Other', 'each', '4900'],
];
const STARTER = [
  { name: 'Media screen display (43")', item_type: 'equipment', description: 'Commercial digital signage display' },
  { name: 'Wall mount bracket', item_type: 'equipment', description: 'Tilt wall bracket and fixings' },
  { name: 'Media player device', item_type: 'equipment', description: 'Android media player for MealDrop Media Screen' },
  { name: 'Installation labour', item_type: 'labour', description: 'On-site installation and cabling' },
  { name: 'Setup & configuration fee', item_type: 'service', description: 'Screen setup, menu content and MealDrop configuration' },
  { name: 'Media Screen service — monthly', item_type: 'subscription', description: 'Content management, updates and remote support' },
  { name: 'POS system setup', item_type: 'service', description: 'MealDrop POS installation and staff training' },
  { name: 'Online ordering — monthly', item_type: 'subscription', description: 'MealDrop online ordering portal' },
];

export function ItemForm({ companyId, item, accounts, onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', description: '', item_type: 'service', unit: 'each', unit_price: '', cost_price: '', account_code: '4020', status: 'active', ...(item || {}) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setType = (t) => { const d = TYPES.find((x) => x[0] === t); setForm((f) => ({ ...f, item_type: t, unit: d[2], account_code: d[3] })); };
  const income = accounts.filter((a) => a.type === 'income' && a.status !== 'archived');
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const { item: saved } = await fin('save_item', { company_id: companyId, ...form, id: item?.id }); toast.success('Item saved'); onSaved?.(saved); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? 'Edit item' : 'New product or service'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name *"><input required value={form.name} onChange={set('name')} className={inputClass} /></Field>
        <Field label="Description (shown on invoice)"><textarea rows={2} value={form.description} onChange={set('description')} className={inputClass} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type"><select value={form.item_type} onChange={(e) => setType(e.target.value)} className={inputClass}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Unit"><select value={form.unit} onChange={set('unit')} className={inputClass}>{['each', 'hour', 'day', 'month', 'year', 'visit', 'metre'].map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Selling price (£) *"><input required type="number" min="0" step="0.01" value={form.unit_price} onChange={set('unit_price')} className={inputClass} /></Field>
          <Field label="Your cost (£)" hint="Optional — for margin tracking"><input type="number" min="0" step="0.01" value={form.cost_price ?? ''} onChange={set('cost_price')} className={inputClass} /></Field>
        </div>
        <Field label="Income account" hint="Where this sale is recorded in your accounts"><select value={form.account_code} onChange={set('account_code')} className={inputClass}>{income.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</select></Field>
        {item && <Field label="Status"><select value={form.status} onChange={set('status')} className={inputClass}><option value="active">Active</option><option value="archived">Archived</option></select></Field>}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn type="submit" variant="primary" busy={busy}>Save item</Btn></div>
      </form>
    </Modal>
  );
}

export default function ItemsTab({ companyId }) {
  const items = useRecords('FinanceItem', companyId, 'name');
  const accounts = useRecords('FinanceAccount', companyId, 'code');
  const [editing, setEditing] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const addStarter = async () => {
    setSeeding(true);
    try {
      const have = new Set(items.rows.map((i) => i.name.toLowerCase()));
      let n = 0;
      for (const s of STARTER) {
        if (have.has(s.name.toLowerCase())) continue;
        const t = TYPES.find((x) => x[0] === s.item_type);
        await fin('save_item', { company_id: companyId, ...s, unit: t[2], account_code: t[3], unit_price: 0 });
        n++;
      }
      toast.success(`${n} starter item(s) added — set your prices`);
      items.reload();
    } catch (e) { toast.error(e.message); } finally { setSeeding(false); }
  };
  const zeroPriced = items.rows.filter((i) => i.status === 'active' && !(Number(i.unit_price) > 0)).length;
  return (
    <Card title="Products & services" subtitle="Your price list. Pick these when building an invoice."
      actions={<><Btn onClick={addStarter} busy={seeding}><Sparkles className="h-4 w-4" />Add MealDrop starter items</Btn><Btn variant="primary" onClick={() => setEditing({})} disabled={!accounts.rows.length}><Plus className="h-4 w-4" />New item</Btn></>}>
      {zeroPriced > 0 && <div className="mb-3"><Notice tone="warn">{zeroPriced} item(s) still have a £0 price. Tap one to set your price.</Notice></div>}
      {items.loading ? <Loading /> : (
        <Table rows={items.rows} onRowClick={(i) => setEditing(i)} empty="No items yet. Add the MealDrop starter items, then set your prices."
          columns={[
            { key: 'name', label: 'Item', render: (i) => <div><p className="font-medium text-slate-900">{i.name}</p><p className="text-xs text-slate-500">{i.description}</p></div> },
            { key: 'item_type', label: 'Type', render: (i) => <span className="capitalize">{i.item_type}</span> },
            { key: 'unit_price', label: 'Price', right: true, render: (i) => <span className={Number(i.unit_price) > 0 ? '' : 'text-amber-700'}>{money(i.unit_price)} / {i.unit}</span> },
            { key: 'margin', label: 'Margin', right: true, render: (i) => (i.cost_price != null && Number(i.unit_price) > 0 ? `${Math.round(((i.unit_price - i.cost_price) / i.unit_price) * 100)}%` : '—') },
            { key: 'account_code', label: 'Account' },
            { key: 'status', label: '', render: (i) => <Badge status={i.status} /> },
          ]} />
      )}
      {editing && <ItemForm companyId={companyId} item={editing.id ? editing : null} accounts={accounts.rows} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); items.reload(); }} />}
    </Card>
  );
}
