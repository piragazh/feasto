/**
 * Card Terminal Integration Smoke Tests
 * 
 * Verifies:
 * - State machine transitions valid
 * - Provider interface contract
 * - MockProvider deterministic
 * - TerminalService state management
 * - Error handling
 */

import { 
  TERMINAL_STATES, 
  isValidTransition, 
  isTerminalState, 
  isSuccessState 
} from '@/lib/terminal-state-machine.js';
import { TerminalService } from '@/lib/terminal-service.js';
import { MockTerminalProvider } from '@/lib/providers/mock-terminal-provider.js';

export async function runCardTerminalSmoke() {
  console.log('\n=== CARD TERMINAL INTEGRATION SMOKE TESTS ===\n');

  const tests = [
    testStateMachineTransitions,
    testMockProviderSuccess,
    testMockProviderDecline,
    testMockProviderTimeout,
    testMockProviderError,
    testTerminalServiceStateTracking,
    testTerminalServiceSubscription,
    testTerminalServiceReset,
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

async function testStateMachineTransitions() {
  // IDLE → INITIATING → AWAITING_CARD → PROCESSING → AUTHORIZED → IDLE
  const flow = [
    { from: TERMINAL_STATES.IDLE, to: TERMINAL_STATES.INITIATING },
    { from: TERMINAL_STATES.INITIATING, to: TERMINAL_STATES.AWAITING_CARD },
    { from: TERMINAL_STATES.AWAITING_CARD, to: TERMINAL_STATES.PROCESSING },
    { from: TERMINAL_STATES.PROCESSING, to: TERMINAL_STATES.AUTHORIZED },
    { from: TERMINAL_STATES.AUTHORIZED, to: TERMINAL_STATES.IDLE }
  ];

  for (const { from, to } of flow) {
    if (!isValidTransition(from, to)) {
      return {
        success: false,
        name: 'State Machine Transitions',
        message: `Invalid transition: ${from} → ${to}`
      };
    }
  }

  // Test invalid transition (should fail)
  if (isValidTransition(TERMINAL_STATES.IDLE, TERMINAL_STATES.AUTHORIZED)) {
    return {
      success: false,
      name: 'State Machine Transitions',
      message: 'Should not allow IDLE → AUTHORIZED'
    };
  }

  return {
    success: true,
    name: 'State Machine Transitions',
    message: 'All valid transitions work, invalid ones blocked'
  };
}

async function testMockProviderSuccess() {
  // Amount ending in non-02/03/04 = success
  const provider = new MockTerminalProvider();
  await provider.init();

  const response = await provider.startPayment({
    amount: 1000,  // Success (not 02/03/04)
    currency: 'GBP',
    orderId: 'TEST-001'
  });

  if (response.status !== 'authorized') {
    return {
      success: false,
      name: 'MockProvider Success Path',
      message: `Expected 'authorized', got '${response.status}'`
    };
  }

  if (!response.transaction_id || !response.receipt_reference) {
    return {
      success: false,
      name: 'MockProvider Success Path',
      message: 'Missing transaction_id or receipt_reference'
    };
  }

  return {
    success: true,
    name: 'MockProvider Success Path',
    message: 'Amount 1000 → authorized with transaction_id'
  };
}

async function testMockProviderDecline() {
  // Amount ending in 02 = decline
  const provider = new MockTerminalProvider();
  await provider.init();

  const response = await provider.startPayment({
    amount: 1002,  // Decline (ends in 02)
    currency: 'GBP',
    orderId: 'TEST-002'
  });

  if (response.status !== 'declined') {
    return {
      success: false,
      name: 'MockProvider Decline Path',
      message: `Expected 'declined', got '${response.status}'`
    };
  }

  if (!response.error_code || response.error_code !== 'CARD_DECLINED') {
    return {
      success: false,
      name: 'MockProvider Decline Path',
      message: 'Missing or wrong error_code'
    };
  }

  return {
    success: true,
    name: 'MockProvider Decline Path',
    message: 'Amount 1002 → declined with error_code'
  };
}

async function testMockProviderTimeout() {
  // Amount ending in 03 = timeout
  const provider = new MockTerminalProvider();
  await provider.init();

  let threwError = false;
  try {
    await provider.startPayment({
      amount: 1003,  // Timeout (ends in 03)
      currency: 'GBP',
      orderId: 'TEST-003'
    });
  } catch (error) {
    threwError = true;
    if (error.code !== 'TIMEOUT') {
      return {
        success: false,
        name: 'MockProvider Timeout Path',
        message: `Expected error code 'TIMEOUT', got '${error.code}'`
      };
    }
  }

  if (!threwError) {
    return {
      success: false,
      name: 'MockProvider Timeout Path',
      message: 'Should throw TerminalError for timeout'
    };
  }

  return {
    success: true,
    name: 'MockProvider Timeout Path',
    message: 'Amount 1003 → throws TerminalError(TIMEOUT)'
  };
}

async function testMockProviderError() {
  // Amount ending in 04 = error
  const provider = new MockTerminalProvider();
  await provider.init();

  let threwError = false;
  try {
    await provider.startPayment({
      amount: 1004,  // Error (ends in 04)
      currency: 'GBP',
      orderId: 'TEST-004'
    });
  } catch (error) {
    threwError = true;
    if (error.code !== 'COMMUNICATION_ERROR') {
      return {
        success: false,
        name: 'MockProvider Error Path',
        message: `Expected error code 'COMMUNICATION_ERROR', got '${error.code}'`
      };
    }
  }

  if (!threwError) {
    return {
      success: false,
      name: 'MockProvider Error Path',
      message: 'Should throw TerminalError for error'
    };
  }

  return {
    success: true,
    name: 'MockProvider Error Path',
    message: 'Amount 1004 → throws TerminalError(COMMUNICATION_ERROR)'
  };
}

async function testTerminalServiceStateTracking() {
  const provider = new MockTerminalProvider();
  const service = new TerminalService(provider);
  await service.init();

  if (service.getState() !== TERMINAL_STATES.IDLE) {
    return {
      success: false,
      name: 'TerminalService State Tracking',
      message: `Expected IDLE after init, got ${service.getState()}`
    };
  }

  const result = await service.startPayment({
    amount: 1000,
    currency: 'GBP',
    orderId: 'TEST-005'
  });

  if (service.getState() !== TERMINAL_STATES.AUTHORIZED) {
    return {
      success: false,
      name: 'TerminalService State Tracking',
      message: `Expected AUTHORIZED after success, got ${service.getState()}`
    };
  }

  if (!result.success) {
    return {
      success: false,
      name: 'TerminalService State Tracking',
      message: 'startPayment should return success=true'
    };
  }

  return {
    success: true,
    name: 'TerminalService State Tracking',
    message: 'IDLE → AUTHORIZED flow correct'
  };
}

async function testTerminalServiceSubscription() {
  const provider = new MockTerminalProvider();
  const service = new TerminalService(provider);
  await service.init();

  const stateLog = [];
  const unsubscribe = service.subscribe(({ state }) => {
    stateLog.push(state);
  });

  await service.startPayment({
    amount: 1000,
    currency: 'GBP',
    orderId: 'TEST-006'
  });

  unsubscribe();

  if (stateLog.length === 0) {
    return {
      success: false,
      name: 'TerminalService Subscription',
      message: 'Listener not called'
    };
  }

  if (!stateLog.includes(TERMINAL_STATES.AUTHORIZED)) {
    return {
      success: false,
      name: 'TerminalService Subscription',
      message: `AUTHORIZED not in log: ${stateLog.join(', ')}`
    };
  }

  return {
    success: true,
    name: 'TerminalService Subscription',
    message: `Listener received ${stateLog.length} state updates`
  };
}

async function testTerminalServiceReset() {
  const provider = new MockTerminalProvider();
  const service = new TerminalService(provider);
  await service.init();

  // Complete a payment
  await service.startPayment({
    amount: 1000,
    currency: 'GBP',
    orderId: 'TEST-007'
  });

  if (service.getState() !== TERMINAL_STATES.AUTHORIZED) {
    return {
      success: false,
      name: 'TerminalService Reset',
      message: 'Should be AUTHORIZED before reset'
    };
  }

  // Reset to idle
  service.resetToIdle();

  if (service.getState() !== TERMINAL_STATES.IDLE) {
    return {
      success: false,
      name: 'TerminalService Reset',
      message: `After reset, expected IDLE, got ${service.getState()}`
    };
  }

  if (service.getCurrentPayment() !== null) {
    return {
      success: false,
      name: 'TerminalService Reset',
      message: 'currentPayment should be null after reset'
    };
  }

  return {
    success: true,
    name: 'TerminalService Reset',
    message: 'AUTHORIZED → IDLE reset works, payment context cleared'
  };
}