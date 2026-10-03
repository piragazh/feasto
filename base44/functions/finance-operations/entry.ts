import { createClientFromRequest } from "npm:@base44/sdk@0.8.23";

const money = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Amount must be a finite number");
  return Math.round((n + Number.EPSILON) * 100) / 100;
};
const jsonError = (message: string, status = 400) => Response.json({ error: message }, { status });

function calculateLines(lines: any[]) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw new Error("Provide between 1 and 100 invoice lines");
  }
  const calculated = lines.map((line, index) => {
    const description = String(line?.description ?? "").trim();
    const quantity = Number(line?.quantity);
    const unitPrice = Number(line?.unit_price);
    const vatRate = Number(line?.vat_rate ?? 0);
    if (!description) throw new Error(`Line ${index + 1}: description is required`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000) throw new Error(`Line ${index + 1}: quantity must be positive`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 100000000) throw new Error(`Line ${index + 1}: unit price is invalid`);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) throw new Error(`Line ${index + 1}: VAT rate must be from 0 to 100`);
    const net = money(quantity * unitPrice);
    const vat = money(net * vatRate / 100);
    return { description, quantity, unit_price: money(unitPrice), net_amount: net, vat_rate: vatRate, vat_amount: vat, gross_amount: money(net + vat), ...(line.account_code ? { account_code: String(line.account_code).slice(0, 40) } : {}) };
  });
  const net_total = money(calculated.reduce((s, l) => s + l.net_amount, 0));
  const vat_total = money(calculated.reduce((s, l) => s + l.vat_amount, 0));
  return { lines: calculated, net_total, vat_total, gross_total: money(net_total + vat_total) };
}

async function audit(base44: any, user: any, companyId: string, entityName: string, recordId: string, action: string, summary: string, after: any) {
  await base44.entities.FinanceAuditLog.create({
    company_id: companyId, entity_name: entityName, record_id: recordId, action,
    changed_by_user_id: user.id, changed_at: new Date().toISOString(),
    summary, after_snapshot: after, source: "financeOperations"
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonError("POST only", 405);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return jsonError("Unauthorized", 401);
    const body = await req.json();
    const action = String(body?.action ?? "");
    
    if (action === "preview_invoice" || action === "preview_expense") {
      const totals = action === "preview_invoice"
        ? calculateLines(body.lines)
        : (() => {
            const net = money(body.net_amount);
            const rate = Number(body.vat_rate ?? 0);
            if (net < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("Net amount or VAT rate is invalid");
            const vat = money(net * rate / 100);
            return { net_amount: net, vat_rate: rate, vat_amount: vat, gross_amount: money(net + vat) };
          })();
      return Response.json({ success: true, totals });
    }

    const companyId = String(body?.company_id ?? "");
    if (!companyId) return jsonError("company_id is required");
    // Use caller-scoped access: company creator RLS is enforced, not bypassed.
    const company = await base44.entities.FinanceCompany.get(companyId);
    if (!company || company.status === "archived") return jsonError("Active FinanceCompany not found or access denied", 404);

    if (action === "create_invoice") {
      const invoiceNumber = String(body.invoice_number ?? "").trim();
      const issueDate = String(body.issue_date ?? "");
      const docType = String(body.document_type ?? "sales_invoice");
      if (!invoiceNumber || invoiceNumber.length > 80) return jsonError("A valid invoice_number is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || Number.isNaN(Date.parse(issueDate))) return jsonError("issue_date must use YYYY-MM-DD");
      if (!["sales_invoice", "purchase_invoice", "credit_note"].includes(docType)) return jsonError("Invalid document_type");
      const duplicate = await base44.entities.FinanceInvoice.filter({ company_id: companyId, invoice_number: invoiceNumber }, null, 2, 0);
      if (duplicate.length) return jsonError("Invoice number already exists for this company", 409);
      const totals = calculateLines(body.lines);
      const invoice = await base44.entities.FinanceInvoice.create({
        company_id: companyId, invoice_number: invoiceNumber, document_type: docType,
        customer_name: String(body.customer_name ?? "").slice(0, 200),
        ...(body.customer_email ? { customer_email: String(body.customer_email).slice(0, 254) } : {}),
        ...(body.customer_address && typeof body.customer_address === "object" ? { customer_address: body.customer_address } : {}),
        issue_date: issueDate,
        ...(body.due_date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date)) ? { due_date: String(body.due_date) } : {}),
        currency: "GBP", status: "draft", ...totals, amount_paid: 0, balance_due: totals.gross_total,
        ...(body.notes ? { notes: String(body.notes).slice(0, 2000) } : {})
      });
      await audit(base44, user, companyId, "FinanceInvoice", invoice.id, "create", "Draft invoice created", invoice);
      return Response.json({ success: true, invoice }, { status: 201 });
    }

    if (action === "create_expense") {
      const date = String(body.expense_date ?? "");
      const description = String(body.description ?? "").trim();
      const net = money(body.net_amount);
      const rate = Number(body.vat_rate ?? 0);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return jsonError("expense_date must use YYYY-MM-DD");
      if (!description || description.length > 500) return jsonError("A valid description is required");
      if (net < 0 || !Number.isFinite(rate) || rate < 0 || rate > 100) return jsonError("Net amount or VAT rate is invalid");
      const vat = money(net * rate / 100);
      const gross = money(net + vat);
      const expense = await base44.entities.FinanceExpense.create({
        company_id: companyId, supplier_name: String(body.supplier_name ?? "").slice(0, 200),
        supplier_invoice_number: String(body.supplier_invoice_number ?? "").slice(0, 80),
        expense_date: date, description, category: String(body.category ?? "uncategorised").slice(0, 80),
        net_amount: net, vat_rate: rate, vat_amount: vat, gross_amount: gross,
        currency: "GBP", payment_status: "unpaid", amount_paid: 0,
        ...(body.receipt_url ? { receipt_url: String(body.receipt_url).slice(0, 2000) } : {}),
        ...(body.notes ? { notes: String(body.notes).slice(0, 2000) } : {})
      });
      await audit(base44, user, companyId, "FinanceExpense", expense.id, "create", "Expense recorded", expense);
      return Response.json({ success: true, expense }, { status: 201 });
    }

    if (action === "post_journal") {
      const entryDate = String(body.entry_date ?? "");
      const description = String(body.description ?? "").trim();
      const lines = body.lines;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(Date.parse(entryDate))) return jsonError("entry_date must use YYYY-MM-DD");
      if (!description || description.length > 500) return jsonError("A valid description is required");
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100) return jsonError("A journal requires 2 to 100 lines");
      const normalized = lines.map((line: any, i: number) => {
        const debit = money(line?.debit ?? 0), credit = money(line?.credit ?? 0);
        if (!String(line?.account_code ?? "").trim()) throw new Error(`Journal line ${i + 1}: account_code is required`);
        if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) throw new Error(`Journal line ${i + 1}: enter either a positive debit or credit`);
        return { account_code: String(line.account_code).slice(0, 40), account_name: String(line.account_name ?? "").slice(0, 120), debit, credit, ...(line.tax_code ? { tax_code: String(line.tax_code).slice(0, 40) } : {}), ...(line.memo ? { memo: String(line.memo).slice(0, 300) } : {}) };
      });
      const totalDebit = money(normalized.reduce((s: number, l: any) => s + l.debit, 0));
      const totalCredit = money(normalized.reduce((s: number, l: any) => s + l.credit, 0));
      if (totalDebit <= 0 || totalDebit !== totalCredit) return jsonError("Journal is not balanced: total debits must equal total credits");
      const entry = await base44.entities.FinanceLedgerEntry.create({
        company_id: companyId, entry_number: String(body.entry_number ?? `JRN-${Date.now()}`).slice(0, 80),
        entry_date: entryDate, source_type: "journal", description, status: "posted", currency: "GBP",
        lines: normalized, total_debit: totalDebit, total_credit: totalCredit, posted_at: new Date().toISOString()
      });
      await audit(base44, user, companyId, "FinanceLedgerEntry", entry.id, "post", "Balanced journal posted", entry);
      return Response.json({ success: true, entry }, { status: 201 });
    }

    return jsonError("Unsupported action. Use preview_invoice, preview_expense, create_invoice, create_expense, or post_journal");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Finance operation error";
    console.error("Finance operation failed:", message);
    return jsonError(message, /not found|access denied/i.test(message) ? 404 : 400);
  }
});
