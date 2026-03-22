import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';

const NavigationStackContext = createContext({
  stack: [],
  push: () => {},
  pop: () => {},
  replace: () => {},
  reset: () => {},
  current: { path: '/', state: {}, tabKey: 'root', scrollY: 0 },
  canGoBack: false,
  depth: 0,
  saveTabState: () => {},
  getTabState: () => null,
  tabCache: {},
});

export function NavigationStackProvider({ children }) {
  return (
    <NavigationStackContext.Provider value={NavigationStackContext._currentValue}>
      {children}
    </NavigationStackContext.Provider>
  );
}

export function useNavigationStack() {
  return useContext(NavigationStackContext);
}