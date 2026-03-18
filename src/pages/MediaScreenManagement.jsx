import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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

export default function MediaScreenManagement() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [restaurant, setRestaurant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('overview');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
            const urlParams = new URLSearchParams(window.location.search);
            const restaurantId = urlParams.get('restaurantId');
            if (userData.role === 'admin' && restaurantId) {
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                setRestaurant(restaurants[0]);
            } else {
                const managers = await base44.entities.RestaurantManager.filter({ user_email: userData.email });
                if (managers.length > 0) {
                    const restaurants = await base44.entities.Restaurant.filter({ id: managers[0].restaurant_ids[0] });
                    setRestaurant(restaurants[0]);
                }
            }
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
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
                            <h1 className="text-2xl font-bold text-gray-900">AI Content Generator</h1>
                            <p className="text-gray-500 text-sm mt-1">Generate promotional images using AI</p>
                        </div>
                        <AIContentGenerator
                            open={true}
                            onClose={() => setActiveSection('library')}
                            onContentGenerated={(content) => {
                                base44.entities.PromotionalContent.create({
                                    restaurant_id: restaurant.id,
                                    ...content,
                                    screen_name: '',
                                    transition: 'fade',
                                    display_order: 0,
                                    is_active: true
                                });
                                setActiveSection('library');
                            }}
                            restaurantName={restaurant.name}
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

    return (
        <div className="flex h-screen bg-gray-950 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
                {/* Brand */}
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
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                    <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-2">Studio</p>
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
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

                {/* Footer */}
                <div className="px-5 py-4 border-t border-gray-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-green-400 shadow-sm shadow-green-400/50" />
                        <span className="text-xs text-gray-500">Studio Online</span>
                    </div>
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top bar */}
                <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">Screen Studio</span>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                        <span className="text-gray-900 font-semibold">{activeNavItem?.label || 'Overview'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
                            <Wifi className="h-3.5 w-3.5 text-green-600" />
                            <span className="text-xs font-semibold text-green-700">{restaurant.name}</span>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 overflow-y-auto bg-gray-50">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
}