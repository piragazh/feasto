import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { LogOut, LayoutDashboard, ShoppingCart, UtensilsCrossed, Table2, Users, CreditCard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function POSAdminLayout({ children, currentSection, onNavigate, restaurant, user }) {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'orders', label: 'Orders', icon: ShoppingCart },
        { id: 'menu', label: 'Menu Management', icon: UtensilsCrossed },
        { id: 'tables', label: 'Tables', icon: Table2 },
        { id: 'staff', label: 'Staff', icon: Users },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    const handleLogout = () => {
        base44.auth.logout();
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* SIDEBAR */}
            <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
                {/* Restaurant Info */}
                <div className="p-4 border-b border-gray-200">
                    <h2 className="font-bold text-lg text-gray-900 truncate">{restaurant?.name || 'POS Admin'}</h2>
                    <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {menuItems.map(item => {
                        const Icon = item.icon;
                        const isActive = currentSection === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onNavigate(item.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isActive
                                        ? 'bg-orange-100 text-orange-900'
                                        : 'text-gray-700 hover:bg-gray-100'
                                }`}
                            >
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className="p-3 border-t border-gray-200">
                    <Button
                        onClick={handleLogout}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                    </Button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 overflow-auto">
                {children}
            </div>
        </div>
    );
}