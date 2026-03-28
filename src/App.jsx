import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import React, { Suspense } from 'react';
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

// Loading fallback for lazy-loaded routes
const RouteLoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    } else {
      // Show visible error for other failures (not blank page)
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Unable to Load App</h2>
              <p className="text-gray-600 mb-1">{authError.message || 'An error occurred while initializing the app'}</p>
              <p className="text-xs text-gray-500 mb-4">Error type: {authError.type}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Retry
              </button>
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
            <LayoutWrapper currentPageName={mainPageKey}>
              <MainPage />
            </LayoutWrapper>
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
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App