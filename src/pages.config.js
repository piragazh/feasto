/**
 * pages.config.js - Page routing configuration
 *
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 *
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 */
import { lazy } from 'react';

// Retry wrapper for lazy imports to handle transient network/chunk-load failures
const lazyWithRetry = (importFn) =>
  lazy(() =>
    importFn().catch(() =>
      new Promise((res) => setTimeout(res, 1500)).then(() => importFn())
    )
  );

// Critical path — loaded eagerly (visible on first paint)
import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Checkout from './pages/Checkout';

// Everything else — lazy loaded (split into separate chunks)
const CookiesPolicy = lazyWithRetry(() => import('./pages/CookiesPolicy'));
const CustomerDisplay = lazyWithRetry(() => import('./pages/CustomerDisplay'));
const CustomerProfile = lazyWithRetry(() => import('./pages/CustomerProfile'));
const DriverApp = lazyWithRetry(() => import('./pages/DriverApp'));
const DriverDashboard = lazyWithRetry(() => import('./pages/DriverDashboard'));
const Favorites = lazyWithRetry(() => import('./pages/Favorites'));
const GoogleMenu = lazyWithRetry(() => import('./pages/GoogleMenu'));
const GroupOrder = lazyWithRetry(() => import('./pages/GroupOrder'));
const KioskDashboard = lazyWithRetry(() => import('./pages/KioskDashboard'));
const KitchenDisplay = lazyWithRetry(() => import('./pages/KitchenDisplay'));
const LoyaltyProgram = lazyWithRetry(() => import('./pages/LoyaltyProgram'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const AdminRestaurants = lazyWithRetry(() => import('./pages/AdminRestaurants'));
const ManageCoupons = lazyWithRetry(() => import('./pages/ManageCoupons'));
const ManageRestaurantManagers = lazyWithRetry(() => import('./pages/ManageRestaurantManagers'));
const MediaLibrary = lazyWithRetry(() => import('./pages/MediaLibrary'));
const MediaScreen = lazyWithRetry(() => import('./pages/MediaScreen'));
const MediaScreenManagement = lazyWithRetry(() => import('./pages/MediaScreenManagement'));
const Messages = lazyWithRetry(() => import('./pages/Messages'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const OrderHistory = lazyWithRetry(() => import('./pages/OrderHistory'));
const Orders = lazyWithRetry(() => import('./pages/Orders'));
const POSDashboard = lazyWithRetry(() => import('./pages/POSDashboard'));
const PrivacyPolicy = lazyWithRetry(() => import('./pages/PrivacyPolicy'));
const PublicFilesManager = lazyWithRetry(() => import('./pages/PublicFilesManager'));
const RestaurantDashboard = lazyWithRetry(() => import('./pages/RestaurantDashboard'));
const Sitemap = lazyWithRetry(() => import('./pages/Sitemap'));
const StaffOnboarding = lazyWithRetry(() => import('./pages/StaffOnboarding'));
const SuperAdmin = lazyWithRetry(() => import('./pages/SuperAdmin'));
const TableOrder = lazyWithRetry(() => import('./pages/TableOrder'));
const TabletDashboard = lazyWithRetry(() => import('./pages/TabletDashboard'));
const TermsOfService = lazyWithRetry(() => import('./pages/TermsOfService'));
const TrackOrder = lazyWithRetry(() => import('./pages/TrackOrder'));

import __Layout from './Layout.jsx';

export const Pages = {
  "AdminDashboard": AdminDashboard,
  "AdminRestaurants": AdminRestaurants,
  "Checkout": Checkout,
  "CookiesPolicy": CookiesPolicy,
  "CustomerDisplay": CustomerDisplay,
  "CustomerProfile": CustomerProfile,
  "DriverApp": DriverApp,
  "DriverDashboard": DriverDashboard,
  "Favorites": Favorites,
  "GoogleMenu": GoogleMenu,
  "GroupOrder": GroupOrder,
  "Home": Home,
  "KioskDashboard": KioskDashboard,
  "KitchenDisplay": KitchenDisplay,
  "LoyaltyProgram": LoyaltyProgram,
  "ManageCoupons": ManageCoupons,
  "ManageRestaurantManagers": ManageRestaurantManagers,
  "MediaLibrary": MediaLibrary,
  "MediaScreen": MediaScreen,
  "MediaScreenManagement": MediaScreenManagement,
  "Messages": Messages,
  "NotFound": NotFound,
  "OrderHistory": OrderHistory,
  "Orders": Orders,
  "POSDashboard": POSDashboard,
  "PrivacyPolicy": PrivacyPolicy,
  "PublicFilesManager": PublicFilesManager,
  "Restaurant": Restaurant,
  "RestaurantDashboard": RestaurantDashboard,
  "Sitemap": Sitemap,
  "StaffOnboarding": StaffOnboarding,
  "SuperAdmin": SuperAdmin,
  "TableOrder": TableOrder,
  "TabletDashboard": TabletDashboard,
  "TermsOfService": TermsOfService,
  "TrackOrder": TrackOrder,
};

export const pagesConfig = {
  mainPage: "Home",
  Pages,
  Layout: __Layout,
};