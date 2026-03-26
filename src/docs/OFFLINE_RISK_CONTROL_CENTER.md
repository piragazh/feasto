# Offline Risk Control Center — User & Developer Guide

**Last Updated:** 2026-03-26  
**Audience:** SuperAdmin users and developers  

---

## For SuperAdmin Users

### What Is It?

A single dashboard showing the most important operational signals about offline review risk right now.

**Opening it:**
```
Navigate to: /OfflineRiskControlCenter
Or click: SuperAdmin → Offline Risk Control Center
```

### What Do I See?

Seven cards, top-to-bottom:

1. **Critical Alert** (red)
   - Orders sitting >4 hours unreviewed
   - Abuse escalations
   - Worst-performing stores
   - *Action:* Click "Digest History" to drill down

2. **Top 5 Risk Stores**
   - Ranked by risk score (flagged % + escalation %)
   - Risk badge, flagged %, escalation %
   - *Action:* Click "View" to see store details

3. **Unresolved Backlog**
   - Orders waiting for their first review
   - Age in hours, store name
   - *Action:* Click store name to see restaurant dashboard

4. **Top 3 Operator Outliers**
   - Operators with highest flagged rates
   - Email, % flagged
   - *Action:* Use "Operator Analytics" link for detail

5. **Escalation Trend**
   - Is escalation rate going up or down?
   - 24h vs 7d comparison, delta badge
   - *Action:* Use "Portfolio Ranking" to investigate

6. **Latest Snapshot**
   - Last digest summary (when, what counts)
   - Acknowledged status
   - *Action:* Click "Digest History" for older snapshots

7. **Quick Links**
   - Digest History
   - Portfolio Ranking
   - Flagged Orders
   - Manager Analytics
   - Operator Analytics
   - Temporal Analytics

### How to Use It

**Every shift start:**
1. Open /OfflineRiskControlCenter
2. Check Critical Alert — anything red?
3. Check Top Stores — any new additions?
4. Check Escalation Trend — getting better or worse?
5. Use Quick Links to drill into specific areas

**Time to actionable insight:** ~90 seconds

### When to Drill Down

| Section | Drill To | Use For |
|---------|----------|---------|
| Critical Alert | Digest History | Acknowledge, see reason codes |
| Top Stores | RestaurantDashboard | Review orders, manage staff |
| Backlog | Flagged Orders | Batch resolve old reviews |
| Operators | Operator Analytics | Detailed performance trends |
| Escalation | Portfolio Ranking | All stores ranked, compare |
| Snapshot | Digest History | Historical trends, acknowledgements |

---

## For Developers

### Component Architecture

```
pages/OfflineRiskControlCenter.jsx
├─ Fetches: restaurants, orders, digest snapshots
├─ Calculates: digest, portfolio risks, backlog
│
└─ Renders 7 focused cards:
    ├─ CriticalAlert.jsx         (conditional)
    ├─ TopRiskStoresCard.jsx      (always)
    ├─ UnresolvedBacklogCard.jsx  (conditional)
    ├─ OperatorOutliersCard.jsx   (conditional)
    ├─ EscalationTrendCard.jsx    (conditional)
    ├─ LatestSnapshotCard.jsx     (conditional)
    └─ QuickNavigationPanel.jsx   (always)
```

### Data Flow

```
Fetch:
  restaurants → list()
  orders → list() [1000 most recent offline]
  snapshots → filter({scope: 'portfolio'}, '-timestamp', 1)

Process (memoized):
  → generatePortfolioDigest(orders, restaurants, ...)
  → Calculate store risks
  → Extract operator outliers from digest
  → Get latest snapshot

Render:
  → 7 conditional cards (only show if has data)
  → Quick links to drill-down pages
```

### Reused Logic

**From `lib/offline-digest-logic.js`:**
```javascript
generatePortfolioDigest(orders, restaurants, portfolioAnalytics, operatorAnalytics)
```
Returns: Critical items, worsening trends, summary metrics

**Portfolio Ranking (inline):**
```javascript
const riskMap = restaurants.map(r => {
  const rOrders = orders.filter(o => o.restaurant_id === r.id && o.offline_created);
  const flaggedRate = (flagged / total) * 100;
  const escalationRate = (escalated / flagged) * 100;
  const risk = (flaggedRate * 0.6) + (escalationRate * 0.4);
  return { id, name, flaggedRate, escalationRate, risk };
}).sort((a, b) => b.risk - a.risk);
```

### Adding a New Section

**Example: Add "Recent Escalations" card**

1. Create component:
```javascript
// components/superadmin/OfflineRiskControlCenter/RecentEscalationsCard.jsx
export default function RecentEscalationsCard({ orders }) {
  const recent = useMemo(() => {
    return orders
      .filter(o => o.offline_review_status === 'escalated')
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 5);
  }, [orders]);
  
  if (recent.length === 0) return null;
  return <Card>...</Card>;
}
```

2. Import in main page:
```javascript
import RecentEscalationsCard from '@/components/superadmin/OfflineRiskControlCenter/RecentEscalationsCard';
```

3. Add to render (maintain priority order):
```javascript
{orders.length > 0 && <RecentEscalationsCard orders={orders} />}
```

4. Add smoke test to `offlineDigest.smoke.js`

### Performance Considerations

**Query optimization:**
- Restaurants: ~100ms (cached)
- Orders: ~500-800ms (top 1000, filtered client-side)
- Snapshots: ~100ms (top 1, indexed)
- **Total load:** ~1-2s

**Calculation overhead:**
- Digest: O(n orders) — already used elsewhere
- Store ranking: O(m restaurants × filtered_orders) — <100ms
- Operator extraction: O(1) from digest — <10ms

**Memoization:**
- digest = useMemo([restaurants, orders])
- topRisks = useMemo([restaurants, orders])
- Prevents unnecessary recalculation on component re-render

### Testing

**Smoke tests added:**

1. `testControlCenterCriticalFirst`
   - Verifies critical items render at top
   - Validates digest.critical_now structure

2. `testControlCenterSectionOrder`
   - Confirms all 7 sections in order
   - No missing cards

3. `testControlCenterNavigationLinks`
   - Validates 6 quick-link buttons
   - Links route to correct pages

**Run tests:**
```bash
npm run test:smoke -- scripts/smoke/suites/offlineDigest.smoke.js
```

### Styling Notes

- **Color coding:** Red (critical) > Yellow (watch) > Gray (info) > Green (good)
- **Responsive:** Full width on mobile, cards stack
- **Icons:** lucide-react (AlertTriangle, TrendingUp, Clock, etc.)
- **Typography:** Small cards, compact text, scannable layout

### Known Limitations

❌ **Not real-time** — Refreshes on page load only  
❌ **Not filterable** — Fixed to portfolio scope only  
❌ **No customization** — Sections always in this order  
❌ **No bulk actions** — Links to detail pages for operations  

---

## Updating the Control Center

### Common Changes

**Change card order:**
- Edit `pages/OfflineRiskControlCenter.jsx` render section
- Keep critical alert first
- Update documentation

**Change top N:**
- Edit `.slice(0, X)` in card components
- E.g., `.slice(0, 5)` → `.slice(0, 10)` for top 10 stores

**Add new metric to a card:**
- Edit card component directly
- Add to render, don't change calculation logic

**Connect to new data source:**
- Add useQuery hook in main page
- Pass data to card component
- Card handles conditional rendering

### Testing After Changes

1. Run smoke tests:
```bash
npm run test:smoke
```

2. Manual test:
   - Load /OfflineRiskControlCenter
   - Check all cards render
   - Click quick links — navigate correctly
   - Check responsive on mobile

3. Verify no console errors or warnings

---

## FAQ

**Q: Why is it on a separate page?**  
A: To keep SuperAdmin dashboard uncluttered. This is the "I need to know critical issues NOW" page. Drill down to specialized analytics for details.

**Q: How often does it refresh?**  
A: On page load. Refresh the page to get new data.

**Q: Can I customize sections?**  
A: Not in the UI. Edit the page code to change order/visibility.

**Q: Why is the backlog limited to 4 items?**  
A: To keep it scannable. Use "Flagged Orders" link for full backlog.

**Q: What does risk score mean?**  
A: Risk = (flagged_rate × 0.6) + (escalation_rate × 0.4). Emphasizes flagged rate, tempered by escalation rate.

**Q: Is this SuperAdmin only?**  
A: Yes. Inherits auth from SuperAdmin role, same as other admin pages.

---

## Related Pages

- **Digest History & Management:** `/SuperAdmin#risk-digest`
- **Portfolio Ranking:** `/SuperAdmin#offline-reviews`
- **Manager Analytics:** `/SuperAdmin#manager-analytics`
- **Operator Analytics:** `/SuperAdmin#operator-analytics`
- **Temporal Analytics:** `/SuperAdmin#temporal-analytics`
- **Flagged Orders Review:** `/SuperAdmin#orders`

---

**Status:** ✅ Production Ready  
**Last Test:** 2026-03-26  
**Coverage:** All 7 sections + navigation tested