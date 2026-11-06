import "./.engine.ts";
import { store, entities, call, check, done } from "./mock.ts";

const { company } = await call("save_company", { fields: { legal_name: "MealDrop LTD" } });
const cid = company.id;
await call("seed_chart", { company_id: cid });
check("post blocked without start date", (await call("post_marketplace", { company_id: cid })).success === false);
await call("save_company", { company_id: cid, fields: { marketplace_from: "2026-10-01" } });
const O = (id: string, date: string, v: number, extra: any = {}) => ({ company_id: cid, order_id: id, order_number: id, restaurant_id: "r1", restaurant_name: "Tilbury Chicken", order_date: date + "T12:00:00Z", gross_order_value: v, commission_amount: 0, reconciliation_status: "recorded", order_status: "delivered", ...extra });
await entities.FinanceOrderCommission.bulkCreate([
  O("A", "2026-10-05", 100), O("B", "2026-10-05", 50), O("C", "2026-10-06", 30),
  O("D", "2026-10-07", 20, { order_status: "refunded", refund_amount: 20, refund_paid_by: "restaurant", refunded_at: "2026-10-08T10:00:00Z" }),
  O("E", "2026-10-09", 10, { order_status: "refunded", refund_amount: 10, refund_paid_by: "platform", refunded_at: "2026-10-09T15:00:00Z" }),
  O("OLD", "2026-09-20", 99), O("X", "2026-10-10", 40, { reconciliation_status: "excluded" }),
]);
// Payout as Super Admin now calculates it: card 180 completed + 10 MealDrop-absorbed refund kept by restaurant = 190; 5% = 9.5
const pay = await entities.Payout.create({ restaurant_id: "r1", restaurant_name: "Tilbury Chicken", period_start: "2026-09-30T23:00:00.000Z", period_end: "2026-10-31T23:59:59.999Z", card_payment_amount: 190, gross_earnings: 190, platform_commission: 9.5, commission_rate: 5, net_payout: 180.5, status: "pending" });
const oldPay = await entities.Payout.create({ restaurant_id: "r1", restaurant_name: "Tilbury Chicken", period_start: "2026-08-31T23:00:00.000Z", period_end: "2026-09-30T22:59:59.999Z", platform_commission: 5, net_payout: 94, status: "paid", paid_date: "2026-09-15T10:00:00Z" });
await entities.FinanceStripeSettlement.create({ company_id: cid, stripe_payout_id: "po_1", arrival_date: "2026-10-20T00:00:00Z", amount: 175, stripe_fees: 5, status: "paid", reconciliation_status: "matched" });

const r1 = await call("post_marketplace", { company_id: cid });
check("posted 5 orders (pre-start and excluded skipped)", r1.receipts === 5, r1);
check("posted 2 refunds", r1.refunds === 2, r1);
check("posted 1 commission (payout before start skipped)", r1.commissions === 1, r1);
check("posted 1 Stripe settlement", r1.settlements === 1, r1);
check("receipts grouped per restaurant per day", store.FinanceLedgerEntry.filter((e: any) => e.source_type === "order_receipt").length === 4);
let bal = (await call("report", { company_id: cid, type: "restaurant_balances", as_of: "2026-12-31" })).report;
const row = bal.rows.find((r: any) => r.restaurant_id === "r1");
check("held for Tilbury = 210 - 20 refund - 9.5 commission = 180.5", row.balance === 180.5, row);
check("held matches pending payout", row.pending_payouts === 180.5, row);
const tb = async () => (await call("report", { company_id: cid, type: "trial_balance", as_of: "2026-12-31" })).report;
let t = await tb();
const b = (c: string) => { const r = t.rows.find((x: any) => x.code === c); return r ? Math.round((r.debit - r.credit) * 100) / 100 : 0; };
check("commission income 9.5", b("4030") === -9.5, t.rows);
check("MealDrop-absorbed refund in 6910", b("6910") === 10, t.rows);
check("Stripe fees 5", b("6020") === 5);
const again = await call("post_marketplace", { company_id: cid });
check("re-run posts nothing", again.receipts + again.refunds + again.commissions + again.payouts_paid + again.settlements === 0, again);

const mp = await call("mark_payout_paid", { company_id: cid, payout_id: pay.id, paid_date: "2026-11-06", payment_method: "bank_transfer", transaction_reference: "MD-OCT" });
check("mark paid posts the bank payment", mp.posted === true && mp.payout.status === "paid", mp);
check("can't pay twice", (await call("mark_payout_paid", { company_id: cid, payout_id: pay.id })).success === false);
check("can't void a paid payout", (await call("void_payout", { company_id: cid, payout_id: pay.id, reason: "x" })).success === false);
bal = (await call("report", { company_id: cid, type: "restaurant_balances", as_of: "2026-12-31" })).report;
check("held now 0", bal.rows.find((r: any) => r.restaurant_id === "r1").balance === 0, bal.rows);
t = await tb();
check("Stripe balance per books = 0 (210 in, 30 refunded, 180 settled)", b("1210") === 0 && bal.stripe_balance_per_books === 0, t.rows);
check("bank = 175 in - 180.5 out", b("1200") === -5.5, b("1200"));
check("payout paid before start date not posted", !store.Payout.find((p: any) => p.id === oldPay.id).finance_payment_entry_id);

const p2 = await entities.Payout.create({ restaurant_id: "r1", restaurant_name: "Tilbury Chicken", period_start: "2026-10-31T00:00:00Z", period_end: "2026-11-06T23:59:59Z", platform_commission: 3, net_payout: 57, status: "pending" });
await call("post_marketplace", { company_id: cid });
check("commission posted for new payout", !!store.Payout.find((p: any) => p.id === p2.id).finance_commission_entry_id);
const v = await call("void_payout", { company_id: cid, payout_id: p2.id, reason: "wrong period" });
check("void keeps the record", v.payout?.status === "voided" && store.Payout.some((p: any) => p.id === p2.id), v);
t = await tb();
check("void reverses its commission", b("4030") === -9.5, b("4030"));
check("trial balance balances", t.total_debit === t.total_credit);
await call("lock_period", { company_id: cid, locked_until: "2026-11-30" });
await entities.FinanceOrderCommission.create(O("L", "2026-11-10", 15));
const r3 = await call("post_marketplace", { company_id: cid });
check("locked-period orders skipped, not failed", r3.success && r3.skipped_locked === 1 && r3.receipts === 0, r3);
done();
