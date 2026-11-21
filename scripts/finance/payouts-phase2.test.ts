import "./.engine.ts";
import { store, entities, call, check, done, setUser } from "./mock.ts";

// Phase 2: reserve, adjustments (chargebacks / manual), scheduled drafts + approval,
// bank details + payment batch, restaurant self-service access, dispute webhook maths.
const admin = { id: "u1", email: "admin@test", role: "admin" };
store.Restaurant = [
  { id: "rN", name: "New Grill", commission_rate: 5 },                                     // brand new: gets the reserve
  { id: "rS", name: "Scheduled Pizza", commission_rate: 10, payout_schedule: "monthly", reserve_percent: 0 },
];
const O = (id: string, rid: string, date: string, total: number, extra: any = {}) => ({ id, restaurant_id: rid, created_date: date + "T12:00:00.000Z", total, order_source: "online", status: "delivered", payment_method: "card", payment_status: "payment_confirmed", ...extra });
store.Order = [
  O("n1", "rN", "2026-01-10", 100), O("n2", "rN", "2026-02-10", 200), O("n3", "rN", "2026-04-10", 50),
  O("s1", "rS", "2026-09-10", 100),
];
store.Payout = [];
const gen = (b: any) => call("generate_payout", b);

// ── Reserve for a new restaurant ──
const p1 = (await gen({ restaurant_id: "rN", frequency: "custom", start_date: "2026-01-01", end_date: "2026-01-31" })).payout;
check("reserve: 10% of £100 card held", p1.reserve_held === 10 && p1.net_payout === 85, p1);
const rN = store.Restaurant.find((r: any) => r.id === "rN");
check("reserve settings saved on first payout (90 days)", rN.reserve_percent === 10 && rN.reserve_until === "2026-04-01T22:59:59.999Z", rN);
check("reserve release created for later", store.PayoutAdjustment.some((a: any) => a.type === "reserve_release" && a.amount === 10 && a.source_payout_id === p1.id));

// ── Chargeback + Stripe fee (as the webhook records them) and a manual credit ──
await entities.PayoutAdjustment.create({ restaurant_id: "rN", restaurant_name: "New Grill", type: "chargeback", amount: -20, status: "open", available_from: "2026-02-05T10:00:00Z", stripe_dispute_id: "dp_1" });
await entities.PayoutAdjustment.create({ restaurant_id: "rN", restaurant_name: "New Grill", type: "dispute_fee", amount: -15, status: "open", available_from: "2026-02-05T10:00:00Z", stripe_dispute_id: "dp_1" });
const cr = await call("add_adjustment", { restaurant_id: "rN", type: "manual_credit", amount: 7.5, reason: "Missing item goodwill" });
store.PayoutAdjustment.find((a: any) => a.id === cr.adjustment.id).available_from = "2026-02-06T10:00:00Z";
check("manual adjustment needs a reason", (await call("add_adjustment", { restaurant_id: "rN", type: "manual_debit", amount: 5 })).success === false);
const p2 = (await gen({ restaurant_id: "rN", frequency: "custom", end_date: "2026-02-28" })).payout;
// card 200 - 10 commission - 20 chargeback - 15 fee + 7.5 credit = 162.5; reserve 10% of 200 = 20 → 142.5
check("chargeback + fee + credit applied", p2.chargebacks_amount === -35 && p2.manual_adjustments_amount === 7.5, p2);
check("still in reserve window: 20 held, net 142.5", p2.reserve_held === 20 && p2.net_payout === 142.5, p2);
check("reserve release not due yet", p2.reserve_released_amount === 0);

// waive a chargeback that's already settled → refused
const cb = store.PayoutAdjustment.find((a: any) => a.type === "chargeback");
check("can't waive an adjustment already in a payout", (await call("waive_adjustment", { adjustment_id: cb.id })).success === false);
// a new open dispute, waived before payout → not charged
const cb2 = await entities.PayoutAdjustment.create({ restaurant_id: "rN", restaurant_name: "New Grill", type: "chargeback", amount: -40, status: "open", available_from: "2026-03-01T10:00:00Z", stripe_dispute_id: "dp_2" });
check("waive open chargeback", (await call("waive_adjustment", { adjustment_id: cb2.id, reason: "Our fault" })).success === true);

// ── After the reserve window: no hold, both holds released ──
const p3 = (await gen({ restaurant_id: "rN", frequency: "custom", end_date: "2026-04-30" })).payout;
check("no reserve after 90 days", p3.reserve_held === 0, p3);
check("both holds released (10 + 20)", p3.reserve_released_amount === 30, p3);
check("waived chargeback not deducted", p3.chargebacks_amount === 0, p3);
check("net = 50 - 2.5 + 30 = 77.5", p3.net_payout === 77.5, p3.net_payout);

// voiding releases its adjustments; the regenerated payout is identical
await call("void_payout", { payout_id: p3.id, reason: "test" });
const p3b = (await gen({ restaurant_id: "rN", frequency: "custom", end_date: "2026-04-30" })).payout;
check("void + regenerate gives the same payout", p3b.net_payout === 77.5 && p3b.reserve_released_amount === 30, p3b);
// voiding the payout that HELD reserve cancels its release: void p3b, then p2 is latest
await call("void_payout", { payout_id: p3b.id, reason: "x" });
await call("void_payout", { payout_id: p2.id, reason: "x" });
const p2b = (await call("preview_payout", { restaurant_id: "rN", frequency: "custom", end_date: "2026-04-30" })).preview;
check("voided payout's reserve release is ignored", p2b.reserve_released_amount === 10, p2b);

// ── Scheduled draft → approval → pay ──
const sch = await call("run_schedule", {});
check("scheduler drafted Scheduled Pizza", sch.drafted?.some((d: any) => d.restaurant === "Scheduled Pizza"), sch);
check("scheduler skips manual restaurants", !sch.drafted?.some((d: any) => d.restaurant === "New Grill"));
const draft = store.Payout.find((p: any) => p.restaurant_id === "rS" && p.status === "awaiting_approval");
check("draft waits for approval", !!draft && draft.net_payout === 90, draft);
check("can't pay an unapproved draft", (await call("mark_payout_paid", { payout_id: draft.id })).success === false);
const again = await call("run_schedule", {});
check("scheduler is idempotent", !again.drafted?.length, again);
check("approve", (await call("approve_payout", { payout_id: draft.id })).payout?.status === "pending");

// ── Bank details, 48h hold, payment batch ──
check("bad sort code refused", (await call("save_bank_details", { restaurant_id: "rS", account_name: "Pizza Ltd", sort_code: "12-34", account_number: "12345678" })).success === false);
await call("save_bank_details", { restaurant_id: "rS", account_name: "Scheduled Pizza Ltd", sort_code: "12-34-56", account_number: "12345678" });
const masked = (await call("get_bank_details", { restaurant_id: "rS" })).bank;
check("bank details come back masked", masked.sort_code === "**-**-56" && masked.account_number === "****5678" && masked.usable, masked);
const ex = await call("export_payment_batch", {});
check("export includes approved payout", ex.included?.length === 1 && ex.csv.includes("Scheduled Pizza Lt,123456,12345678,90.00,MEALDROP ") /* name cut to 18 chars for Bacs */, ex);
check("exported payout is processing", store.Payout.find((p: any) => p.id === draft.id).status === "processing");
const bp = await call("mark_batch_paid", { batch_id: ex.batch_id, paid_date: "2026-10-05" });
check("batch marked paid", bp.paid === 1 && store.Payout.find((p: any) => p.id === draft.id).status === "paid", bp);
await call("save_bank_details", { restaurant_id: "rS", account_name: "Someone Else", sort_code: "999999", account_number: "87654321" });
const changed = (await call("get_bank_details", { restaurant_id: "rS" })).bank;
check("changed bank details held 48h, history kept", !changed.usable && changed.history.length === 1, changed);

// ── Restaurant self-service access ──
store.RestaurantManager = [{ id: "m1", user_email: "owner@pizza", is_active: true, restaurant_ids: ["rS"] }];
setUser({ id: "u2", email: "owner@pizza", role: "user" });
const mine = await call("my_payouts", { restaurant_id: "rS" });
check("manager sees own payouts, internals hidden", mine.success && mine.payouts.length === 1 && !("order_ids" in mine.payouts[0]), mine);
check("manager can't see another restaurant", (await call("my_payouts", { restaurant_id: "rN" })).status === 403);
check("manager can't use admin actions", (await call("generate_payout", { restaurant_id: "rS" })).status === 403);
const st = await call("my_statement", { restaurant_id: "rS", payout_id: draft.id });
check("statement lines", st.lines?.length === 1 && st.lines[0].total === 100, st);
setUser(null); // signed out
check("signed-out can't read", (await call("my_payouts", { restaurant_id: "rS" })).status === 401);
setUser(null);
check("scheduler runs without a user", (await call("run_schedule", {})).success === true);
setUser(admin);

// ── Dispute webhook maths (handleDispute from stripeWebhook) ──
const src = await Deno.readTextFile(new URL("../../base44/functions/stripeWebhook/entry.ts", import.meta.url));
const body = src.slice(src.indexOf("async function handleDispute"), src.indexOf("// MAIN WEBHOOK HANDLER"));
const handleDispute = new Function(`return (${body.replace(/\/\/ ─+\s*$/, "").trim()})`)();
store.Order.push(O("dp", "rS", "2026-10-02", 30, { payment_intent_id: "pi_9", order_number: "D-1" }));
const svc = { asServiceRole: { entities } };
const dispute = (bts: any[]) => ({ id: "dp_9", payment_intent: "pi_9", reason: "fraudulent", status: "needs_response", balance_transactions: bts });
await handleDispute(svc, dispute([{ amount: -3000, fee: 2000 }]));
await handleDispute(svc, dispute([{ amount: -3000, fee: 2000 }])); // repeat event
const sumOf = (t: string) => store.PayoutAdjustment.filter((a: any) => a.stripe_dispute_id === "dp_9" && a.type === t).reduce((s: number, a: any) => s + a.amount, 0);
check("dispute charges restaurant once (−30 and −20 fee)", sumOf("chargeback") === -30 && sumOf("dispute_fee") === -20, store.PayoutAdjustment.filter((a: any) => a.stripe_dispute_id === "dp_9"));
await handleDispute(svc, dispute([{ amount: -3000, fee: 2000 }, { amount: 3000, fee: -2000 }])); // won
check("won dispute credits it back", sumOf("chargeback") === 0 && sumOf("dispute_fee") === 0);
done();
