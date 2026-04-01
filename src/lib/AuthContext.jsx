import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // Initialize public settings (empty for now - SDK handles routing)
      setAppPublicSettings({});
      setIsLoadingPublicSettings(false);

      // Always attempt to load auth — cookie-based sessions don't use URL tokens
      await loadUserAuth();
    } catch (err) {
      // Never block app load — treat any init error as guest session
      console.error('[AuthProvider] Init failed (treating as guest):', err);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const loadUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      setIsAuthenticated(false);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthError(null);
    } catch (error) {
      // Always treat auth failures as "not logged in" — the app is public and must load for guests.
      // Never block page load due to an auth check error (network, CORS, 401, 5xx, etc.)
      const message = error?.message || '';
      console.warn('[AuthProvider] Auth check failed (treating as guest):', message);
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthError(null);
    }
  };

  const logout = (redirectTo = window.location.pathname) => {
    setUser(null);
    setIsAuthenticated(false);
    base44.auth.logout(redirectTo);
  };

  const loginRedirect = (nextPath = window.location.pathname) => {
    base44.auth.redirectToLogin(nextPath);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        loginRedirect,
        initializeApp
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};