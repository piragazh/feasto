import "./.engine.ts";
import { store, call, check, done } from "./mock.ts";

// Restaurant payout engine: generate_payout / preview_payout / void_payout.
store.Restaurant = [
  { id: "r1", name: "Tilbury Chicken", commission_rate: 5, commission_type: "percentage", reserve_percent: 0 },
  { id: "r0", name: "Free Trial Grill", commission_rate: 0, commission_type: "percentage", reserve_percent: 0 },
  { id: "rf", name: "Flat Fee Cafe", commission_type: "fixed", fixed_commission_amount: 30, reserve_percent: 0 },
];
const O = (id: string, rid: string, date: string, total: number, extra: any = {}) => ({
  id, restaurant_id: rid, created_date: date + "T12:00:00.000Z", total, order_source: "online",
  status: "delivered", payment_method: "card", payment_status: "payment_confirmed", order_type: "delivery", ...extra,
});
store.Order = [
  O("A", "r1", "2026-10-05", 100),
  O("B", "r1", "2026-10-06", 50, { payment_method: "cash", payment_status: "pending_payment" }),
  O("C", "r1", "2026-10-30", 30, { status: "ready_for_collection", order_type: "collection" }),
  O("D", "r1", "2026-10-07", 20, { status: "refund_rejected_by_restaurant" }),
  O("E", "r1", "2026-10-08", 40, { status: "refunded", refund_amount: 10, refund_paid_by: "restaurant" }),
  O("F", "r1", "2026-10-09", 25, { status: "refunded", refund_amount: 25, refund_paid_by: "platform" }),
  O("G", "r1", "2026-10-10", 15, { payment_status: "failed_payment" }),
  O("H", "r1", "2026-10-11", 9, { status: "cancelled" }),
  O("I", "r1", "2026-10-12", 999, { order_source: "pos" }),
  O("J", "r1", "2026-11-02", 70),
  O("Z", "r0", "2026-10-05", 80),
  O("Y", "rf", "2026-09-20", 10),
];
const gen = (b: any) => call("generate_payout", b);

// 1. First payout: October, UK month boundaries
const p1 = (await gen({ restaurant_id: "r1", frequency: "custom", start_date: "2026-10-01", end_date: "2026-10-31" })).payout;
check("Oct starts at UK midnight (BST)", p1.period_start === "2026-09-30T23:00:00.000Z", p1.period_start);
check("Oct ends at UK midnight (GMT)", p1.period_end === "2026-10-31T23:59:59.999Z", p1.period_end);
check("rejected-refund order is paid (1.2)", p1.order_ids.includes("D"));
check("unfinished order held, not dropped (1.1)", !p1.order_ids.includes("C") && p1.held_orders === 1, p1);
check("failed card payment excluded (1.8)", !p1.order_ids.includes("G") && p1.unpaid_card_orders === 1);
check("POS and after-cut-off orders excluded", !p1.order_ids.includes("I") && !p1.order_ids.includes("J"));
check("gross = 100+50+20+30 kept of E+25 platform-refunded F", p1.gross_earnings === 225, p1.gross_earnings);
check("card 175 / cash 50", p1.card_payment_amount === 175 && p1.cash_payment_amount === 50, p1);
check("commission 5% = 11.25", p1.platform_commission === 11.25, p1.platform_commission);
check("net 163.75", p1.net_payout === 163.75, p1.net_payout);
check("platform refund reported, not deducted", p1.refunds_paid_by_platform === 25 && p1.refunds_paid_by_restaurant === 0, p1);

// 2. Same period can't be paid twice
const again = await gen({ restaurant_id: "r1", frequency: "custom", end_date: "2026-10-31" });
check("re-run of a paid period refused", again.success === false, again);

// 3. Late order, earlier card refund deducted once, cash refund not deducted, shortfall
store.Order.find((o: any) => o.id === "C").status = "collected";
Object.assign(store.Order.find((o: any) => o.id === "A"), { status: "refunded", refund_amount: 100, refund_paid_by: "restaurant" });
Object.assign(store.Order.find((o: any) => o.id === "B"), { status: "refunded", refund_amount: 50, refund_paid_by: "restaurant" });
const p2 = (await gen({ restaurant_id: "r1", frequency: "custom", end_date: "2026-11-15" })).payout;
check("continues exactly where Oct ended (1.7)", p2.period_start === "2026-11-01T00:00:00.000Z", p2.period_start);
check("late order C picked up", p2.order_ids.includes("C") && p2.late_orders === 1, p2);
check("earlier card refund deducted (100)", p2.refunds_paid_by_restaurant === 100, p2.refunds_paid_by_restaurant);
check("earlier cash refund not deducted (1.4)", p2.cash_refunds_not_deducted === 50, p2);
check("shortfall 100 - 5 - 100 = -5", p2.net_payout === 0 && p2.shortfall_amount === 5, p2);

// 4. Shortfall carried forward (2.1); refunds not counted twice
store.Order.push(O("K", "r1", "2026-11-17", 40));
const p3 = (await gen({ restaurant_id: "r1", frequency: "custom", end_date: "2026-11-18" })).payout;
check("brought forward 5", p3.brought_forward_amount === 5, p3);
check("net 40 - 2 - 5 = 33", p3.net_payout === 33, p3.net_payout);
check("refund A not deducted again", p3.refunds_paid_by_restaurant === 0 && !p3.refund_order_ids.includes("A"), p3);

// 5. Void rules
const vMid = await call("void_payout", { payout_id: p2.id, reason: "test" });
check("can't void a payout in the middle", vMid.success === false, vMid);
const vLast = await call("void_payout", { payout_id: p3.id, reason: "test" });
check("can void the latest", vLast.success === true, vLast);
const p3b = (await gen({ restaurant_id: "r1", frequency: "custom", end_date: "2026-11-18" })).payout;
check("voiding releases its orders", p3b.order_ids.includes("K") && p3b.net_payout === 33, p3b);

// 6. 0% commission stays 0 (1.5)
const z = (await gen({ restaurant_id: "r0", frequency: "custom", end_date: "2026-10-31" })).payout;
check("0% commission is 0, not 15%", z.platform_commission === 0 && z.net_payout === 80, z);

// 7. Fixed fee once per calendar month
const f = (await call("preview_payout", { restaurant_id: "rf", frequency: "custom", start_date: "2026-09-15", end_date: "2026-11-10" })).preview;
check("fixed fee: Sep + Oct month-ends = 2 x 30", f.commission_months === 2 && f.platform_commission === 60, f);
check("preview creates nothing", !store.Payout.some((p: any) => p.restaurant_id === "rf"));

// 8. Weekly = last full Mon-Sun week
const w = (await call("preview_payout", { restaurant_id: "rf", frequency: "weekly" })).preview;
const endUk = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(w.period_end));
check("weekly ends on a Sunday before today", new Date(endUk + "T00:00:00Z").getUTCDay() === 0 && endUk < new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()), endUk);
// 9. Legacy payouts (no order_ids): covered what was complete when generated
store.Restaurant.push({ id: "rL", name: "Legacy", commission_rate: 5, reserve_percent: 0 });
const H = (t: string) => [{ status: "delivered", timestamp: t }];
store.Order.push(
  O("L1", "rL", "2026-08-20", 10, { status_history: H("2026-08-20T13:00:00Z") }),
  O("L2", "rL", "2026-08-31", 54.03, { status_history: H("2026-09-01T11:05:13Z") }),
  O("L3", "rL", "2026-08-21", 20),
);
store.Payout.push({ id: "legacyAug", restaurant_id: "rL", status: "paid", period_start: "2026-07-31T23:00:00.000Z", period_end: "2026-08-31T22:59:59.999Z", created_date: "2026-09-01T07:55:00.753Z", shortfall_amount: 0 });
const lg = (await call("preview_payout", { restaurant_id: "rL", frequency: "custom", end_date: "2026-09-30" })).preview;
check("legacy: order completed after the payout was made is paid now", lg.late_orders === 1 && lg.card_payment_amount === 54.03, lg);
check("future end date refused", (await gen({ restaurant_id: "rf", frequency: "custom", end_date: "2099-01-01" })).success === false);
done();
