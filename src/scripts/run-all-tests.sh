#!/bin/bash
# Run all tests: manual checklist + automated test suites
# Usage: ./scripts/run-all-tests.sh

set -e

echo "=========================================="
echo "Payment System Test Suite Runner"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test suite
run_test_suite() {
  local suite_name=$1
  local test_file=$2
  local test_pattern=$3

  echo -e "${YELLOW}[TEST SUITE] ${suite_name}${NC}"
  
  if [ -z "$test_pattern" ]; then
    npx vitest run "$test_file" --reporter=verbose
  else
    npx vitest run "$test_file" -t "$test_pattern" --reporter=verbose
  fi
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ${suite_name} PASSED${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ ${suite_name} FAILED${NC}"
    ((TESTS_FAILED++))
  fi
  
  echo ""
}

# ============================================
# FRONTEND AUTO TESTS
# ============================================
echo -e "${YELLOW}=== FRONTEND AUTO TESTS ===${NC}"
echo ""

run_test_suite \
  "FE-001 to FE-005: Guest Checkout Happy Path" \
  "lib/__tests__/checkout-e2e.test.js" \
  "Checkout - Guest Happy Path"

run_test_suite \
  "FE-006 to FE-008: Authenticated Checkout" \
  "lib/__tests__/checkout-e2e.test.js" \
  "Checkout - Authenticated User"

run_test_suite \
  "FE-009 to FE-011: Payment Method & State" \
  "lib/__tests__/checkout-e2e.test.js" \
  "Checkout - Payment Method Switching"

run_test_suite \
  "FE-012 to FE-014: Pricing & Totals" \
  "lib/__tests__/checkout-e2e.test.js" \
  "Checkout - Price Calculation"

run_test_suite \
  "FE-015 to FE-024: Edge Cases & Recovery" \
  "lib/__tests__/checkout-e2e.test.js" \
  "Checkout - Edge Cases"

# ============================================
# BACKEND FUNCTION TESTS
# ============================================
echo -e "${YELLOW}=== BACKEND FUNCTION TESTS ===${NC}"
echo ""

run_test_suite \
  "BE-001 to BE-010: createPaymentIntent" \
  "functions/__tests__/checkout-functions.test.js" \
  "createPaymentIntent"

run_test_suite \
  "BE-011 to BE-024: verifyAndCreateOrder" \
  "functions/__tests__/checkout-functions.test.js" \
  "verifyAndCreateOrder"

run_test_suite \
  "BE-025 to BE-027: createIdempotentOrder" \
  "functions/__tests__/checkout-functions.test.js" \
  "createIdempotentOrder"

run_test_suite \
  "BE-028 to BE-031: refundWithRetry" \
  "functions/__tests__/checkout-functions.test.js" \
  "refundWithRetry"

# ============================================
# WEBHOOK TESTS
# ============================================
echo -e "${YELLOW}=== WEBHOOK TESTS ===${NC}"
echo ""

run_test_suite \
  "WH-001 to WH-006: Webhook Event Processing" \
  "functions/__tests__/webhook.test.js" \
  "Stripe Webhook"

# ============================================
# RACE CONDITION TESTS
# ============================================
echo -e "${YELLOW}=== RACE CONDITION TESTS ===${NC}"
echo ""

run_test_suite \
  "RC-001 to RC-004: Concurrent Order & Refund" \
  "lib/__tests__/race-conditions.test.js" \
  "Race Condition"

# ============================================
# CHAOS / FAILURE INJECTION TESTS
# ============================================
echo -e "${YELLOW}=== CHAOS / FAILURE INJECTION TESTS ===${NC}"
echo ""

run_test_suite \
  "CH-001 to CH-012: Failure Scenarios" \
  "lib/__tests__/chaos.test.js" \
  "Chaos"

# ============================================
# COVERAGE REPORT
# ============================================
echo -e "${YELLOW}=== CODE COVERAGE ===${NC}"
echo ""
echo "Generating coverage report..."
npx vitest run --coverage --reporter=verbose

# ============================================
# SUMMARY
# ============================================
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo -e "Suites Passed:  ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Suites Failed:  ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi