import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * NavigationStack - State-based history management with tab content caching
 * Provides stable navigation with visual state preservation and scroll position restoration
 */
const NavigationStackContext = createContext();

// Tab cache stores component state and scroll positions
const TabCacheManager = {
  cache: new Map(),
  
  saveTabState: (tabKey, state) => {
    TabCacheManager.cache.set(tabKey, {
      state,
      timestamp: Date.now(),
      scrollY: window.scrollY,
    });
  },
  
  getTabState: (tabKey) => {
    return TabCacheManager.cache.get(tabKey);
  },
  
  clearTabState: (tabKey) => {
    TabCacheManager.cache.delete(tabKey);
  },
  
  clearAllCache: () => {
    TabCacheManager.cache.clear();
  },
};

export function NavigationStackProvider({ children }) {
  const [stack, setStack] = useState([]);
  const [tabCache, setTabCache] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const prevLocationRef = useRef(location.pathname);

  // Sync stack with location changes
  useEffect(() => {
    if (location.pathname !== prevLocationRef.current) {
      prevLocationRef.current = location.pathname;
    }
  }, [location.pathname]);

  // Push route onto stack with state caching
  const push = useCallback((path, state = {}, tabKey = null) => {
    const stackEntry = {
      path,
      pathname: path,
      state,
      tabKey: tabKey || path,
      timestamp: Date.now(),
      scrollY: window.scrollY,
    };

    setStack(prev => [...prev, stackEntry]);
    navigate(path, { state });
  }, [navigate]);

  // Pop route from stack with scroll restoration
  const pop = useCallback(() => {
    if (stack.length === 0) return;

    const previousEntry = stack[stack.length - 2];
    
    setStack(prev => prev.slice(0, -1));
    navigate(-1);

    // Restore scroll position after navigation
    if (previousEntry?.scrollY !== undefined) {
      setTimeout(() => window.scrollTo(0, previousEntry.scrollY), 0);
    }
  }, [navigate, stack.length, stack]);

  // Replace current route
  const replace = useCallback((path, state = {}, tabKey = null) => {
    const stackEntry = {
      path,
      pathname: path,
      state,
      tabKey: tabKey || path,
      timestamp: Date.now(),
      scrollY: window.scrollY,
    };

    if (stack.length === 0) {
      setStack([stackEntry]);
    } else {
      setStack(prev => [...prev.slice(0, -1), stackEntry]);
    }
    
    navigate(path, { state, replace: true });
  }, [navigate, stack.length]);

  // Get current route info
  const current = stack[stack.length - 1] || { 
    path: '/', 
    state: {}, 
    tabKey: 'root',
    scrollY: 0,
  };
  const canGoBack = stack.length > 1;

  // Clear entire stack and cache (home reset)
  const reset = useCallback(() => {
    setStack([]);
    TabCacheManager.clearAllCache();
    navigate('/', { replace: true });
    window.scrollTo(0, 0);
  }, [navigate]);

  // Save tab state before switching
  const saveTabState = useCallback((tabKey, state) => {
    TabCacheManager.saveTabState(tabKey, state);
    setTabCache(prev => ({
      ...prev,
      [tabKey]: { state, scrollY: window.scrollY },
    }));
  }, []);

  // Retrieve and restore tab state
  const getTabState = useCallback((tabKey) => {
    return TabCacheManager.getTabState(tabKey);
  }, []);

  return (
    <NavigationStackContext.Provider
      value={{
        stack,
        push,
        pop,
        replace,
        reset,
        current,
        canGoBack,
        depth: stack.length,
        saveTabState,
        getTabState,
        tabCache,
      }}
    >
      {children}
    </NavigationStackContext.Provider>
  );
}

export function useNavigationStack() {
  const context = useContext(NavigationStackContext);
  if (!context) {
    throw new Error('useNavigationStack must be used within NavigationStackProvider');
  }
  return context;
}