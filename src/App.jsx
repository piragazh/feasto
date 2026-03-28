import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
// NOTE: Toaster import removed — it is rendered by Layout.jsx to avoid duplicate toasts.
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import React, { Suspense } from 'react';
// NOTE: Toaster is rendered inside Layout.jsx for every page. Do NOT add another Toaster here.
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { NavigationStackProvider } from '@/lib/NavigationStack';
import { StackNavigationAnimator } from '@/lib/StackNavigationAnimator';
import OfflineRiskControlCenter from './pages/OfflineRiskControlCenter';
import RestaurantOfflineRiskOverview from './pages/RestaurantOfflineRiskOverview';
import AdminRestaurants from './pages/AdminRestaurants';
import ReconciliationDashboard from './pages/ReconciliationDashboard';
import Unsubscribe from './pages/Unsubscribe';
import Restaurant from './pages/Restaurant';
import Home from './pages/Home';

// Loading fallback for lazy-loaded routes
const RouteLoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const { Pages = {}, Layout, mainPage } = pagesConfig || {};
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey && Pages[mainPageKey] ? Pages[mainPageKey] : () => (<div className="flex items-center justify-center min-h-screen text-red-600">Page not found</div>);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const DomainChecker = ({ children }) => {
  const [customDomainRestaurantId, setCustomDomainRestaurantId] = React.useState(null);
  const [domainCheckDone, setDomainCheckDone] = React.useState(false);
  const [domainCheckError, setDomainCheckError] = React.useState(null);

  React.useEffect(() => {
    const checkDomain = async () => {
      try {
        const hostname = window.location.hostname;
        const isPlatform = hostname === 'localhost' || hostname.includes('base44') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes('127.0.0.1');
        if (isPlatform) {
          console.log('[DomainChecker] Platform domain detected:', hostname);
          setDomainCheckDone(true);
          return;
        }
        console.log('[DomainChecker] Custom domain detected:', hostname);
        
        const cached = sessionStorage.getItem('customDomainRestaurantId');
        const cachedFor = sessionStorage.getItem('customDomainCheckedFor');
        if (cached && cachedFor === hostname) {
          console.log('[DomainChecker] Using cached restaurant ID:', cached);
          setCustomDomainRestaurantId(cached);
          setDomainCheckDone(true);
          return;
        }
        
        try {
          const { base44 } = await import('@/api/base44Client');
          console.log('[DomainChecker] Querying for restaurant with custom_domain:', hostname);
          const restaurants = await base44.entities.Restaurant.filter({ custom_domain: hostname, domain_verified: true });
          const found = restaurants?.[0];
          if (found) {
            console.log('[DomainChecker] Found restaurant:', found.id, found.name);
            sessionStorage.setItem('customDomainRestaurantId', found.id);
            sessionStorage.setItem('customDomainCheckedFor', hostname);
            setCustomDomainRestaurantId(found.id);
          } else {
            console.log('[DomainChecker] No verified restaurant found for custom domain');
          }
        } catch (e) {
          console.error('[DomainChecker] Error querying restaurant:', e?.message || e);
          setDomainCheckError(e?.message || 'Failed to check custom domain');
        }
      } catch (e) {
        console.error('[DomainChecker] Unexpected error:', e?.message || e);
        setDomainCheckError(e?.message || 'Unexpected error');
      } finally {
        setDomainCheckDone(true);
      }
    };
    checkDomain();
  }, []);

  if (!domainCheckDone) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (domainCheckError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <div className="text-red-600 font-bold mb-2">⚠️ Domain Check Error</div>
          <p className="text-sm text-gray-600 mb-4">{domainCheckError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return children({ customDomainRestaurantId });
};

const AuthenticatedApp = ({ customDomainRestaurantId }) => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else {
      // Step 4: Show visible fatal error UI with technical details for admins/devs
      const isDev = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-lg shadow-lg p-8 border-l-4 border-red-600">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load App</h2>
              <p className="text-red-700 font-medium mb-4 text-sm">{authError.message || 'An error occurred during app initialization'}</p>
              
              {isDev && (
                <div className="text-left bg-gray-900 text-gray-100 rounded p-4 mb-4 font-mono text-xs overflow-auto max-h-40 border border-gray-700">
                  <div className="font-semibold mb-2 text-gray-400">Debug Info:</div>
                  <div>Frontend: {window.location.hostname}</div>
                  <div>AppId: {import.meta.env.VITE_BASE44_APP_ID || 'unknown'}</div>
                  <div>Error Type: {authError.type}</div>
                  {authError.data?.status && <div>Status: {authError.data.status}</div>}
                  <div className="mt-2 text-yellow-400">Check browser console for full logs</div>
                </div>
              )}
              
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors mb-2"
              >
                Retry
              </button>
              
              {isDev && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium transition-colors text-sm"
                >
                  Go Home
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
  }

  // Render the main app with lazy loading and stack-based navigation
  return (
    <NavigationStackProvider>
      <StackNavigationAnimator>
        <Routes>
           <Route path="/" element={
             customDomainRestaurantId ? (
               <LayoutWrapper currentPageName="Restaurant">
                 <Restaurant restaurantId={customDomainRestaurantId} />
               </LayoutWrapper>
             ) : (
               <LayoutWrapper currentPageName="Home">
                 <Home />
               </LayoutWrapper>
             )
           } />
          {Object.entries(Pages).map(([path, Page]) => (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <Suspense fallback={<RouteLoadingFallback />}>
                  <LayoutWrapper currentPageName={path}>
                    <Page />
                  </LayoutWrapper>
                </Suspense>
              }
            />
          ))}
          <Route path="/OfflineRiskControlCenter" element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LayoutWrapper currentPageName="OfflineRiskControlCenter">
                <OfflineRiskControlCenter />
              </LayoutWrapper>
            </Suspense>
          } />
          <Route path="/RestaurantOfflineRiskOverview" element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LayoutWrapper currentPageName="RestaurantOfflineRiskOverview">
                <RestaurantOfflineRiskOverview />
              </LayoutWrapper>
            </Suspense>
          } />
          <Route path="/AdminRestaurants" element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LayoutWrapper currentPageName="AdminRestaurants">
                <AdminRestaurants />
              </LayoutWrapper>
            </Suspense>
          } />
          <Route path="/ReconciliationDashboard" element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <LayoutWrapper currentPageName="ReconciliationDashboard">
                <ReconciliationDashboard />
              </LayoutWrapper>
            </Suspense>
          } />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </StackNavigationAnimator>
    </NavigationStackProvider>
  );
};


function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <DomainChecker>
            {({ customDomainRestaurantId }) => (
              <AuthenticatedApp customDomainRestaurantId={customDomainRestaurantId} />
            )}
          </DomainChecker>
        </Router>
        {/* Toaster is rendered by Layout.jsx — removed duplicate from here */}
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App