import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getScreenHealth } from '@/components/mediascreen/screenHealth';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
    Monitor, ArrowLeft, BarChart3, Play, Image as ImageIcon,
    Palette, Grid3x3, Zap, Wifi, ChevronRight, Settings, Radio, Menu, X
} from 'lucide-react';
import StudioOverview from '@/components/mediascreen/StudioOverview';
import StudioPlaylists from '@/components/mediascreen/StudioPlaylists';
import StudioMediaLibrary from '@/components/mediascreen/StudioMediaLibrary';
import StudioTemplateGallery from '@/components/mediascreen/StudioTemplateGallery';
import ScreenControl from '@/components/mediascreen/ScreenControl';
import MediaWallManager from '@/components/mediascreen/MediaWallManager';
import StudioWidgets from '@/components/mediascreen/StudioWidgets';
import AIContentGenerator from '@/components/mediascreen/AIContentGenerator';

const NAV_ITEMS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'playlists', label: 'Screens & Playlists', icon: Play },
    { id: 'library', label: 'Media Library', icon: ImageIcon },
    { id: 'templates', label: 'Templates', icon: Palette },
    { id: 'widgets', label: 'Live Widgets', icon: Zap },
    { id: 'walls', label: 'Media Walls', icon: Grid3x3 },
    { id: 'ai', label: 'AI Generator', icon: Radio },
    { id: 'control', label: 'Live Control', icon: Settings },
];

/** Real screen status for the sidebar: how many of this site's screens are checking in. */
function ScreenStatusFooter({ restaurantId, onOpen }) {
    const { data: screens = [], isError } = useQuery({
        queryKey: ['studio-footer-screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        refetchInterval: 60000,
    });
    const [, setTick] = useState(0);
    useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

    const states = screens.filter(s => s.is_active !== false).map(s => getScreenHealth(s));
    const online = states.filter(s => s === 'online').length;
    const total = states.length;
    let dot = 'bg-gray-500', label = 'No screens yet';
    if (isError) { dot = 'bg-amber-400'; label = "Can't check screens"; }
    else if (total) {
        dot = online === total ? 'bg-green-400' : online === 0 ? 'bg-red-500' : 'bg-amber-400';
        label = `${online} of ${total} screen${total === 1 ? '' : 's'} online`;
    }
    return (
        <button onClick={onOpen} className="px-5 py-4 border-t border-gray-800 w-full text-left hover:bg-gray-800/50 transition-colors" title="Open Live Control">
            <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-xs text-gray-400">{label}</span>
            </div>
        </button>
    );
}

export default function MediaScreenManagement() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [restaurants, setRestaurants] = useState([]); // every site this person can manage
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('overview');
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantId = urlParams.get('restaurantId');
            if (userData.role === 'admin' && restaurantId) {
                const rows = await base44.entities.Restaurant.filter({ id: restaurantId });
                setRestaurant(rows[0]);
            } else {
                // A manager can run several sites: offer all of them, not just the first.
                const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email });
                const ids = [...new Set(managers
                    .filter(m => m.is_active !== false)
                    .flatMap(m => Array.isArray(m.restaurant_ids) ? m.restaurant_ids : []))];
                const rows = (await Promise.all(ids.map(id =>
                    base44.entities.Restaurant.filter({ id }).then(r => r[0]).catch(() => null)))).filter(Boolean);
                rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
                setRestaurants(rows);
                let remembered = null;
                try { remembered = localStorage.getItem('studio_restaurant_id'); } catch {}
                const pick = rows.find(r => r.id === restaurantId)
                    || rows.find(r => r.id === remembered && r.media_screen_enabled)
                    || rows.find(r => r.media_screen_enabled)
                    || rows[0];
                setRestaurant(pick || null);
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const switchRestaurant = (id) => {
        const next = restaurants.find(r => r.id === id);
        if (!next) return;
        setRestaurant(next);
        setActiveSection('overview');
        try { localStorage.setItem('studio_restaurant_id', id); } catch {}
        const url = new URL(window.location.href);
        url.searchParams.set('restaurantId', id);
        window.history.replaceState(null, '', url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-950">
                <div className="text-center">
                    <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Loading Studio...</p>
                </div>
            </div>
        );
    }

    if (!restaurant || !restaurant.media_screen_enabled) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-950">
                <div className="text-center max-w-sm px-6">
                    <div className="w-20 h-20 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-6">
                        <Monitor className="h-10 w-10 text-gray-500" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        {!restaurant ? 'Restaurant Not Found' : 'Media Screen Not Enabled'}
                    </h2>
                    <p className="text-gray-400 text-sm mb-6">
                        {!restaurant
                            ? 'No restaurant found for your account.'
                            : 'Please contact support to enable media screen access for your restaurant.'}
                    </p>
                    {restaurants.length > 1 && (
                        <select
                            value={restaurant?.id || ''}
                            onChange={(e) => switchRestaurant(e.target.value)}
                            aria-label="Choose restaurant"
                            className="mb-4 w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-sm px-3 py-2"
                        >
                            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    )}
                    <Button onClick={() => navigate(createPageUrl('RestaurantDashboard'))} variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-800">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Dashboard
                    </Button>
                </div>
            </div>
        );
    }

    const renderContent = () => {
        switch (activeSection) {
            case 'overview':
                return <StudioOverview restaurantId={restaurant.id} onNavigate={setActiveSection} />;
            case 'playlists':
                return <StudioPlaylists restaurantId={restaurant.id} />;
            case 'library':
                return <StudioMediaLibrary restaurantId={restaurant.id} />;
            case 'templates':
                return <StudioTemplateGallery restaurantId={restaurant.id} />;
            case 'widgets':
                return <StudioWidgets restaurantId={restaurant.id} />;
            case 'ai':
                return (
                    <div className="p-6">
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">AI Ad Creator</h1>
                            <p className="text-gray-500 text-sm mt-1">Turn your real dishes and offers into screen ads — prices stay in sync with the till</p>
                        </div>
                        <AIContentGenerator
                            onClose={() => setActiveSection('library')}
                            onNavigate={setActiveSection}
                            restaurantName={restaurant.name}
                            restaurantId={restaurant.id}
                            restaurantColor={restaurant.theme_primary_color || '#f97316'}
                            websiteUrl={restaurant.custom_domain || ''}
                            logoUrl={restaurant.logo_url || ''}
                        />
                    </div>
                );
            case 'walls':
                return (
                    <div className="p-6">
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">Media Walls</h1>
                            <p className="text-gray-500 text-sm mt-1">Configure multi-screen synchronized displays</p>
                        </div>
                        <MediaWallManager restaurantId={restaurant.id} />
                    </div>
                );
            case 'control':
                return (
                    <div className="p-6">
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-gray-900">Live Control</h1>
                            <p className="text-gray-500 text-sm mt-1">Push updates and manage screens in real-time</p>
                        </div>
                        <ScreenControl restaurantId={restaurant.id} />
                    </div>
                );
            default:
                return <StudioOverview restaurantId={restaurant.id} onNavigate={setActiveSection} />;
        }
    };

    const activeNavItem = NAV_ITEMS.find(n => n.id === activeSection);

    const SidebarContent = ({ onNavigate }) => (
        <>
            <div className="px-5 py-5 border-b border-gray-800">
                <button
                    onClick={() => navigate(createPageUrl('RestaurantDashboard'))}
                    className="flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors mb-5 text-sm"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Dashboard
                </button>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-900/30">
                        <Monitor className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-white font-bold text-sm leading-tight">Screen Studio</p>
                        <p className="text-gray-500 text-xs truncate">{restaurant.name}</p>
                    </div>
                </div>
                {restaurants.length > 1 && (
                    <select
                        value={restaurant.id}
                        onChange={(e) => { switchRestaurant(e.target.value); onNavigate?.(); }}
                        aria-label="Switch restaurant"
                        className="mt-4 w-full rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs px-2.5 py-2"
                    >
                        {restaurants.map(r => (
                            <option key={r.id} value={r.id}>{r.name}{r.media_screen_enabled ? '' : ' (screens not enabled)'}</option>
                        ))}
                    </select>
                )}
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">Studio</p>
                {NAV_ITEMS.map(item => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => { setActiveSection(item.id); onNavigate?.(); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                                isActive
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/30'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                        >
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            {item.label}
                        </button>
                    );
                })}
            </nav>
            <ScreenStatusFooter restaurantId={restaurant.id} onOpen={() => { setActiveSection('control'); onNavigate?.(); }} />
        </>
    );

    return (
        <div className="flex h-screen bg-gray-950 overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 bg-gray-900 border-r border-gray-800 flex-col flex-shrink-0">
                <SidebarContent />
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top bar */}
                <header className="h-14 bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Mobile hamburger */}
                        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9 -ml-1 mr-1">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-64 p-0 bg-gray-900 border-gray-800 [&>button]:hidden">
                                <div className="flex flex-col h-full">
                                    <SidebarContent onNavigate={() => setMobileSidebarOpen(false)} />
                                </div>
                            </SheetContent>
                        </Sheet>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400 hidden sm:inline">Screen Studio</span>
                            <ChevronRight className="h-3.5 w-3.5 text-gray-300 hidden sm:inline" />
                            <span className="text-gray-900 font-semibold">{activeNavItem?.label || 'Overview'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                            <Wifi className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-xs font-semibold text-green-700 hidden sm:inline">{restaurant.name}</span>
                            <span className="text-xs font-semibold text-green-700 sm:hidden">Online</span>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto bg-gray-50">
                    <React.Fragment key={restaurant.id}>{renderContent()}</React.Fragment>
                </main>
            </div>
        </div>
    );
}