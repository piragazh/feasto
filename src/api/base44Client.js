import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { getApiUrl } from '@/lib/api-origin';
import { normalizePlatformTimestamps } from '@/lib/platformTimestamps';

const { appId, token, functionsVersion } = appParams;

// Initialize SDK with backend URL properly configured for custom domains
// getApiUrl() is called here (at module load) after window.location is available
const backendUrl = getApiUrl('').replace(/\/$/, '');
console.log('[base44Client] Initialized with backend URL:', backendUrl, 'appId:', appId);

const rawClient = createClient({
  appId,
  token,
  functionsVersion,
  requiresAuth: false,
  backendUrl: backendUrl
});

// ── Platform timestamps: correct them once, here, for every screen ──────────
// created_date / updated_date arrive as UTC without a "Z", so browsers read them
// as local time and every order showed one hour early during British Summer
// Time. Correcting them at the single point all reads pass through fixes every
// screen at once - see src/lib/platformTimestamps.js.
const correct = (out) => (out && typeof out.then === 'function')
  ? out.then(normalizePlatformTimestamps)
  : normalizePlatformTimestamps(out);

const entityCache = new Map();
const wrapEntity = (entity) => new Proxy(entity, {
  get(target, prop) {
    const orig = target[prop];
    if (typeof orig !== 'function') return orig;
    if (prop === 'subscribe') {
      // Live updates carry records too.
      return (callback, ...rest) =>
        orig.call(target, (event) => callback(normalizePlatformTimestamps(event)), ...rest);
    }
    return (...args) => correct(orig.apply(target, args));
  },
});
const entities = new Proxy(rawClient.entities, {
  get(target, name) {
    const entity = target[name];
    if (!entity || typeof entity !== 'object') return entity;
    if (!entityCache.has(name)) entityCache.set(name, wrapEntity(entity));
    return entityCache.get(name);
  },
});
const functions = new Proxy(rawClient.functions, {
  get(target, prop) {
    const orig = target[prop];
    // Backend functions return orders too (e.g. posCreateOrder).
    return prop === 'invoke' && typeof orig === 'function'
      ? (...args) => correct(orig.apply(target, args))
      : orig;
  },
});

export const base44 = new Proxy(rawClient, {
  get(target, prop) {
    if (prop === 'entities') return entities;
    if (prop === 'functions') return functions;
    return target[prop];
  },
});