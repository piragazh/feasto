/**
 * Smoke test runner core utilities.
 * Pure Node.js — no external dependencies.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Env loading ─────────────────────────────────────────────────────────────

export function loadEnv() {
    const envPath = resolve(__dirname, '../.env.smoke');
    if (existsSync(envPath)) {
        const lines = readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const [key, ...rest] = trimmed.split('=');
            if (key && rest.length) {
                process.env[key.trim()] = rest.join('=').trim();
            }
        }
    }

    const required = ['SMOKE_BASE_URL'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error(`\n❌  Missing required env vars: ${missing.join(', ')}`);
        console.error('   Copy scripts/smoke/.env.smoke.example → scripts/smoke/.env.smoke and fill in values.\n');
        process.exit(1);
    }

    return {
        baseUrl: process.env.SMOKE_BASE_URL.replace(/\/$/, ''),
        adminToken: process.env.SMOKE_ADMIN_TOKEN || '',
        userToken: process.env.SMOKE_USER_TOKEN || '',
        restaurantId: process.env.SMOKE_TEST_RESTAURANT_ID || '',
        couponId: process.env.SMOKE_TEST_COUPON_ID || '',
        couponCode: process.env.SMOKE_TEST_COUPON_CODE || 'SMOKETEST10',
        menuItemId: process.env.SMOKE_TEST_MENU_ITEM_ID || '',
    };
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

export async function call(baseUrl, fnName, payload, token = null) {
    const url = `${baseUrl}/api/functions/${fnName}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        // 15 second timeout
        signal: AbortSignal.timeout(15_000),
    });

    let body;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json') || ct.includes('manifest')) {
        body = await res.json();
    } else {
        body = await res.text();
    }

    return { status: res.status, body };
}

// GET helper for manifest/static endpoints
export async function get(baseUrl, path) {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    let body;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json') || ct.includes('manifest')) {
        body = await res.json();
    } else {
        body = await res.text();
    }
    return { status: res.status, body, contentType: ct };
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

export function assert(condition, message) {
    if (!condition) throw new Error(message);
}

export function assertStatus(actual, expected, context = '') {
    if (actual !== expected) {
        throw new Error(`Expected HTTP ${expected}, got ${actual}${context ? ' (' + context + ')' : ''}`);
    }
}

export function assertBodyHas(body, key, context = '') {
    if (body == null || typeof body !== 'object') {
        throw new Error(`Expected JSON object body${context ? ' (' + context + ')' : ''}`);
    }
    if (!(key in body)) {
        throw new Error(`Expected body to have key "${key}"${context ? ' (' + context + ')' : ''}. Got: ${JSON.stringify(body)}`);
    }
}

export function assertNoRawError(body) {
    if (typeof body === 'object' && body !== null) {
        const errStr = JSON.stringify(body);
        // These substrings indicate a raw stack trace or internal secret was leaked
        const forbidden = ['at Object.', 'stack:', 'STRIPE_SECRET', 'BASE44_', 'Deno.', 'node_modules'];
        for (const f of forbidden) {
            if (errStr.includes(f)) {
                throw new Error(`Response leaks internal detail: "${f}". Body: ${errStr.substring(0, 200)}`);
            }
        }
    }
}

// ─── Test runner ─────────────────────────────────────────────────────────────

const results = [];

export async function test(name, category, fn) {
    process.stdout.write(`  [${category}] ${name} ... `);
    const start = Date.now();
    try {
        await fn();
        const ms = Date.now() - start;
        console.log(`✅  PASS  (${ms}ms)`);
        results.push({ name, category, pass: true, ms });
    } catch (err) {
        const ms = Date.now() - start;
        console.log(`❌  FAIL  (${ms}ms)`);
        console.log(`       → ${err.message}`);
        results.push({ name, category, pass: false, ms, error: err.message });
    }
}

export function printSummary(suiteName) {
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const total = results.length;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${suiteName} — ${passed}/${total} passed`);
    if (failed > 0) {
        console.log(`\n  Failed tests:`);
        results.filter(r => !r.pass).forEach(r => {
            console.log(`    ❌ [${r.category}] ${r.name}`);
            console.log(`       ${r.error}`);
        });
    }
    console.log(`${'─'.repeat(60)}\n`);

    return failed;
}

export function getResults() {
    return [...results];
}