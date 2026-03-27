# Kiosk Orders — Staff Quick Reference Guide

## What Are Kiosk Orders?

Orders placed on the **self-service kiosk terminal** in your restaurant. They appear in Live Orders with a **purple 🖥️ Kiosk badge**.

---

## Kiosk Order Workflow

### 1. Customer Places Order on Kiosk

- Customer selects items, customizes options
- Chooses **"Pay at Counter"** or taps **card terminal**
- Order number is displayed on kiosk screen
- **You receive the order in Live Orders**

### 2. Accepting the Order (Staff)

#### If Order is "Counter-Pay" (Pay at Counter)
Status: **Pending** (Kitchen waits ⏸️)

**You must:**
1. **Collect payment** from the customer (cash/card)
2. **Click "Confirm Payment"** button on the order card
3. Kitchen printing happens automatically
4. Kitchen starts preparing

**Why?** We prevent orders reaching the kitchen before payment is confirmed — no fraudulent unpaid orders.

#### If Order is "Card Terminal" (Pre-paid)
Status: **Confirmed** (Kitchen starts immediately ✅)

**You must:**
1. **Click "Accept Order"** to confirm you received it
2. Kitchen printing happens automatically
3. Kitchen starts preparing

**No payment step needed** — the card terminal already collected payment.

---

## Finding Kiosk Orders in Live Orders

### Quick Filter
1. Open **Live Orders** page
2. Click **"Show Filters"**
3. Find **"Source"** dropdown
4. Select **"🖥️ Kiosk"** to see only kiosk orders
5. Or select **"Other (Online/POS)"** to hide kiosk orders

### Visual Indicator
Look for the **purple 🖥️ Kiosk badge** next to the order number.

```
Order #C-1234  [🖥️ Kiosk]  [Takeaway]  [Pending]
               ↑ Purple badge = Kiosk order
```

---

## Actions You Can Perform

### Kiosk Counter-Pay Orders (Pending)

| Button | Action | Result |
|--------|--------|--------|
| **✓ Confirm Payment** | Tap after collecting payment | Order → "Confirmed", kitchen prints & starts |
| **✗ Reject** | Tap to cancel order | Refund payment, order → "Cancelled" |
| **🖨️ Print** | Reprint kitchen ticket | Emergency reprints if printer failed |

### Kiosk Card-Terminal Orders (Confirmed)

| Button | Action | Result |
|--------|--------|--------|
| **Start Preparing** | Tap when ready to cook | Order → "Preparing" |
| **Ready for Collection** | Tap when ready | Order → "Ready for Collection", customer notified |
| **🖨️ Print** | Reprint kitchen ticket | Emergency reprints if printer failed |

### All Kiosk Orders (Any Status)

| Button | Action | Result |
|--------|--------|--------|
| **Cancel** | Tap to cancel | Order → "Cancelled", refund issued |
| **🖨️ Print** | Reprint to kitchen | Reprints current order ticket |

---

## Kitchen Ticket for Kiosk Orders

What the kitchen team sees when your order prints:

```
        ╔════════════════════════════════════════════╗
        ║         [YOUR RESTAURANT NAME]            ║
        ║            🖥️ KIOSK ORDER                 ║
        ╠════════════════════════════════════════════╣
        ║ Order: K-1234                              ║
        ║ Type: TAKEAWAY                             ║
        ║ Time: 14:35                                ║
        ╠════════════════════════════════════════════╣
        ║ ITEMS:                                     ║
        ║ 2x Burger                                  ║
        ║    - Extra lettuce                         ║
        ║    - No onions                             ║
        ║ 1x Fries                                   ║
        ║ 1x Coke                                    ║
        ╠════════════════════════════════════════════╣
        ║ CUSTOMER DETAILS:                          ║
        ║ Name: John Doe                             ║
        ║ Phone: 07700 000123                        ║
        ╠════════════════════════════════════════════╣
        ║ PAYMENT SUMMARY:                           ║
        ║ Subtotal:        £18.00                    ║
        ║ Total:           £18.00                    ║
        ╚════════════════════════════════════════════╝
```

The **🖥️ KIOSK ORDER** header tells kitchen staff this came from the kiosk (not online or POS).

---

## Common Scenarios

### Scenario 1: Customer Placed Counter-Pay Order

```
You see in Live Orders:
  Order #C-1234  [🖥️ Kiosk]  [Takeaway]  [Pending]

Action:
  1. Customer approaches counter
  2. Customer pays (cash/card/check)
  3. You click "Confirm Payment"
  4. Kitchen prints automatically
  5. Kitchen starts cooking
  6. Order status changes to "Confirmed" → "Preparing"
  7. When ready, set to "Ready for Collection"
  8. Customer collects order
```

### Scenario 2: Card Terminal Order (Already Paid)

```
You see in Live Orders:
  Order #C-1235  [🖥️ Kiosk]  [Dine-in, Table 5]  [Confirmed]

Action:
  1. You click "Accept Order" to confirm receipt
  2. Kitchen prints automatically
  3. Kitchen starts cooking
  4. When ready, set to "Start Preparing"
  5. When done, order goes to kitchen pass
  6. Waiter delivers to Table 5
```

### Scenario 3: Print Failed, Need to Reprint

```
You click "✓ Confirm Payment" but printer didn't print

Action:
  1. Click the 🖨️ (print icon) button on the order card
  2. Printer retries
  3. If still fails, show kitchen staff the order number (K-1234)
```

### Scenario 4: Customer Changes Mind (Before Payment Confirmed)

```
Customer wants to cancel before paying

Action:
  1. Click "✗ Reject" button
  2. Order → "Cancelled"
  3. Customer doesn't pay
  4. No refund needed
  5. Order removed from queue
```

---

## Key Differences: Kiosk vs Online Orders

| Feature | Kiosk | Online |
|---------|-------|--------|
| **Customer** | On-site | Delivery/collection |
| **Payment** | Counter-pay or card terminal | Online (pre-paid) |
| **Status** | Pending (if counter-pay) → Confirmed | Confirmed (already paid) |
| **Badge** | 🖥️ Purple Kiosk badge | None (or 🚚 Delivery badge) |
| **Kitchen Header** | 🖥️ KIOSK ORDER | (No special header) |
| **Confirmation Step** | Yes (staff confirms payment) | No (already paid) |
| **Notifications** | Only kitchen (no SMS — customer is on-site) | SMS to customer |

---

## Troubleshooting

### Problem: Can't find the "Confirm Payment" button

**Solution:**
- Order must be **Pending** status
- Order must be **Kiosk source** (has 🖥️ badge)
- Order must be **Counter-pay** payment method (not card)
- If order is "Confirmed", button already used — kitchen is preparing

### Problem: Kitchen didn't receive the order

**Solution:**
1. Check printer connection (should show green status)
2. Click **🖨️ Print button** to manually retrigger
3. If still fails, tell kitchen staff the order number (K-1234)

### Problem: Wrong order printed to kitchen

**Solution:**
- This shouldn't happen (system auto-routes by order ID)
- Check the order number on the ticket vs order card
- Alert kitchen staff to verify

### Problem: Customer paid but I clicked "Reject"

**Solution:**
1. **Don't worry** — status shows "Cancelled", not refunded
2. Staff/manager can:
   - Manually reopen order (contact support)
   - Accept a new manual entry for the same order
   - Refund via POS/payment system separately

---

## Tips for Smooth Workflow

✅ **Do:**
- Scan/read kiosk order number before calling customer to counter
- Confirm payment before clicking button (customer actually paid)
- Check kitchen ticket printed (green status or visual confirmation)
- Use "Reject" for orders customer cancels (not for mistakes)
- Click "Ready for Collection" when order is bagged and on counter

❌ **Don't:**
- Confirm payment before customer pays
- Leave "Pending" orders unattended (kitchen waiting)
- Ignore "Pending" status (those are waiting on you)
- Click print repeatedly (one print usually enough)
- Cancel orders as a workaround (use "Reject" instead)

---

## Customer Communication

### What to Say When Order Arrives

**Counter-pay:**
> "Your order is #K-1234. That'll be £18 please. Once you pay, I'll send it to the kitchen right away."

**Card terminal (already paid):**
> "Your order is #K-1234. Payment processed. Your order will be ready in about 15 minutes."

**Ready for collection:**
> "Order K-1234 is ready! Here's your bag. Thank you for your order."

---

## Questions?

Contact your manager or check the **Live Orders help section** if you're unsure about any step.

**Remember:** The purple 🖥️ Kiosk badge is your visual cue — those orders have special handling for payment confirmation!