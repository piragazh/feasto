import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import ManageCoupons from './pages/ManageCoupons';
import RestaurantDashboard from './pages/RestaurantDashboard';
import TrackOrder from './pages/TrackOrder';
import DriverDashboard from './pages/DriverDashboard';
import DriverApp from './pages/DriverApp';
import ManageRestaurantManagers from './pages/ManageRestaurantManagers';
import AdminDashboard from './pages/AdminDashboard';
import AdminRestaurants from './pages/AdminRestaurants';
import GroupOrder from './pages/GroupOrder';
import SuperAdmin from './pages/SuperAdmin';
import __Layout from './Layout.jsx';


export const PAGES = {
    "Home": Home,
    "Restaurant": Restaurant,
    "Checkout": Checkout,
    "Orders": Orders,
    "ManageCoupons": ManageCoupons,
    "RestaurantDashboard": RestaurantDashboard,
    "TrackOrder": TrackOrder,
    "DriverDashboard": DriverDashboard,
    "DriverApp": DriverApp,
    "ManageRestaurantManagers": ManageRestaurantManagers,
    "AdminDashboard": AdminDashboard,
    "AdminRestaurants": AdminRestaurants,
    "GroupOrder": GroupOrder,
    "SuperAdmin": SuperAdmin,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};