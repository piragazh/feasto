# Kiosk Kitchen Print Refinements

## Overview

Kitchen printing for kiosk-origin orders has been refined to clearly display payment status and provide robust error handling that doesn't crash the live order UI.

---

## 1. Print Template Enhancements

### Kiosk Order Label

All kiosk orders display:
```
🖥️ KIOSK ORDER (indigo badge, 2px border)
```

### Payment Status Indicators

**For counter-pay kiosk orders:**

| Status | Badge | Display |
|--------|-------|---------|
| Awaiting payment | ⏳ Yellow badge with 2px border | `⏳ AWAITING PAYMENT AT COUNTER` |
| Payment confirmed | ✓ Green badge with 2px border | `✓ PAYMENT CONFIRMED` |

**For card-terminal kiosk orders:**
- No payment badge (already confirmed at creation)

### Template Example

```html
<div class="collection-badge" style="background:#e0e7ff;color:#3730a3;border:2px solid #3730a3;">
    🖥️ KIOSK ORDER
</div>

<!-- For pay_at_counter + awaiting payment -->
<div class="collection-badge" style="background:#fef3c7;color:#92400e;border:2px solid #f59e0b;">
    ⏳ AWAITING PAYMENT AT COUNTER
</div>

<!-- For pay_at_counter + confirmed -->
<div class="collection-badge" style="background:#d1fae5;color:#065f46;border:2px solid #10b981;">
    ✓ PAYMENT CONFIRMED
</div>
```

---

## 2. Printer Routing (Unchanged)

Channel routing remains unchanged:

| `order_source` | Printer channel | Fallback |
|---|---|---|
| kiosk | `kiosk_order` | `online_order` if no dedicated slot |
| online | `online_order` | Browser print |
| pos/dine_in | `pos_order` | Browser print |

**No changes to centralized printer config or channel assignment logic.**

---

## 3. Error Handling

### Auto-Print (New Orders)

```javascript
autoPrintOrder() → try/catch
  - Bluetooth attempt → catch + fallback to browser
  - Browser fallback → catch + silent fail
  - No exceptions thrown to UI
```

**Result:** Failed auto-print does not crash live order stream.

### Manual Print (Reprint)

```javascript
printOrderDetails() → try/catch
  - Popup window check → warn + return
  - Document write → try/catch + close window on error
  - Browser print → catches popup blocker + formatting errors
```

**Result:** Print failures show toast errors but don't crash the order card UI.

### Silent Failures

- Bluetooth connection failures → fallback to browser print
- Popup blocker → user gets warning toast
- Document formatting errors → user gets error toast + window closes

---

## 4. Files Changed

| File | Changes |
|---|---|
| `components/restaurant/LiveOrders` | **Print template:** Added payment status badges for kiosk orders<br/>**Error handling:** Wrapped autoPrintOrder + browserPrintOrder in try/catch<br/>**Robustness:** Check printWindow.document, handle popup blocker, close window on error |

---

## 5. Kitchen Staff Impact

### What Kitchen Staff See

**Kiosk counter-pay order (awaiting payment):**
```
        ╔════════════════════════════════════════════╗
        ║         [RESTAURANT NAME]                   ║
        ║    🖥️ KIOSK ORDER                          ║
        ║    ⏳ AWAITING PAYMENT AT COUNTER           ║
        ╠════════════════════════════════════════════╣
        ║ Order: K-1234                              ║
        ║ Type: TAKEAWAY                             ║
        ║ ...                                        ║
```

**Kiosk card-terminal order (already paid):**
```
        ╔════════════════════════════════════════════╗
        ║         [RESTAURANT NAME]                   ║
        ║    🖥️ KIOSK ORDER                          ║
        ║    ✓ PAYMENT CONFIRMED                     ║
        ╠════════════════════════════════════════════╣
        ║ Order: K-1235                              ║
        ║ Type: TAKEAWAY                             ║
        ║ ...                                        ║
```

### Staff Actions

- **Awaiting payment badge** → Staff knows kitchen should NOT start until payment confirmed
- **Payment confirmed badge** → Staff knows kitchen can start immediately

---

## 6. Error Recovery

| Error | User Impact | Recovery |
|---|---|---|
| Bluetooth offline | Auto-print → browser fallback | Kitchen gets printed ticket via browser |
| Popup blocked | Reprint button → warning toast | User allows popups and retries |
| Document error | Reprint button → error toast | Window closes safely, no zombie window |
| Config missing | Auto-print → browser fallback | Fallback catches all edge cases |

---

## 7. Testing

**Manual tests:**
- [ ] Auto-print new kiosk counter-pay order → ticket prints with "⏳ AWAITING PAYMENT"
- [ ] Confirm payment → re-prints with "✓ PAYMENT CONFIRMED"
- [ ] Auto-print new kiosk card-terminal order → no payment badge shown
- [ ] Disconnect Bluetooth printer → auto-print falls back to browser
- [ ] Block popups → reprint shows warning, retrying allows popup
- [ ] Close print window mid-print → no ghost window left open
- [ ] Verify Live Orders UI doesn't crash on any print error

---

## 8. Backward Compatibility

✅ **No breaking changes:**
- Existing online/POS print flows unchanged
- Printer routing unchanged
- Kitchen staff experience unchanged (except for new kiosk badges)
- All error handling is additive (doesn't alter success path)

---

## Summary

Kiosk kitchen printing is now **clear, safe, and resilient:**
- ✅ Payment status visible to kitchen staff
- ✅ All printer failures caught and don't crash UI
- ✅ Automatic fallbacks (Bluetooth → browser, popup blocker → warning)
- ✅ Robust window handling (checks document, closes on error)
- ✅ Unchanged routing and legacy compatibility