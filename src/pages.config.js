import Home from './pages/Home';
import Restaurant from './pages/Restaurant';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import ManageCoupons from './pages/ManageCoupons';
import RestaurantDashboard from './pages/RestaurantDashboard';
import TrackOrder from './pages/TrackOrder';
import DriverDashboard from './pages/DriverDashboard';
import DriverApp from './pages/DriverApp';
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
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};