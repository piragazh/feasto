#!/usr/bin/env node
/* global process */

/**
 * Checkout Test Suite Runner
 * 
 * Runs all checkout-related smoke tests:
 * 1. Payment initialization logic tests
 * 2. Pricing calculation tests
 * 3. E2E checkout flow with real data
 * 4. Integration tests
 */

import { runCheckoutPaymentTests } from './suites/checkoutPaymentInitialization.smoke.js';
import { runCheckoutIntegrationTest } from './suites/checkoutIntegrationTest.smoke.js';

async function runAllTests() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║          CHECKOUT TEST SUITE - COMPLETE              ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    const allResults = [];
    
    // Run test suites
    console.log('\n\n📋 Running Unit Tests...');
    const unitTests = await runCheckoutPaymentTests();
    allResults.push({ suite: 'Payment Initialization', ...unitTests });
    
    console.log('\n\n📋 Running Integration Tests...');
    const integrationTests = await runCheckoutIntegrationTest();
    allResults.push({ suite: 'Checkout Integration', ...integrationTests });
    
    // Summary
    console.log('\n\n╔════════════════════════════════════════════════════════╗');
    console.log('║                  FINAL SUMMARY                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    let totalPassed = 0;
    let totalTests = 0;
    
    allResults.forEach(result => {
        console.log(`${result.suite}:`);
        console.log(`  Passed: ${result.passed}/${result.total}`);
        console.log(`  Failed: ${result.failed}/${result.total}`);
        totalPassed += result.passed;
        totalTests += result.total;
    });
    
    console.log('\n' + '─'.repeat(60));
    console.log(`TOTAL: ${totalPassed}/${totalTests} tests passed`);
    console.log('─'.repeat(60) + '\n');
    
    const success = totalPassed === totalTests;
    console.log(success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
    console.log('\n');
    
    process.exit(success ? 0 : 1);
}

runAllTests().catch(err => {
    console.error('\n❌ Test runner failed:', err.message);
    process.exit(1);
});