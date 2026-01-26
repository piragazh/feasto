import AdminDashboard from './pages/AdminDashboard';
import AdminRestaurants from './pages/AdminRestaurants';
import Checkout from './pages/Checkout';
import CookiesPolicy from './pages/CookiesPolicy';
import CustomerProfile from './pages/CustomerProfile';
import DriverApp from './pages/DriverApp';
import DriverDashboard from './pages/DriverDashboard';
import Favorites from './pages/Favorites';
import GroupOrder from './pages/GroupOrder';
import Home from './pages/Home';
import LoyaltyProgram from './pages/LoyaltyProgram';
import ManageCoupons from './pages/ManageCoupons';
import ManageRestaurantManagers from './pages/ManageRestaurantManagers';
import MediaScreen from './pages/MediaScreen';
import Messages from './pages/Messages';
import NotFound from './pages/NotFound';
import OrderHistory from './pages/OrderHistory';
import Orders from './pages/Orders';
import POSDashboard from './pages/POSDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Restaurant from './pages/Restaurant';
import SuperAdmin from './pages/SuperAdmin';
import TermsOfService from './pages/TermsOfService';
import TrackOrder from './pages/TrackOrder';
import MediaScreenManagement from './pages/MediaScreenManagement';
import RestaurantDashboard from './pages/RestaurantDashboard';
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
    "GroupOrder": GroupOrder,
    "Home": Home,
    "LoyaltyProgram": LoyaltyProgram,
    "ManageCoupons": ManageCoupons,
    "ManageRestaurantManagers": ManageRestaurantManagers,
    "MediaScreen": MediaScreen,
    "Messages": Messages,
    "NotFound": NotFound,
    "OrderHistory": OrderHistory,
    "Orders": Orders,
    "POSDashboard": POSDashboard,
    "PrivacyPolicy": PrivacyPolicy,
    "Restaurant": Restaurant,
    "SuperAdmin": SuperAdmin,
    "TermsOfService": TermsOfService,
    "TrackOrder": TrackOrder,
    "MediaScreenManagement": MediaScreenManagement,
    "RestaurantDashboard": RestaurantDashboard,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};