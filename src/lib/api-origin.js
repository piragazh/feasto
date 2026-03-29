/**
 * Centralized API Origin Configuration
 * Separates frontend origin (where app runs) from API origin (where /api endpoints live)
 * 
 * On custom domains:
 *   - Frontend: restaurant.com (user-facing)
 *   - API: base44-platform.app (backend services)
 * 
 * On platform domains:
 *   - Frontend: preview-sandbox--xxx.base44.app
 *   - API: preview-sandbox--xxx.base44.app (same)
 */

/**
 * Get the API base URL for this environment.
 * Returns the origin where /api endpoints live.
 * 
 * Priority:
 * 1. VITE_PUBLIC_API_BASE_URL (can be injected at deploy)
 * 2. VITE_PUBLIC_PLATFORM_DOMAIN (fallback)
 * 3. window.location.origin (last resort for local dev)
 */
export const getApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    // SSR fallback
    return process.env.VITE_PUBLIC_API_BASE_URL || 'https://api.base44.app';
  }

  // Check for explicit API base URL (can be set via env var or injected at runtime)
  const explicitApiBase = import.meta.env.VITE_PUBLIC_API_BASE_URL;
  if (explicitApiBase) {
    console.log('[API-Origin] Using explicit API base:', explicitApiBase);
    return explicitApiBase;
  }

  // For custom domains, assume API lives on platform domain (passed via window config)
  // In production, this would be injected by deployment config
  const platformDomain = window.__BASE44_PLATFORM_DOMAIN || import.meta.env.VITE_PUBLIC_PLATFORM_DOMAIN;
  if (platformDomain) {
    const apiBase = `https://${platformDomain}`;
    console.log('[API-Origin] Using platform domain for API:', apiBase);
    return apiBase;
  }

  // Auto-detect custom domains: if hostname is not a Base44/local domain, use the configured platform domain when available.
  const hostname = window.location.hostname;
  const isCustomDomain = !hostname.includes('base44.app') && !hostname.includes('localhost') && !hostname.includes('127.0.0.1');
  if (isCustomDomain) {
    const sessionApiBase = window.sessionStorage.getItem('base44_api_base_url');
    if (sessionApiBase) {
      console.log('[API-Origin] Using session API base:', sessionApiBase);
      return sessionApiBase;
    }

    console.warn('[API-Origin] Custom domain detected without explicit API base/platform domain; falling back to current origin.');
    return window.location.origin;
  }

  // Fallback: assume frontend and API are on same origin (local dev, platform domain)
  console.log('[API-Origin] Using current origin for API:', window.location.origin);
  return window.location.origin;
};

/**
 * Get the frontend origin (where the app is running from).
 * Used for redirects, callbacks, etc.
 */
export const getFrontendOrigin = () => {
  return window.location.origin;
};

/**
 * Helper to construct a full API URL.
 * Ensures API calls go to the correct origin.
 */
export const getApiUrl = (path) => {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

/**
 * Logging helper for debugging API origin issues.
 */
export const logApiOriginDebug = () => {
  const frontendOrigin = getFrontendOrigin();
  const apiBase = getApiBaseUrl();
  console.log('[API-Origin-Debug]', {
    frontend: frontendOrigin,
    api: apiBase,
    sameOrigin: frontendOrigin === apiBase,
    appId: import.meta.env.VITE_BASE44_APP_ID,
  });
};