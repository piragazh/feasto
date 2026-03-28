/**
 * PWA Service Worker Lifecycle Manager
 * =====================================
 * Handles:
 *  - Single registration path for /sw.js
 *  - Safe update detection
 *  - Route-aware reload decisions (never interrupt active transactional flows)
 *  - Dev-only console logging
 *
 * ROUTE SAFETY POLICY
 * -------------------
 * Routes where automatic reload is BLOCKED (user must manually refresh):
 *   - /Checkout          real-money flow in progress
 *   - /POSDashboard      order entry in progress
 *   - /KioskDashboard    customer-facing kiosk mid-order
 *   - /TabletDashboard   tablet POS mid-order
 *   - /KitchenDisplay    kitchen display (reload would lose current view)
 *   - /CustomerDisplay   customer-facing display
 *
 * Routes where automatic reload IS safe (user is browsing, not transacting):
 *   - /Home, /Restaurant, /Orders, /CustomerProfile, etc.
 *   - /AdminDashboard, /RestaurantDashboard (admin views reload safely)
 *   - /MediaScreen (has its own recovery logic)
 */

const DEV = import.meta.env.DEV;

const log = (...args) => {
  if (DEV) console.log('[SW Lifecycle]', ...args);
};

/** Routes where we must NOT auto-reload even if a new SW is waiting. */
const SAFE_TO_RELOAD_BLOCKLIST = [
  /^\/Checkout/i,
  /^\/POSDashboard/i,
  /^\/KioskDashboard/i,
  /^\/TabletDashboard/i,
  /^\/KitchenDisplay/i,
  /^\/CustomerDisplay/i,
];

/**
 * Returns true if the current page is in an active transactional flow
 * where an automatic reload would disrupt the user.
 */
export function isActiveTransactionalRoute(pathname = window.location.pathname) {
  return SAFE_TO_RELOAD_BLOCKLIST.some((p) => p.test(pathname));
}

/**
 * Perform a soft reload safely.
 * If on a transactional route, log and skip; the update will apply on next navigation.
 */
function safeReload(reason = 'SW update') {
  if (isActiveTransactionalRoute()) {
    log(`Skipping auto-reload on transactional route: ${window.location.pathname} (reason: ${reason})`);
    // Store flag so we can show a "refresh available" banner from the UI if desired
    window.__swUpdatePending = true;
    window.dispatchEvent(new CustomEvent('swUpdatePending'));
    return;
  }
  log(`Reloading for: ${reason}`);
  window.location.reload();
}

/**
 * Register the service worker and wire up the full lifecycle.
 * Call this once from main.jsx — it is a no-op in development
 * unless explicitly overridden.
 *
 * Returns a cleanup function (for HMR / testing).
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    log('Service workers not supported in this browser.');
    return () => {};
  }

  // Listen for messages from the SW (e.g. SW_UPDATE_AVAILABLE posted on activate)
  const onMessage = (event) => {
    if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
      log('Received SW_UPDATE_AVAILABLE message from new service worker.');
      safeReload('new service worker activated');
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);

  // Register
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        // updateViaCache: 'none' — browser always fetches sw.js from network
        // so stale SW file is never served from HTTP cache
        updateViaCache: 'none',
      });

      log('Registered:', registration.scope);

      // If a new SW is already waiting (e.g. from a previous update that didn't
      // reload), trigger a safe reload now.
      if (registration.waiting) {
        log('A waiting SW was found on registration — triggering safe reload.');
        safeReload('waiting SW on registration');
      }

      // Watch for future updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        log('New service worker installing...');

        newWorker.addEventListener('statechange', () => {
          log('New SW state:', newWorker.state);

          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // A new SW installed but the old one is still controlling the page.
            // The new SW will self-activate via skipWaiting() and then post
            // SW_UPDATE_AVAILABLE via clients.claim() → message. The reload
            // will happen via the message handler above.
            log('New SW installed and waiting to activate.');
          }
        });
      });

      // Periodically check for updates (every 30 minutes) so long-running
      // POS/media screens pick up deploys without requiring a manual refresh.
      setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);

    } catch (error) {
      // SW registration failure is non-fatal — app works without it
      log('Registration failed:', error);
    }
  });

  return () => {
    navigator.serviceWorker.removeEventListener('message', onMessage);
  };
}

/**
 * One-time cleanup: remove any legacy service workers that may have been
 * registered under different paths or by older app versions.
 * Runs once per browser session (tracked in sessionStorage).
 *
 * This replaces the blanket-unregister that was previously in main.jsx.
 */
export async function cleanupLegacyServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;

  // Only run once per session to avoid redundant work on every page load
  if (sessionStorage.getItem('sw_legacy_cleaned')) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const reg of registrations) {
      const swUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';

      // Keep our own /sw.js registration — unregister anything else
      const isOurs = swUrl.endsWith('/sw.js');
      if (!isOurs) {
        log('Removing legacy SW:', swUrl);
        await reg.unregister();
      }
    }

    sessionStorage.setItem('sw_legacy_cleaned', '1');
  } catch (e) {
    // Non-fatal
    log('Legacy SW cleanup error:', e);
  }
}