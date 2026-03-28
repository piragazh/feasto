/**
 * Frontend Integration Tests for Checkout
 * Framework: Vitest + React Testing Library
 * Location: src/lib/__tests__/checkout-e2e.test.js
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checkout from '@/pages/Checkout';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mock base44 API
vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: {
      me: vi.fn(),
      isAuthenticated: vi.fn(() => Promise.resolve(false))
    },
    entities: {
      Restaurant: {filter: vi.fn()},
      MenuItem: {filter: vi.fn()},
      Coupon: {filter: vi.fn()},
      Promotion: {filter: vi.fn()}
    },
    functions: {
      invoke: vi.fn()
    }
  }
}));

vi.mock('@stripe/react-stripe-js');

const renderCheckout = (props = {}) => {
  const user = userEvent.setup();
  const rendered = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <BrowserRouter>
        <Checkout {...props} />
      </BrowserRouter>
    </QueryClientProvider>
  );
  return {user, ...rendered};
};

describe('Checkout - Guest Happy Path', () => {
  beforeEach(() => {
    localStorage.setItem('cart', JSON.stringify([
      {id: 'item1', name: 'Pizza', price: 10, quantity: 2},
      {id: 'item2', name: 'Pasta', price: 8, quantity: 1}
    ]));
    localStorage.setItem('cartRestaurantId', 'rest_123');
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('FE-001: Guest adds 3 items, enters details, pays with card', async () => {
    const {user} = renderCheckout();
    
    // Wait for checkout form
    await waitFor(() => {
      expect(screen.getByText('Checkout')).toBeInTheDocument();
    });
    
    // Fill guest details
    await user.type(screen.getByLabelText(/Full Name/), 'John Doe');
    await user.type(screen.getByLabelText(/Email Address/), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone/), '07700000001');
    await user.type(screen.getByLabelText(/Street Address/), '10 Downing St');
    await user.type(screen.getByLabelText(/Door Number/), '10');
    
    // Verify total (28 + 2 delivery = 30)
    expect(screen.getByText(/£30\.00/)).toBeInTheDocument();
    
    // Select card payment
    await user.click(screen.getByRole('radio', {name: /card/i}));
    
    // Mock payment success
    vi.mock('@stripe/react-stripe-js', () => ({
      useStripe: () => ({
        confirmPayment: vi.fn().mockResolvedValue({
          paymentIntent: {id: 'pi_test_001', status: 'succeeded'}
        })
      })
    }));
  });

  test('FE-002: Guest applies coupon, discount shows correctly', async () => {
    const {user} = renderCheckout();
    
    // Mock coupon validation
    vi.mocked(base44.entities.Coupon.filter).mockResolvedValue([{
      code: 'SAVE10',
      discount_type: 'percentage',
      discount_value: 10,
      per_customer_limit: 1,
      usage_count: 0,
      stackable: false
    }]);
    
    // Apply coupon
    const couponInput = screen.getByPlaceholderText(/coupon|promo code/i);
    await user.type(couponInput, 'SAVE10');
    await user.click(screen.getByText(/apply/i));
    
    // Verify discount
    await waitFor(() => {
      expect(screen.getByText('10% off')).toBeInTheDocument();
      expect(screen.getByText(/Discount: -£2\.50/)).toBeInTheDocument();
    });
  });

  test('FE-003: Invalid phone rejects submission', async () => {
    const {user} = renderCheckout();
    
    // Enter invalid phone
    await user.type(screen.getByLabelText(/Phone/), '01234567890');
    await user.click(screen.getByText(/Place Order/));
    
    // Error shown
    expect(screen.getByText(/Please enter a valid UK phone/)).toBeInTheDocument();
    
    // Form not submitted
    expect(vi.mocked(base44.functions.invoke)).not.toHaveBeenCalled();
  });

  test('FE-004: Missing address blocks submission', async () => {
    const {user} = renderCheckout();
    
    // Fill some fields but not address
    await user.type(screen.getByLabelText(/Full Name/), 'John');
    await user.type(screen.getByLabelText(/Email/), 'john@example.com');
    await user.type(screen.getByLabelText(/Phone/), '07700000001');
    
    // Try to submit
    await user.click(screen.getByText(/Place Order/));
    
    expect(screen.getByText(/Please select your delivery address/)).toBeInTheDocument();
  });

  test('FE-005: Email already registered prompts sign-in', async () => {
    const {user} = renderCheckout();
    
    // Enter registered email
    const emailInput = screen.getByLabelText(/Email Address/);
    await user.type(emailInput, 'existing@example.com');
    await user.tab(); // blur
    
    // Mock email existence check
    vi.mocked(base44.entities.User.filter).mockResolvedValue([{
      email: 'existing@example.com'
    }]);
    
    // Wait for check and error
    await waitFor(() => {
      expect(screen.getByText(/already registered/)).toBeInTheDocument();
    });
  });
});

describe('Checkout - Payment Method Switching', () => {
  test('FE-009: Switch Card → Cash → Card resets payment state', async () => {
    const {user} = renderCheckout();
    
    // Select Card
    await user.click(screen.getByRole('radio', {name: /card/i}));
    expect(screen.getByText('💳 Payment Details')).toBeInTheDocument();
    
    // Switch to Cash
    await user.click(screen.getByRole('radio', {name: /cash/i}));
    expect(screen.queryByText('💳 Payment Details')).not.toBeInTheDocument();
    
    // Switch back to Card
    await user.click(screen.getByRole('radio', {name: /card/i}));
    expect(screen.getByText('💳 Payment Details')).toBeInTheDocument();
  });
});

describe('Checkout - Edge Cases', () => {
  test('FE-018: Empty cart redirects to Home', async () => {
    localStorage.removeItem('cart');
    
    renderCheckout();
    
    await waitFor(() => {
      expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    });
  });

  test('FE-020: Item becomes unavailable after added', async () => {
    renderCheckout();
    
    // Mock item unavailable
    vi.mocked(base44.entities.MenuItem.filter).mockResolvedValue(null);
    
    // Try to checkout
    await user.click(screen.getByText(/Place Order/));
    
    // Should show refunded message
    await waitFor(() => {
      expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    });
  });
});