/**
 * POS Offline Database using IndexedDB
 * Handles offline order queuing, menu caching, and sync on reconnect.
 */

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 4;
const STORES = {
    MENU_ITEMS: 'menu_items',
    PENDING_ORDERS: 'pending_orders',
    RESTAURANTS: 'restaurants',
    TABLES: 'tables',
    PENDING_STATUS_UPDATES: 'pending_status_updates',
    PENDING_TABLE_ORDERS: 'pending_table_orders',
    STAFF_PINS: 'staff_pins',
};

let dbInstance = null;

function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORES.MENU_ITEMS)) {
                const store = db.createObjectStore(STORES.MENU_ITEMS, { keyPath: 'id' });
                store.createIndex('restaurant_id', 'restaurant_id', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.PENDING_ORDERS)) {
                const store = db.createObjectStore(STORES.PENDING_ORDERS, { keyPath: 'offline_id' });
                store.createIndex('restaurant_id', 'restaurant_id', { unique: false });
                store.createIndex('synced', 'synced', { unique: false });
            }
            if (!db.objectStoreNames.contains(STORES.RESTAURANTS)) {
                db.createObjectStore(STORES.RESTAURANTS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.TABLES)) {
                const store = db.createObjectStore(STORES.TABLES, { keyPath: 'id' });
                store.createIndex('restaurant_id', 'restaurant_id', { unique: false });
            }
            // v3: pending status updates
            if (!db.objectStoreNames.contains(STORES.PENDING_STATUS_UPDATES)) {
                const store = db.createObjectStore(STORES.PENDING_STATUS_UPDATES, { keyPath: 'offline_id' });
                store.createIndex('order_id', 'order_id', { unique: false });
                store.createIndex('synced', 'synced', { unique: false });
            }
            // v4: pending table orders (dine-in orders queued while offline)
            if (!db.objectStoreNames.contains(STORES.PENDING_TABLE_ORDERS)) {
                const store = db.createObjectStore(STORES.PENDING_TABLE_ORDERS, { keyPath: 'offline_id' });
                store.createIndex('restaurant_id', 'restaurant_id', { unique: false });
                store.createIndex('synced', 'synced', { unique: false });
            }
            // v4: staff PIN hashes for offline login
            if (!db.objectStoreNames.contains(STORES.STAFF_PINS)) {
                db.createObjectStore(STORES.STAFF_PINS, { keyPath: 'staff_id' });
            }
        };

        req.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };

        req.onerror = () => reject(req.error);
    });
}

// Generic helpers
function txStore(db, storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ─── Menu Items ─────────────────────────────────────────────────────────────

export async function cacheMenuItems(restaurantId, items) {
    const db = await openDB();
    // Use a single transaction for the whole operation
    const tx = db.transaction(STORES.MENU_ITEMS, 'readwrite');
    const store = tx.objectStore(STORES.MENU_ITEMS);
    const index = store.index('restaurant_id');
    const keys = await promisify(index.getAllKeys(restaurantId));
    for (const k of keys) store.delete(k);
    for (const item of items) store.put({ ...item, restaurant_id: restaurantId });
    // Wait for transaction to complete
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function getCachedMenuItems(restaurantId) {
    const db = await openDB();
    const store = txStore(db, STORES.MENU_ITEMS);
    const index = store.index('restaurant_id');
    return promisify(index.getAll(restaurantId));
}

// ─── Restaurants ─────────────────────────────────────────────────────────────

export async function cacheRestaurant(restaurant) {
    const db = await openDB();
    const store = txStore(db, STORES.RESTAURANTS, 'readwrite');
    return promisify(store.put(restaurant));
}

export async function getCachedRestaurant(restaurantId) {
    const db = await openDB();
    const store = txStore(db, STORES.RESTAURANTS);
    return promisify(store.get(restaurantId));
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export async function cacheTables(restaurantId, tables) {
    const db = await openDB();
    const tx = db.transaction(STORES.TABLES, 'readwrite');
    const store = tx.objectStore(STORES.TABLES);
    const index = store.index('restaurant_id');
    const keys = await promisify(index.getAllKeys(restaurantId));
    for (const k of keys) store.delete(k);
    for (const table of tables) store.put({ ...table, restaurant_id: restaurantId });
    await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

export async function getCachedTables(restaurantId) {
    const db = await openDB();
    const store = txStore(db, STORES.TABLES);
    const index = store.index('restaurant_id');
    return promisify(index.getAll(restaurantId));
}

// ─── Pending Orders ──────────────────────────────────────────────────────────

export async function savePendingOrder(orderData) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS, 'readwrite');
    const offline_id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const record = {
        ...orderData,
        offline_id,
        synced: false,
        syncStatus: 'pending', // ✨ NEW: 'pending' | 'synced' | 'failed'
        syncError: null, // ✨ NEW: error message if failed
        syncAttempts: 0, // ✨ NEW: retry count
        created_at: new Date().toISOString(),
    };
    await promisify(store.put(record));
    return record;
}

export async function getPendingOrders(restaurantId) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS);
    const index = store.index('restaurant_id');
    const all = await promisify(index.getAll(restaurantId));
    return all.filter(o => !o.synced);
}

export async function markOrderSynced(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({ ...record, synced: true, syncStatus: 'synced', syncError: null }));
    }
}

// ✨ NEW: Mark sync failure with error details
export async function markOrderSyncFailed(offline_id, errorMessage) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({
            ...record,
            syncStatus: 'failed',
            syncError: errorMessage,
            syncAttempts: (record.syncAttempts || 0) + 1,
        }));
    }
}

export async function getAllPendingUnsynced() {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS);
    const all = await promisify(store.getAll());
    return all.filter(o => !o.synced);
}

/**
 * After this many failed attempts an order stops being retried automatically
 * and is surfaced to a manager for a decision instead. Without a cap, an order
 * the server permanently rejects (e.g. failed revalidation) would be retried on
 * every sync cycle forever, re-toasting an error each time during service.
 */
export const MAX_SYNC_ATTEMPTS = 5;

/** Orders still worth retrying automatically. */
export async function getRetryablePendingOrders() {
    const all = await getAllPendingUnsynced();
    return all.filter(o => (o.syncAttempts || 0) < MAX_SYNC_ATTEMPTS);
}

/** Orders that have exhausted their retries and need a manager decision. */
export async function getStuckOrders(restaurantId) {
    const all = await getAllPendingUnsynced();
    const stuck = all.filter(o => (o.syncAttempts || 0) >= MAX_SYNC_ATTEMPTS);
    return restaurantId ? stuck.filter(o => o.restaurant_id === restaurantId) : stuck;
}

export async function getRetryableTableOrders() {
    const all = await getAllPendingTableOrders();
    return all.filter(o => (o.syncAttempts || 0) < MAX_SYNC_ATTEMPTS);
}

export async function getStuckTableOrders(restaurantId) {
    const all = await getAllPendingTableOrders();
    const stuck = all.filter(o => (o.syncAttempts || 0) >= MAX_SYNC_ATTEMPTS);
    return restaurantId ? stuck.filter(o => o.restaurant_id === restaurantId) : stuck;
}

/** Reset the attempt counter so a stuck order is retried again (manager action). */
export async function resetOrderSyncAttempts(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({ ...record, syncAttempts: 0, syncStatus: 'pending', syncError: null }));
    }
}

export async function resetTableOrderSyncAttempts(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({ ...record, syncAttempts: 0, syncStatus: 'pending', syncError: null }));
    }
}

/**
 * Permanently drop a stuck order from the queue (manager action, e.g. the order
 * was re-entered manually). Kept deliberately explicit — nothing discards
 * order data automatically.
 */
export async function discardPendingOrder(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS, 'readwrite');
    await promisify(store.delete(offline_id));
}

export async function discardPendingTableOrder(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS, 'readwrite');
    await promisify(store.delete(offline_id));
}

export async function getPendingOrderCount(restaurantId) {
    const pending = await getPendingOrders(restaurantId);
    return pending.length;
}

// ─── Pending Status Updates ──────────────────────────────────────────────────

export async function savePendingStatusUpdate(orderId, status) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_STATUS_UPDATES, 'readwrite');
    const offline_id = `status_${orderId}_${Date.now()}`;
    const record = { offline_id, order_id: orderId, status, synced: false, created_at: new Date().toISOString() };
    await promisify(store.put(record));
    return record;
}

export async function getAllPendingStatusUpdates() {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_STATUS_UPDATES);
    const all = await promisify(store.getAll());
    return all.filter(r => !r.synced);
}

export async function markStatusUpdateSynced(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_STATUS_UPDATES, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) await promisify(store.put({ ...record, synced: true }));
}

// ─── Cache metadata ──────────────────────────────────────────────────────────

const META_KEY = 'pos_cache_meta';

export function getCacheMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch { return {}; }
}

export function setCacheMeta(restaurantId, key, value) {
    const meta = getCacheMeta();
    if (!meta[restaurantId]) meta[restaurantId] = {};
    meta[restaurantId][key] = value;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function getLastCachedAt(restaurantId, key) {
    return getCacheMeta()?.[restaurantId]?.[key] || null;
}

// ─── Pending Table Orders (offline dine-in) ──────────────────────────────────

export async function savePendingTableOrder(orderData, tableId, tableNumber) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS, 'readwrite');
    const offline_id = `table_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const record = {
        ...orderData,
        offline_id,
        table_id: tableId,
        table_number: tableNumber,
        synced: false,
        syncStatus: 'pending',
        syncError: null,
        syncAttempts: 0,
        created_at: new Date().toISOString(),
    };
    await promisify(store.put(record));
    return record;
}

export async function getAllPendingTableOrders() {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS);
    const all = await promisify(store.getAll());
    return all.filter(o => !o.synced);
}

export async function markTableOrderSynced(offline_id) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({ ...record, synced: true, syncStatus: 'synced', syncError: null }));
    }
}

export async function markTableOrderSyncFailed(offline_id, errorMessage) {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_TABLE_ORDERS, 'readwrite');
    const record = await promisify(store.get(offline_id));
    if (record) {
        await promisify(store.put({
            ...record,
            syncStatus: 'failed',
            syncError: errorMessage,
            syncAttempts: (record.syncAttempts || 0) + 1,
        }));
    }
}

// ─── Staff PIN Cache (offline login) ─────────────────────────────────────────

export async function cacheStaffPin(staffId, restaurantId, pinHash, staffInfo) {
    const db = await openDB();
    const store = txStore(db, STORES.STAFF_PINS, 'readwrite');
    const record = {
        staff_id: staffId,
        restaurant_id: restaurantId,
        pin_hash: pinHash,
        staff_info: staffInfo,
        cached_at: new Date().toISOString(),
    };
    await promisify(store.put(record));
    return record;
}

export async function getCachedStaffPin(staffId) {
    const db = await openDB();
    const store = txStore(db, STORES.STAFF_PINS);
    return promisify(store.get(staffId));
}