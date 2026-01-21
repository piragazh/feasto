import React from 'react';
import { LogOut, ShoppingCart, UtensilsCrossed, DollarSign, Monitor, Users, BarChart3, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';

export default function POSLayout({ children, currentTab, onTabChange, restaurant, user, cart, cartTotal }) {
    const menuItems = [
        { id: 'order-entry', label: 'Orders', icon: ShoppingCart },
        { id: 'queue', label: 'Queue', icon: Package },
        { id: 'tables', label: 'Tables', icon: Monitor },
        { id: 'waitlist', label: 'Waitlist', icon: Users },
        { id: 'payment', label: 'Payment', icon: DollarSign },
        { id: 'kitchen', label: 'Kitchen', icon: Monitor },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* SIDEBAR */}
            <div className="w-56 bg-white border-r border-gray-200 flex flex-col">
                {/* Restaurant Info */}
                <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <UtensilsCrossed className="h-5 w-5 text-white" />
                        </div>
                        <h2 className="font-bold text-lg text-gray-900 truncate">{restaurant?.name || 'POS'}</h2>
                    </div>
                    <p className="text-xs text-gray-500">Point of Sale</p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {menuItems.map(item => {
                        const Icon = item.icon;
                        const isActive = currentTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onTabChange(item.id)}
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
                        onClick={() => base44.auth.logout()}
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
            <div className="flex-1 flex flex-col">
                {/* HEADER */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
                    <div className="px-6 py-3 flex items-center justify-between">
                        <h1 className="text-xl font-semibold text-gray-900">
                            {menuItems.find(m => m.id === currentTab)?.label || 'POS System'}
                        </h1>
                        <div className="flex items-center gap-3">
                            {cart.length > 0 && (
                                <>
                                    <Badge className="bg-orange-500 text-white">
                                        <ShoppingCart className="h-3 w-3 mr-1" />
                                        {cart.length} items
                                    </Badge>
                                    <Badge className="bg-blue-500 text-white">
                                        <DollarSign className="h-3 w-3 mr-1" />
                                        £{cartTotal.toFixed(2)}
                                    </Badge>
                                </>
                            )}
                            <div className="text-sm text-gray-500">
                                {user?.full_name || 'User'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-auto p-6">
                    {children}
                </div>
            </div>
        </div>
    );
}