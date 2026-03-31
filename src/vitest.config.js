/**
/* eslint-disable no-undef */
 * Vitest configuration — kept separate from vite.config.js so Vitest
 * doesn't load browser-only plugins (base44, react) during test runs.
 *
 * The `test` block in vite.config.js still works but this file is used
 * explicitly when running `npm run test:run` in CI.
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
    test: {
        // Run in Node — our pure-function tests have no browser deps
        environment: 'node',

        // Match all test files in src/
        include: ['src/**/*.test.{js,jsx,ts,tsx}'],

        // Vitest globals (describe, it, expect) without explicit imports
        globals: true,

        // Clear mocks automatically between tests
        clearMocks: true,
        restoreMocks: true,

        // Fail on any unhandled error
        bail: 0,

        // Reporters: verbose in CI, default locally
        reporter: process.env.CI ? 'verbose' : 'default',

        // Coverage configuration (opt-in via --coverage flag)
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/lib/**/*.js'],
            exclude: ['src/lib/__tests__/**'],
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});