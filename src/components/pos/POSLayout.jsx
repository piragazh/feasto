import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, Home } from 'lucide-react';

export default function POSLayout({ children, currentPageName }) {
    const [user, setUser] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            // User not logged in
        }
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* Sidebar */}
            <div className={`${sidebarOpen ? 'w-64' : 'w-0'} bg-gray-900 text-white transition-all duration-300 overflow-hidden flex flex-col`}>
                <div className="p-4 border-b border-gray-800">
                    <h1 className="font-bold text-lg">POS System</h1>
                </div>
                
                <nav className="flex-1 p-4 space-y-2">
                    <Link to={createPageUrl('RestaurantDashboard')} className="block">
                        <Button variant="ghost" className="w-full justify-start text-gray-300 hover:text-white hover:bg-gray-800">
                            <Home className="h-4 w-4 mr-3" />
                            Back to Dashboard
                        </Button>
                    </Link>
                </nav>

                <div className="p-4 border-t border-gray-800">
                    {user && (
                        <div className="mb-4">
                            <p className="text-sm text-gray-400">{user.full_name}</p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                    )}
                    <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => base44.auth.logout()}
                        className="w-full"
                    >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Bar */}
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                    <h2 className="text-lg font-semibold text-gray-900">{currentPageName}</h2>
                    <div className="w-10" /> {/* Spacer for alignment */}
                </div>

                {/* Content Area */}
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}