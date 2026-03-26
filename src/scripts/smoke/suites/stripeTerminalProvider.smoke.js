/**
 * Stripe Terminal Provider Smoke Tests
 * 
 * Verifies:
 * - Provider interface compliance
 * - Error mapping/normalization
 * - Double-submit protection logic
 * - Edge case handling (disconnect, already processing, etc.)
 * - Factory provider creation
 */

import { StripeTerminalProvider } from '@/lib/providers/stripe-terminal-provider.js';
import { createTerminalProvider } from '@/lib/providers/terminal-provider-factory.js';

export async function runStripeTerminalSmoke() {
  console.log('\n=== STRIPE TERMINAL PROVIDER SMOKE TESTS ===\n');

  const tests = [
    testProviderInitialization,
    testProviderInterfaceCompliance,
    testDoubleSubmitDetection,
    testAlreadyProcessingGuard,
    testReaderNotConnectedError,
    testErrorNormalization,
    testProviderFactory,
    testProviderStatusCheck,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test();
      if (result.success) {
        console.log(`✅ ${result.name}: ${result.message}`);
        passed++;
      } else {
        console.log(`❌ ${result.name}: ${result.message}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);

  return { passed, failed, total: passed + failed };
}

// ──────────────────────────────────────────────────────────────
// TEST CASES
// ──────────────────────────────────────────────────────────────

async function testProviderInitialization() {
  const provider = new StripeTerminalProvider({
    publishableKey: 'pk_test_123',
    deviceSerialNumber: 'reader_abc'
  });

  if (!provider) {
    return {
      success: false,
      name: 'Provider Initialization',
      message: 'Failed to instantiate'
    };
  }

  if (provider.isInitialized) {
    return {
      success: false,
      name: 'Provider Initialization',
      message: 'Should not be initialized before init() call'
    };
  }

  return {
    success: true,
    name: 'Provider Initialization',
    message: 'Provider instantiated, not yet initialized'
  };
}

async function testProviderInterfaceCompliance() {
  const provider = new StripeTerminalProvider();

  // Check all required methods exist
  const requiredMethods = ['init', 'startPayment', 'cancelPayment', 'getStatus'];
  for (const method of requiredMethods) {
    if (typeof provider[method] !== 'function') {
      return {
        success: false,
        name: 'Provider Interface Compliance',
        message: `Missing method: ${method}`
      };
    }
  }

  // Check config property
  if (!provider.config || typeof provider.config !== 'object') {
    return {
      success: false,
      name: 'Provider Interface Compliance',
      message: 'Missing config property'
    };
  }

  return {
    success: true,
    name: 'Provider Interface Compliance',
    message: 'All required methods + config property present'
  };
}

async function testDoubleSubmitDetection() {
  const provider = new StripeTerminalProvider();

  // Simulate setting lastPaymentIntentId (normally set after first successful payment)
  provider.lastPaymentIntentId = 'pi_existing_123';
  provider.isInitialized = true;
  provider.currentReader = { label: 'Test Reader' };

  // Mock _checkRecentTransaction to return a cached result
  provider._checkRecentTransaction = async (orderId) => {
    if (orderId === 'ORDER-DUPLICATE') {
      return { id: 'ch_cached_123', receipt_email: 'rcpt@stripe' };
    }
    return null;
  };

  // Attempt to start payment with same orderId
  try {
    const result = await provider.startPayment({
      amount: 1000,
      currency: 'GBP',
      orderId: 'ORDER-DUPLICATE'
    });

    // Should return cached result (not create new payment intent)
    if (result.metadata?.skipDuplicateCheck !== true) {
      return {
        success: false,
        name: 'Double Submit Detection',
        message: 'Did not skip duplicate check'
      };
    }

    return {
      success: true,
      name: 'Double Submit Detection',
      message: 'Duplicate orderId returned cached transaction'
    };
  } catch (error) {
    return {
      success: false,
      name: 'Double Submit Detection',
      message: `Threw error instead of using cache: ${error.message}`
    };
  }
}

async function testAlreadyProcessingGuard() {
  const provider = new StripeTerminalProvider();
  provider.isInitialized = true;
  provider.isProcessing = true; // Already processing
  provider.currentReader = { label: 'Test Reader' };

  try {
    await provider.startPayment({
      amount: 1000,
      currency: 'GBP',
      orderId: 'ORDER-CONCURRENT'
    });

    return {
      success: false,
      name: 'Already Processing Guard',
      message: 'Should throw error when already processing'
    };
  } catch (error) {
    if (error.code === 'ALREADY_PROCESSING') {
      return {
        success: true,
        name: 'Already Processing Guard',
        message: 'Correctly blocked concurrent payment'
      };
    }
    return {
      success: false,
      name: 'Already Processing Guard',
      message: `Wrong error code: ${error.code}`
    };
  }
}

async function testReaderNotConnectedError() {
  const provider = new StripeTerminalProvider();
  provider.isInitialized = true;
  provider.currentReader = null; // No reader connected

  try {
    await provider.startPayment({
      amount: 1000,
      currency: 'GBP',
      orderId: 'ORDER-NO-READER'
    });

    return {
      success: false,
      name: 'Reader Not Connected Error',
      message: 'Should throw error when no reader connected'
    };
  } catch (error) {
    if (error.code === 'NO_READER') {
      return {
        success: true,
        name: 'Reader Not Connected Error',
        message: 'Correctly detected no reader'
      };
    }
    return {
      success: false,
      name: 'Reader Not Connected Error',
      message: `Wrong error code: ${error.code}`
    };
  }
}

async function testErrorNormalization() {
  const provider = new StripeTerminalProvider();

  // Test card_error mapping
  const cardError = {
    type: 'card_error',
    code: 'card_declined',
    message: 'Your card was declined'
  };

  const result = provider._handlePaymentError(cardError, 'TEST-001');

  if (result.status !== 'declined' || result.error_code !== 'CARD_ERROR') {
    return {
      success: false,
      name: 'Error Normalization',
      message: `Expected declined/CARD_ERROR, got ${result.status}/${result.error_code}`
    };
  }

  return {
    success: true,
    name: 'Error Normalization',
    message: 'Card error correctly mapped to declined status'
  };
}

async function testProviderFactory() {
  // Test mock provider
  const mockConfig = { terminal_provider: 'mock' };
  const mockProvider = createTerminalProvider(mockConfig);

  if (mockProvider.constructor.name !== 'MockTerminalProvider') {
    return {
      success: false,
      name: 'Provider Factory',
      message: 'Factory did not return MockTerminalProvider'
    };
  }

  // Test stripe provider
  const stripeConfig = {
    terminal_provider: 'stripe',
    terminal_config: { publishableKey: 'pk_test_123' }
  };
  const stripeProvider = createTerminalProvider(stripeConfig);

  if (stripeProvider.constructor.name !== 'StripeTerminalProvider') {
    return {
      success: false,
      name: 'Provider Factory',
      message: 'Factory did not return StripeTerminalProvider'
    };
  }

  // Test default (empty config → mock)
  const defaultProvider = createTerminalProvider({});
  if (defaultProvider.constructor.name !== 'MockTerminalProvider') {
    return {
      success: false,
      name: 'Provider Factory',
      message: 'Factory did not default to MockTerminalProvider'
    };
  }

  return {
    success: true,
    name: 'Provider Factory',
    message: 'Factory correctly creates stripe, mock, and defaults'
  };
}

async function testProviderStatusCheck() {
  const provider = new StripeTerminalProvider();

  const status = await provider.getStatus();

  if (!status.hasOwnProperty('online') ||
      !status.hasOwnProperty('initialized') ||
      !status.hasOwnProperty('provider')) {
    return {
      success: false,
      name: 'Provider Status Check',
      message: 'Status missing required properties'
    };
  }

  if (status.provider !== 'stripe') {
    return {
      success: false,
      name: 'Provider Status Check',
      message: 'Status did not identify as stripe'
    };
  }

  if (status.initialized !== false) {
    return {
      success: false,
      name: 'Provider Status Check',
      message: 'Should report initialized=false before init()'
    };
  }

  return {
    success: true,
    name: 'Provider Status Check',
    message: 'Status correctly reports provider info and initialized state'
  };
}