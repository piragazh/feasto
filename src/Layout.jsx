import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuSeparator, 
    DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Home, ShoppingBag, User, LogOut, Menu } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
    const [user, setUser] = useState(null);
    const [cartCount, setCartCount] = useState(0);

    useEffect(() => {
        loadUser();
        updateCartCount();
        
        const interval = setInterval(updateCartCount, 1000);
        return () => clearInterval(interval);
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
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

    const hideHeader = ['Checkout'].includes(currentPageName);

    return (
        <div className="min-h-screen bg-gray-50">
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
            `}</style>

            {!hideHeader && (
                <header className="bg-white border-b sticky top-0 z-50">
                    <div className="max-w-6xl mx-auto px-4">
                        <div className="flex items-center justify-between h-16">
                            <Link to={createPageUrl('Home')} className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
                                    <span className="text-white font-bold text-lg">F</span>
                                </div>
                                <span className="font-bold text-xl text-gray-900 hidden sm:block">Foodie</span>
                            </Link>

                            <nav className="hidden md:flex items-center gap-8">
                                <Link 
                                    to={createPageUrl('Home')} 
                                    className={`text-sm font-medium transition-colors ${
                                        currentPageName === 'Home' 
                                            ? 'text-orange-500' 
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Restaurants
                                </Link>
                                <Link 
                                    to={createPageUrl('Orders')} 
                                    className={`text-sm font-medium transition-colors ${
                                        currentPageName === 'Orders' 
                                            ? 'text-orange-500' 
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    My Orders
                                </Link>
                            </nav>

                            <div className="flex items-center gap-3">
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

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="rounded-full">
                                            <Menu className="h-5 w-5 md:hidden" />
                                            <User className="h-5 w-5 hidden md:block" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56">
                                        <div className="md:hidden">
                                            <DropdownMenuItem asChild>
                                                <Link to={createPageUrl('Home')} className="flex items-center gap-2">
                                                    <Home className="h-4 w-4" />
                                                    Restaurants
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem asChild>
                                                <Link to={createPageUrl('Orders')} className="flex items-center gap-2">
                                                    <ShoppingBag className="h-4 w-4" />
                                                    My Orders
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                        </div>
                                        {user && (
                                            <>
                                                <div className="px-2 py-1.5">
                                                    <p className="text-sm font-medium">{user.full_name || 'User'}</p>
                                                    <p className="text-xs text-gray-500">{user.email}</p>
                                                </div>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        <DropdownMenuItem 
                                            onClick={() => base44.auth.logout()}
                                            className="text-red-600 cursor-pointer"
                                        >
                                            <LogOut className="h-4 w-4 mr-2" />
                                            Sign Out
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>
                </header>
            )}

            <main>{children}</main>
        </div>
    );
}