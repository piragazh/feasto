import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { DarkModeProvider } from '@/components/ui/dark-mode-provider';
import { ArrowLeft } from 'lucide-react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { PageTransition } from '@/components/ui/page-transition';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Home, ShoppingBag, User, LogOut, Menu, Tag, MessageSquare, Bell, Heart } from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import ChatbotWidget from '@/components/chatbot/ChatbotWidget';
import { Toaster } from 'sonner';
import { addSkipLink } from '@/lib/a11y-utils';
import { initializeLiveRegions } from '@/lib/aria-utils.jsx';
import { getApiUrl } from '@/lib/api-origin';

// Google Tag Manager initialization
const initializeGTM = () => {
    const gtmId = import.meta.env.VITE_GTM_ID || 'GTM-PJ3JPPSN';
    
    // Store for later use
    window.__gtmId = gtmId;
    
    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    
    // Define gtag function PK
    window.gtag = function() { 
        window.dataLayer.push(arguments); 
    };
    
    // Set defaults
    window.gtag('js', new Date());
    
    // Configure GTM with privacy settings
    window.gtag('config', gtmId, { 
        'anonymize_ip': true,
        'allow_google_signals': false,
        'send_page_view': true
    });
    
    // Load GTM script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gtmId}`;
    script.onload = () => {
        if (import.meta.env.DEV) console.log('GTM script loaded successfully');
    };
    script.onerror = () => {
        if (import.meta.env.DEV) console.error('Failed to load GTM script');
    };
    document.head.insertBefore(script, document.head.firstChild);
};

class LayoutErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[Layout] Error boundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-red-50 p-4">
          <div className="text-center">
            <div className="text-red-600 font-bold mb-2">⚠️ Layout Error</div>
            <p className="text-sm text-gray-600 mb-4">{this.state.error?.message || 'An error occurred'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Layout({ children, currentPageName }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [cartCount, setCartCount] = useState(0);
    const [isRestaurantManager, setIsRestaurantManager] = useState(false);
    
    // Read customDomainRestaurantId from sessionStorage in state (not top-level render)
    // to avoid synchronous render-time reads that can cause React update conflicts (#426)
    const [customDomainRestaurantId, setCustomDomainRestaurantId] = useState(null);

    useEffect(() => {
        setCustomDomainRestaurantId(sessionStorage.getItem('customDomainRestaurantId') || null);
    }, []);

    useEffect(() => {
        const syncCustomDomainRestaurant = () => {
            const id = sessionStorage.getItem('customDomainRestaurantId') || null;
            setCustomDomainRestaurantId((prev) => (prev === id ? prev : id));
        };

        syncCustomDomainRestaurant();
        window.addEventListener('storage', syncCustomDomainRestaurant);
        window.addEventListener('focus', syncCustomDomainRestaurant);

        return () => {
            window.removeEventListener('storage', syncCustomDomainRestaurant);
            window.removeEventListener('focus', syncCustomDomainRestaurant);
        };
    }, []);

    // Fetch restaurant data if custom domain is set
    const { data: customDomainRestaurant } = useQuery({
        queryKey: ['custom-domain-restaurant', customDomainRestaurantId],
        queryFn: async () => {
            if (!customDomainRestaurantId) return null;
            const restaurants = await base44.entities.Restaurant.filter({ id: customDomainRestaurantId });
            return restaurants?.[0] || null;
        },
        enabled: !!customDomainRestaurantId,
    });

    // SEO Meta Tags & PWA Manifest
    useEffect(() => {
        // Set favicon for custom domain
        if (customDomainRestaurant?.logo_url) {
            let favicon = document.querySelector('link[rel="icon"]');
            if (!favicon) {
                favicon = document.createElement('link');
                favicon.rel = 'icon';
                document.head.appendChild(favicon);
            }
            favicon.href = customDomainRestaurant.logo_url;
        }

        // Add PWA manifest link
        let manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) {
            manifestLink = document.createElement('link');
            manifestLink.rel = 'manifest';
            document.head.appendChild(manifestLink);
        }
        
        // For restaurant dashboard / POS, use restaurant-specific dashboard manifest
        // IMPORTANT: Use getApiUrl() to ensure the request hits the backend function,
        // not the SPA frontend rewrite which returns HTML instead of JSON.
        if (currentPageName === 'RestaurantDashboard' || currentPageName === 'POSDashboard' || currentPageName === 'TabletDashboard') {
            const urlParams = new URLSearchParams(window.location.search);
            const dashboardRestaurantId = urlParams.get('restaurant_id') || customDomainRestaurantId;
            const posMode = currentPageName === 'POSDashboard' ? 'pos' : currentPageName === 'TabletDashboard' ? 'tablet' : 'dashboard';
            if (dashboardRestaurantId) {
                manifestLink.href = getApiUrl(`/getManifest?restaurant_id=${dashboardRestaurantId}&mode=${posMode}`);
            } else {
                manifestLink.href = getApiUrl(`/getManifest?mode=${posMode}`);
            }
        } else if (customDomainRestaurantId) {
            manifestLink.href = getApiUrl(`/getManifest?restaurant_id=${customDomainRestaurantId}`);
        } else {
            manifestLink.href = getApiUrl('/getManifest');
        }

        // Add theme-color meta tag
        let themeColor = document.querySelector('meta[name="theme-color"]');
        if (!themeColor) {
            themeColor = document.createElement('meta');
            themeColor.name = 'theme-color';
            document.head.appendChild(themeColor);
        }
        themeColor.content = customDomainRestaurant?.theme_primary_color || '#f97316';

        // Add apple-mobile-web-app-capable for iOS
        let appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
        if (!appleCapable) {
            appleCapable = document.createElement('meta');
            appleCapable.name = 'apple-mobile-web-app-capable';
            appleCapable.content = 'yes';
            document.head.appendChild(appleCapable);
        }

        // Add apple-mobile-web-app-status-bar-style
        let appleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (!appleStatusBar) {
            appleStatusBar = document.createElement('meta');
            appleStatusBar.name = 'apple-mobile-web-app-status-bar-style';
            appleStatusBar.content = 'default';
            document.head.appendChild(appleStatusBar);
        }

        // Set title and meta tags
        const isRestaurantPage = currentPageName === 'Restaurant';
        if (!isRestaurantPage) {
            if (customDomainRestaurant?.name) {
                const titleText = customDomainRestaurant.description 
                    ? `${customDomainRestaurant.name} - ${customDomainRestaurant.description}`
                    : `${customDomainRestaurant.name} - Order Online`;
                document.title = titleText;
            } else {
                document.title = 'MealDrop - Food Delivery from Your Favourite Restaurants';
            }
        }

        // Meta description
        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement('meta');
            metaDescription.name = 'description';
            document.head.appendChild(metaDescription);
        }
        if (customDomainRestaurant?.seo_description) {
              metaDescription.content = customDomainRestaurant.seo_description;
          } else if (customDomainRestaurant?.description) {
              metaDescription.content = customDomainRestaurant.description;
          } else {
              metaDescription.content = 'Order food online from top restaurants in the UK. Fast delivery, great food, amazing offers. Download the MealDrop app for iOS and Android.';
          }

        // Keywords
        let metaKeywords = document.querySelector('meta[name="keywords"]');
        if (!metaKeywords) {
            metaKeywords = document.createElement('meta');
            metaKeywords.name = 'keywords';
            document.head.appendChild(metaKeywords);
        }
        metaKeywords.content = 'food delivery, restaurant delivery, online food order, takeaway, food near me, delivery app';

        // Open Graph tags
        const ogTags = [
            { property: 'og:title', content: customDomainRestaurant?.name || 'MealDrop - Food Delivery' },
            { property: 'og:description', content: customDomainRestaurant?.description || 'Order food online from your favourite restaurants' },
            { property: 'og:type', content: 'website' },
            { property: 'og:url', content: window.location.href },
            { property: 'og:image', content: customDomainRestaurant?.logo_url || customDomainRestaurant?.image_url || 'https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png' }
        ];

        ogTags.forEach(({ property, content }) => {
            let tag = document.querySelector(`meta[property="${property}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.setAttribute('property', property);
                document.head.appendChild(tag);
            }
            tag.content = content;
        });

        // Twitter Card tags
        const twitterTags = [
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: customDomainRestaurant?.name || 'MealDrop - Food Delivery' },
            { name: 'twitter:description', content: customDomainRestaurant?.description || 'Order food online from your favourite restaurants' },
            { name: 'twitter:image', content: customDomainRestaurant?.logo_url || customDomainRestaurant?.image_url || 'https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png' }
        ];

        twitterTags.forEach(({ name, content }) => {
            let tag = document.querySelector(`meta[name="${name}"]`);
            if (!tag) {
                tag = document.createElement('meta');
                tag.name = name;
                document.head.appendChild(tag);
            }
            tag.content = content;
        });

        // Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = window.location.href;
    }, [location, customDomainRestaurant]);

    useEffect(() => {
        initializeGTM();
        addSkipLink();
        initializeLiveRegions();
        loadUser();
        updateCartCount();
        
        const interval = setInterval(updateCartCount, 1000);
        return () => clearInterval(interval);
    }, []);

    // Remove trackDashboardActivity calls that cause 404 errors

    // Track page views with GTM
    useEffect(() => {
        if (window.__gtmId && window.__gtmId !== 'undefined' && window.gtag && window.dataLayer) {
            // Use setTimeout to ensure GTM is ready
            setTimeout(() => {
                window.gtag('event', 'page_view', {
                    'page_path': location.pathname,
                    'page_title': document.title,
                    'send_to': window.__gtmId
                });
            }, 100);
        }
    }, [location]);

    const loadUser = async () => {
    try {
        const userData = await base44.auth.me();
        setUser(userData);

        // Check if user is a restaurant manager
        const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email });
        setIsRestaurantManager(managers && managers.length > 0);

        // Handle staff post-login redirect
        const staffRole = sessionStorage.getItem('staff_post_login_role');
        const staffEmail = sessionStorage.getItem('staff_post_login_email');
        if (staffRole && staffEmail && userData.email?.toLowerCase() === staffEmail?.toLowerCase()) {
            sessionStorage.removeItem('staff_post_login_role');
            sessionStorage.removeItem('staff_post_login_email');
            if (staffRole === 'cashier') {
                window.location.href = createPageUrl('POSDashboard');
            } else {
                window.location.href = createPageUrl('RestaurantDashboard');
            }
        }
    } catch (e) {
        // User not logged in
    }
    };

    const updateCartCount = () => {
        try {
            const cart = localStorage.getItem('cart');
            if (cart) {
                const items = JSON.parse(cart);
                if (Array.isArray(items)) {
                    const count = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                    setCartCount(count);
                } else {
                    console.warn('[Layout] Cart is not an array, clearing');
                    localStorage.removeItem('cart');
                    setCartCount(0);
                }
            } else {
                setCartCount(0);
            }
        } catch (e) {
            console.error('[Layout] Corrupted cart data, clearing:', e?.message);
            localStorage.removeItem('cart');
            localStorage.removeItem('cartRestaurantId');
            localStorage.removeItem('cartRestaurantName');
            setCartCount(0);
        }
    };



    const hideHeader = ['Checkout', 'POSDashboard', 'DriverApp', 'MediaScreen', 'Sitemap', 'TabletDashboard', 'KioskDashboard', 'CustomerDisplay'].includes(currentPageName);
    const isFullScreenPage = ['MediaScreen', 'POSDashboard', 'TabletDashboard', 'KioskDashboard', 'CustomerDisplay', 'KitchenDisplay'].includes(currentPageName);
    const showBottomNav = !['Checkout', 'RestaurantDashboard', 'AdminDashboard', 'AdminRestaurants', 'SuperAdmin', 'ManageRestaurantManagers', 'DriverDashboard', 'POSDashboard', 'PrivacyPolicy', 'TermsOfService', 'DriverApp', 'MediaScreen', 'Sitemap', 'CustomerDisplay'].includes(currentPageName);
    const hideFooter = ['Checkout', 'RestaurantDashboard', 'AdminDashboard', 'AdminRestaurants', 'SuperAdmin', 'ManageRestaurantManagers', 'DriverDashboard', 'POSDashboard', 'DriverApp', 'MediaScreen', 'Sitemap', 'KitchenDisplay', 'TabletDashboard', 'KioskDashboard', 'CustomerDisplay'].includes(currentPageName);
    
    // Custom domain home link
    const homeUrl = customDomainRestaurantId 
        ? createPageUrl('Restaurant') + `?id=${customDomainRestaurantId}`
        : createPageUrl('Home');

    // Determine if we should show back button (not on Home or custom domain restaurant page)
    const isHomePage = currentPageName === 'Home' || (customDomainRestaurantId && currentPageName === 'Restaurant');
    const showBackButton = !hideHeader && !isHomePage;

    // Bottom nav tabs for stack preservation
    const bottomNavTabs = ['Home', 'Orders', 'Checkout', 'Messages', 'CustomerProfile'];
    
    // Handle bottom nav tab click with stack preservation
    const handleTabClick = (e, targetPage, targetUrl) => {
        e.preventDefault();
        
        // If already on this tab's page, go to its root
        if (currentPageName === targetPage) {
            navigate(targetUrl, { replace: true });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            // Save current location for the outgoing tab
            const currentTabKey = `tab_location_${currentPageName}`;
            sessionStorage.setItem(currentTabKey, JSON.stringify({
                pathname: location.pathname,
                search: location.search,
                scrollY: window.scrollY
            }));
            
            // Check if incoming tab has saved location
            const incomingTabKey = `tab_location_${targetPage}`;
            const savedLocation = sessionStorage.getItem(incomingTabKey);
            
            if (savedLocation) {
                try {
                    const { pathname, search, scrollY } = JSON.parse(savedLocation);
                    navigate(pathname + search);
                    // Restore scroll after navigation
                    setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'instant' }), 0);
                } catch (e) {
                    // If parsing fails, just navigate normally
                    navigate(targetUrl);
                }
            } else {
                // No saved location, navigate to tab root
                navigate(targetUrl);
            }
        }
    };



    return (
        <LayoutErrorBoundary>
        <DarkModeProvider>
        <div className="w-full min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 md:pb-0" style={{ paddingBottom: 'max(5rem, env(safe-area-inset-bottom, 5rem))' }}>
            {/* Google Tag Manager Noscript */}
            {window.__gtmId && window.__gtmId !== 'undefined' && (
                <noscript 
                    dangerouslySetInnerHTML={{
                        __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=${window.__gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`
                    }}
                />
            )}
            <Toaster position="top-center" richColors />
            <style>{`
                :root {
                    --primary: 24 100% 50%;
                    --primary-foreground: 0 0% 100%;
                }
                html, body {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                html::-webkit-scrollbar, body::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                body {
                    overscroll-behavior: none;
                }
                @media (max-width: 768px) {
                    body {
                        overscroll-behavior-y: contain;
                    }
                }
                nav, button, a {
                    user-select: none;
                    -webkit-user-select: none;
                    -moz-user-select: none;
                    -ms-user-select: none;
                }
            `}</style>

            {!hideHeader && (
                <header className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-50 fixed-top" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}>
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="flex items-center justify-between h-14 md:h-16">
                            {showBackButton ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(-1)}
                                    className="rounded-full mr-2"
                                    aria-label="Go back to previous page"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                            ) : customDomainRestaurant ? (
                                <Link to={homeUrl} className="flex items-center gap-2">
                                    <img 
                                        src={customDomainRestaurant.logo_url || customDomainRestaurant.image_url} 
                                        alt={customDomainRestaurant.name || "Restaurant Logo"} 
                                        className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover"
                                    />
                                    <span className="font-bold text-lg md:text-xl text-gray-900 dark:text-white hidden sm:block">{customDomainRestaurant.name}</span>
                                </Link>
                            ) : (
                                <Link to={homeUrl} className="flex items-center gap-2">
                                    <img 
                                        src="https://res.cloudinary.com/dbbjc1cre/image/upload/v1770322839/final_logo_icon_only_rgoqoy.png" 
                                        alt="MealDrop Logo" 
                                        className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover"
                                    />
                                    <span className="font-bold text-lg md:text-xl text-gray-900 dark:text-white hidden sm:block">MealDrop</span>
                                </Link>
                            )}



                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-3">
                                    {user && <NotificationBell userEmail={user.email} />}

                                    {cartCount > 0 && (
                                        <Link to={createPageUrl('Checkout')}>
                                            <Button variant="outline" className="relative rounded-full" aria-label={`View cart with ${cartCount} items`}>
                                                <ShoppingBag className="h-5 w-5" />
                                                <span className="absolute -top-1 -right-1 h-5 w-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center" aria-hidden="true">
                                                    {cartCount}
                                                </span>
                                            </Button>
                                        </Link>
                                    )}
                                </div>

                                <DropdownMenu modal={false}>
                                    <DropdownMenuTrigger asChild>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="rounded-full h-11 w-11 md:h-9 md:w-9 touch-manipulation active:scale-95 transition-transform"
                                            aria-label="Open menu"
                                            aria-haspopup="true"
                                        >
                                            <Menu className="h-6 w-6 md:hidden" aria-hidden="true" />
                                            <User className="h-5 w-5 hidden md:block" aria-hidden="true" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56 z-[100]">
                                       <DropdownMenuItem asChild className="md:hidden">
                                           <Link to={homeUrl} className="flex items-center gap-2">
                                               <Home className="h-4 w-4" />
                                               {customDomainRestaurantId ? 'Home' : 'Restaurants'}
                                           </Link>
                                       </DropdownMenuItem>
                                       <DropdownMenuItem asChild className="md:hidden">
                                           <Link to={createPageUrl('Orders')} className="flex items-center gap-2">
                                               <ShoppingBag className="h-4 w-4" />
                                               My Orders
                                           </Link>
                                       </DropdownMenuItem>
                                       <DropdownMenuItem asChild>
                                           <Link to={createPageUrl('Favorites')} className="flex items-center gap-2">
                                               <Heart className="h-4 w-4" />
                                               Favorites
                                           </Link>
                                       </DropdownMenuItem>
                                       <DropdownMenuItem asChild>
                                           <Link to={createPageUrl('Messages')} className="flex items-center gap-2">
                                               <MessageSquare className="h-4 w-4" />
                                               Messages
                                           </Link>
                                       </DropdownMenuItem>
                                       <DropdownMenuItem asChild>
                                           <Link to={createPageUrl('CustomerProfile')} className="flex items-center gap-2">
                                               <User className="h-4 w-4" />
                                               My Profile
                                           </Link>
                                       </DropdownMenuItem>
                                       {isRestaurantManager && (
                                           <DropdownMenuItem asChild>
                                               <Link to={createPageUrl('RestaurantDashboard')} className="flex items-center gap-2">
                                                   <Home className="h-4 w-4" />
                                                   Restaurant Dashboard
                                               </Link>
                                           </DropdownMenuItem>
                                       )}
                                       {user?.role === 'admin' && (
                                       <>
                                           <DropdownMenuItem asChild>
                                               <Link to={createPageUrl('SuperAdmin')} className="flex items-center gap-2">
                                                   <Home className="h-4 w-4" />
                                                   Super Admin Panel
                                               </Link>
                                           </DropdownMenuItem>
                                           <DropdownMenuItem asChild>
                                               <Link to={createPageUrl('AdminDashboard')} className="flex items-center gap-2">
                                                   <Home className="h-4 w-4" />
                                                   Admin Dashboard
                                               </Link>
                                           </DropdownMenuItem>
                                           <DropdownMenuItem asChild>
                                               <Link to={createPageUrl('AdminRestaurants')} className="flex items-center gap-2">
                                                   <Home className="h-4 w-4" />
                                                   Manage Restaurants
                                               </Link>
                                           </DropdownMenuItem>
                                           <DropdownMenuItem asChild className="md:hidden">
                                               <Link to={createPageUrl('ManageCoupons')} className="flex items-center gap-2">
                                                   <Tag className="h-4 w-4" />
                                                   Manage Coupons
                                               </Link>
                                           </DropdownMenuItem>
                                           <DropdownMenuItem asChild>
                                               <Link to={createPageUrl('ManageRestaurantManagers')} className="flex items-center gap-2">
                                                   <User className="h-4 w-4" />
                                                   Restaurant Managers
                                               </Link>
                                           </DropdownMenuItem>
                                       </>
                                       )}
                                       <DropdownMenuSeparator />
                                        {user && (
                                            <>
                                                <div className="px-2 py-1.5">
                                                    <p className="text-sm font-medium">{user.full_name || 'User'}</p>
                                                    <p className="text-xs text-gray-500">{user.email}</p>
                                                </div>
                                                <DropdownMenuSeparator />
                                            </>
                                            )}
                                            {user ? (
                                            <DropdownMenuItem 
                                                onClick={() => base44.auth.logout()}
                                                className="text-red-600 cursor-pointer"
                                            >
                                                <LogOut className="h-4 w-4 mr-2" />
                                                Sign Out
                                            </DropdownMenuItem>
                                            ) : (
                                            <DropdownMenuItem 
                                                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                                                className="cursor-pointer"
                                            >
                                                <LogOut className="h-4 w-4 mr-2" />
                                                Sign In
                                            </DropdownMenuItem>
                                            )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </header>
            )}

            <main id="main-content" className="min-h-screen">
                {isFullScreenPage ? (
                    children
                ) : (
                    <PullToRefresh onRefresh={() => window.location.reload()}>
                        <PageTransition>
                            {children}
                        </PageTransition>
                    </PullToRefresh>
                )}
            </main>

                {/* AI Chatbot Widget */}
                {!['AdminDashboard', 'AdminRestaurants', 'SuperAdmin', 'ManageRestaurantManagers', 'RestaurantDashboard', 'POSDashboard', 'MediaScreen'].includes(currentPageName) && <ChatbotWidget />}

                {/* Footer */}
                {!hideFooter && (
                <footer className="bg-gray-900 text-gray-300 border-t border-gray-800 mt-auto">
                    <div className="max-w-6xl mx-auto px-4 py-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                            <div>
                                <h3 className="text-white font-bold text-lg mb-4">MealDrop</h3>
                                <p className="text-sm text-gray-400">
                                    Your favourite restaurants, delivered to your door.
                                </p>
                            </div>
                            <div>
                                <h4 className="text-white font-semibold mb-4">Legal</h4>
                                <ul className="space-y-2 text-sm">
                                    <li>
                                        <Link to={createPageUrl('PrivacyPolicy')} className="hover:text-white transition-colors">
                                            Privacy Policy
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to={createPageUrl('TermsOfService')} className="hover:text-white transition-colors">
                                            Terms of Service
                                        </Link>
                                    </li>
                                    <li>
                                        <Link to={createPageUrl('CookiesPolicy')} className="hover:text-white transition-colors">
                                            Cookies Policy
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="text-white font-semibold mb-4">Support</h4>
                                <ul className="space-y-2 text-sm">
                                    <li>
                                        <Link to={createPageUrl('Messages')} className="hover:text-white transition-colors">
                                            Contact Us
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <div className="border-t border-gray-800 mt-8 pt-6 text-center text-sm text-gray-400">
                            © {new Date().getFullYear()} MealDrop. All rights reserved.
                        </div>
                        </div>
                        </footer>
                        )}

                {/* Mobile Bottom Navigation */}
                {showBottomNav && (
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 z-40 fixed-bottom" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0.5rem))', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
                    <div className="flex items-center justify-around h-16 px-2">
                        <a 
                            href={homeUrl}
                            onClick={(e) => handleTabClick(e, customDomainRestaurantId ? 'Restaurant' : 'Home', homeUrl)}
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Home' || (customDomainRestaurantId && currentPageName === 'Restaurant') ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'
                            }`}
                        >
                            <Home className="h-6 w-6" />
                            <span className="text-xs font-medium">Home</span>
                        </a>

                        <a 
                            href={createPageUrl('Orders')}
                            onClick={(e) => handleTabClick(e, 'Orders', createPageUrl('Orders'))}
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Orders' ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'
                            }`}
                        >
                            <ShoppingBag className="h-6 w-6" />
                            <span className="text-xs font-medium">Orders</span>
                        </a>

                        <a 
                            href={createPageUrl('Checkout')}
                            onClick={(e) => handleTabClick(e, 'Checkout', createPageUrl('Checkout'))}
                            className="flex flex-col items-center justify-center flex-1 gap-1 py-2 relative"
                        >
                            <div className={`relative ${cartCount > 0 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'}`}>
                                <ShoppingBag className="h-6 w-6" />
                                {cartCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className={`text-xs font-medium ${cartCount > 0 ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'}`}>Cart</span>
                        </a>

                        <a 
                            href={createPageUrl('Messages')}
                            onClick={(e) => handleTabClick(e, 'Messages', createPageUrl('Messages'))}
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Messages' ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'
                            }`}
                        >
                            <MessageSquare className="h-6 w-6" />
                            <span className="text-xs font-medium">Messages</span>
                        </a>

                        <a 
                            href={createPageUrl('CustomerProfile')}
                            onClick={(e) => handleTabClick(e, 'CustomerProfile', createPageUrl('CustomerProfile'))}
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'CustomerProfile' ? 'text-orange-500' : 'text-gray-600 dark:text-gray-400'
                            }`}
                        >
                            <User className="h-6 w-6" />
                            <span className="text-xs font-medium">Profile</span>
                        </a>
                    </div>
                </nav>
                )}
            </div>
            </DarkModeProvider>
            </LayoutErrorBoundary>
            );
            }