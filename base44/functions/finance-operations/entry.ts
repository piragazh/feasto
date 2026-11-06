// MealDrop Finance engine — double-entry bookkeeping, invoicing, expenses, reports.
// Every write to a Finance entity goes through this function (entity RLS blocks
// direct client writes). Only users with role "admin" may call it.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.23";

// ───────────────────────── helpers ─────────────────────────
class FinError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
const fail = (message: string, status = 400): never => { throw new FinError(message, status); };
const r2 = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) fail("Amount must be a valid number");
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const needDate = (s: unknown, label: string) => { if (!isDate(s)) fail(`${label} must be a date (YYYY-MM-DD)`); return String(s); };
const today = () => new Date().toISOString().slice(0, 10);
const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
function addDays(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
function addPeriod(date: string, freq: string) {
  const d = new Date(date + "T00:00:00Z");
  const day = d.getUTCDate();
  if (freq === "weekly") { d.setUTCDate(day + 7); return d.toISOString().slice(0, 10); }
  const months = freq === "quarterly" ? 3 : freq === "annually" ? 12 : 1;
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// ───────────────────────── chart of accounts ─────────────────────────
const DEFAULT_ACCOUNTS = [
  ["0030", "Computer & office equipment", "asset", "fixed_asset"],
  ["0040", "Equipment depreciation", "asset", "fixed_asset"],
  ["1000", "Stock — equipment for resale", "asset", "current_asset"],
  ["1100", "Trade debtors (customers owe us)", "asset", "current_asset"],
  ["1200", "Business bank account", "asset", "bank"],
  ["1210", "Stripe balance", "asset", "bank"],
  ["1230", "Cash", "asset", "bank"],
  ["2100", "Trade creditors (we owe suppliers)", "liability", "current_liability"],
  ["2200", "VAT control", "liability", "current_liability"],
  ["2300", "Corporation tax", "liability", "current_liability"],
  ["2310", "PAYE & NI", "liability", "current_liability"],
  ["2400", "Restaurant payouts owed", "liability", "current_liability"],
  ["2500", "Director's loan account", "liability", "current_liability"],
  ["2600", "Accruals", "liability", "current_liability"],
  ["3000", "Share capital", "equity", "equity"],
  ["3100", "Retained earnings", "equity", "equity"],
  ["3200", "Dividends paid", "equity", "equity"],
  ["4000", "Sales — equipment", "income", "sales"],
  ["4010", "Sales — installation & labour", "income", "sales"],
  ["4020", "Sales — services & subscriptions", "income", "sales"],
  ["4030", "Commission income", "income", "sales"],
  ["4900", "Other income", "income", "other_income"],
  ["5000", "Cost of equipment sold", "expense", "cost_of_sales"],
  ["5010", "Subcontractor labour", "expense", "cost_of_sales"],
  ["5020", "Installation materials", "expense", "cost_of_sales"],
  ["6000", "Software & hosting", "expense", "overhead"],
  ["6010", "Marketing & advertising", "expense", "overhead"],
  ["6020", "Payment processing fees", "expense", "overhead"],
  ["6030", "Travel & motor", "expense", "overhead"],
  ["6040", "Insurance", "expense", "overhead"],
  ["6050", "Accountancy & legal", "expense", "overhead"],
  ["6060", "Office costs & supplies", "expense", "overhead"],
  ["6070", "Telephone & internet", "expense", "overhead"],
  ["6080", "Bank charges", "expense", "overhead"],
  ["6090", "Wages & salaries", "expense", "overhead"],
  ["6100", "Rent & rates", "expense", "overhead"],
  ["6110", "Tools & small equipment", "expense", "overhead"],
  ["6120", "Training & subscriptions", "expense", "overhead"],
  ["6900", "General expenses", "expense", "overhead"],
  ["8000", "Depreciation charge", "expense", "overhead"],
  ["9000", "Corporation tax charge", "expense", "tax"],
];
const SYSTEM_CODES = new Set(["1100", "1200", "1210", "1230", "2100", "2200", "2400", "2500", "3100"]);
const ITEM_TYPE_ACCOUNT: Record<string, string> = { equipment: "4000", labour: "4010", service: "4020", subscription: "4020", other: "4900" };
const BANK_FOR_METHOD: Record<string, string> = { bank_transfer: "1200", card: "1200", direct_debit: "1200", stripe: "1210", cash: "1230", other: "1200" };
const DEBTORS = "1100", CREDITORS = "2100", VAT = "2200";

// ───────────────────────── context ─────────────────────────
type Ctx = { db: any; user: any; base44: any };

async function all(entity: any, query: any, sort: string | null = null) {
  const out: any[] = [];
  for (let skip = 0; skip < 50000; skip += 500) {
    const page = await entity.filter(query, sort, 500, skip);
    out.push(...(page || []));
    if (!page || page.length < 500) break;
  }
  return out;
}
async function getOne(entity: any, id: unknown, label: string) {
  const sid = str(id, 64);
  if (!sid) fail(`${label} id is required`);
  const rows = await entity.filter({ id: sid }, null, 1, 0);
  if (!rows?.[0]) fail(`${label} not found`, 404);
  return rows[0];
}
async function getCompany(ctx: Ctx, id: unknown) {
  const c = await getOne(ctx.db.FinanceCompany, id, "Company");
  if (c.status === "archived") fail("This company is archived");
  return c;
}
async function accountMap(ctx: Ctx, companyId: string) {
  const rows = await all(ctx.db.FinanceAccount, { company_id: companyId });
  return new Map<string, any>(rows.map((a: any) => [a.code, a]));
}
function assertOpen(company: any, date: string) {
  if (company.locked_until && date <= company.locked_until) {
    fail(`The books are locked up to ${company.locked_until}. Use a date after that, or unlock the period in Settings.`, 409);
  }
}
async function audit(ctx: Ctx, companyId: string, entity: string, recordId: string, action: string, summary: string, before: any = null, after: any = null) {
  await ctx.db.FinanceAuditLog.create({
    company_id: companyId, entity_name: entity, record_id: String(recordId || ""), action,
    changed_by_user_id: ctx.user.id, changed_by_email: ctx.user.email || "", changed_at: new Date().toISOString(),
    summary: summary.slice(0, 500), ...(before ? { before_snapshot: before } : {}), ...(after ? { after_snapshot: after } : {}),
    source: "finance-operations",
  });
}

// Post a balanced double-entry journal. Lines: {account_code, debit, credit, memo}
async function postEntry(ctx: Ctx, company: any, e: { date: string; source_type: string; source_id?: string; source_reference?: string; description: string; lines: any[] }) {
  assertOpen(company, e.date);
  const accounts = await accountMap(ctx, company.id);
  if (!accounts.size) fail("Set up the chart of accounts first (Settings → Chart of accounts)");
  const lines = e.lines
    .map((l) => ({ ...l, debit: r2(l.debit || 0), credit: r2(l.credit || 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0)
    .map((l, i) => {
      const acc = accounts.get(String(l.account_code));
      if (!acc) fail(`Line ${i + 1}: account ${l.account_code} does not exist`);
      if (acc.status === "archived") fail(`Account ${acc.code} ${acc.name} is archived`);
      if (l.debit < 0 || l.credit < 0 || (l.debit > 0 && l.credit > 0)) fail(`Line ${i + 1}: use either a positive debit or a positive credit`);
      return { account_code: acc.code, account_name: acc.name, debit: l.debit, credit: l.credit, ...(l.memo ? { memo: str(l.memo, 300) } : {}) };
    });
  if (lines.length < 2) fail("A journal needs at least two lines");
  const td = r2(lines.reduce((s, l) => s + l.debit, 0));
  const tc = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (td <= 0 || td !== tc) fail(`Entry does not balance: debits £${td.toFixed(2)} vs credits £${tc.toFixed(2)}`);
  const fresh = await getOne(ctx.db.FinanceCompany, company.id, "Company");
  const num = Number(fresh.next_journal_number || 1);
  await ctx.db.FinanceCompany.update(company.id, { next_journal_number: num + 1 });
  return await ctx.db.FinanceLedgerEntry.create({
    company_id: company.id, entry_number: `JE-${pad(num, 6)}`, entry_date: e.date, source_type: e.source_type,
    ...(e.source_id ? { source_id: e.source_id } : {}), ...(e.source_reference ? { source_reference: str(e.source_reference, 120) } : {}),
    description: str(e.description, 500), status: "posted", currency: "GBP", lines, total_debit: td, total_credit: tc,
    posted_at: new Date().toISOString(), posted_by: ctx.user.email || ctx.user.id,
  });
}
async function reverseEntry(ctx: Ctx, company: any, entryId: string, date: string, reason: string) {
  const entry = await getOne(ctx.db.FinanceLedgerEntry, entryId, "Ledger entry");
  if (entry.status === "reversed") fail(`${entry.entry_number} is already reversed`);
  const reversal = await postEntry(ctx, company, {
    date, source_type: "reversal", source_id: entry.id, source_reference: entry.entry_number,
    description: `Reversal of ${entry.entry_number}: ${reason}`.slice(0, 500),
    lines: entry.lines.map((l: any) => ({ account_code: l.account_code, debit: l.credit, credit: l.debit, memo: l.memo })),
  });
  await ctx.db.FinanceLedgerEntry.update(entry.id, { status: "reversed", reversed_entry_id: reversal.id });
  await ctx.db.FinanceLedgerEntry.update(reversal.id, { reverses_entry_id: entry.id });
  return reversal;
}

// ───────────────────────── invoices ─────────────────────────
function calcLines(input: any, vatRegistered: boolean, itemsById: Map<string, any>) {
  if (!Array.isArray(input) || input.length === 0) fail("Add at least one line");
  if (input.length > 100) fail("An invoice can have up to 100 lines");
  const lines = input.map((l: any, i: number) => {
    const item = l.item_id ? itemsById.get(String(l.item_id)) : null;
    const description = str(l.description || item?.name, 1000);
    const quantity = Number(l.quantity);
    const unitPrice = Number(l.unit_price === undefined || l.unit_price === null || l.unit_price === "" ? item?.unit_price : l.unit_price);
    const discount = Number(l.discount_percent || 0);
    const vatRate = vatRegistered ? Number(l.vat_rate ?? 20) : 0;
    if (!description) fail(`Line ${i + 1}: description is required`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) fail(`Line ${i + 1}: quantity must be more than 0`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1e8) fail(`Line ${i + 1}: price is invalid`);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) fail(`Line ${i + 1}: discount must be 0–100%`);
    if (![0, 5, 20].includes(vatRate)) fail(`Line ${i + 1}: VAT rate must be 0, 5 or 20`);
    const net = r2(quantity * unitPrice * (1 - discount / 100));
    const vat = r2(net * vatRate / 100);
    const account = str(l.account_code || item?.account_code || ITEM_TYPE_ACCOUNT[item?.item_type] || "4020", 10);
    return {
      ...(item ? { item_id: item.id } : {}), description, quantity, unit: str(l.unit || item?.unit || "each", 20),
      unit_price: r2(unitPrice), discount_percent: discount, net_amount: net, vat_rate: vatRate, vat_amount: vat,
      gross_amount: r2(net + vat), account_code: account,
    };
  });
  const net_total = r2(lines.reduce((s: number, l: any) => s + l.net_amount, 0));
  const vat_total = r2(lines.reduce((s: number, l: any) => s + l.vat_amount, 0));
  return { lines, net_total, vat_total, gross_total: r2(net_total + vat_total) };
}
function companySnapshot(c: any) {
  return {
    legal_name: c.legal_name, trading_name: c.trading_name || "", company_number: c.company_number || "",
    registered_in: c.registered_in || "England and Wales", vat_registered: !!c.vat_registered, vat_number: c.vat_registered ? (c.vat_number || "") : "",
    address: c.address || {}, email: c.email || "", phone: c.phone || "", website: c.website || "", logo_url: c.logo_url || "",
    bank_account_name: c.bank_account_name || "", bank_sort_code: c.bank_sort_code || "", bank_account_number: c.bank_account_number || "",
    invoice_footer: c.invoice_footer || "",
  };
}
function invoiceStatus(inv: any) {
  if (inv.status === "void" || inv.status === "draft") return inv.status;
  const settled = r2(Number(inv.amount_paid || 0) + Number(inv.credited_amount || 0));
  if (r2(inv.gross_total - settled) <= 0) return "paid";
  return settled > 0 ? "part_paid" : "issued";
}
async function refreshInvoice(ctx: Ctx, inv: any, patch: any = {}) {
  const merged = { ...inv, ...patch };
  merged.balance_due = Math.max(0, r2(Number(merged.gross_total || 0) - Number(merged.amount_paid || 0) - Number(merged.credited_amount || 0)));
  merged.status = invoiceStatus(merged);
  return await ctx.db.FinanceInvoice.update(inv.id, { ...patch, balance_due: merged.balance_due, status: merged.status });
}
function groupCredits(lines: any[]) {
  const by = new Map<string, number>();
  for (const l of lines) by.set(l.account_code, r2((by.get(l.account_code) || 0) + l.net_amount));
  return [...by.entries()];
}
async function issueInvoiceRecord(ctx: Ctx, company: any, inv: any) {
  if (inv.status !== "draft") fail("Only draft invoices can be issued");
  if (!inv.customer_id) fail("Choose a customer before issuing");
  if (!inv.lines?.length || !(inv.gross_total > 0)) fail("An invoice must have a total above £0");
  const issueDate = needDate(inv.issue_date || today(), "Issue date");
  assertOpen(company, issueDate);
  const fresh = await getOne(ctx.db.FinanceCompany, company.id, "Company");
  let next = Number(fresh.next_invoice_number || 1);
  let number = `${fresh.invoice_prefix || "INV-"}${pad(next)}`;
  for (let guard = 0; guard < 50; guard++) {
    const clash = await ctx.db.FinanceInvoice.filter({ company_id: company.id, invoice_number: number }, null, 1, 0);
    if (!clash?.length) break;
    next++; number = `${fresh.invoice_prefix || "INV-"}${pad(next)}`;
  }
  await ctx.db.FinanceCompany.update(company.id, { next_invoice_number: next + 1 });
  const lines = [
    { account_code: DEBTORS, debit: inv.gross_total, credit: 0, memo: inv.customer_name },
    ...groupCredits(inv.lines).map(([code, amt]) => ({ account_code: code, debit: 0, credit: amt })),
    ...(inv.vat_total > 0 ? [{ account_code: VAT, debit: 0, credit: inv.vat_total, memo: "Output VAT" }] : []),
  ];
  const entry = await postEntry(ctx, fresh, { date: issueDate, source_type: "invoice", source_id: inv.id, source_reference: number, description: `Invoice ${number} — ${inv.customer_name}`, lines });
  const terms = Number(fresh.payment_terms_days ?? 14);
  const updated = await ctx.db.FinanceInvoice.update(inv.id, {
    invoice_number: number, status: "issued", issue_date: issueDate, due_date: inv.due_date || addDays(issueDate, terms),
    issued_at: new Date().toISOString(), company_snapshot: companySnapshot(fresh), ledger_entry_id: entry.id,
    amount_paid: 0, credited_amount: 0, balance_due: inv.gross_total,
  });
  await audit(ctx, company.id, "FinanceInvoice", inv.id, "issue", `Issued ${number} for £${inv.gross_total.toFixed(2)}`, null, { invoice_number: number, gross_total: inv.gross_total });
  return updated;
}
async function buildDraft(ctx: Ctx, company: any, body: any, existing: any = null) {
  const customer = await getOne(ctx.db.FinanceCustomer, body.customer_id, "Customer");
  if (customer.company_id !== company.id) fail("Customer belongs to another company");
  const items = await all(ctx.db.FinanceItem, { company_id: company.id });
  const totals = calcLines(body.lines, !!company.vat_registered, new Map(items.map((i: any) => [i.id, i])));
  const issueDate = body.issue_date ? needDate(body.issue_date, "Issue date") : today();
  const terms = Number(customer.payment_terms_days ?? company.payment_terms_days ?? 14);
  const dueDate = body.due_date ? needDate(body.due_date, "Due date") : addDays(issueDate, terms);
  if (dueDate < issueDate) fail("Due date cannot be before the issue date");
  return {
    company_id: company.id, document_type: "sales_invoice", status: "draft", currency: "GBP",
    customer_id: customer.id, ...(customer.restaurant_id ? { restaurant_id: customer.restaurant_id } : {}),
    customer_name: customer.name, customer_email: customer.email || "", customer_address_text: customer.billing_address || "",
    issue_date: issueDate, due_date: dueDate, ...(body.supply_date && isDate(body.supply_date) ? { supply_date: body.supply_date } : {}),
    reference: str(body.reference, 120), notes: str(body.notes, 2000), internal_notes: str(body.internal_notes, 2000),
    ...totals, amount_paid: 0, credited_amount: 0, balance_due: totals.gross_total,
    ...(existing?.recurring_id ? { recurring_id: existing.recurring_id } : body.recurring_id ? { recurring_id: body.recurring_id } : {}),
  };
}

function esc(s: unknown) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
const gbp = (n: unknown) => "£" + Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function invoiceHtml(inv: any, message: string) {
  const c = inv.company_snapshot || {};
  const a = c.address || {};
  const addr = [a.line_1, a.line_2, a.city, a.postcode].filter(Boolean).map(esc).join(", ");
  const isCN = inv.document_type === "credit_note";
  const rows = (inv.lines || []).map((l: any) => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(l.description)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${l.quantity} ${esc(l.unit || "")}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${gbp(l.unit_price)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${gbp(l.net_amount)}</td></tr>`).join("");
  const bank = c.bank_account_number ? `<p style="margin:16px 0 0;font-size:13px;color:#334155"><strong>Pay by bank transfer</strong><br>${esc(c.bank_account_name || c.legal_name)} · Sort code ${esc(c.bank_sort_code)} · Account ${esc(c.bank_account_number)}<br>Reference: ${esc(inv.invoice_number)}</p>` : "";
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:20px;color:#0f172a"><div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
${message ? `<p style="white-space:pre-line">${esc(message)}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">` : ""}
<table width="100%"><tr><td><h2 style="margin:0">${esc(c.trading_name || c.legal_name)}</h2><p style="margin:4px 0;font-size:12px;color:#64748b">${addr}</p></td><td style="text-align:right"><h3 style="margin:0">${isCN ? "CREDIT NOTE" : "INVOICE"}</h3><p style="margin:4px 0">${esc(inv.invoice_number)}</p></td></tr></table>
<p style="font-size:14px"><strong>Bill to:</strong> ${esc(inv.customer_name)}<br><span style="white-space:pre-line;color:#475569">${esc(inv.customer_address_text)}</span></p>
<p style="font-size:14px">Date: ${esc(inv.issue_date)}${isCN ? "" : ` · Due: <strong>${esc(inv.due_date)}</strong>`}${inv.reference ? ` · Ref: ${esc(inv.reference)}` : ""}${isCN && inv.credit_of_invoice_number ? ` · Credits invoice ${esc(inv.credit_of_invoice_number)}` : ""}</p>
<table width="100%" style="border-collapse:collapse;font-size:14px"><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">Description</th><th style="padding:8px;text-align:right">Qty</th><th style="padding:8px;text-align:right">Price</th><th style="padding:8px;text-align:right">Amount</th></tr>${rows}</table>
<p style="text-align:right;font-size:14px">${c.vat_registered ? `Net ${gbp(inv.net_total)} · VAT ${gbp(inv.vat_total)}<br>` : ""}<strong style="font-size:18px">Total ${gbp(inv.gross_total)}</strong>${!isCN && inv.amount_paid > 0 ? `<br>Paid ${gbp(inv.amount_paid)} · <strong>Balance due ${gbp(inv.balance_due)}</strong>` : ""}</p>
${c.vat_registered ? "" : `<p style="font-size:12px;color:#64748b">No VAT has been charged — ${esc(c.legal_name)} is not registered for VAT.</p>`}
${inv.notes ? `<p style="font-size:13px;white-space:pre-line">${esc(inv.notes)}</p>` : ""}${isCN ? "" : bank}
<p style="margin-top:24px;font-size:11px;color:#94a3b8">${esc(c.legal_name)}${c.company_number ? ` · Registered in ${esc(c.registered_in || "England and Wales")} no. ${esc(c.company_number)}` : ""}${addr ? ` · Registered office: ${addr}` : ""}${c.vat_registered && c.vat_number ? ` · VAT ${esc(c.vat_number)}` : ""}${c.invoice_footer ? `<br>${esc(c.invoice_footer)}` : ""}</p>
</div></body></html>`;
}
async function emailInvoice(ctx: Ctx, inv: any, to: string, message: string) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) fail("Enter a valid email address for the customer");
  const c = inv.company_snapshot || {};
  const kind = inv.document_type === "credit_note" ? "Credit note" : "Invoice";
  await ctx.base44.asServiceRole.integrations.Core.SendEmail({
    to, from_name: c.trading_name || c.legal_name || "MealDrop",
    subject: `${kind} ${inv.invoice_number} from ${c.trading_name || c.legal_name} — ${gbp(inv.gross_total)}`,
    body: invoiceHtml(inv, message),
  });
  return await ctx.db.FinanceInvoice.update(inv.id, { sent_at: new Date().toISOString(), sent_to: to });
}

// ───────────────────────── reports ─────────────────────────
function fyStart(company: any, asOf: string) {
  const m = Number(company.accounting_year_start_month || 4), d = Number(company.accounting_year_start_day || 1);
  const y = Number(asOf.slice(0, 4));
  const candidate = `${y}-${pad(m, 2)}-${pad(d, 2)}`;
  return candidate <= asOf ? candidate : `${y - 1}-${pad(m, 2)}-${pad(d, 2)}`;
}
async function balances(ctx: Ctx, companyId: string, from: string | null, to: string) {
  const entries = await all(ctx.db.FinanceLedgerEntry, { company_id: companyId });
  const by = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    if (e.entry_date > to || (from && e.entry_date < from)) continue;
    for (const l of e.lines || []) {
      const b = by.get(l.account_code) || { debit: 0, credit: 0 };
      b.debit += Number(l.debit || 0); b.credit += Number(l.credit || 0);
      by.set(l.account_code, b);
    }
  }
  return { by, entries };
}
async function report(ctx: Ctx, company: any, body: any) {
  const type = str(body.type, 40);
  const asOf = body.as_of ? needDate(body.as_of, "As-of date") : today();
  const accounts = [...(await accountMap(ctx, company.id)).values()].sort((a, b) => a.code.localeCompare(b.code));
  const signed = (a: any, b: any) => ["asset", "expense"].includes(a.type) ? r2(b.debit - b.credit) : r2(b.credit - b.debit);

  if (type === "trial_balance") {
    const { by } = await balances(ctx, company.id, null, asOf);
    const rows = accounts.map((a) => { const b = by.get(a.code) || { debit: 0, credit: 0 }; const net = r2(b.debit - b.credit); return { code: a.code, name: a.name, type: a.type, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }; }).filter((r) => r.debit || r.credit);
    return { as_of: asOf, rows, total_debit: r2(rows.reduce((s, r) => s + r.debit, 0)), total_credit: r2(rows.reduce((s, r) => s + r.credit, 0)) };
  }
  if (type === "profit_and_loss") {
    const from = body.from ? needDate(body.from, "From date") : fyStart(company, asOf);
    const { by } = await balances(ctx, company.id, from, asOf);
    const section = (pred: (a: any) => boolean) => {
      const rows = accounts.filter(pred).map((a) => ({ code: a.code, name: a.name, amount: signed(a, by.get(a.code) || { debit: 0, credit: 0 }) })).filter((r) => r.amount !== 0);
      return { rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)) };
    };
    const sales = section((a) => a.type === "income" && a.subtype !== "other_income");
    const otherIncome = section((a) => a.type === "income" && a.subtype === "other_income");
    const cos = section((a) => a.type === "expense" && a.subtype === "cost_of_sales");
    const overheads = section((a) => a.type === "expense" && !["cost_of_sales", "tax"].includes(a.subtype));
    const tax = section((a) => a.type === "expense" && a.subtype === "tax");
    const grossProfit = r2(sales.total - cos.total);
    const beforeTax = r2(grossProfit + otherIncome.total - overheads.total);
    return { from, to: asOf, sales, cost_of_sales: cos, gross_profit: grossProfit, other_income: otherIncome, overheads, profit_before_tax: beforeTax, tax, net_profit: r2(beforeTax - tax.total) };
  }
  if (type === "balance_sheet") {
    const { by } = await balances(ctx, company.id, null, asOf);
    const section = (pred: (a: any) => boolean) => {
      const rows = accounts.filter(pred).map((a) => ({ code: a.code, name: a.name, amount: signed(a, by.get(a.code) || { debit: 0, credit: 0 }) })).filter((r) => r.amount !== 0);
      return { rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)) };
    };
    const fixed = section((a) => a.type === "asset" && a.subtype === "fixed_asset");
    const current = section((a) => a.type === "asset" && a.subtype !== "fixed_asset");
    const liabilities = section((a) => a.type === "liability");
    const equity = section((a) => a.type === "equity");
    const profit = r2(accounts.filter((a) => a.type === "income").reduce((s, a) => s + signed(a, by.get(a.code) || { debit: 0, credit: 0 }), 0)
      - accounts.filter((a) => a.type === "expense").reduce((s, a) => s + signed(a, by.get(a.code) || { debit: 0, credit: 0 }), 0));
    const netAssets = r2(fixed.total + current.total - liabilities.total);
    const totalEquity = r2(equity.total + profit);
    return { as_of: asOf, fixed_assets: fixed, current_assets: current, liabilities, net_assets: netAssets, equity, profit_to_date: profit, total_equity: totalEquity, balanced: Math.abs(netAssets - totalEquity) < 0.01 };
  }
  if (type === "aged_debtors") {
    const invoices = await all(ctx.db.FinanceInvoice, { company_id: company.id, document_type: "sales_invoice", status: { $in: ["issued", "part_paid"] } });
    const buckets = ["current", "1_30", "31_60", "61_90", "over_90"];
    const byCustomer = new Map<string, any>();
    for (const inv of invoices) {
      if (!(inv.balance_due > 0) || inv.issue_date > asOf) continue;
      const late = daysBetween(inv.due_date || inv.issue_date, asOf);
      const bucket = late <= 0 ? "current" : late <= 30 ? "1_30" : late <= 60 ? "31_60" : late <= 90 ? "61_90" : "over_90";
      const row = byCustomer.get(inv.customer_id) || { customer_id: inv.customer_id, customer_name: inv.customer_name, total: 0, invoices: [], ...Object.fromEntries(buckets.map((b) => [b, 0])) };
      row[bucket] = r2(row[bucket] + inv.balance_due); row.total = r2(row.total + inv.balance_due);
      row.invoices.push({ id: inv.id, invoice_number: inv.invoice_number, due_date: inv.due_date, balance_due: inv.balance_due, days_overdue: Math.max(0, late) });
      byCustomer.set(inv.customer_id, row);
    }
    const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
    const totals = Object.fromEntries([...buckets, "total"].map((b) => [b, r2(rows.reduce((s, r) => s + r[b], 0))]));
    return { as_of: asOf, rows, totals };
  }
  if (type === "vat_threshold") {
    const threshold = Number(company.vat_threshold || 90000);
    const salesCodes = new Set(accounts.filter((a) => a.type === "income" && a.subtype === "sales").map((a) => a.code));
    const { entries } = await balances(ctx, company.id, null, asOf);
    const monthly = new Map<string, number>();
    for (const e of entries) {
      for (const l of e.lines || []) {
        if (!salesCodes.has(l.account_code)) continue;
        const k = e.entry_date.slice(0, 7);
        monthly.set(k, r2((monthly.get(k) || 0) + Number(l.credit || 0) - Number(l.debit || 0)));
      }
    }
    const months: any[] = [];
    const d = new Date(asOf.slice(0, 7) + "-01T00:00:00Z");
    for (let i = 11; i >= 0; i--) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
      months.push({ month: m, turnover: monthly.get(m) || 0 });
    }
    const rolling = r2(months.reduce((s, m) => s + m.turnover, 0));
    const pct = threshold ? Math.round((rolling / threshold) * 1000) / 10 : 0;
    const status = company.vat_registered ? "registered" : rolling > threshold ? "must_register" : pct >= 75 ? "warning" : "ok";
    return { as_of: asOf, threshold, rolling_12_months: rolling, percent: pct, headroom: r2(threshold - rolling), status, months };
  }
  if (type === "general_ledger") {
    const code = str(body.account_code, 10);
    const from = body.from ? needDate(body.from, "From date") : fyStart(company, asOf);
    const acc = accounts.find((a) => a.code === code);
    if (!acc) fail("Choose an account");
    const { entries } = await balances(ctx, company.id, null, asOf);
    let opening = 0; const rows: any[] = [];
    for (const e of entries.sort((x: any, y: any) => (x.entry_date + x.entry_number).localeCompare(y.entry_date + y.entry_number))) {
      for (const l of e.lines || []) {
        if (l.account_code !== code) continue;
        const delta = ["asset", "expense"].includes(acc.type) ? Number(l.debit || 0) - Number(l.credit || 0) : Number(l.credit || 0) - Number(l.debit || 0);
        if (e.entry_date < from) { opening = r2(opening + delta); continue; }
        rows.push({ date: e.entry_date, entry_number: e.entry_number, description: e.description, memo: l.memo || "", debit: l.debit || 0, credit: l.credit || 0, delta: r2(delta) });
      }
    }
    let run = opening; for (const r of rows) { run = r2(run + r.delta); r.balance = run; }
    return { account: { code: acc.code, name: acc.name, type: acc.type }, from, to: asOf, opening, closing: run, rows };
  }
  if (type === "overview") {
    const from = fyStart(company, asOf);
    const pnl: any = await report(ctx, company, { type: "profit_and_loss", from, as_of: asOf });
    const { by } = await balances(ctx, company.id, null, asOf);
    const bal = (code: string) => { const b = by.get(code) || { debit: 0, credit: 0 }; return r2(b.debit - b.credit); };
    const banks = accounts.filter((a) => a.subtype === "bank").map((a) => ({ code: a.code, name: a.name, balance: bal(a.code) }));
    const aged: any = await report(ctx, company, { type: "aged_debtors", as_of: asOf });
    const vat: any = await report(ctx, company, { type: "vat_threshold", as_of: asOf });
    return {
      fy_start: from, as_of: asOf, income: r2(pnl.sales.total + pnl.other_income.total), expenses: r2(pnl.cost_of_sales.total + pnl.overheads.total), net_profit: pnl.net_profit,
      banks, cash_total: r2(banks.reduce((s, b) => s + b.balance, 0)), debtors: aged.totals.total,
      overdue: r2(aged.totals.total - aged.totals.current), creditors: r2(-bal(CREDITORS)), vat,
    };
  }
  fail("Unknown report type");
}

// ───────────────────────── action handlers ─────────────────────────
const COMPANY_FIELDS = ["legal_name", "trading_name", "company_number", "registered_in", "utr", "email", "phone", "website", "logo_url", "bank_account_name", "bank_sort_code", "bank_account_number", "invoice_prefix", "credit_note_prefix", "invoice_footer", "notes"];

const handlers: Record<string, (ctx: Ctx, body: any) => Promise<any>> = {
  async save_company(ctx, body) {
    const f = body.fields || {};
    const patch: any = {};
    for (const k of COMPANY_FIELDS) if (k in f) patch[k] = str(f[k], k === "invoice_footer" || k === "notes" ? 1000 : 200);
    if (f.address && typeof f.address === "object") patch.address = { line_1: str(f.address.line_1, 200), line_2: str(f.address.line_2, 200), city: str(f.address.city, 100), postcode: str(f.address.postcode, 20).toUpperCase(), country: str(f.address.country || "United Kingdom", 60) };
    if ("payment_terms_days" in f) { const t = Number(f.payment_terms_days); if (!Number.isInteger(t) || t < 0 || t > 365) fail("Payment terms must be 0–365 days"); patch.payment_terms_days = t; }
    if ("accounting_year_start_month" in f) { const m = Number(f.accounting_year_start_month); if (!Number.isInteger(m) || m < 1 || m > 12) fail("Year-start month is invalid"); patch.accounting_year_start_month = m; }
    if ("accounting_year_start_day" in f) { const d = Number(f.accounting_year_start_day); if (!Number.isInteger(d) || d < 1 || d > 31) fail("Year-start day is invalid"); patch.accounting_year_start_day = d; }
    if ("vat_registered" in f) {
      patch.vat_registered = !!f.vat_registered;
      if (patch.vat_registered) {
        const vn = str(f.vat_number, 20).replace(/\s/g, "").toUpperCase();
        if (!/^(GB)?\d{9}(\d{3})?$/.test(vn)) fail("Enter a valid UK VAT number (9 digits) to switch VAT on");
        patch.vat_number = vn; patch.vat_scheme = "standard";
        patch.vat_registration_date = f.vat_registration_date && isDate(f.vat_registration_date) ? f.vat_registration_date : today();
      } else { patch.vat_scheme = "not_registered"; }
    }
    if ("vat_threshold" in f) patch.vat_threshold = r2(f.vat_threshold);
    if (!body.company_id) {
      if (!patch.legal_name) fail("Legal name is required");
      const created = await ctx.db.FinanceCompany.create({ ...patch, status: "active", currency: "GBP", next_invoice_number: 1, next_credit_note_number: 1, next_journal_number: 1, vat_scheme: patch.vat_scheme || "not_registered" });
      await audit(ctx, created.id, "FinanceCompany", created.id, "create", "Company created", null, patch);
      return { company: created };
    }
    const company = await getCompany(ctx, body.company_id);
    if ("next_invoice_number" in f) {
      const n = Number(f.next_invoice_number);
      if (!Number.isInteger(n) || n < Number(company.next_invoice_number || 1)) fail("Next invoice number can only move forward (no reusing numbers)");
      patch.next_invoice_number = n;
    }
    const updated = await ctx.db.FinanceCompany.update(company.id, patch);
    await audit(ctx, company.id, "FinanceCompany", company.id, "update", "Company settings updated", null, patch);
    return { company: updated };
  },

  async seed_chart(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const existing = await accountMap(ctx, company.id);
    const missing = DEFAULT_ACCOUNTS.filter(([code]) => !existing.has(code)).map(([code, name, type, subtype]) => ({ company_id: company.id, code, name, type, subtype, is_system: SYSTEM_CODES.has(code), is_bank: subtype === "bank", status: "active" }));
    if (missing.length) await ctx.db.FinanceAccount.bulkCreate(missing);
    await ctx.db.FinanceCompany.update(company.id, { chart_seeded: true });
    await audit(ctx, company.id, "FinanceAccount", company.id, "seed", `Chart of accounts set up (${missing.length} added)`);
    return { added: missing.length };
  },

  async save_account(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const code = str(body.code, 10), name = str(body.name, 120), type = str(body.type, 20);
    if (!/^\d{4}$/.test(code)) fail("Account code must be 4 digits");
    if (!name) fail("Account name is required");
    if (!["asset", "liability", "equity", "income", "expense"].includes(type)) fail("Choose an account type");
    const accounts = await accountMap(ctx, company.id);
    if (body.id) {
      const acc = await getOne(ctx.db.FinanceAccount, body.id, "Account");
      if (acc.company_id !== company.id) fail("Account belongs to another company");
      const patch: any = { name, description: str(body.description, 300), subtype: str(body.subtype || acc.subtype, 40) };
      if (!acc.is_system) { patch.status = body.status === "archived" ? "archived" : "active"; }
      if (acc.code !== code || acc.type !== type) fail("Code and type can't change once an account exists — create a new account instead");
      return { account: await ctx.db.FinanceAccount.update(acc.id, patch) };
    }
    if (accounts.has(code)) fail(`Account ${code} already exists`);
    const account = await ctx.db.FinanceAccount.create({ company_id: company.id, code, name, type, subtype: str(body.subtype, 40) || (type === "expense" ? "overhead" : type === "income" ? "sales" : type), is_system: false, is_bank: body.subtype === "bank", description: str(body.description, 300), status: "active" });
    await audit(ctx, company.id, "FinanceAccount", account.id, "create", `Account ${code} ${name} created`);
    return { account };
  },

  async save_customer(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const name = str(body.name, 200);
    if (!name) fail("Customer name is required");
    const email = str(body.email, 254);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Email address looks invalid");
    const data: any = { company_id: company.id, name, contact_name: str(body.contact_name, 120), email, phone: str(body.phone, 40), billing_address: str(body.billing_address, 600), company_number: str(body.company_number, 20), notes: str(body.notes, 1000), status: body.status === "archived" ? "archived" : "active" };
    if (body.payment_terms_days !== "" && body.payment_terms_days !== undefined && body.payment_terms_days !== null) { const t = Number(body.payment_terms_days); if (!Number.isInteger(t) || t < 0 || t > 365) fail("Payment terms must be 0–365 days"); data.payment_terms_days = t; }
    if (body.restaurant_id) { const rows = await ctx.db.Restaurant.filter({ id: str(body.restaurant_id, 64) }, null, 1, 0); if (!rows?.[0]) fail("Linked restaurant not found"); data.restaurant_id = rows[0].id; }
    if (body.id) {
      const c = await getOne(ctx.db.FinanceCustomer, body.id, "Customer");
      if (c.company_id !== company.id) fail("Customer belongs to another company");
      return { customer: await ctx.db.FinanceCustomer.update(c.id, data) };
    }
    const customer = await ctx.db.FinanceCustomer.create(data);
    await audit(ctx, company.id, "FinanceCustomer", customer.id, "create", `Customer ${name} added`);
    return { customer };
  },

  async import_restaurants(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const restaurants = await all(ctx.db.Restaurant, {});
    const existing = await all(ctx.db.FinanceCustomer, { company_id: company.id });
    const linked = new Set(existing.map((c: any) => c.restaurant_id).filter(Boolean));
    const records = restaurants.filter((r: any) => r?.id && !linked.has(r.id)).map((r: any) => ({ company_id: company.id, restaurant_id: r.id, name: str(r.name, 200) || "Restaurant", phone: str(r.alert_phone, 40), billing_address: str(r.address, 600), status: "active" }));
    for (let i = 0; i < records.length; i += 100) await ctx.db.FinanceCustomer.bulkCreate(records.slice(i, i + 100));
    await audit(ctx, company.id, "FinanceCustomer", company.id, "import", `${records.length} restaurants imported as customers`);
    return { imported: records.length, skipped: restaurants.length - records.length };
  },

  async save_item(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const name = str(body.name, 200);
    if (!name) fail("Item name is required");
    const type = ["equipment", "labour", "service", "subscription", "other"].includes(body.item_type) ? body.item_type : "service";
    const price = r2(body.unit_price); if (price < 0) fail("Price cannot be negative");
    const accounts = await accountMap(ctx, company.id);
    const account = str(body.account_code, 10) || ITEM_TYPE_ACCOUNT[type];
    const acc = accounts.get(account);
    if (!acc || acc.type !== "income") fail("Choose an income account for this item");
    const data: any = { company_id: company.id, name, description: str(body.description, 1000), item_type: type, unit: str(body.unit || (type === "labour" ? "hour" : type === "subscription" ? "month" : "each"), 20), unit_price: price, account_code: account, status: body.status === "archived" ? "archived" : "active", ...(body.cost_price !== "" && body.cost_price != null ? { cost_price: r2(body.cost_price) } : {}) };
    if (body.id) { const it = await getOne(ctx.db.FinanceItem, body.id, "Item"); if (it.company_id !== company.id) fail("Item belongs to another company"); return { item: await ctx.db.FinanceItem.update(it.id, data) }; }
    return { item: await ctx.db.FinanceItem.create(data) };
  },

  async save_draft(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    let existing = null;
    if (body.id) { existing = await getOne(ctx.db.FinanceInvoice, body.id, "Invoice"); if (existing.company_id !== company.id) fail("Invoice belongs to another company"); if (existing.status !== "draft") fail("Issued invoices can't be edited. Raise a credit note instead."); }
    const data = await buildDraft(ctx, company, body, existing);
    let invoice = existing ? await ctx.db.FinanceInvoice.update(existing.id, data) : await ctx.db.FinanceInvoice.create(data);
    if (!existing) await audit(ctx, company.id, "FinanceInvoice", invoice.id, "create", `Draft invoice for ${data.customer_name} £${data.gross_total.toFixed(2)}`);
    if (body.issue) invoice = await issueInvoiceRecord(ctx, company, invoice);
    if (body.issue && body.send) invoice = await emailInvoice(ctx, invoice, str(body.send_to || invoice.customer_email, 254), str(body.message, 2000));
    return { invoice };
  },

  async delete_draft(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.id, "Invoice");
    if (inv.status !== "draft") fail("Only drafts can be deleted. Void or credit an issued invoice instead.");
    await ctx.db.FinanceInvoice.delete(inv.id);
    await audit(ctx, inv.company_id, "FinanceInvoice", inv.id, "delete", "Draft deleted", inv);
    return { deleted: true };
  },

  async issue_invoice(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.id, "Invoice");
    const company = await getCompany(ctx, inv.company_id);
    let invoice = await issueInvoiceRecord(ctx, company, inv);
    if (body.send) invoice = await emailInvoice(ctx, invoice, str(body.send_to || invoice.customer_email, 254), str(body.message, 2000));
    return { invoice };
  },

  async send_invoice(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.id, "Invoice");
    if (["draft", "void"].includes(inv.status)) fail("Issue the invoice before sending it");
    const invoice = await emailInvoice(ctx, inv, str(body.to || inv.customer_email, 254), str(body.message, 2000));
    await audit(ctx, inv.company_id, "FinanceInvoice", inv.id, "send", `Emailed to ${invoice.sent_to}`);
    return { invoice };
  },

  async record_payment(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.invoice_id, "Invoice");
    if (inv.document_type !== "sales_invoice" || !["issued", "part_paid"].includes(inv.status)) fail("Payments can only be recorded against an unpaid issued invoice");
    const company = await getCompany(ctx, inv.company_id);
    const amount = r2(body.amount);
    if (amount <= 0) fail("Payment amount must be more than £0");
    if (amount > r2(inv.balance_due) + 0.001) fail(`Payment is more than the £${Number(inv.balance_due).toFixed(2)} still owed`);
    const date = needDate(body.payment_date || today(), "Payment date");
    if (date < inv.issue_date) fail("Payment date can't be before the invoice date");
    const method = BANK_FOR_METHOD[body.method] ? body.method : "bank_transfer";
    const bank = str(body.bank_account_code, 10) || BANK_FOR_METHOD[method];
    const accounts = await accountMap(ctx, company.id);
    if (accounts.get(bank)?.type !== "asset") fail("Choose a bank or cash account for the money received");
    const entry = await postEntry(ctx, company, { date, source_type: "payment", source_id: inv.id, source_reference: inv.invoice_number, description: `Payment received — ${inv.invoice_number} ${inv.customer_name}`, lines: [{ account_code: bank, debit: amount, credit: 0, memo: str(body.reference, 120) }, { account_code: DEBTORS, debit: 0, credit: amount, memo: inv.customer_name }] });
    const payment = await ctx.db.FinancePayment.create({ company_id: company.id, invoice_id: inv.id, customer_id: inv.customer_id, invoice_number: inv.invoice_number, payment_date: date, amount, method, bank_account_code: bank, reference: str(body.reference, 120), ledger_entry_id: entry.id, status: "posted", notes: str(body.notes, 500) });
    const invoice = await refreshInvoice(ctx, inv, { amount_paid: r2(Number(inv.amount_paid || 0) + amount) });
    await audit(ctx, company.id, "FinanceInvoice", inv.id, "payment", `£${amount.toFixed(2)} received (${method})`);
    return { invoice, payment };
  },

  async reverse_payment(ctx, body) {
    const p = await getOne(ctx.db.FinancePayment, body.payment_id, "Payment");
    if (p.status === "reversed") fail("Payment already reversed");
    const company = await getCompany(ctx, p.company_id);
    const reason = str(body.reason, 300) || "Payment reversed";
    await reverseEntry(ctx, company, p.ledger_entry_id, needDate(body.date || today(), "Date"), reason);
    await ctx.db.FinancePayment.update(p.id, { status: "reversed", notes: `${p.notes || ""} [Reversed: ${reason}]`.trim() });
    const inv = await getOne(ctx.db.FinanceInvoice, p.invoice_id, "Invoice");
    const invoice = await refreshInvoice(ctx, inv, { amount_paid: Math.max(0, r2(Number(inv.amount_paid || 0) - p.amount)) });
    await audit(ctx, company.id, "FinancePayment", p.id, "reverse", reason);
    return { invoice };
  },

  async void_invoice(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.id, "Invoice");
    if (inv.status !== "issued" || inv.document_type !== "sales_invoice") fail("Only an issued invoice with no payments or credits can be voided");
    if (Number(inv.amount_paid || 0) > 0 || Number(inv.credited_amount || 0) > 0) fail("This invoice has payments or credits — raise a credit note instead");
    const company = await getCompany(ctx, inv.company_id);
    const reason = str(body.reason, 300); if (!reason) fail("Give a reason for voiding");
    const date = needDate(body.date || (company.locked_until && inv.issue_date <= company.locked_until ? today() : inv.issue_date), "Void date");
    const rev = await reverseEntry(ctx, company, inv.ledger_entry_id, date, `Void ${inv.invoice_number}: ${reason}`);
    const invoice = await ctx.db.FinanceInvoice.update(inv.id, { status: "void", balance_due: 0, voided_at: new Date().toISOString(), void_reason: reason, void_ledger_entry_id: rev.id });
    await audit(ctx, company.id, "FinanceInvoice", inv.id, "void", reason);
    return { invoice };
  },

  async create_credit_note(ctx, body) {
    const inv = await getOne(ctx.db.FinanceInvoice, body.invoice_id, "Invoice");
    if (inv.document_type !== "sales_invoice" || !["issued", "part_paid", "paid"].includes(inv.status)) fail("Credit notes can only be raised against an issued invoice");
    const company = await getCompany(ctx, inv.company_id);
    const reason = str(body.reason, 500); if (!reason) fail("Give a reason for the credit note");
    const items = await all(ctx.db.FinanceItem, { company_id: company.id });
    const srcLines = Array.isArray(body.lines) && body.lines.length ? body.lines : inv.lines;
    const totals = calcLines(srcLines.map((l: any) => ({ ...l, vat_rate: l.vat_rate ?? 0 })), !!company.vat_registered, new Map(items.map((i: any) => [i.id, i])));
    const creditable = r2(inv.gross_total - Number(inv.credited_amount || 0));
    if (totals.gross_total > creditable + 0.001) fail(`You can credit at most £${creditable.toFixed(2)} on this invoice`);
    const date = needDate(body.date || today(), "Credit note date");
    assertOpen(company, date);
    const fresh = await getOne(ctx.db.FinanceCompany, company.id, "Company");
    const n = Number(fresh.next_credit_note_number || 1);
    const number = `${fresh.credit_note_prefix || "CN-"}${pad(n)}`;
    await ctx.db.FinanceCompany.update(company.id, { next_credit_note_number: n + 1 });
    const applied = Math.min(totals.gross_total, r2(inv.balance_due));
    const cn = await ctx.db.FinanceInvoice.create({
      company_id: company.id, document_type: "credit_note", invoice_number: number, status: "issued", currency: "GBP",
      customer_id: inv.customer_id, ...(inv.restaurant_id ? { restaurant_id: inv.restaurant_id } : {}), customer_name: inv.customer_name, customer_email: inv.customer_email, customer_address_text: inv.customer_address_text,
      issue_date: date, reference: inv.reference || "", notes: reason, ...totals, amount_paid: 0, credited_amount: applied, balance_due: r2(totals.gross_total - applied),
      credit_of_invoice_id: inv.id, credit_of_invoice_number: inv.invoice_number, company_snapshot: companySnapshot(fresh), issued_at: new Date().toISOString(),
    });
    const entry = await postEntry(ctx, fresh, { date, source_type: "credit_note", source_id: cn.id, source_reference: number, description: `Credit note ${number} against ${inv.invoice_number} — ${inv.customer_name}`, lines: [
      ...groupCredits(totals.lines).map(([code, amt]) => ({ account_code: code, debit: amt, credit: 0 })),
      ...(totals.vat_total > 0 ? [{ account_code: VAT, debit: totals.vat_total, credit: 0 }] : []),
      { account_code: DEBTORS, debit: 0, credit: totals.gross_total, memo: inv.customer_name },
    ] });
    await ctx.db.FinanceInvoice.update(cn.id, { ledger_entry_id: entry.id, status: cn.balance_due > 0 ? "issued" : "paid" });
    const invoice = await refreshInvoice(ctx, inv, { credited_amount: r2(Number(inv.credited_amount || 0) + totals.gross_total) });
    await audit(ctx, company.id, "FinanceInvoice", cn.id, "credit_note", `${number} £${totals.gross_total.toFixed(2)} against ${inv.invoice_number}: ${reason}`);
    return { credit_note: { ...cn, ledger_entry_id: entry.id }, invoice, refund_owed: cn.balance_due };
  },

  async refund_credit(ctx, body) {
    const cn = await getOne(ctx.db.FinanceInvoice, body.credit_note_id, "Credit note");
    if (cn.document_type !== "credit_note" || !(cn.balance_due > 0)) fail("No unused credit to refund on this credit note");
    const company = await getCompany(ctx, cn.company_id);
    const amount = r2(body.amount ?? cn.balance_due);
    if (amount <= 0 || amount > cn.balance_due + 0.001) fail(`Refund must be between £0.01 and £${cn.balance_due.toFixed(2)}`);
    const date = needDate(body.date || today(), "Refund date");
    const bank = BANK_FOR_METHOD[body.method] || "1200";
    await postEntry(ctx, company, { date, source_type: "payment", source_id: cn.id, source_reference: cn.invoice_number, description: `Refund paid — ${cn.invoice_number} ${cn.customer_name}`, lines: [{ account_code: DEBTORS, debit: amount, credit: 0 }, { account_code: bank, debit: 0, credit: amount, memo: str(body.reference, 120) }] });
    const left = r2(cn.balance_due - amount);
    const updated = await ctx.db.FinanceInvoice.update(cn.id, { balance_due: left, amount_paid: r2(Number(cn.amount_paid || 0) + amount), status: left > 0 ? "issued" : "paid" });
    await audit(ctx, company.id, "FinanceInvoice", cn.id, "refund", `£${amount.toFixed(2)} refunded`);
    return { credit_note: updated };
  },

  async save_recurring(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const customer = await getOne(ctx.db.FinanceCustomer, body.customer_id, "Customer");
    if (customer.company_id !== company.id) fail("Customer belongs to another company");
    const items = await all(ctx.db.FinanceItem, { company_id: company.id });
    const totals = calcLines(body.lines, false, new Map(items.map((i: any) => [i.id, i])));
    const freq = ["weekly", "monthly", "quarterly", "annually"].includes(body.frequency) ? body.frequency : "monthly";
    const data: any = { company_id: company.id, customer_id: customer.id, name: str(body.name, 120) || `${customer.name} — ${freq} service`, reference: str(body.reference, 120), lines: totals.lines.map((l: any) => ({ item_id: l.item_id, description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price, account_code: l.account_code })), frequency: freq, next_run_date: needDate(body.next_run_date, "Next invoice date"), auto_issue: body.auto_issue !== false, auto_email: !!body.auto_email, status: ["active", "paused", "ended"].includes(body.status) ? body.status : "active", notes: str(body.notes, 1000), ...(body.end_date && isDate(body.end_date) ? { end_date: body.end_date } : {}) };
    if (body.id) { const r = await getOne(ctx.db.FinanceRecurringInvoice, body.id, "Recurring invoice"); return { recurring: await ctx.db.FinanceRecurringInvoice.update(r.id, data) }; }
    const recurring = await ctx.db.FinanceRecurringInvoice.create({ ...data, invoices_generated: 0 });
    await audit(ctx, company.id, "FinanceRecurringInvoice", recurring.id, "create", `Recurring ${freq} invoice for ${customer.name}`);
    return { recurring };
  },

  async run_recurring(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const asOf = body.as_of ? needDate(body.as_of, "Date") : today();
    const templates = await all(ctx.db.FinanceRecurringInvoice, { company_id: company.id, status: "active" });
    const created: any[] = [], errors: any[] = [];
    for (const t of templates) {
      let next = t.next_run_date, count = Number(t.invoices_generated || 0), lastId = t.last_invoice_id, lastRun = t.last_run_date;
      for (let i = 0; i < 12 && next && next <= asOf; i++) {
        if (t.end_date && next > t.end_date) break;
        try {
          const draft = await buildDraft(ctx, company, { customer_id: t.customer_id, issue_date: next, supply_date: next, reference: t.reference, lines: t.lines, notes: t.notes, recurring_id: t.id });
          let inv = await ctx.db.FinanceInvoice.create(draft);
          if (t.auto_issue) inv = await issueInvoiceRecord(ctx, company, inv);
          if (t.auto_issue && t.auto_email && inv.customer_email) inv = await emailInvoice(ctx, inv, inv.customer_email, "");
          created.push({ id: inv.id, invoice_number: inv.invoice_number || "(draft)", customer_name: inv.customer_name, gross_total: inv.gross_total });
          count++; lastId = inv.id; lastRun = next; next = addPeriod(next, t.frequency);
        } catch (e) { errors.push({ template: t.name, error: e instanceof Error ? e.message : String(e) }); break; }
      }
      const ended = !!(t.end_date && next > t.end_date);
      await ctx.db.FinanceRecurringInvoice.update(t.id, { next_run_date: next, invoices_generated: count, ...(lastId ? { last_invoice_id: lastId } : {}), ...(lastRun ? { last_run_date: lastRun } : {}), ...(ended ? { status: "ended" } : {}) });
    }
    return { created, errors };
  },

  async save_expense(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const date = needDate(body.expense_date, "Expense date");
    const description = str(body.description, 500); if (!description) fail("Description is required");
    const gross = r2(body.gross_amount); if (gross <= 0) fail("Amount must be more than £0");
    const vat = r2(body.vat_amount || 0); if (vat < 0 || vat > gross) fail("VAT amount is invalid");
    const reclaim = !!company.vat_registered && vat > 0 && body.vat_reclaimable !== false;
    const accounts = await accountMap(ctx, company.id);
    const code = str(body.account_code, 10) || "6900";
    const acc = accounts.get(code);
    if (!acc || !["expense", "asset"].includes(acc.type) || acc.subtype === "bank") fail("Choose an expense (or fixed-asset) account");
    const cost = reclaim ? r2(gross - vat) : gross;
    const expense = await ctx.db.FinanceExpense.create({ company_id: company.id, supplier_name: str(body.supplier_name, 200), supplier_invoice_number: str(body.supplier_invoice_number, 80), expense_date: date, ...(body.due_date && isDate(body.due_date) ? { due_date: body.due_date } : {}), account_code: code, category: acc.name, description, net_amount: r2(gross - vat), vat_rate: 0, vat_amount: vat, vat_reclaimable: reclaim, gross_amount: gross, currency: "GBP", payment_status: "unpaid", amount_paid: 0, ...(body.receipt_url ? { receipt_url: str(body.receipt_url, 2000) } : {}), ...(body.linked_invoice_id ? { linked_invoice_id: str(body.linked_invoice_id, 64) } : {}), notes: str(body.notes, 1000) });
    const entry = await postEntry(ctx, company, { date, source_type: "expense", source_id: expense.id, source_reference: body.supplier_invoice_number, description: `${str(body.supplier_name, 80) || "Supplier"} — ${description}`, lines: [
      { account_code: code, debit: cost, credit: 0 }, ...(reclaim ? [{ account_code: VAT, debit: vat, credit: 0, memo: "Input VAT" }] : []), { account_code: CREDITORS, debit: 0, credit: gross, memo: body.supplier_name },
    ] });
    let result = await ctx.db.FinanceExpense.update(expense.id, { ledger_entry_id: entry.id });
    if (body.paid) result = (await handlers.pay_expense(ctx, { id: expense.id, payment_date: body.payment_date || date, from_account: body.paid_from_account })).expense;
    await audit(ctx, company.id, "FinanceExpense", expense.id, "create", `Expense £${gross.toFixed(2)} ${description}`);
    return { expense: result };
  },

  async pay_expense(ctx, body) {
    const ex = await getOne(ctx.db.FinanceExpense, body.id, "Expense");
    if (ex.payment_status !== "unpaid") fail("This expense is already paid or void");
    const company = await getCompany(ctx, ex.company_id);
    const from = str(body.from_account, 10) || "1200";
    const accounts = await accountMap(ctx, company.id);
    const acc = accounts.get(from);
    if (!acc || !(acc.subtype === "bank" || from === "2500")) fail("Pay from a bank/cash account or the director's loan account");
    const date = needDate(body.payment_date || today(), "Payment date");
    const entry = await postEntry(ctx, company, { date, source_type: "expense_payment", source_id: ex.id, source_reference: ex.supplier_invoice_number, description: `Paid ${ex.supplier_name || "supplier"} — ${ex.description}`, lines: [{ account_code: CREDITORS, debit: ex.gross_amount, credit: 0 }, { account_code: from, debit: 0, credit: ex.gross_amount }] });
    const expense = await ctx.db.FinanceExpense.update(ex.id, { payment_status: "paid", amount_paid: ex.gross_amount, payment_date: date, paid_from_account: from, payment_ledger_entry_id: entry.id });
    return { expense };
  },

  async void_expense(ctx, body) {
    const ex = await getOne(ctx.db.FinanceExpense, body.id, "Expense");
    if (ex.payment_status === "void") fail("Already void");
    const company = await getCompany(ctx, ex.company_id);
    const reason = str(body.reason, 300); if (!reason) fail("Give a reason");
    const date = needDate(body.date || today(), "Date");
    if (ex.payment_ledger_entry_id) await reverseEntry(ctx, company, ex.payment_ledger_entry_id, date, reason);
    const rev = ex.ledger_entry_id ? await reverseEntry(ctx, company, ex.ledger_entry_id, date, reason) : null;
    const expense = await ctx.db.FinanceExpense.update(ex.id, { payment_status: "void", ...(rev ? { void_ledger_entry_id: rev.id } : {}), notes: `${ex.notes || ""} [Void: ${reason}]`.trim() });
    await audit(ctx, company.id, "FinanceExpense", ex.id, "void", reason);
    return { expense };
  },

  async post_journal(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const type = body.source_type === "opening_balance" ? "opening_balance" : "journal";
    const entry = await postEntry(ctx, company, { date: needDate(body.entry_date, "Journal date"), source_type: type, source_reference: str(body.reference, 120), description: str(body.description, 500) || "Manual journal", lines: Array.isArray(body.lines) ? body.lines : [] });
    await audit(ctx, company.id, "FinanceLedgerEntry", entry.id, "post", `${entry.entry_number} £${entry.total_debit.toFixed(2)}: ${entry.description}`);
    return { entry };
  },

  async reverse_entry(ctx, body) {
    const entry = await getOne(ctx.db.FinanceLedgerEntry, body.entry_id, "Entry");
    if (!["journal", "opening_balance"].includes(entry.source_type)) fail("Reverse invoices, payments and expenses from their own screens so the documents stay in step");
    const company = await getCompany(ctx, entry.company_id);
    const reason = str(body.reason, 300); if (!reason) fail("Give a reason");
    const rev = await reverseEntry(ctx, company, entry.id, needDate(body.date || today(), "Date"), reason);
    await audit(ctx, company.id, "FinanceLedgerEntry", entry.id, "reverse", reason);
    return { reversal: rev };
  },

  async lock_period(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const lockedUntil = body.locked_until ? needDate(body.locked_until, "Lock date") : null;
    const updated = await ctx.db.FinanceCompany.update(company.id, { locked_until: lockedUntil });
    await audit(ctx, company.id, "FinanceCompany", company.id, lockedUntil ? "period_lock" : "period_unlock", lockedUntil ? `Books locked up to ${lockedUntil}` : "Books unlocked", { locked_until: company.locked_until || null }, { locked_until: lockedUntil });
    return { company: updated };
  },

  async report(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    return { report: await report(ctx, company, body) };
  },

  async save_payouts(ctx, body) {
    const company = await getCompany(ctx, body.company_id);
    const rows = Array.isArray(body.records) ? body.records : [];
    if (!rows.length || rows.length > 2000) fail("Provide 1–2000 payout records");
    const clean = rows.map((p: any, i: number) => {
      const ref = str(p.payout_reference, 80), name = str(p.restaurant_name, 200);
      if (!ref || !name) fail(`Row ${i + 1}: payout reference and restaurant are required`);
      const date = needDate(p.payout_date, `Row ${i + 1} payout date`);
      const net = r2(p.net_payout); if (net < 0) fail(`Row ${i + 1}: net payout can't be negative`);
      return { company_id: company.id, payout_reference: ref, payout_date: date, ...(isDate(p.period_start) ? { period_start: p.period_start } : {}), ...(isDate(p.period_end) ? { period_end: p.period_end } : {}), payment_provider: str(p.payment_provider, 80), restaurant_name: name, currency: "GBP", gross_order_value: r2(p.gross_order_value || 0), commission_rate: r2(p.commission_rate || 0), commission_amount: r2(p.commission_amount || 0), commission_vat: r2(p.commission_vat || 0), refunds_and_chargebacks: r2(p.refunds_and_chargebacks || 0), other_deductions: r2(p.other_deductions || 0), net_payout: net, status: ["expected", "processing", "paid", "reconciled", "query"].includes(p.status) ? p.status : "expected", source_type: p.source_type === "csv_import" ? "csv_import" : "manual", external_reference: str(p.external_reference, 120), notes: str(p.notes, 1000) };
    });
    for (let i = 0; i < clean.length; i += 100) await ctx.db.FinancePayout.bulkCreate(clean.slice(i, i + 100));
    await audit(ctx, company.id, "FinancePayout", company.id, "import", `${clean.length} payout record(s) saved`);
    return { saved: clean.length };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ success: false, error: "POST only" }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) fail("Please sign in", 401);
    if (user.role !== "admin") fail("Finance is restricted to MealDrop administrators", 403);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = handlers[action];
    if (!handler) fail(`Unknown action "${action}"`);
    const result = await handler({ db: base44.asServiceRole.entities, user, base44 }, body);
    return Response.json({ success: true, ...result });
  } catch (error) {
    const status = error instanceof FinError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected finance error";
    console.error("[finance-operations]", message);
    return Response.json({ success: false, error: message }, { status });
  }
});
