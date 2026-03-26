# Offline Risk Control Center — Freshness & Refresh Model

## Overview

The Offline Risk Control Center now includes **lightweight freshness indicators** and a **sensible refresh strategy** to help SuperAdmins quickly assess data currency without aggressive polling.

**Goal:** Let users know how current their data is, and refresh safely when needed.

---

## Data Freshness Model

### Data Sources & Drift Risk

| Card | Source | Query Type | Drift Risk | Freshness |
|------|--------|-----------|-----------|-----------|
| **Critical Alert** | Live Orders | Real-time query | HIGH | Page refresh only |
| **Top Risk Stores** | Live Orders + Restaurants | Real-time query | HIGH | Page refresh only |
| **Unresolved Backlog** | Live Orders | Real-time query | HIGH | Page refresh only |
| **Operator Outliers** | Memoized Digest | Derived from live | MEDIUM | Tied to live refresh |
| **Escalation Trend** | Memoized Digest | Derived from live | MEDIUM | Tied to live refresh |
| **Latest Snapshot** | Scheduled Snapshot | ~5-10 min refresh | MEDIUM | Independent schedule |
| **Quick Navigation** | Static | No queries | NONE | Always fresh |

### Freshness Thresholds

- 🟢 **Fresh** — Data ≤ 5 minutes old
- 🟡 **Aging** — Data 5–15 minutes old
- 🔴 **Stale** — Data > 15 minutes old

---

## Freshness Indicators

### Page-Level Freshness Display

At the top of the control center, the **FreshnessIndicator** component shows:

1. **Status Badge** (🟢 Fresh / 🟡 Aging / 🔴 Stale)
2. **Last Refreshed Time** — "Last refreshed: X minutes ago"
3. **Latest Snapshot Time** — "Latest snapshot: Y minutes ago"
4. **Stale Warning** (only if > 15 minutes old) — "Consider refreshing for latest data"

### Card-Level Source Labels

Each card displays a **source label** indicating data origin:

- 📊 **Live Data** — Real-time order queries (TopRiskStores, CriticalAlert, Backlog)
- 📸 **Latest Snapshot** — Scheduled digest snapshot (LatestSnapshotCard)
- 🔀 **Derived** — Calculated from live data + snapshot (OperatorOutliers, EscalationTrend)

---

## Refresh Strategy

### Manual Refresh

**Button Location:** Top-right of the Freshness Indicator

**Behavior:**
- Clicks the "Refresh" button
- Re-fetches restaurants, orders, and snapshot data in parallel
- Updates `lastRefreshedAt` timestamp
- Shows loading state during fetch

**Use Case:** User notices stale data or wants the latest before making a decision

### Automatic Refresh (Optional)

**Toggle Location:** Next to Refresh button ("Auto-refresh ON/OFF")

**Behavior:**
- Default: **OFF** (no aggressive polling)
- When enabled: Automatically refreshes every 5 minutes if page is active
- Does NOT refresh if browser tab is inactive (respects browser visibility)
- Can be toggled on/off at any time

**Use Case:** SuperAdmin monitoring a critical incident wants live updates without manual clicks

### No Noisy Polling

- No auto-refresh on page load
- No short interval polling (minimum 5 minutes)
- Respects browser visibility API (stops refreshing if tab is inactive)
- All refreshes are parallelized for efficiency

---

## Component Reference

### FreshnessIndicator

```jsx
<FreshnessIndicator
  lastRefreshedAt={new Date()}  // When data was last refreshed
  latestSnapshotTime={new Date()}  // When latest snapshot was created
  isRefreshing={false}  // Show loading state during fetch
  onRefresh={handleRefresh}  // Callback for manual refresh
  autoRefreshEnabled={false}  // Current auto-refresh state
  onAutoRefreshToggle={() => {}}  // Toggle auto-refresh
/>
```

**Output:**
- Freshness status (🟢/🟡/🔴) with explanation
- Timestamps for last refresh and latest snapshot
- Stale warning if data > 15 minutes old
- Refresh button with loading state
- Auto-refresh toggle

### SourceLabel

```jsx
<SourceLabel
  source="live"  // "live" | "snapshot" | "derived"
  size="sm"  // "sm" or default (larger)
/>
```

**Output:**
- Color-coded badge showing data origin
- Tooltip explains freshness model for each source

---

## What "Last Updated" Means

**"Last Refreshed"** = When all live queries (orders, restaurants) were last fetched from the database.

- Does NOT include snapshot fetch time (snapshots are independent)
- Does NOT include memoization time (calculated fields are instant)
- Indicates freshness of the most volatile data (orders)

**"Latest Snapshot"** = When the scheduled digest snapshot was generated (~5-10 min intervals).

- Independent of "Last Refreshed"
- May be older or newer than live data
- Used for comparison and historical tracking

---

## Which Sections Are Live vs Snapshot-Based

| Section | Source | Freshness |
|---------|--------|-----------|
| **Critical Alert** | Live (orders) | Updates only on manual refresh |
| **Top Risk Stores** | Live (orders) | Updates only on manual refresh |
| **Unresolved Backlog** | Live (orders) | Updates only on manual refresh |
| **Operator Outliers** | Derived (live digest) | Updates on manual refresh |
| **Escalation Trend** | Derived (live digest) | Updates on manual refresh |
| **Latest Snapshot** | Scheduled snapshot | Independent 5-10 min cycle |
| **Freshness Display** | Page state | Updates on every refresh |

---

## How Refresh Works

### Manual Refresh Flow

```
User clicks "Refresh"
  ↓
Set isRefreshing = true (show spinner)
  ↓
Parallel fetch:
  • refetchRestaurants()
  • refetchOrders()
  • refetchSnapshots()
  ↓
All complete (or error)
  ↓
Update lastRefreshedAt = new Date()
  ↓
Set isRefreshing = false (hide spinner)
  ↓
Memoized digest recalculates automatically
  ↓
Page re-renders with fresh data + new timestamp
```

### Auto-Refresh Flow (If Enabled)

```
Every 5 minutes (if page is active):
  ↓
Trigger manual refresh (same flow as above)
```

---

## What Stale Warnings Mean

A **stale warning** appears when data is > 15 minutes old.

**Reasons data gets stale:**
1. User hasn't clicked refresh button
2. Auto-refresh is disabled
3. No manual refresh during an incident

**What to do:**
1. Click "Refresh" button to fetch latest data
2. Enable "Auto-refresh" if monitoring an active issue
3. Review timestamp to understand how old data actually is

---

## Testing & Coverage

### Smoke Tests

Located in `scripts/smoke/suites/offlineRiskControlCenterFreshness.smoke.js`

**Coverage:**
- Freshness indicator renders with correct data
- Timestamp calculations are accurate
- Status badges (fresh/aging/stale) display at correct thresholds
- Stale warnings only show when appropriate
- Refresh button disabled/enabled states
- Auto-refresh toggle behavior
- Source labels render on all cards
- Source types are correctly assigned

**Run:**
```bash
npm run smoke -- --suite offlineRiskControlCenterFreshness
```

---

## Remaining Limitations

1. **No real-time streaming** — Designed for safe polling, not WebSocket updates
2. **Snapshot lag** — Scheduled snapshots run every 5-10 min, not instantly
3. **Manual refresh only** — No auto-refresh on error or network reconnect
4. **No historical timestamps** — Doesn't track when each individual field last changed
5. **Derived data opacity** — Operator/Escalation trends don't show which live vs snapshot data contributed most

---

## Future Enhancements

- [ ] Visibility API integration (pause auto-refresh if tab inactive)
- [ ] Historical timestamp tracking per card
- [ ] Failed refresh retry logic
- [ ] Granular refresh (select which cards to refresh)
- [ ] Customizable auto-refresh interval (currently 5 min)
- [ ] Timestamp distribution (show min/max/median data age)

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Is data fresh? | Look at freshness status (🟢/🟡/🔴) at top |
| How old is the data? | Read "Last refreshed" timestamp |
| How old is the snapshot? | Read "Latest snapshot" timestamp |
| Why is data stale? | Check if auto-refresh is enabled; otherwise, click Refresh |
| What does "Live Data" mean? | Real-time order queries; updates only on manual/auto refresh |
| What does "Latest Snapshot" mean? | Scheduled digest from 5-10 min ago; independent update cycle |
| What does "Derived" mean? | Calculated from live data at refresh time |