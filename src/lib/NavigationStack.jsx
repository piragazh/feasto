import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NavigationStackContext = createContext(null);

const TabCacheManager = {
  cache: new Map(),
  saveTabState: (tabKey, state) => {
    TabCacheManager.cache.set(tabKey, { state, timestamp: Date.now(), scrollY: window.scrollY });
  },
  getTabState: (tabKey) => TabCacheManager.cache.get(tabKey),
  clearAllCache: () => TabCacheManager.cache.clear(),
};

export function NavigationStackProvider({ children }) {
  const [stack, setStack] = useState([]);
  const [tabCache, setTabCache] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const prevLocationRef = useRef(location.pathname);

  useEffect(() => {
    prevLocationRef.current = location.pathname;
  }, [location.pathname]);

  const push = useCallback((path, state = {}, tabKey = null) => {
    setStack(prev => [...prev, { path, state, tabKey: tabKey || path, scrollY: window.scrollY }]);
    navigate(path, { state });
  }, [navigate]);

  const pop = useCallback(() => {
    setStack(prev => {
      const prev2 = prev[prev.length - 2];
      if (prev2?.scrollY !== undefined) {
        setTimeout(() => window.scrollTo(0, prev2.scrollY), 0);
      }
      return prev.slice(0, -1);
    });
    navigate(-1);
  }, [navigate]);

  const replace = useCallback((path, state = {}, tabKey = null) => {
    setStack(prev => {
      const entry = { path, state, tabKey: tabKey || path, scrollY: window.scrollY };
      return prev.length === 0 ? [entry] : [...prev.slice(0, -1), entry];
    });
    navigate(path, { state, replace: true });
  }, [navigate]);

  const reset = useCallback(() => {
    setStack([]);
    TabCacheManager.clearAllCache();
    navigate('/', { replace: true });
    window.scrollTo(0, 0);
  }, [navigate]);

  const saveTabState = useCallback((tabKey, state) => {
    TabCacheManager.saveTabState(tabKey, state);
    setTabCache(prev => ({ ...prev, [tabKey]: { state, scrollY: window.scrollY } }));
  }, []);

  const getTabState = useCallback((tabKey) => TabCacheManager.getTabState(tabKey), []);

  const current = stack[stack.length - 1] || { path: '/', state: {}, tabKey: 'root', scrollY: 0 };

  return (
    <NavigationStackContext.Provider value={{
      stack, push, pop, replace, reset,
      current, canGoBack: stack.length > 1,
      depth: stack.length, saveTabState, getTabState, tabCache,
    }}>
      {children}
    </NavigationStackContext.Provider>
  );
}

export function useNavigationStack() {
  const context = useContext(NavigationStackContext);
  if (!context) throw new Error('useNavigationStack must be used within NavigationStackProvider');
  return context;
}