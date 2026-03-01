/**
 * POS Offline Database using IndexedDB
 * Handles offline order queuing, menu caching, and sync on reconnect.
 */

const DB_NAME = 'pos_offline_db';
const DB_VERSION = 3;
const STORES = {
    MENU_ITEMS: 'menu_items',
    PENDING_ORDERS: 'pending_orders',
    RESTAURANTS: 'restaurants',
    TABLES: 'tables',
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
        await promisify(store.put({ ...record, synced: true }));
    }
}

export async function getAllPendingUnsynced() {
    const db = await openDB();
    const store = txStore(db, STORES.PENDING_ORDERS);
    const all = await promisify(store.getAll());
    return all.filter(o => !o.synced);
}

export async function getPendingOrderCount(restaurantId) {
    const pending = await getPendingOrders(restaurantId);
    return pending.length;
}