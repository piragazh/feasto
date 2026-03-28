import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { getApiUrl, logApiOriginDebug } from '@/lib/api-origin';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      const headers = { 'X-App-Id': appParams.appId };
      if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;
      
      // Add 10-second timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        // Step 3: Use dedicated API origin config (not window.location.origin)
        const apiUrl = getApiUrl(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`);
        
        logApiOriginDebug();
        console.log('[AuthContext] App state check:', { appId: appParams.appId, apiUrl });
        
        const res = await fetch(apiUrl, { 
          headers,
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const err = new Error(data?.message || `Failed to load app (${res.status})`);
          err.status = res.status;
          err.data = data;
          logApiOriginDebug();
          console.error('[AuthContext] App settings fetch failed:', { status: res.status, message: err.message, appId: appParams.appId });
          throw err;
        }
        const publicSettings = await res.json();
        setAppPublicSettings(publicSettings);
        
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        clearTimeout(timeoutId);
        console.error('App state check failed:', appError);
        
        // Timeout or network error - proceed with fallback
        if (appError.name === 'AbortError' || !appError.status) {
          console.warn('App settings fetch timeout/network error, proceeding with fallback');
          setAppPublicSettings(null);
          setIsLoadingPublicSettings(false);
          if (appParams.token) {
            await checkUserAuth();
          } else {
            setIsLoadingAuth(false);
          }
          return;
        }
        
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          }
          // For other 403s (auth_required, etc.), proceed as public app - don't block
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      // Don't set auth error for public apps - allow unauthenticated access
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
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