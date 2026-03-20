/**
 * Accessibility Utilities - WCAG 2.1 AA Compliant Focus and Safe-Area Management
 */

/**
 * Trap focus within a modal/dialog element
 * Prevents keyboard focus from leaving the modal
 * 
 * @param {HTMLElement} element - Modal element to trap focus in
 * @param {Function} onEscape - Callback when Escape is pressed
 */
export function trapFocus(element, onEscape) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  function handleKeyDown(e) {
    if (e.key === 'Escape' && onEscape) {
      onEscape();
      return;
    }

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        // Shift+Tab
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    }
  }

  element.addEventListener('keydown', handleKeyDown);
  firstElement?.focus();

  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Restore focus to previously focused element
 * Useful for modals, dialogs, and drawers
 * 
 * @returns {Function} - Function to restore focus
 */
export function captureFocus() {
  const previouslyFocused = document.activeElement;
  
  return () => {
    if (previouslyFocused && previouslyFocused.focus) {
      previouslyFocused.focus({ preventScroll: true });
    }
  };
}

/**
 * Announce message to screen readers
 * Uses ARIA live region for immediate announcements
 * 
 * @param {string} message - Message to announce
 * @param {string} priority - 'polite' (default) or 'assertive'
 */
export function announceToScreenReader(message, priority = 'polite') {
  let liveRegion = document.querySelector('[aria-live]');
  
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'sr-only';
    document.body.appendChild(liveRegion);
  }
  
  liveRegion.setAttribute('aria-live', priority);
  liveRegion.textContent = message;
  
  // Clear after announcement
  setTimeout(() => {
    liveRegion.textContent = '';
  }, 1000);
}

/**
 * Get safe-area inset values
 * Returns actual viewport safe-area measurements
 * 
 * @returns {Object} - { top, right, bottom, left }
 */
export function getSafeAreaInsets() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  
  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top') || '0', 10),
    right: parseInt(style.getPropertyValue('--safe-area-inset-right') || '0', 10),
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0', 10),
    left: parseInt(style.getPropertyValue('--safe-area-inset-left') || '0', 10),
  };
}

/**
 * Validate element is within safe viewport
 * Checks if element would be obscured by notches or system UI
 * 
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} - True if element is in safe area
 */
export function isInSafeArea(element) {
  if (!element) return true;
  
  const rect = element.getBoundingClientRect();
  const insets = getSafeAreaInsets();
  
  const isSafeHorizontally = rect.left >= insets.left && 
                             rect.right <= (window.innerWidth - insets.right);
  const isSafeVertically = rect.top >= insets.top && 
                           rect.bottom <= (window.innerHeight - insets.bottom);
  
  return isSafeHorizontally && isSafeVertically;
}

/**
 * Check if device is in landscape orientation
 * Useful for handling safe-area insets on sides
 * 
 * @returns {boolean} - True if landscape
 */
export function isLandscape() {
  return window.matchMedia('(orientation: landscape)').matches;
}

/**
 * Add skip-to-main link for keyboard navigation
 * Required for WCAG 2.1 AA compliance
 */
export function addSkipLink() {
  const existingSkipLink = document.querySelector('.skip-to-main');
  if (existingSkipLink) return;
  
  const skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'skip-to-main fixed top-0 left-0 z-[10000] px-4 py-2 bg-black text-white focus:outline-2 focus:outline-white';
  skipLink.textContent = 'Skip to main content';
  skipLink.style.transform = 'translateX(-9999px)';
  skipLink.addEventListener('focus', () => {
    skipLink.style.transform = 'translateX(0)';
  });
  skipLink.addEventListener('blur', () => {
    skipLink.style.transform = 'translateX(-9999px)';
  });
  
  document.body.insertBefore(skipLink, document.body.firstChild);
}

/**
 * Validate touch target size (minimum 44x44px)
 * Ensures WCAG 2.1 AA compliance for mobile
 * 
 * @param {HTMLElement} element - Element to validate
 * @returns {boolean} - True if meets minimum size
 */
export function validateTouchTarget(element) {
  if (!element) return true;
  
  const rect = element.getBoundingClientRect();
  return rect.width >= 44 && rect.height >= 44;
}