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
import AdminDashboard from './pages/AdminDashboard';
import AdminRestaurants from './pages/AdminRestaurants';
import Checkout from './pages/Checkout';
import CookiesPolicy from './pages/CookiesPolicy';
import CustomerProfile from './pages/CustomerProfile';
import DriverApp from './pages/DriverApp';
import DriverDashboard from './pages/DriverDashboard';
import Favorites from './pages/Favorites';
import GoogleMenu from './pages/GoogleMenu';
import GroupOrder from './pages/GroupOrder';
import Home from './pages/Home';
import LoyaltyProgram from './pages/LoyaltyProgram';
import ManageCoupons from './pages/ManageCoupons';
import ManageRestaurantManagers from './pages/ManageRestaurantManagers';
import MediaScreen from './pages/MediaScreen';
import MediaScreenManagement from './pages/MediaScreenManagement';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';
import OrderHistory from './pages/OrderHistory';
import Orders from './pages/Orders';
import POSDashboard from './pages/POSDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import PublicFilesManager from './pages/PublicFilesManager';
import Restaurant from './pages/Restaurant';
import RestaurantDashboard from './pages/RestaurantDashboard';
import SuperAdmin from './pages/SuperAdmin';
import TermsOfService from './pages/TermsOfService';
import TrackOrder from './pages/TrackOrder';
import Sitemap from './pages/Sitemap';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminRestaurants": AdminRestaurants,
    "Checkout": Checkout,
    "CookiesPolicy": CookiesPolicy,
    "CustomerProfile": CustomerProfile,
    "DriverApp": DriverApp,
    "DriverDashboard": DriverDashboard,
    "Favorites": Favorites,
    "GoogleMenu": GoogleMenu,
    "GroupOrder": GroupOrder,
    "Home": Home,
    "LoyaltyProgram": LoyaltyProgram,
    "ManageCoupons": ManageCoupons,
    "ManageRestaurantManagers": ManageRestaurantManagers,
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
    "SuperAdmin": SuperAdmin,
    "TermsOfService": TermsOfService,
    "TrackOrder": TrackOrder,
    "Sitemap": Sitemap,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};