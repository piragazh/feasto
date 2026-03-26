/**
 * Terminal Provider Factory
 * 
 * Dynamically creates the correct provider based on restaurant config.
 * Enables switching providers without touching TerminalService or UI.
 */

import { MockTerminalProvider } from '@/lib/providers/mock-terminal-provider.js';
import { StripeTerminalProvider } from '@/lib/providers/stripe-terminal-provider.js';

/**
 * Create a terminal provider based on config
 * @param {Object} restaurantConfig - Restaurant's terminal config
 * @param {string} restaurantConfig.terminal_provider - 'mock' | 'stripe'
 * @param {Object} restaurantConfig.terminal_config - Provider-specific settings
 * @returns {TerminalProvider} Initialized provider instance
 */
export function createTerminalProvider(restaurantConfig = {}) {
  const providerType = restaurantConfig.terminal_provider || 'mock';
  const providerConfig = restaurantConfig.terminal_config || {};

  switch (providerType) {
    case 'stripe':
      return new StripeTerminalProvider(providerConfig);
    
    case 'mock':
    default:
      return new MockTerminalProvider();
  }
}

/**
 * Get all available providers
 * @returns {Object} { type: description }
 */
export function getAvailableProviders() {
  return {
    mock: 'Mock Terminal (testing, deterministic)',
    stripe: 'Stripe Terminal (real hardware)'
  };
}

/**
 * Get provider config schema (for validation/docs)
 * @param {string} providerType
 * @returns {Object} JSON schema for that provider's config
 */
export function getProviderConfigSchema(providerType) {
  switch (providerType) {
    case 'stripe':
      return {
        type: 'object',
        properties: {
          publishableKey: {
            type: 'string',
            description: 'Stripe publishable key'
          },
          deviceSerialNumber: {
            type: 'string',
            description: 'Optional: connect to specific reader by serial'
          }
        },
        required: ['publishableKey']
      };
    
    case 'mock':
    default:
      return {
        type: 'object',
        properties: {
          testMode: {
            type: 'string',
            enum: ['success', 'decline', 'timeout', 'error'],
            description: 'Optional: force specific outcome'
          }
        }
      };
  }
}