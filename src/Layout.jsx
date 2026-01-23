import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";

// Google Tag Manager initialization
const initializeGTM = () => {
    const gtmId = 'GTM-PJ3JPPSN';
    console.log('GTM ID value:', gtmId);
    
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
        console.log('GTM script loaded successfully');
    };
    script.onerror = () => {
        console.error('Failed to load GTM script');
    };
    document.head.insertBefore(script, document.head.firstChild);
};
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

export default function Layout({ children, currentPageName }) {
    const location = useLocation();
    const [user, setUser] = useState(null);
    const [cartCount, setCartCount] = useState(0);
    const [customDomainChecked, setCustomDomainChecked] = useState(false);
    const [isRestaurantManager, setIsRestaurantManager] = useState(false);
    const [customDomainRestaurantId, setCustomDomainRestaurantId] = useState(null);

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

    // SEO Meta Tags
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

        // Set title and meta tags
        if (customDomainRestaurant?.name) {
            const titleText = customDomainRestaurant.description 
                ? `${customDomainRestaurant.name} - ${customDomainRestaurant.description}`
                : `${customDomainRestaurant.name} - Order Online`;
            document.title = titleText;
        } else {
            document.title = 'MealDrop - Food Delivery from Your Favourite Restaurants';
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
        loadUser();
        updateCartCount();
        checkCustomDomain();
        
        const interval = setInterval(updateCartCount, 1000);
        return () => clearInterval(interval);
    }, []);

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
        } catch (e) {
            // User not logged in
        }
    };

    const updateCartCount = () => {
        const cart = localStorage.getItem('cart');
        if (cart) {
            const items = JSON.parse(cart);
            const count = items.reduce((sum, item) => sum + item.quantity, 0);
            setCartCount(count);
        } else {
            setCartCount(0);
        }
    };

    const checkCustomDomain = async () => {
        if (customDomainChecked) return;

        try {
            const currentDomain = window.location.hostname;

            // Skip for localhost, IP addresses, or main platform domains
            if (
                currentDomain === 'localhost' || 
                currentDomain.includes('base44') ||
                /^\d+\.\d+\.\d+\.\d+$/.test(currentDomain) ||
                currentDomain.includes('127.0.0.1')
            ) {
                setCustomDomainChecked(true);
                return;
            }

            // Fetch all restaurants to check for custom domain match
            const restaurants = await base44.entities.Restaurant.list();

            const domainRestaurant = restaurants.find(r => 
                r.custom_domain && 
                r.domain_verified && 
                r.custom_domain.toLowerCase() === currentDomain.toLowerCase()
            );

            if (domainRestaurant) {
                setCustomDomainRestaurantId(domainRestaurant.id);

                // If on custom domain, redirect to restaurant page if not already there
                const restaurantUrl = createPageUrl('Restaurant') + `?id=${domainRestaurant.id}`;
                if (!window.location.pathname.includes('/Restaurant') || !window.location.search.includes(domainRestaurant.id)) {
                    window.location.href = restaurantUrl;
                }
            }

            setCustomDomainChecked(true);
        } catch (error) {
            // Silently fail - don't disrupt user experience
            setCustomDomainChecked(true);
        }
    };

    const hideHeader = ['Checkout', 'POSDashboard'].includes(currentPageName);
    const showBottomNav = !['Checkout', 'RestaurantDashboard', 'AdminDashboard', 'AdminRestaurants', 'SuperAdmin', 'ManageRestaurantManagers', 'DriverDashboard', 'POSDashboard', 'PrivacyPolicy', 'TermsOfService'].includes(currentPageName);
    const hideFooter = ['Checkout', 'RestaurantDashboard', 'AdminDashboard', 'AdminRestaurants', 'SuperAdmin', 'ManageRestaurantManagers', 'DriverDashboard', 'POSDashboard'].includes(currentPageName);
    
    // Custom domain home link
    const homeUrl = customDomainRestaurantId 
        ? createPageUrl('Restaurant') + `?id=${customDomainRestaurantId}`
        : createPageUrl('Home');

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 5rem)' }}>
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
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @media (max-width: 768px) {
                    body {
                        overscroll-behavior-y: contain;
                    }
                }
            `}</style>

            {!hideHeader && (
                <header className="bg-white border-b sticky top-0 z-50 safe-area-top">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="flex items-center justify-between h-14 md:h-16">
                            <Link to={homeUrl} className="flex items-center gap-2">
                                {customDomainRestaurant ? (
                                    <>
                                        <img 
                                            src={customDomainRestaurant.logo_url || customDomainRestaurant.image_url || 'https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png?w=100&h=100&fit=crop'} 
                                            alt={customDomainRestaurant.name || "Restaurant Logo"} 
                                            className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover"
                                        />
                                        <span className="font-bold text-lg md:text-xl text-gray-900 hidden sm:block">{customDomainRestaurant.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <img 
                                            src="https://res.cloudinary.com/dbbjc1cre/image/upload/v1767479445/my-project-page-1_qsv0xc.png?w=100&h=100&fit=crop" 
                                            alt="MealDrop Logo" 
                                            className="w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover"
                                        />
                                        <span className="font-bold text-lg md:text-xl text-gray-900 hidden sm:block">MealDrop</span>
                                    </>
                                )}
                            </Link>



                            <div className="flex items-center gap-2">
                                <div className="hidden md:flex items-center gap-3">
                                    {user && <NotificationBell userEmail={user.email} />}

                                    {cartCount > 0 && (
                                        <Link to={createPageUrl('Checkout')}>
                                            <Button variant="outline" className="relative rounded-full">
                                                <ShoppingBag className="h-5 w-5" />
                                                <span className="absolute -top-1 -right-1 h-5 w-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                                    {cartCount}
                                                </span>
                                            </Button>
                                        </Link>
                                    )}
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="rounded-full h-11 w-11 md:h-9 md:w-9">
                                            <Menu className="h-6 w-6 md:hidden" />
                                            <User className="h-5 w-5 hidden md:block" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
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
                                                onClick={() => base44.auth.redirectToLogin()}
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

            <main className="min-h-screen">{children}</main>

                {/* AI Chatbot Widget */}
                <ChatbotWidget />

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
                <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-40 safe-area-bottom">
                    <div className="flex items-center justify-around h-16 px-2">
                        <Link 
                            to={homeUrl} 
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Home' || (customDomainRestaurantId && currentPageName === 'Restaurant') ? 'text-orange-500' : 'text-gray-600'
                            }`}
                        >
                            <Home className="h-6 w-6" />
                            <span className="text-xs font-medium">Home</span>
                        </Link>
                        
                        <Link 
                            to={createPageUrl('Orders')} 
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Orders' ? 'text-orange-500' : 'text-gray-600'
                            }`}
                        >
                            <ShoppingBag className="h-6 w-6" />
                            <span className="text-xs font-medium">Orders</span>
                        </Link>

                        <Link 
                            to={createPageUrl('Checkout')} 
                            className="flex flex-col items-center justify-center flex-1 gap-1 py-2 relative"
                        >
                            <div className={`relative ${cartCount > 0 ? 'text-orange-500' : 'text-gray-600'}`}>
                                <ShoppingBag className="h-6 w-6" />
                                {cartCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-orange-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className={`text-xs font-medium ${cartCount > 0 ? 'text-orange-500' : 'text-gray-600'}`}>Cart</span>
                        </Link>

                        <Link 
                            to={createPageUrl('Messages')} 
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'Messages' ? 'text-orange-500' : 'text-gray-600'
                            }`}
                        >
                            <MessageSquare className="h-6 w-6" />
                            <span className="text-xs font-medium">Messages</span>
                        </Link>
                        
                        <Link 
                            to={createPageUrl('CustomerProfile')} 
                            className={`flex flex-col items-center justify-center flex-1 gap-1 py-2 transition-colors ${
                                currentPageName === 'CustomerProfile' ? 'text-orange-500' : 'text-gray-600'
                            }`}
                        >
                            <User className="h-6 w-6" />
                            <span className="text-xs font-medium">Profile</span>
                        </Link>
                    </div>
                </nav>
            )}
        </div>
    );
}