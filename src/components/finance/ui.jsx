import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { formatGBP } from './financeMath';

export const money = (n) => formatGBP(Number(n || 0));
export const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:bg-slate-50';

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={'block text-sm font-medium text-slate-700 ' + className}>
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  );
}

export function Btn({ variant = 'secondary', size = 'md', busy, children, className = '', ...props }) {
  const styles = {
    primary: 'bg-orange-600 text-white hover:bg-orange-700 border-transparent',
    dark: 'bg-slate-900 text-white hover:bg-slate-800 border-transparent',
    secondary: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
    danger: 'bg-white text-red-700 hover:bg-red-50 border-red-200',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
  }[variant];
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3 py-2 text-sm' }[size];
  return (
    <button type="button" disabled={busy || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${sizes} ${className}`} {...props}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Stat({ label, value, note, icon: Icon, tone = 'default' }) {
  const toneCls = { default: 'text-slate-900', good: 'text-emerald-700', bad: 'text-red-700', warn: 'text-amber-700' }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-500">{label}</p>{Icon && <Icon className="h-4 w-4 text-slate-400" />}</div>
      <p className={'mt-2 text-2xl font-semibold tracking-tight ' + toneCls}>{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

const BADGE = {
  draft: 'bg-slate-100 text-slate-700', issued: 'bg-blue-100 text-blue-800', part_paid: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800', void: 'bg-slate-200 text-slate-500 line-through', overdue: 'bg-red-100 text-red-800',
  unpaid: 'bg-amber-100 text-amber-800', active: 'bg-emerald-100 text-emerald-800', paused: 'bg-slate-100 text-slate-700',
  ended: 'bg-slate-200 text-slate-500', archived: 'bg-slate-200 text-slate-500', posted: 'bg-emerald-100 text-emerald-800',
  reversed: 'bg-slate-200 text-slate-500', reversal: 'bg-purple-100 text-purple-800',
};
const LABEL = { part_paid: 'Part paid', issued: 'Unpaid' };
export function Badge({ status }) {
  return <span className={'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ' + (BADGE[status] || 'bg-slate-100 text-slate-700')}>{LABEL[status] || String(status || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</span>;
}
export const isOverdue = (inv) => inv.document_type === 'sales_invoice' && ['issued', 'part_paid'].includes(inv.status) && inv.due_date && inv.due_date < today();
export const displayStatus = (inv) => (isOverdue(inv) ? 'overdue' : inv.status);

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={'max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6 ' + (wide ? 'max-w-5xl' : 'max-w-2xl')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={'rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ' + className}>
      {(title || actions) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>{title && <h2 className="font-semibold text-slate-900">{title}</h2>}{subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}</div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Table({ columns, rows, empty = 'Nothing here yet.', onRowClick, minWidth = 640 }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">{columns.map((c) => <th key={c.key} className={'px-4 py-2.5 font-medium sm:px-3 ' + (c.right ? 'text-right' : '')}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={'border-b border-slate-100 last:border-0 ' + (onRowClick ? 'cursor-pointer hover:bg-orange-50/50' : '')}>
              {columns.map((c) => <td key={c.key} className={'px-4 py-2.5 sm:px-3 ' + (c.right ? 'text-right tabular-nums ' : '') + (c.className || '')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone = 'info', children }) {
  const cls = { info: 'border-blue-200 bg-blue-50 text-blue-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', bad: 'border-red-200 bg-red-50 text-red-900', good: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone];
  return <div className={'rounded-lg border p-3 text-sm ' + cls}>{children}</div>;
}

export function Search({ value, onChange, placeholder }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-xs" />;
}

export function Loading({ text = 'Loading…' }) {
  return <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{text}</p>;
}
