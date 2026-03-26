# PWA & Service Worker Caching

**Last reviewed: 2026-03-26**

---

## Current service worker strategy

The app registers a single service worker at `/sw.js` via `src/lib/pwa-lifecycle.js`.

### Caching approach

| Request type | Strategy | Notes |
|---|---|---|
| Static assets (JS, CSS, fonts) | Cache-first | Versioned by build hash |
| API calls | Network-first | Falls back to cached response if offline |
| Images | Cache-first | Fetches new if not cached |

### Update behaviour

When a new service worker is detected:
1. The new SW is installed but waits (`skipWaiting` is NOT called automatically)
2. `pwa-lifecycle.js` checks whether the current route is a **transactional route** (see below)
3. If safe: page reloads to activate the new SW
4. If on a transactional route: reload is deferred until the user leaves that route

### Transactional route safety

Auto-reload is blocked on routes that would disrupt an in-progress user action:

- `/Checkout` — active payment flow
- `/POSDashboard` — live POS session
- `/TabletDashboard` — tablet ordering session
- `/KioskDashboard` — kiosk self-service session
- `/RestaurantDashboard` — live order management

This is implemented in `isActiveTransactionalRoute()` in `src/lib/pwa-lifecycle.js` and covered by `src/lib/__tests__/pwa-route-safety.test.js`.

**Previous approach (blanket SW unregister) has been removed.** Earlier code unregistered all service workers on load. This is not the current strategy — the SW is now managed with proper lifecycle handling.

---

## PWA manifest

The manifest is served dynamically by the `getManifest` backend function, which adapts to:
- Restaurant custom domain (uses restaurant name, logo, and theme colour)
- Page mode: `restaurant`, `dashboard`, `pos`, `tablet`

Theme colour is pulled from `restaurant.theme_primary_color` (default: `#f97316`).

---

## Install prompt & capabilities

The app is installable as a PWA on both iOS and Android. Key meta tags are injected by Layout:
- `apple-mobile-web-app-capable: yes`
- `apple-mobile-web-app-status-bar-style: default`
- `theme-color` — dynamic per restaurant

---

## Known limitations

- **Offline ordering is not supported.** The checkout flow requires live Stripe and Base44 API connectivity. Cached API responses may allow browsing menus offline, but order submission will fail.
- **SW does not send push notifications.** Order status updates are delivered via polling (React Query refetch interval), not push.
- **Cache size is not explicitly limited.** Heavy image-caching restaurants could grow the image cache significantly on low-storage devices.

---

## Testing

```bash
npm run test:run  # includes pwa-route-safety.test.js
```

Manual checks:
- Open DevTools → Application → Service Workers — verify `/sw.js` is registered and active
- Throttle to Offline in Network tab — menu pages should load from cache; checkout should fail gracefully
- Navigate to `/Checkout` and trigger a SW update — verify no auto-reload interrupts the payment flow