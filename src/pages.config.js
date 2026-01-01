import AdminDashboard from './pages/AdminDashboard';
import AdminRestaurants from './pages/AdminRestaurants';
import Checkout from './pages/Checkout';
import DriverApp from './pages/DriverApp';
import DriverDashboard from './pages/DriverDashboard';
import GroupOrder from './pages/GroupOrder';
import Home from './pages/Home';
import ManageCoupons from './pages/ManageCoupons';
import ManageRestaurantManagers from './pages/ManageRestaurantManagers';
import Orders from './pages/Orders';
import Restaurant from './pages/Restaurant';
import RestaurantDashboard from './pages/RestaurantDashboard';
import SuperAdmin from './pages/SuperAdmin';
import TrackOrder from './pages/TrackOrder';
import CustomerProfile from './pages/CustomerProfile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminDashboard": AdminDashboard,
    "AdminRestaurants": AdminRestaurants,
    "Checkout": Checkout,
    "DriverApp": DriverApp,
    "DriverDashboard": DriverDashboard,
    "GroupOrder": GroupOrder,
    "Home": Home,
    "ManageCoupons": ManageCoupons,
    "ManageRestaurantManagers": ManageRestaurantManagers,
    "Orders": Orders,
    "Restaurant": Restaurant,
    "RestaurantDashboard": RestaurantDashboard,
    "SuperAdmin": SuperAdmin,
    "TrackOrder": TrackOrder,
    "CustomerProfile": CustomerProfile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};