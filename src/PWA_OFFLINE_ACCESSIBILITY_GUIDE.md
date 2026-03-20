# PWA Offline Caching & Accessibility Refactor

## Overview
Comprehensive PWA implementation with Service Worker offline caching, skeleton loading UI components, and ARIA live region announcements for screen reader support.

---

## 1. Service Worker - Offline Content Caching

### Location
`public/service-worker.js`

### Features
- **Network-First Strategy (APIs):** Attempts network fetch first, falls back to cached responses
- **Cache-First Strategy (Images):** Serves cached images, fetches new ones if unavailable
- **Static Asset Caching:** Caches HTML, CSS, JS on install
- **Automatic Cache Cleanup:** Removes old cache versions on activation

### Cache Buckets
```javascript
CACHE_PATTERNS = {
  static: 'v1-mealdrop-static',  // HTML, CSS, JS, fonts
  api: 'v1-mealdrop-api',        // API responses
  images: 'v1-mealdrop-images'   // Image files
}
```

### Caching Strategy by Request Type

| Request Type | Strategy | Fallback |
|---|---|---|
| API calls | Network-first | Cached response |
| Images | Cache-first | Network fetch |
| Scripts/Styles | Cache-first | Network fetch |
| Other assets | Cache-first | Network fetch |

### Service Worker Registration
Automatically registered in `main.jsx`:
```javascript
navigator.serviceWorker.register('/service-worker.js');
// Auto-updates every hour
setInterval(() => registration.update(), 3600000);
```

### Offline Behavior
- **When Online:** Cache is updated, latest content served
- **When Offline:** 
  - Cached API responses served (may be stale)
  - Error response: `{ error: "Offline - cached data unavailable" }`
  - Cached images displayed, or placeholder shown

---

## 2. Skeleton Loading Components

### Location
`components/ui/skeleton-loader.jsx`

### Available Skeletons

#### SkeletonCard
Loading placeholder for card-based lists:
```jsx
<SkeletonCard count={3} />
```
- Animated pulse effect
- Customizable count

#### SkeletonTable
Table header and rows skeleton:
```jsx
<SkeletonTable rows={5} columns={4} />
```
- Responsive grid layout
- Configurable rows/columns

#### SkeletonChart
Chart area placeholder:
```jsx
<SkeletonChart />
```
- Bar chart height animation
- Full-width responsive

#### SkeletonStats
KPI card grid skeleton:
```jsx
<SkeletonStats count={4} />
```
- Cards with title and value areas
- Multi-column grid

#### SkeletonListItem
List item skeleton with avatar:
```jsx
<SkeletonListItem count={3} />
```
- Avatar + text lines
- Used for user/restaurant lists

#### SkeletonFormSection
Form area placeholder:
```jsx
<SkeletonFormSection />
```
- Multiple input fields
- Submit button area

---

## 3. Data Fetch Wrapper Components

### Location
`components/dashboard/DataFetchWrapper.jsx`

### DataFetchWrapper
High-level wrapper with loading, error, and success states:

```jsx
<DataFetchWrapper
  isLoading={isLoading}
  error={error}
  data={data}
  skeletonType="table"      // card, table, stats, chart, form
  skeletonCount={5}
  errorMessage="Custom error text"
  loadingMessage="Loading data..."
  successMessage="Data loaded successfully"
>
  {/* Your content here */}
</DataFetchWrapper>
```

**Features:**
- Automatic skeleton rendering based on type
- Error state with message
- ARIA live region announcements
- Success message announcement (optional)

### DynamicListWrapper
Specialized wrapper for lists/tables:

```jsx
<DynamicListWrapper
  isLoading={isLoading}
  error={error}
  items={items}
  itemLabel="restaurant"    // Used in announcements
  emptyMessage="No items found"
  errorMessage="Failed to load"
>
  {/* Your list/table content */}
</DynamicListWrapper>
```

**Features:**
- Item count announcement
- Empty state message
- Automatic count calculation

---

## 4. ARIA Live Region Utilities

### Location
`lib/aria-utils.js`

### Functions

#### initializeLiveRegions()
Call once on app mount (done in Layout):
```javascript
useEffect(() => {
  initializeLiveRegions();
}, []);
```

Creates three invisible regions:
- `aria-live="polite"` - Non-urgent updates
- `aria-live="assertive"` - Urgent alerts/errors
- `role="status"` - Status messages

#### announcePolite(message)
Non-urgent announcements (data loaded, form submitted):
```javascript
announcePolite('Customer list updated with 15 new users');
```

#### announceAssertive(message)
Urgent announcements (errors, warnings):
```javascript
announceAssertive('Error: Failed to save order');
```

#### announceStatus(message)
Status updates:
```javascript
announceStatus('Processing order...');
```

#### useAnnouncement() Hook
React hook for functional components:
```jsx
const announce = useAnnouncement();

// In effect
useEffect(() => {
  if (dataLoaded) {
    announce.status(`Loaded ${count} items`);
  }
}, [dataLoaded]);
```

#### LiveRegion Component
For complex or conditional announcements:
```jsx
<LiveRegion 
  role="status"
  message={isLoading ? 'Loading...' : ''}
/>
```

### Convenience Functions

```javascript
// Loading state
announceLoading('orders');           // "Loading orders..."

// Completion
announceComplete('Order placement'); // "Order placement completed"

// Error
announceError('Connection failed');  // "Error: Connection failed"

// Result counts
announceResultCount(15, 'restaurant'); // "15 restaurants found"
```

---

## 5. Integration Examples

### AdminDashboard Implementation

#### 1. Import Components
```javascript
import { DataFetchWrapper, DynamicListWrapper } from '@/components/dashboard/DataFetchWrapper';
import { SkeletonStats, SkeletonChart } from '@/components/ui/skeleton-loader';
import { useAnnouncement } from '@/lib/aria-utils';
```

#### 2. Setup Announcements
```javascript
const announce = useAnnouncement();

// Announce when data loads
useEffect(() => {
  if (!restaurantsLoading && restaurants.length > 0) {
    announce.status(`Loaded ${restaurants.length} restaurants`);
  }
}, [restaurantsLoading, restaurants.length]);
```

#### 3. Wrap Data-Fetching Views
```jsx
// KPI Cards with skeleton loading
{restaurantsLoading || ordersLoading ? (
  <SkeletonStats count={4} />
) : (
  // Your KPI cards
)}

// Charts with wrapper
<DataFetchWrapper
  isLoading={restaurantsLoading || ordersLoading}
  error={restaurantsError || ordersError}
  skeletonType="chart"
>
  {/* Your chart JSX */}
</DataFetchWrapper>

// Tables with live regions
<DynamicListWrapper
  isLoading={restaurantsLoading}
  items={restaurantStats}
  itemLabel="restaurant"
>
  <table aria-live="polite" aria-label="Restaurant data">
    {/* Your table */}
  </table>
</DynamicListWrapper>
```

---

## 6. Screen Reader Announcements - Best Practices

### What to Announce
✅ **DO announce:**
- Data load completion with count
- Errors and warnings
- Operation success (order placed, profile saved)
- Filter/sort changes
- Pagination changes
- New items appearing in dynamic lists

### What NOT to Announce
❌ **DON'T announce:**
- Every keystroke
- Hover states
- Icon changes (if already described)
- Minor UI state changes
- Load start (loading skeleton is visible)

### Announcement Levels

```javascript
// Polite (default, waits for pause)
announce.polite('Order submitted for review');

// Assertive (interrupts current speech)
announce.assertive('Payment failed - try again');

// Status (short, friendly)
announce.status('3 new orders received');
```

---

## 7. Testing Checklist

### Offline Functionality
- [ ] Load app on WiFi with DevTools open
- [ ] Go to Network tab → throttle to Offline
- [ ] Refresh page - content still loads from cache
- [ ] Navigate between pages - works offline
- [ ] API calls fail gracefully with error message

### Skeleton Loading
- [ ] Skeletons display while `isLoading === true`
- [ ] Skeletons match actual content width/height
- [ ] Animations are smooth (no jank)
- [ ] Content renders immediately when ready

### Screen Reader Support (NVDA/JAWS/VoiceOver)
- [ ] Service Worker registers (check console)
- [ ] Page title updates with ARIA live regions
- [ ] "Loading..." announcement heard when fetching
- [ ] Item count announced: "Loaded: 15 restaurants"
- [ ] Error messages announced with urgency
- [ ] "Restaurant data" table read as region
- [ ] Skip link works (press Tab at page load)
- [ ] Table headers properly marked

### Android WebView
- [ ] Service Worker works in WebView
- [ ] Offline content cached and retrievable
- [ ] Cache size reasonable (< 50MB)
- [ ] No errors in WebView console

---

## 8. Performance Optimization

### Cache Size Management
Service Worker limits caches:
- **Static cache:** ~5-10MB (CSS, JS, fonts)
- **API cache:** ~10-20MB (JSON responses)
- **Images cache:** ~20-50MB (image files)

### Update Strategy
```javascript
// Service Worker updates every hour
setInterval(() => registration.update(), 3600000);

// Manual update on button click
async function checkForUpdates() {
  const reg = await navigator.serviceWorker.ready;
  await reg.update();
}
```

### Stale-While-Revalidate Pattern
API responses served from cache immediately, updated in background:
```javascript
// User gets cached response instantly
// Service Worker updates cache silently
// Next request has fresh data
```

---

## 9. Files Modified/Created

### New Files
- `public/service-worker.js` - PWA offline caching
- `components/ui/skeleton-loader.jsx` - Loading placeholders
- `lib/aria-utils.js` - Screen reader announcements
- `components/dashboard/DataFetchWrapper.jsx` - Data fetch wrappers

### Modified Files
- `main.jsx` - Service Worker registration
- `layout` - ARIA live regions initialization
- `pages/AdminDashboard` - Skeleton loading + announcements

---

## 10. Browser & Device Support

| Feature | Support |
|---|---|
| Service Workers | ✅ Chrome 40+, Firefox 44+, Safari 11.1+, Edge 17+ |
| ARIA Live Regions | ✅ All modern browsers |
| Cache API | ✅ All modern browsers |
| Android WebView | ✅ Android 5.0+ |
| iOS Safari | ✅ iOS 11.3+ |

### Progressive Enhancement
Apps gracefully degrade without Service Worker:
- Offline caching unavailable, but app still works online
- Skeleton loading shows, then real content loads
- Screen reader support works regardless of Service Worker

---

## 11. Troubleshooting

### Service Worker Not Registering
```javascript
// Check console for errors
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Registered Service Workers:', regs);
});
```

### Cache Not Updating
```javascript
// Clear all caches manually
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});
// Then reload page
```

### Stale Data After Update
Service Worker serves cached data by design. For real-time updates:
```javascript
// Force network-only for critical endpoints
if (url.includes('/live-orders')) {
  return fetch(request); // Skip cache
}
```

### Screen Reader Not Announcing
```javascript
// Verify live regions exist
console.log(document.getElementById('aria-live-polite'));
console.log(document.getElementById('aria-live-assertive'));

// Test announcement
announceStatus('Test message');
```

---

## 12. Future Enhancements

- [ ] Background sync for offline orders
- [ ] Periodic sync for data updates
- [ ] Push notifications for order status
- [ ] IndexedDB for larger offline storage
- [ ] Service Worker update notifications
- [ ] Cache management UI (clear old caches)