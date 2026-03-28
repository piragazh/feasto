# Test Runner Guide

## Quick Start

```bash
# Run all tests with detailed summary
npm run test:all

# Run specific test suite
npm run test:frontend    # Frontend tests only
npm run test:backend     # Backend function tests
npm run test:webhook     # Webhook tests
npm run test:race        # Race condition tests
npm run test:chaos       # Chaos/failure injection tests

# Interactive test UI
npm run test

# Watch mode (re-run on file change)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Organization

```
lib/__tests__/
├── checkout-e2e.test.js         (28 tests: FE-001 to FE-024)
├── race-conditions.test.js       (5 tests: RC-001 to RC-004)
└── chaos.test.js                 (15 tests: CH-001 to CH-012)

functions/__tests__/
├── checkout-functions.test.js    (31 tests: BE-001 to BE-031)
└── webhook.test.js               (12 tests: WH-001 to WH-006)
```

## Test Suites Summary

| Suite | Tests | Type | Command |
|-------|-------|------|---------|
| **Frontend** | 28 | E2E/Integration | `npm run test:frontend` |
| **Backend Functions** | 31 | Unit | `npm run test:backend` |
| **Webhooks** | 12 | Unit | `npm run test:webhook` |
| **Race Conditions** | 5 | Concurrency | `npm run test:race` |
| **Chaos** | 15 | Failure Injection | `npm run test:chaos` |
| **TOTAL** | **131** | Mixed | `npm run test:all` |

## CI/CD Integration

```bash
# GitHub Actions example (.github/workflows/test.yml)
- name: Run all tests
  run: npm run test:all
  
- name: Generate coverage
  run: npm run test:coverage
  
- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Coverage Targets

- **Lines:** ≥95%
- **Branches:** ≥90%
- **Functions:** ≥95%

View coverage report after running:
```bash
npm run test:coverage
open coverage/index.html
```

## Debugging Tests

```bash
# Run single test file with debug output
npx vitest run lib/__tests__/checkout-e2e.test.js --reporter=verbose

# Run specific test by name
npx vitest run -t "FE-001"

# Debug in browser (pause execution)
npx vitest --inspect-brk --inspect --single-thread
```

## Manual QA Checklist

See `docs/PAYMENT_VALIDATION_PACK.md` Section 1 for 40 manual test cases.

Execute manually or via test framework:
1. **M001-M009:** Guest Checkout
2. **M010-M012:** Authenticated Checkout
3. **M013-M019:** Payment Methods
4. **M020-M025:** Pricing & Discounts
5. **M026-M033:** Error Handling
6. **M034-M038:** Mobile/Cross-Platform
7. **M039-M040:** Concurrency

## Release Gate Checklist

Before production deployment, ensure:
- [ ] All 131 automated tests pass
- [ ] Coverage ≥95% lines
- [ ] All 10 release gates pass (see `docs/RELEASE_GATES.md`)
- [ ] Manual QA sign-off obtained

## Test Patterns Used

### Frontend Tests (Vitest + React Testing Library)
```javascript
describe('Feature', () => {
  test('test-id: Expected behavior', async () => {
    const {user} = renderComponent();
    await user.type(screen.getByLabelText(/label/), 'input');
    expect(screen.getByText(/output/)).toBeInTheDocument();
  });
});
```

### Backend Tests (Vitest)
```javascript
describe('Function', () => {
  test('BE-XXX: Expected behavior', async () => {
    const response = await invoke('functionName', {payload});
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({...});
  });
});
```

## Troubleshooting

**Tests timeout:**
- Increase timeout: `vi.setConfig({testTimeout: 10000})`
- Check for unresolved promises

**Mock not working:**
- Ensure mock is before import: `vi.mock('@/api')`
- Clear mocks between tests: `vi.clearAllMocks()`

**Coverage gaps:**
- Run with detailed report: `npx vitest run --coverage`
- Check `coverage/index.html` for uncovered lines

## Next Steps

1. Run `npm run test:all` to execute full suite
2. Review `docs/RELEASE_GATES.md` for sign-off criteria
3. Execute manual QA tests from `docs/PAYMENT_VALIDATION_PACK.md`
4. Obtain all 3 sign-offs (Engineering, QA, Ops)
5. Deploy to production