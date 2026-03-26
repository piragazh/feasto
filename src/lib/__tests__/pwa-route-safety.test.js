/**
 * PWA Route Safety — unit tests for isActiveTransactionalRoute()
 *
 * Ensures the reload-blocker correctly identifies transactional routes
 * and does NOT block safe informational routes.
 */

import { describe, it, expect } from 'vitest';
import { isActiveTransactionalRoute } from '../pwa-lifecycle.js';

describe('isActiveTransactionalRoute', () => {
  // ── Should BLOCK auto-reload ──────────────────────────────────────────────
  const blocked = [
    '/Checkout',
    '/checkout',                    // case-insensitive
    '/POSDashboard',
    '/POSDashboard?restaurant_id=x',
    '/KioskDashboard',
    '/TabletDashboard',
    '/KitchenDisplay',
    '/CustomerDisplay',
  ];

  blocked.forEach((path) => {
    it(`blocks auto-reload on: ${path}`, () => {
      expect(isActiveTransactionalRoute(path)).toBe(true);
    });
  });

  // ── Should ALLOW auto-reload ──────────────────────────────────────────────
  const allowed = [
    '/',
    '/Home',
    '/Restaurant',
    '/Orders',
    '/CustomerProfile',
    '/AdminDashboard',
    '/AdminRestaurants',
    '/SuperAdmin',
    '/RestaurantDashboard',
    '/MediaScreen',
    '/Messages',
    '/Favorites',
    '/DriverApp',
    '/DriverDashboard',
  ];

  allowed.forEach((path) => {
    it(`allows auto-reload on: ${path}`, () => {
      expect(isActiveTransactionalRoute(path)).toBe(false);
    });
  });
});