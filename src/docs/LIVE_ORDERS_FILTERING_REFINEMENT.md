# Live Orders — Filtering & Prioritization Refinement

**Date:** March 27, 2026  
**Objective:** Optimize staff workflow by prioritizing kiosk orders, especially unpaid ones

---

## 1. Filter Tabs (Unchanged but Enhanced)

```
[All Orders (42)] [💳 Unpaid Kiosk (3)] [🖥️ All Kiosk (8)] [Online / Other (34)]
```

**Behavior:**
- ✅ "All Orders" — shows all in sorted order (unpaid kiosk first)
- ✅ "💳 Unpaid Kiosk" — isolates counter-pay orders awaiting payment confirmation
- ✅ "🖥️ All Kiosk" — all kiosk orders (card + counter-pay)
- ✅ "Online / Other" — non-kiosk orders only

**Count badges:** Update in real-time to reflect current order count per filter.

---

## 2. Sorting & Prioritization (NEW)

Applied automatically in **all filter views**:

### Sort Order (Descending Priority)

| Priority | Criteria | Example |
|---|---|---|
| **1** | Unpaid kiosk (`payment_status === 'pending_payment'`) | Counter-pay order awaiting staff | 
| **2** | Pending/new orders (`status === 'pending'` or `order_status === 'new'`) | Waiting for kitchen acceptance |
| **3** | Confirmed orders (`order_status === 'confirmed'`) | Kitchen starting prep |
| **4** | Preparing orders (`order_status === 'preparing'`) | In progress |
| **5** | Ready orders (`order_status === 'ready'`) | Awaiting collection/driver |
| **6** | Oldest first (by `created_date`) | Within same priority, show oldest |

**Rationale:**
- Unpaid orders block kitchen workflow → show first
- Pending orders need staff action → show early
- Preparing orders are in progress → less urgent
- Oldest orders within same priority are most time-sensitive

**Code:**
```javascript
const sortedOrders = React.useMemo(() => {
    const sorted = [...orders];
    sorted.sort((a, b) => {
        // Priority 1: Unpaid kiosk orders at top
        const aUnpaidKiosk = a.order_source === 'kiosk' && a.payment_status === 'pending_payment' ? 0 : 1;
        const bUnpaidKiosk = b.order_source === 'kiosk' && b.payment_status === 'pending_payment' ? 0 : 1;
        if (aUnpaidKiosk !== bUnpaidKiosk) return aUnpaidKiosk - bUnpaidKiosk;

        // Priority 2: Pending/new orders (awaiting action)
        const statusPriority = { 
            'pending': 0, 'new': 0, 'confirmed': 1, 
            'preparing': 2, 'ready_for_collection': 3, 'out_for_delivery': 3 
        };
        const aStatus = a.order_source === 'kiosk' ? a.order_status : a.status;
        const bStatus = b.order_source === 'kiosk' ? b.order_status : b.status;
        const aPriority = statusPriority[aStatus] ?? 4;
        const bPriority = statusPriority[bStatus] ?? 4;
        if (aPriority !== bPriority) return aPriority - bPriority;

        // Priority 3: Oldest first (most urgent)
        return new Date(a.created_date) - new Date(b.created_date);
    });
    return sorted;
}, [orders]);
```

---

## 3. Card Styling & Visual Hierarchy

### Unpaid Kiosk Orders (HIGHEST VISUAL PRIORITY)

```
┌─────────────────────────────────────────────────────────────┐
│ K-1234 | 🖥️ Kiosk | 🏪 | 💳 | New        (orange border)   │
│ ⚠️ ORANGE BORDER + LIGHT ORANGE BACKGROUND                   │
└─────────────────────────────────────────────────────────────┘
```

**Styling:**
- Border: `2px solid #f97316` (orange)
- Background: `bg-orange-50/30` (light orange tint)
- Shadow: `shadow-lg shadow-orange-200` (emphasizes urgency)
- Animation: None (already pulsing payment badge)

**Key message:** "Staff action required NOW — customer waiting at counter"

### Pending Non-Kiosk Orders (HIGH PRIORITY)

```
┌─────────────────────────────────────────────────────────────┐
│ #abc123 | 🚚 | ⏳ Pending      (red border, standard)        │
│ 2px solid #ef4444                                            │
└─────────────────────────────────────────────────────────────┘
```

**Styling:** Red border (existing), but lower visual weight than unpaid kiosk

### All Other Orders (STANDARD)

```
┌─────────────────────────────────────────────────────────────┐
│ #def456 | 🖥️ Kiosk | 🏪 | ✓ | Prep        (gray border)    │
│ 1px solid #d1d5db (subtle)                                   │
└─────────────────────────────────────────────────────────────┘
```

**Styling:** Standard gray border, no background tint

---

## 4. Compact Badge Display

### Before (Verbose)

```
K-1234 | 🖥️ Kiosk | 🏪 Collection | 💳 Pending Payment | New
```

**Issues:** Takes up 2 lines, slow to scan, redundant text.

### After (Compact)

```
K-1234 | 🖥️ | 🏪 | 💳 | New
```

**Improvements:**
- ✅ Fits one line
- ✅ Icons only for quick visual scan
- ✅ Minimal text abbreviations (Conf, Prep, Ready)
- ✅ Pulsing payment badge still draws eye

**Badge sizes:** `size="sm"` (shorter padding)

**Badge text mapping:**
- Payment badges: Single emoji (💳=pending, ✓=confirmed, 💰=paid_card)
- Order status badges: Abbreviations (New, Conf, Prep, Ready)
- Order type badges: Emoji only (🚚, 🏪, 🥡, 🍽️)
- Source badge: "🖥️ Kiosk"

---

## 5. Header Alert

When viewing "All Orders" and unpaid kiosk orders exist:

```
Live Orders (42)
⚠️ 3 unpaid kiosk orders
```

**Purpose:**
- Draws staff attention if switching back to "All Orders"
- Quickly shows how many need immediate action
- Disappears when all paid or when filtered to "Unpaid Kiosk"

---

## 6. Files Changed

| File | Changes |
|---|---|
| `components/restaurant/LiveOrders` | Added `useMemo` import, sorting logic, alert, compact badge display, enhanced card styling |

---

## 7. Sorting Examples

### Example 1: Mixed Orders

```
Input (by created_date):
  A. Order #001 — Online, Delivery, Pending (10 min ago)
  B. K-050 — Kiosk, Card, Paid, New (8 min ago)
  C. K-051 — Kiosk, Counter, UNPAID, New (1 min ago) ← NEWEST
  D. Order #002 — Online, Collection, Confirmed (3 min ago)

Output (sorted):
  C. K-051 — Kiosk, Counter, UNPAID, New (1 min ago)         ← #1: Unpaid first
  A. Order #001 — Online, Delivery, Pending (10 min ago)     ← #2: Pending next
  D. Order #002 — Online, Collection, Confirmed (3 min ago)  ← #3: Confirmed
  B. K-050 — Kiosk, Card, Paid, New (8 min ago)              ← #4: New (after unpaid kiosk paid)
```

### Example 2: All In Progress

```
Input:
  A. K-100 — Kiosk, Counter, Confirmed, Prep (15 min ago)
  B. Order #200 — Online, Delivery, Prep (5 min ago)
  C. K-101 — Kiosk, Card, Paid, Prep (10 min ago)

Output (by age within same priority):
  A. K-100 — Kiosk, Counter, Confirmed, Prep (15 min ago)    ← Oldest (most urgent)
  C. K-101 — Kiosk, Card, Paid, Prep (10 min ago)
  B. Order #200 — Online, Delivery, Prep (5 min ago)         ← Newest
```

---

## 8. UX Trade-Offs

| Trade-Off | Why | Impact |
|---|---|---|
| Compact badges (emoji-only) | Faster scanning, one-line header | Staff learns emoji meanings quickly (4 total) |
| Automatic sorting (always on) | Reduces manual filtering | Staff can't reorder by preference, but workflow order is best |
| Orange highlight for unpaid | Consistent with payment metaphor | Slight visual noise if many unpaid (rare, hopefully) |
| Alert in header | Draws attention without page reload | Only shows in "All Orders" (not filtered views) |

---

## 9. Filtering Behavior Matrix

| View | Sorting | Badges | Styling | Notes |
|---|---|---|---|---|
| All Orders | Unpaid kiosk first, then status, then age | Compact | Unpaid kiosk = orange | Shows alert if unpaid exist |
| Unpaid Kiosk | Age only (all same priority) | Compact | All orange (priority view) | Fast checkout list |
| All Kiosk | Unpaid first, then status, then age | Compact | Unpaid = orange, others = standard | Full kiosk workflow view |
| Online / Other | Pending first, then status, then age | Compact | Pending = red, others = standard | Excludes kiosk entirely |

---

## 10. Staff Workflow Improved

### Before (No Sorting)

```
1. Staff opens Live Orders
2. Scans 40+ orders to find unpaid kiosk
3. Finds 3 scattered throughout list
4. Manually checks each for payment status
5. Takes 2-3 minutes per unpaid order
```

### After (Auto-Sorted + Highlighted)

```
1. Staff opens Live Orders
2. Unpaid kiosk orders at top (orange highlight)
3. "⚠️ 3 unpaid kiosk orders" alert in header
4. Click first unpaid order → Confirm Payment (30 seconds)
5. Next unpaid order visible → Repeat
6. Takes 2-3 minutes total for all unpaid (faster + clearer)
```

---

## 11. Testing Checklist

- [ ] Unpaid kiosk orders appear first (regardless of filter)
- [ ] Orange border + background visible on unpaid kiosk
- [ ] Compact badges fit on one line
- [ ] Sorting respects both kiosk (`order_status`) and legacy (`status`)
- [ ] Alert shows "⚠️ X unpaid" when viewing "All Orders" (not other filters)
- [ ] Pulsing payment badge still visible (animation intact)
- [ ] "All Orders" count in tab is accurate
- [ ] Filters still work (Unpaid Kiosk, All Kiosk, Online) after sorting
- [ ] Date filtering respects sort order
- [ ] Search results also sorted by priority

---

## Summary

✅ **No data changes** — filtering/sorting only  
✅ **Automatic prioritization** — no manual sort needed  
✅ **Compact UI** — badges fit one line, reduces cognitive load  
✅ **Clear visual hierarchy** — unpaid kiosk = orange, pending = red, standard = gray  
✅ **Alert system** — warns staff when unpaid orders exist  
✅ **Backward compatible** — legacy orders unaffected  

**Result:** Staff can visually scan and handle unpaid kiosk orders in seconds, not minutes.