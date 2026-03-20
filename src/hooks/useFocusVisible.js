import { useRef, useEffect } from 'react';

/**
 * useFocusVisible - Manages WCAG AA compliant focus-visible states
 * Provides consistent focus styling with keyboard-only indicators
 * 
 * @returns {Object} - { ref, isFocusVisible, focusProps }
 */
export function useFocusVisible() {
  const ref = useRef(null);
  const isKeyboardFocused = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseDown = () => {
      isKeyboardFocused.current = false;
    };

    const handleKeyDown = (e) => {
      // Detect keyboard navigation
      if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || 
          e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt') {
        isKeyboardFocused.current = true;
      }
    };

    const handleFocus = () => {
      if (isKeyboardFocused.current) {
        element.classList.add('focus-visible');
      }
    };

    const handleBlur = () => {
      element.classList.remove('focus-visible');
      isKeyboardFocused.current = false;
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('focus', handleFocus);
      element.removeEventListener('blur', handleBlur);
    };
  }, []);

  return {
    ref,
    isFocusVisible: useRef(() => {
      return ref.current?.classList.contains('focus-visible') || false;
    }).current,
    focusProps: {
      ref,
      onMouseDown: () => {
        isKeyboardFocused.current = false;
      },
    },
  };
}

/**
 * useAutoFocus - Manages safe auto-focus with scroll prevention
 * 
 * @param {boolean} shouldFocus - Whether to auto-focus
 * @param {number} delay - Delay before focusing (ms)
 */
export function useAutoFocus(shouldFocus = true, delay = 0) {
  const ref = useRef(null);

  useEffect(() => {
    if (!shouldFocus || !ref.current) return;

    const timer = setTimeout(() => {
      ref.current?.focus({ preventScroll: true });
    }, delay);

    return () => clearTimeout(timer);
  }, [shouldFocus, delay]);

  return ref;
}