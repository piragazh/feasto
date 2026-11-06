import { createClientFromRequest } from "npm:@base44/sdk@0.8.23";
import Stripe from "npm:stripe";

const MEALDROP_COMPANY_ID = "6adb27b5c246acfa7f3c9b9a";
const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const responseError = (message: string, status = 400) => Response.json({ success: false, error: message }, { status });

function stripeMode(key: string) {
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return responseError("POST only", 405);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return responseError("Unauthorized", 401);
    if (user.role !== "admin") return responseError("Finance is restricted to MealDrop administrators", 403);
    const body = await req.json();
    const companyId = String(body?.company_id || "");
    const action = String(body?.action || "");
    if (!companyId) return responseError("company_id is required");
    if (companyId !== MEALDROP_COMPANY_ID) return responseError("Stripe reconciliation is currently restricted to the MealDrop finance company", 403);

    const db = base44.asServiceRole;
    const company = (await db.entities.FinanceCompany.filter({ id: companyId }, null, 1, 0))?.[0];
    if (!company || company.status !== "active") return responseError("MealDrop FinanceCompany not found", 404);

    if (action === "sync_order_commissions") {
      // Only ONLINE card orders: that money lands in MealDrop's Stripe account.
      // POS, kiosk and third-party (Uber/Deliveroo/Just Eat) orders are paid elsewhere.
      const CARD = new Set(["card", "apple_pay", "google_pay"]);
      const EXCLUDED_SOURCES = new Set(["pos", "kiosk", "third_party"]);
      const orders: any[] = [];
      for (let skip = 0; skip < 20000; skip += 500) {
        const page = await db.entities.Order.filter({
          payment_status: { $in: ["payment_confirmed", "paid_card"] },
          status: { $in: ["delivered", "collected", "refunded"] }
        }, "-created_date", 500, skip);
        orders.push(...(page || []));
        if (!page || page.length < 500) break;
      }
      const existing: any[] = [];
      for (let skip = 0; skip < 50000; skip += 500) {
        const page = await db.entities.FinanceOrderCommission.filter({ company_id: companyId }, "-created_date", 500, skip);
        existing.push(...(page || []));
        if (!page || page.length < 500) break;
      }
      const byOrderId = new Map((existing || []).map((r: any) => [r.order_id, r]));
      const restaurantCache = new Map<string, any>();
      let created = 0, updated = 0, skipped = 0, excluded = 0;
      for (const order of orders) {
        if (!order?.id) continue;
        const source = String(order.order_source || "online");
        const eligible = !EXCLUDED_SOURCES.has(source) && CARD.has(String(order.payment_method || ""));
        const refundFields = order.status === "refunded"
          ? { refund_amount: roundMoney(Number(order.refund_amount ?? order.total ?? 0)), refund_paid_by: String(order.refund_paid_by || "restaurant"), ...((order.refund_approved_date || order.updated_date) ? { refunded_at: new Date(order.refund_approved_date || order.updated_date).toISOString() } : {}) }
          : {};
        const prior: any = byOrderId.get(order.id);
        if (prior) {
          // Bring older rows up to date (source, refunds) without touching anything already posted.
          const patch: any = {};
          if (!prior.order_source) patch.order_source = source;
          if (!eligible && !prior.ledger_entry_id && prior.reconciliation_status !== "excluded") { patch.reconciliation_status = "excluded"; excluded++; }
          if (order.status === "refunded" && prior.order_status !== "refunded" && !prior.refund_entry_id) Object.assign(patch, refundFields, { order_status: "refunded" });
          if (Object.keys(patch).length) { await db.entities.FinanceOrderCommission.update(prior.id, patch); updated++; } else skipped++;
          continue;
        }
        if (!eligible) { excluded++; continue; }
        const restaurantId = String(order.restaurant_id || "");
        let restaurant: any = null;
        if (restaurantId) {
          if (!restaurantCache.has(restaurantId)) {
            const records = await db.entities.Restaurant.filter({ id: restaurantId }, null, 1, 0);
            restaurantCache.set(restaurantId, records?.[0] || null);
          }
          restaurant = restaurantCache.get(restaurantId);
        }
        const gross = roundMoney(Math.max(0, Number(order.total || 0)));
        const configuredRate = Number(restaurant?.commission_rate ?? 15);
        const rate = Number.isFinite(configuredRate) && configuredRate >= 0 && configuredRate <= 100 ? configuredRate : 15;
        const commission = Math.min(gross, restaurant?.commission_type === "fixed" ? roundMoney(Number(restaurant?.fixed_commission_amount || 0)) : roundMoney(gross * rate / 100));
        await db.entities.FinanceOrderCommission.create({
          company_id: companyId, order_id: String(order.id), order_number: String(order.order_number || ""),
          restaurant_id: restaurantId, restaurant_name: String(order.restaurant_name || restaurant?.name || "Unknown restaurant"),
          ...(order.created_date ? { order_date: new Date(order.created_date).toISOString() } : {}),
          order_source: source, currency: "GBP", gross_order_value: gross, commission_rate: rate,
          commission_amount: commission, commission_vat: 0, restaurant_earnings: roundMoney(gross - commission),
          payment_method: String(order.payment_method || ""), payment_intent_id: String(order.payment_intent_id || ""),
          order_status: String(order.status || ""), payment_status: String(order.payment_status || ""),
          ...refundFields, reconciliation_status: "recorded", source_type: "order_sync",
          notes: "Online card order paid into MealDrop's Stripe account. Commission shown is an estimate; the payout statement is what's posted."
        });
        created++;
      }
      return Response.json({ success: true, action, fetched: orders.length, created, updated, skipped, excluded, message: `${created} new online card order(s) recorded, ${updated} updated, ${excluded} excluded (POS, kiosk, third-party or cash).` });
    }

    if (action === "sync_stripe_payouts") {
      const secret = Deno.env.get("STRIPE_SECRET_KEY") || "";
      const mode = stripeMode(secret);
      if (!secret || mode === "unknown") return responseError("Stripe secret key is not configured correctly. Configure STRIPE_SECRET_KEY in Base44 secrets before syncing. No key is returned by this endpoint.", 503);
      const stripe = new Stripe(secret);
      const createdFrom = Number(body.created_after || 0);
      if (!Number.isFinite(createdFrom) || createdFrom < 0) return responseError("created_after must be a Unix timestamp in seconds");
      const payouts = await stripe.payouts.list({ limit: 100, ...(createdFrom ? { created: { gte: createdFrom } } : {}) });
      const existing = await db.entities.FinanceStripeSettlement.filter({ company_id: companyId }, "-created_date", 2000, 0);
      const byStripeId = new Map((existing || []).map((r: any) => [r.stripe_payout_id, r]));
      let imported = 0, skipped = 0, skippedCurrency = 0;
      for (const payout of payouts.data || []) {
        if (byStripeId.has(payout.id)) { skipped++; continue; }
        if (String(payout.currency || "gbp").toLowerCase() !== "gbp") { skippedCurrency++; continue; }
        let txns: any[] = [];
        let txnPage = await stripe.balanceTransactions.list({ payout: payout.id, limit: 100 });
        txns.push(...(txnPage.data || []));
        while (txnPage.has_more && txnPage.data?.length) {
          txnPage = await stripe.balanceTransactions.list({ payout: payout.id, limit: 100, starting_after: txnPage.data[txnPage.data.length - 1].id });
          txns.push(...(txnPage.data || []));
          if (txns.length >= 5000) break;
        }
        const gross = roundMoney(txns.reduce((s: number, tx: any) => s + Number(tx.amount || 0), 0) / 100);
        const fees = roundMoney(txns.reduce((s: number, tx: any) => s + Number(tx.fee || 0), 0) / 100);
        const net = roundMoney(txns.reduce((s: number, tx: any) => s + Number(tx.net || 0), 0) / 100);
        const amount = roundMoney(Number(payout.amount || 0) / 100);
        const matched = Math.abs(net - amount) <= 0.01;
        await db.entities.FinanceStripeSettlement.create({
          company_id: companyId, stripe_payout_id: payout.id, payout_reference: payout.id,
          payout_date: new Date(Number(payout.created) * 1000).toISOString(),
          ...(payout.arrival_date ? { arrival_date: new Date(Number(payout.arrival_date) * 1000).toISOString() } : {}),
          currency: String(payout.currency || "gbp"), amount, gross_balance_transactions: gross,
          stripe_fees: fees, net_balance_transactions: net, status: String(payout.status || "unknown"),
          reconciliation_status: matched ? "matched" : "query", source_type: "stripe_api",
          livemode: Boolean(payout.livemode), external_reference: payout.id,
          notes: matched
            ? "Imported from Stripe API. Net balance transactions match payout amount within £0.01."
            : "Review required: balance transaction net total differs from payout amount. Stripe API payout is a MealDrop bank settlement, not a restaurant payout."
        });
        imported++;
      }
      return Response.json({ success: true, action, stripe_mode: mode, fetched: (payouts.data || []).length, imported, skipped, skipped_non_gbp: skippedCurrency, has_more: Boolean(payouts.has_more), message: "Imported GBP Stripe account-to-bank payouts only. These are not restaurant transfers. Sync checks the latest 100 payouts; use a date filter for older history." });
    }

    return responseError("Unsupported action. Use sync_order_commissions or sync_stripe_payouts");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Stripe finance reconciliation error";
    console.error("[finance-stripe-reconciliation]", message);
    return responseError(message, /not found|access denied/i.test(message) ? 404 : 400);
  }
});
