import AdminDashboard from './pages/AdminDashboard';
import AdminRestaurants from './pages/AdminRestaurants';
import Checkout from './pages/Checkout';
import CustomerProfile from './pages/CustomerProfile';
import DriverApp from './pages/DriverApp';
import DriverDashboard from './pages/DriverDashboard';
import Favorites from './pages/Favorites';
import GroupOrder from './pages/GroupOrder';
import Home from './pages/Home';
import LoyaltyProgram from './pages/LoyaltyProgram';
import ManageCoupons from './pages/ManageCoupons';
import ManageRestaurantManagers from './pages/ManageRestaurantManagers';
import Messages from './pages/Messages';
import OrderHistory from './pages/OrderHistory';
import Orders from './pages/Orders';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Restaurant from './pages/Restaurant';
import RestaurantDashboard from './pages/RestaurantDashboard';
import SuperAdmin from './pages/SuperAdmin';
import TermsOfService from './pages/TermsOfService';
import TrackOrder from './pages/TrackOrder';
import POSDashboard from './pages/POSDashboard';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminRestaurants": AdminRestaurants,
    "Checkout": Checkout,
    "CustomerProfile": CustomerProfile,
    "DriverApp": DriverApp,
    "DriverDashboard": DriverDashboard,
    "Favorites": Favorites,
    "GroupOrder": GroupOrder,
    "Home": Home,
    "LoyaltyProgram": LoyaltyProgram,
    "ManageCoupons": ManageCoupons,
    "ManageRestaurantManagers": ManageRestaurantManagers,
    "Messages": Messages,
    "OrderHistory": OrderHistory,
    "Orders": Orders,
    "PrivacyPolicy": PrivacyPolicy,
    "Restaurant": Restaurant,
    "RestaurantDashboard": RestaurantDashboard,
    "SuperAdmin": SuperAdmin,
    "TermsOfService": TermsOfService,
    "TrackOrder": TrackOrder,
    "POSDashboard": POSDashboard,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};