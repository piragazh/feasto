import React, { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * NavigationStack - Manages stack-based navigation with visual state preservation
 * Used with Framer Motion for slide-in/slide-out animations
 */
const NavigationStackContext = createContext();

export function NavigationStackProvider({ children }) {
  const [stack, setStack] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();

  // Push route onto stack
  const push = useCallback((path, state = {}) => {
    setStack(prev => [
      ...prev,
      { path, state, timestamp: Date.now() }
    ]);
    navigate(path, { state });
  }, [navigate]);

  // Pop route from stack (go back)
  const pop = useCallback(() => {
    if (stack.length === 0) return;
    
    setStack(prev => prev.slice(0, -1));
    navigate(-1);
  }, [navigate, stack.length]);

  // Replace current route
  const replace = useCallback((path, state = {}) => {
    if (stack.length === 0) {
      push(path, state);
      return;
    }
    
    setStack(prev => [
      ...prev.slice(0, -1),
      { path, state, timestamp: Date.now() }
    ]);
    navigate(path, { state, replace: true });
  }, [navigate, push, stack.length]);

  // Get current route info
  const current = stack[stack.length - 1] || { path: '/', state: {} };
  const canGoBack = stack.length > 1;

  // Clear entire stack (home)
  const reset = useCallback(() => {
    setStack([]);
    navigate('/', { replace: true });
  }, [navigate]);

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