import "./.engine.ts";
import { store, sent, setUser, call, check, done } from "./mock.ts";

const today = () => new Date().toISOString().slice(0, 10);
const tbOf = async (cid: string, as_of = "2027-12-31") => (await call("report", { company_id: cid, type: "trial_balance", as_of })).report;

setUser({ id: "u2", role: "user" });
check("non-admin rejected", (await call("report", {})).status === 403);
setUser({ id: "u1", email: "a@t", role: "admin" });

const { company } = await call("save_company", { fields: { legal_name: "MealDrop LTD", trading_name: "MealDrop", company_number: "12345678", address: { line_1: "1 High St", city: "Rainham", postcode: "rm13 1aa" }, bank_sort_code: "00-00-00", bank_account_number: "12345678", payment_terms_days: 14 } });
const cid = company.id;
check("posting blocked before chart", (await call("post_journal", { company_id: cid, entry_date: "2026-11-01", description: "x", lines: [{ account_code: "1200", debit: 1 }, { account_code: "3000", credit: 1 }] })).success === false);
check("chart seeded", (await call("seed_chart", { company_id: cid })).added > 30);
check("chart seeding idempotent", (await call("seed_chart", { company_id: cid })).added === 0);
check("opening journal posted", (await call("post_journal", { company_id: cid, entry_date: "2026-04-01", source_type: "opening_balance", description: "Share capital", lines: [{ account_code: "1200", debit: 100 }, { account_code: "3000", credit: 100 }] })).success);
check("unbalanced journal rejected", (await call("post_journal", { company_id: cid, entry_date: "2026-04-01", description: "bad", lines: [{ account_code: "1200", debit: 100 }, { account_code: "3000", credit: 90 }] })).success === false);

const { customer } = await call("save_customer", { company_id: cid, name: "Tilbury Chicken", email: "owner@tilbury.test", billing_address: "1 Dock Rd\nTilbury" });
const { item: screen } = await call("save_item", { company_id: cid, name: "Media screen 43in", item_type: "equipment", unit_price: 450 });
const { item: labour } = await call("save_item", { company_id: cid, name: "Installation", item_type: "labour", unit_price: 40 });
const { item: svc } = await call("save_item", { company_id: cid, name: "Media screen service", item_type: "subscription", unit_price: 25 });
check("labour item defaults to 4010 / hour", labour.account_code === "4010" && labour.unit === "hour", labour);

const d1 = await call("save_draft", { company_id: cid, customer_id: customer.id, issue_date: "2026-11-06", reference: "Media screen install", lines: [{ item_id: screen.id, quantity: 2, unit_price: 450, vat_rate: 20 }, { item_id: labour.id, quantity: 3, unit_price: 40 }, { description: "Setup fee", quantity: 1, unit_price: 75, discount_percent: 20 }] });
check("draft totals 1080, VAT ignored (not registered)", d1.invoice.gross_total === 1080 && d1.invoice.vat_total === 0, d1);
check("draft has no number", !d1.invoice.invoice_number);
check("due date = issue + 14 days", d1.invoice.due_date === "2026-11-20", d1.invoice.due_date);
const iss = await call("issue_invoice", { id: d1.invoice.id, send: true });
check("issued as INV-0001", iss.invoice?.invoice_number === "INV-0001", iss);
check("email sent with no-VAT wording", sent.length === 1 && sent[0].to === "owner@tilbury.test" && sent[0].body.includes("not registered for VAT"));
check("company details frozen on invoice", iss.invoice.company_snapshot?.company_number === "12345678");
check("issued invoice can't be edited", (await call("save_draft", { company_id: cid, id: d1.invoice.id, customer_id: customer.id, lines: [{ description: "x", quantity: 1, unit_price: 1 }] })).success === false);
let t = await tbOf(cid);
const bal = (code: string) => { const r = t.rows.find((x: any) => x.code === code); return r ? r.debit - r.credit : 0; };
check("debtors 1080", bal("1100") === 1080, t.rows);
check("sales split equipment 900 / labour 120 / services 60", bal("4000") === -900 && bal("4010") === -120 && bal("4020") === -60, t.rows);

check("overpayment rejected", (await call("record_payment", { invoice_id: d1.invoice.id, amount: 2000, payment_date: "2026-11-10" })).success === false);
const p1 = await call("record_payment", { invoice_id: d1.invoice.id, amount: 500, payment_date: "2026-11-10" });
check("part paid", p1.invoice.status === "part_paid" && p1.invoice.balance_due === 580, p1);
const p2 = await call("record_payment", { invoice_id: d1.invoice.id, amount: 580, payment_date: "2026-11-12" });
check("fully paid", p2.invoice.status === "paid" && p2.invoice.balance_due === 0, p2);
const rp = await call("reverse_payment", { payment_id: p2.payment.id, reason: "bounced" });
check("reversed payment reopens invoice", rp.invoice.status === "part_paid" && rp.invoice.balance_due === 580, rp);
const cn = await call("create_credit_note", { invoice_id: d1.invoice.id, reason: "Discount agreed", date: "2026-11-15", lines: [{ description: "Goodwill", quantity: 1, unit_price: 80, account_code: "4020" }] });
check("credit note CN-0001", cn.credit_note?.invoice_number === "CN-0001", cn);
check("invoice balance 500 after credit", cn.invoice.balance_due === 500 && cn.invoice.credited_amount === 80, cn.invoice);
check("void blocked once paid", (await call("void_invoice", { id: d1.invoice.id, reason: "x" })).success === false);

const d2 = await call("save_draft", { company_id: cid, customer_id: customer.id, issue_date: "2026-11-06", lines: [{ item_id: svc.id, quantity: 1 }], issue: true });
check("price-list line without price uses item price; INV-0002", d2.invoice?.invoice_number === "INV-0002" && d2.invoice.gross_total === 25, d2);
check("void", (await call("void_invoice", { id: d2.invoice.id, reason: "Issued in error" })).invoice.status === "void");
const d3 = await call("save_draft", { company_id: cid, customer_id: customer.id, lines: [{ item_id: svc.id, quantity: 1 }], issue: true });
check("numbers never reused (INV-0003)", d3.invoice.invoice_number === "INV-0003");
await call("record_payment", { invoice_id: d3.invoice.id, amount: 25, payment_date: today() });
const cn2 = await call("create_credit_note", { invoice_id: d3.invoice.id, reason: "Cancelled service" });
check("credit on paid invoice = refund owed 25", cn2.refund_owed === 25, cn2);
check("refund settles credit note", (await call("refund_credit", { credit_note_id: cn2.credit_note.id, date: today() })).credit_note.status === "paid");
check("credit beyond invoice rejected", (await call("create_credit_note", { invoice_id: d3.invoice.id, reason: "again" })).success === false);

const e1 = await call("save_expense", { company_id: cid, supplier_name: "Currys", description: "2x 43in display", expense_date: "2026-11-02", account_code: "5000", gross_amount: 600, vat_amount: 100, paid: true, payment_date: "2026-11-02", paid_from_account: "2500" });
check("expense paid via director loan", e1.expense?.payment_status === "paid", e1);
const e2 = await call("save_expense", { company_id: cid, supplier_name: "AWS", description: "Hosting", expense_date: "2026-11-03", account_code: "6000", gross_amount: 30 });
t = await tbOf(cid);
check("VAT stays in cost when not registered", bal("5000") === 600 && bal("2200") === 0, t.rows);
check("creditors 30, director loan 600", bal("2100") === -30 && bal("2500") === -600, t.rows);
check("bank can't be a cost category", (await call("save_expense", { company_id: cid, description: "x", expense_date: "2026-11-03", account_code: "1200", gross_amount: 5 })).success === false);
check("expense void", (await call("void_expense", { id: e2.expense.id, reason: "duplicate" })).expense.payment_status === "void");

const pnl = (await call("report", { company_id: cid, type: "profit_and_loss", from: "2026-04-01", as_of: "2027-03-31" })).report;
check("P&L sales 1000", pnl.sales.total === 1000, pnl.sales);
check("P&L gross profit 400", pnl.gross_profit === 400);
check("balance sheet balances", (await call("report", { company_id: cid, type: "balance_sheet", as_of: "2027-03-31" })).report.balanced);
const aged = (await call("report", { company_id: cid, type: "aged_debtors", as_of: "2027-01-15" })).report;
check("aged debtors 500 in 31-60", aged.totals.total === 500 && aged.totals["31_60"] === 500, aged.totals);
const vat = (await call("report", { company_id: cid, type: "vat_threshold", as_of: "2026-11-30" })).report;
check("VAT threshold rolling 1000, ok", vat.rolling_12_months === 1000 && vat.status === "ok", vat);
const gl = (await call("report", { company_id: cid, type: "general_ledger", account_code: "1100", from: "2026-11-11", as_of: "2027-03-31" })).report;
check("account history: reversal not back-dated", gl.opening === 580 && gl.closing === 500 && gl.rows.length === 3, gl);

await call("lock_period", { company_id: cid, locked_until: "2026-11-30" });
check("posting in locked period blocked", (await call("record_payment", { invoice_id: d1.invoice.id, amount: 10, payment_date: "2026-11-20" })).success === false);
check("posting after lock ok", (await call("record_payment", { invoice_id: d1.invoice.id, amount: 10, payment_date: "2026-12-02" })).success === true);

check("recurring saved", (await call("save_recurring", { company_id: cid, customer_id: customer.id, name: "Monthly service", frequency: "monthly", next_run_date: "2026-12-31", lines: [{ item_id: svc.id, quantity: 1, unit_price: 25 }], auto_issue: true, auto_email: true })).success);
const run1 = await call("run_recurring", { company_id: cid, as_of: "2027-02-28" });
check("recurring catch-up: Dec 31, Jan 31, Feb 28", run1.created.length === 3, run1);
check("next run back on the 31st", store.FinanceRecurringInvoice[0].next_run_date === "2027-03-31", store.FinanceRecurringInvoice[0].next_run_date);
check("re-run creates no duplicates", (await call("run_recurring", { company_id: cid, as_of: "2027-02-28" })).created.length === 0);
check("next invoice number can't go backwards", (await call("save_company", { company_id: cid, fields: { next_invoice_number: 1 } })).success === false);
t = await tbOf(cid);
check("final trial balance balances", t.total_debit === t.total_credit, t);
check("audit trail written", store.FinanceAuditLog.length > 15);
done();
