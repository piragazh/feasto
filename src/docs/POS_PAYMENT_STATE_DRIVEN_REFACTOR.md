# POSPayment State-Driven UI Refactor

**Date:** 2026-03-26  
**Status:** Complete - Fully state-driven payment flow  
**Component:** `components/pos/POSPayment.jsx`

---

## 1. UI STATE MAPPING

Terminal state → UI rendering:

| Terminal State | UI Behavior | User Sees |
|---|---|---|
| **IDLE** | Show payment method buttons (Cash, Card) | "Select payment method" |
| **INITIATING** | Disable buttons, show loading dialog | "Connecting to terminal..." |
| **AWAITING_CARD** | Lock UI, show card prompt | "Tap or insert card" (with cancel) |
| **PROCESSING** | Show spinner, prevent interaction | "Processing payment..." |
| **AUTHORIZED** | Show success, auto-complete payment | "✓ Payment Approved - £X.XX" |
| **DECLINED** | Show error screen, offer retry | "✗ Card Declined - Try another card" |
| **FAILED** | Show error screen, offer retry | "✗ Payment Failed - Technical issue" |
| **TIMEOUT** | Show error screen, offer retry | "✗ Timeout - Card not detected in time" |
| **CANCELLED** | Show error screen (user action) | "✗ Payment Cancelled - Try again?" |

---

## 2. CHANGES MADE

### A. State Subscription Enhanced
**Before:** Simple state + error tracking  
**After:** Normalized error codes + meaningful error messages

```javascript
// NEW: Capture both error message AND error code
const [terminalError, setTerminalError] = useState('');
const [terminalErrorCode, setTerminalErrorCode] = useState('');

// Subscribe to all state changes with normalized metadata
service.subscribe(({ state, metadata }) => {
    // Extract and normalize provider responses
    if (state === TERMINAL_STATES.DECLINED) {
        setTerminalError(metadata?.error_message || 'Card declined');
        setTerminalErrorCode(metadata?.error_code || 'CARD_ERROR');
    }
    // ... handle other states
});
```

### B. processCard Made Asynchronous-Safe
**Before:** Checked `.success` property immediately  
**After:** Initiates payment, lets state machine drive UI

```javascript
// OLD (WRONG):
const result = await terminalServiceRef.current.startPayment({...});
if (result.success) { /* do something */ }

// NEW (CORRECT):
try {
    await terminalServiceRef.current.startPayment({...});
    // UI will react to state changes via subscription
    // Do NOT check result here
} catch (error) {
    setTerminalError(error.message);
}
```

### C. Authorization Listener Added
**Before:** Manual setTimeout hack  
**After:** Proper useEffect listening to terminal state

```javascript
// Watch for AUTHORIZED state and auto-complete
useEffect(() => {
    if (terminalState === TERMINAL_STATES.AUTHORIZED && terminalAmount > 0) {
        const timer = setTimeout(() => {
            addPayment('card', terminalAmount);
            toast.success('Card approved');
            terminalServiceRef.current?.resetToIdle();
        }, 800);
        return () => clearTimeout(timer);
    }
}, [terminalState]);
```

### D. Button Disabling During Processing
**Before:** Only checked `isProcessing` boolean  
**After:** Disabled when `terminalState !== IDLE`

```javascript
// Disable card button during any active terminal operation
<AlertDialogAction 
    onClick={processCard} 
    disabled={isProcessing || terminalState !== TERMINAL_STATES.IDLE}
>
    {terminalState === TERMINAL_STATES.IDLE ? 'Send to Terminal' : 'Sending...'}
</AlertDialogAction>
```

### E. Cancel Button During Card Waiting
**Before:** No cancel option  
**After:** Cancel button appears during AWAITING_CARD state

```javascript
{terminalState === TERMINAL_STATES.AWAITING_CARD && (
    <AlertDialogFooter>
        <Button onClick={handleTerminalCancel} variant="outline">
            Cancel
        </Button>
    </AlertDialogFooter>
)}

const handleTerminalCancel = async () => {
    await terminalServiceRef.current?.cancelPayment();
    setActiveMethod(null);
};
```

### F. Multi-State Dialog for Terminal Operations
**Before:** Only AWAITING_CARD and PROCESSING  
**After:** Distinct UI for INITIATING, AWAITING_CARD, PROCESSING

```javascript
{[TERMINAL_STATES.INITIATING, TERMINAL_STATES.AWAITING_CARD, TERMINAL_STATES.PROCESSING].includes(terminalState) && (
    <Dialog>
        {terminalState === TERMINAL_STATES.INITIATING && 'Connecting to Terminal...'}
        {terminalState === TERMINAL_STATES.AWAITING_CARD && 'Ready for Card - (with cancel button)'}
        {terminalState === TERMINAL_STATES.PROCESSING && 'Processing Payment...'}
    </Dialog>
)}
```

### G. Error Screen Shows Error Codes
**Before:** Just error message  
**After:** Error message + error code for support/debugging

```javascript
<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
    <p className="text-red-400 text-sm font-medium">{terminalError}</p>
    {terminalErrorCode && (
        <p className="text-xs mt-1 font-mono">Code: {terminalErrorCode}</p>
    )}
</div>
```

### H. Contextual Error Messages
**Before:** Generic "failed" message  
**After:** Different message for each failure type

```javascript
{terminalState === TERMINAL_STATES.DECLINED && 'Try another card or payment method.'}
{terminalState === TERMINAL_STATES.TIMEOUT && 'The card was not tapped in time. Please try again.'}
{terminalState === TERMINAL_STATES.CANCELLED && 'You cancelled the payment. You can retry or choose another method.'}
{terminalState === TERMINAL_STATES.FAILED && 'There was a technical issue. Please try again or use another method.'}
```

---

## 3. EDGE CASES HANDLED

### Double Submission Prevention
✅ Disable card button when `terminalState !== IDLE`  
✅ Once in INITIATING → can't click Send button again  
✅ UI locked during awaiting/processing

### Reader Disconnection
✅ TerminalService catches disconnect in provider  
✅ UI shows FAILED state  
✅ User can retry or choose different method

### Timeout During Card Tap
✅ Provider times out after 60s of card waiting  
✅ State → TIMEOUT  
✅ UI shows specific message: "Card was not detected in time"  
✅ User can retry

### User Cancels During Awaiting Card
✅ Cancel button available in AWAITING_CARD state  
✅ Calls `handleTerminalCancel()`  
✅ Calls provider's `cancelPayment()`  
✅ Resets service to IDLE  
✅ Returns to method selection

### Successful Payment Auto-Completion
✅ Authorization listener detects AUTHORIZED state  
✅ Waits 800ms to show user success screen  
✅ Then auto-adds payment  
✅ Resets terminal to IDLE  
✅ Auto-advances to receipt

### Error Recovery
✅ Retry button calls `handleTerminalRetry()`  
✅ Clears error state  
✅ Reinitates `processCard()`  
✅ Can try same card or cancel to pick different method

### Terminal Not Initialized
✅ Check `terminalServiceRef.current` before startPayment  
✅ Set error with code: `NO_SERVICE`  
✅ Prevents crash

### Payment Initiation Failure
✅ Try/catch around `startPayment()`  
✅ Captures init errors (not server errors)  
✅ Sets error code: `PAYMENT_INIT_FAILED`

---

## 4. KEY ARCHITECTURAL CHANGES

### Before (Broken)
```
UI calls processCard()
  ↓
await terminalServiceRef.current.startPayment()
  ↓
Check result.success immediately
  ↓
Based on result, add payment or show error
  ↓
PROBLEM: Result is initial response, not final state!
State machine hasn't finished yet.
```

### After (Correct)
```
UI calls processCard()
  ↓
initiate startPayment() (don't await for result check)
  ↓
State machine begins: IDLE → INITIATING → AWAITING_CARD → PROCESSING → {AUTHORIZED|DECLINED|FAILED}
  ↓
UI subscription reacts to each state change
  ↓
When AUTHORIZED detected, auto-complete payment
  ↓
UI always consistent with actual terminal state
```

---

## 5. SUMMARY OF STATE-DRIVEN PRINCIPLE

**UI IS A PURE FUNCTION OF STATE:**

```
UI = f(terminalState)

- terminalState = IDLE → Show method buttons
- terminalState = INITIATING → Show connecting spinner
- terminalState = AWAITING_CARD → Show tap/insert screen (with cancel)
- terminalState = PROCESSING → Show processing spinner
- terminalState = AUTHORIZED → Show success + auto-complete
- terminalState = DECLINED → Show error + retry
- etc.
```

**KEY RULES:**
1. UI does NOT call provider directly
2. UI only calls `TerminalService.startPayment()` and `cancelPayment()`
3. All state changes flow through subscription
4. UI reacts to state, never checks results
5. Error codes + messages come from normalized metadata

---

## 6. TESTING CHECKLIST

- [ ] Click "Charge to Card" → INITIATING state shows
- [ ] After reader connects → AWAITING_CARD state shows with "Tap card" + Cancel button
- [ ] Card successfully tapped → AUTHORIZED state shows + auto-adds payment
- [ ] Card declined → DECLINED state shows error + Retry button
- [ ] During AWAITING_CARD, click Cancel → goes back to method selection
- [ ] Retry button works multiple times
- [ ] Terminal timeout (60s) → TIMEOUT state shows specific message
- [ ] All buttons disabled during INITIATING/AWAITING_CARD/PROCESSING
- [ ] Error codes display for support reference

---

## 7. PRODUCTION CHECKLIST

- [ ] All terminal states handled (8 states covered)
- [ ] Double submission prevention working
- [ ] Cancel button appears only when appropriate
- [ ] Error messages are user-friendly + code for support
- [ ] Auto-completion after authorization
- [ ] State resets properly on retry
- [ ] No setTimeout hacks, all driven by state
- [ ] Cleanup: subscription unsubscribed on unmount
- [ ] No direct provider calls in UI