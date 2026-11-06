import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Every Finance write goes through the finance-operations backend function.
export async function fin(action, payload = {}) {
  let response;
  try {
    response = await base44.functions.invoke('finance-operations', { action, ...payload });
  } catch (error) {
    const msg = error?.response?.data?.error || error?.data?.error || error?.message || 'Finance request failed';
    throw new Error(msg);
  }
  const data = response?.data ?? response;
  if (!data?.success) throw new Error(data?.error || 'Finance request failed');
  return data;
}

// Read all records of a finance entity for a company (paged, admin-only via RLS).
export async function listAll(entity, query, sort = '-created_date') {
  const out = [];
  for (let skip = 0; skip < 20000; skip += 500) {
    const page = await base44.entities[entity].filter(query, sort, 500, skip);
    out.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return out;
}

export function useRecords(entity, companyId, sort = '-created_date', extra = null) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(extra || {});
  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setRows(await listAll(entity, { company_id: companyId, ...(extra || {}) }, sort));
      setError('');
    } catch (e) {
      setError(e?.message || 'Could not load records');
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, companyId, sort, key]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, loading, error, reload, setRows };
}

export function useReport(companyId, type, params = {}, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(params);
  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try { setData((await fin('report', { company_id: companyId, type, ...params })).report); setError(''); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, type, key, ...deps]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}

export function downloadCsv(filename, rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
