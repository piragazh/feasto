import { useCallback, useEffect, useState } from 'react';
import { useNavigationStack } from '@/lib/NavigationStack';

/**
 * useTabState - Manages tab-specific state caching and restoration
 * Automatically saves/restores state when switching between tabs
 * 
 * @param {string} tabKey - Unique identifier for this tab
 * @param {*} initialState - Initial state value
 * @returns {[state, setState]} - State and setState tuple
 */
export function useTabState(tabKey, initialState) {
  const { saveTabState, getTabState } = useNavigationStack();
  const [state, setState] = useState(() => {
    const cached = getTabState(tabKey);
    return cached ? cached.state : initialState;
  });

  // Save state when it changes
  const setStateWithCache = useCallback((newState) => {
    setState(newState);
    saveTabState(tabKey, typeof newState === 'function' ? newState(state) : newState);
  }, [tabKey, saveTabState, state]);

  return [state, setStateWithCache];
}

/**
 * useTabScroll - Manages scroll position restoration for tabs
 * Automatically saves scroll position when leaving tab, restores when returning
 * 
 * @param {string} tabKey - Unique identifier for this tab
 */
export function useTabScroll(tabKey) {
  const { getTabState } = useNavigationStack();

  useEffect(() => {
    const cached = getTabState(tabKey);
    if (cached?.scrollY !== undefined) {
      // Restore scroll position after component mounts
      setTimeout(() => {
        window.scrollTo(0, cached.scrollY);
      }, 0);
    }
  }, [tabKey, getTabState]);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      // Scroll position is automatically saved by NavigationStack
    };
  }, []);
}