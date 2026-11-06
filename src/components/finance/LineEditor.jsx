import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Btn, inputClass, money } from './ui';
import { roundMoney } from './financeMath';

export const emptyLine = () => ({ item_id: '', description: '', quantity: 1, unit: 'each', unit_price: '', discount_percent: 0, account_code: '4020' });

export function lineNet(l) {
  const q = Number(l.quantity) || 0, p = Number(l.unit_price) || 0, d = Number(l.discount_percent) || 0;
  return roundMoney(q * p * (1 - d / 100));
}

export default function LineEditor({ lines, setLines, items, accounts, showDiscount = true }) {
  const income = accounts.filter((a) => a.type === 'income' && a.status !== 'archived');
  const activeItems = items.filter((i) => i.status !== 'archived');
  const update = (idx, patch) => setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const pickItem = (idx, id) => {
    const it = activeItems.find((x) => x.id === id);
    if (!it) return update(idx, { item_id: '' });
    update(idx, { item_id: it.id, description: it.description ? `${it.name} — ${it.description}` : it.name, unit: it.unit || 'each', unit_price: it.unit_price, account_code: it.account_code || '4020' });
  };
  return (
    <div className="space-y-3">
      {lines.map((l, idx) => (
        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-2 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="text-xs font-medium text-slate-500">Product / service</label>
              <select value={l.item_id || ''} onChange={(e) => pickItem(idx, e.target.value)} className={inputClass}>
                <option value="">Custom line…</option>
                {activeItems.map((i) => <option key={i.id} value={i.id}>{i.name} ({money(i.unit_price)}/{i.unit})</option>)}
              </select>
            </div>
            <div className="sm:col-span-7">
              <label className="text-xs font-medium text-slate-500">Description</label>
              <input value={l.description} onChange={(e) => update(idx, { description: e.target.value })} className={inputClass} placeholder="What you're charging for" />
            </div>
            <div className="col-span-1 grid grid-cols-3 gap-2 sm:col-span-12 sm:grid-cols-12">
              <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-500">Qty</label><input type="number" min="0" step="0.01" value={l.quantity} onChange={(e) => update(idx, { quantity: e.target.value })} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-500">Unit</label><input value={l.unit} onChange={(e) => update(idx, { unit: e.target.value })} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-500">Price £</label><input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => update(idx, { unit_price: e.target.value })} className={inputClass} /></div>
              {showDiscount && <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-500">Disc %</label><input type="number" min="0" max="100" step="0.5" value={l.discount_percent} onChange={(e) => update(idx, { discount_percent: e.target.value })} className={inputClass} /></div>}
              <div className="col-span-2 sm:col-span-3"><label className="text-xs font-medium text-slate-500">Income account</label>
                <select value={l.account_code} onChange={(e) => update(idx, { account_code: e.target.value })} className={inputClass}>{income.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name.replace('Sales — ', '')}</option>)}</select>
              </div>
              <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                <span className="text-sm font-semibold tabular-nums text-slate-900">{money(lineNet(l))}</span>
                <button type="button" onClick={() => setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : [emptyLine()])} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <Btn size="sm" onClick={() => setLines([...lines, emptyLine()])}><Plus className="h-4 w-4" />Add line</Btn>
    </div>
  );
}

export const cleanLines = (lines) => lines
  .filter((l) => String(l.description || '').trim() || l.item_id)
  .map((l) => ({ ...(l.item_id ? { item_id: l.item_id } : {}), description: l.description, quantity: Number(l.quantity), unit: l.unit, unit_price: Number(l.unit_price || 0), discount_percent: Number(l.discount_percent || 0), account_code: l.account_code }));
