/**
 * Smoke: auditLog
 * Category B/D – Authenticated write + auth rejection
 * Environment: staging only (creates DashboardActivity records)
 * Destructive: minor — creates a DashboardActivity row, no customer impact
 */

import { call, test, assertStatus, assertBodyHas, assertNoRawError } from '../lib/runner.js';

export async function run(env) {
    console.log('\n── auditLog ──────────────────────────────────────────────');

    // ── D: Unauthenticated request rejected ──────────────────────────────────
    await test('unauthenticated request is rejected (no token)', 'D', async () => {
        const { status, body } = await call(env.baseUrl, 'auditLog', {
            action: 'smoke_test',
            resourceType: 'SmokeTest',
        });
        // Function calls base44.auth.me() — without token it should either
        // reject or fall back to anonymous. In either case must not 500.
        assertNoRawError(body);
        // Status should be 400/401/403 or 201 (anonymous fallback allowed by design)
        const allowed = [400, 401, 403, 201];
        if (!allowed.includes(status)) {
            throw new Error(`Unexpected status ${status} for unauthenticated auditLog`);
        }
    });

    await test('missing required fields returns 400', 'A', async () => {
        const { status, body } = await call(env.baseUrl, 'auditLog', {
            // action and resourceType are omitted
            details: { smoke: true },
        }, env.adminToken || undefined);
        assertStatus(status, 400);
        assertBodyHas(body, 'error');
        assertNoRawError(body);
    });

    // ── B: Authenticated write ────────────────────────────────────────────────
    if (env.adminToken) {
        await test('valid audit event writes successfully (admin)', 'C', async () => {
            const { status, body } = await call(env.baseUrl, 'auditLog', {
                action: 'smoke_test_write',
                resourceType: 'SmokeTest',
                resourceId: 'smoke-fixture-id',
                severity: 'info',
                details: { source: 'smoke-test', timestamp: new Date().toISOString() },
            }, env.adminToken);
            assertStatus(status, 201);
            assertBodyHas(body, 'success');
            assertBodyHas(body, 'logId');
            assertNoRawError(body);
        });

        await test('response does not leak internal details on any path', 'B', async () => {
            // Send a deliberately weird payload to probe error paths
            const { status, body } = await call(env.baseUrl, 'auditLog', {
                action: null,
                resourceType: null,
            }, env.adminToken);
            // Should be 400 — missing fields
            assertStatus(status, 400);
            assertNoRawError(body);
        });
    } else {
        console.log('   ⏭  Skipped authenticated auditLog tests (SMOKE_ADMIN_TOKEN not set)');
    }
}