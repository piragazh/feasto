/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import { lazy } from 'react';

// Critical path — loaded eagerly (visible on first paint)
import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Checkout from './pages/Checkout';
import DriverApp from './pages/DriverApp';
import AdminDashboard from './pages/AdminDashboard';

// Everything else — lazy loaded (split into separate chunks)
const AdminRestaurants = lazy(() => import('./pages/AdminRestaurants'));
const CookiesPolicy = lazy(() => import('./pages/CookiesPolicy'));
const CustomerDisplay = lazy(() => import('./pages/CustomerDisplay'));
const CustomerProfile = lazy(() => import('./pages/CustomerProfile'));
const DriverDashboard = lazy(() => import('./pages/DriverDashboard'));
const Favorites = lazy(() => import('./pages/Favorites'));
const GoogleMenu = lazy(() => import('./pages/GoogleMenu'));
const GroupOrder = lazy(() => import('./pages/GroupOrder'));
const KioskDashboard = lazy(() => import('./pages/KioskDashboard'));
const KitchenDisplay = lazy(() => import('./pages/KitchenDisplay'));
const LoyaltyProgram = lazy(() => import('./pages/LoyaltyProgram'));
const ManageCoupons = lazy(() => import('./pages/ManageCoupons'));
const ManageRestaurantManagers = lazy(() => import('./pages/ManageRestaurantManagers'));
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'));
const MediaScreen = lazy(() => import('./pages/MediaScreen'));
const MediaScreenManagement = lazy(() => import('./pages/MediaScreenManagement'));
const Messages = lazy(() => import('./pages/Messages'));
const NotFound = lazy(() => import('./pages/NotFound'));
const OrderHistory = lazy(() => import('./pages/OrderHistory'));
const Orders = lazy(() => import('./pages/Orders'));
const POSDashboard = lazy(() => import('./pages/POSDashboard'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const PublicFilesManager = lazy(() => import('./pages/PublicFilesManager'));
const RestaurantDashboard = lazy(() => import('./pages/RestaurantDashboard'));
const Sitemap = lazy(() => import('./pages/Sitemap'));
const StaffOnboarding = lazy(() => import('./pages/StaffOnboarding'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const TableOrder = lazy(() => import('./pages/TableOrder'));
const TabletDashboard = lazy(() => import('./pages/TabletDashboard'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));

import __Layout from './Layout.jsx';


export const PAGES = {
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
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};