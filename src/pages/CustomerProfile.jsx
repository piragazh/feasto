import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Package, Heart, MapPin, Award, ArrowLeft, Trash2, Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import OrderHistory from '@/components/profile/OrderHistory';
import FavoritesList from '@/components/profile/FavoritesList';
import AddressManager from '@/components/profile/AddressManager';
import LoyaltyRewards from '@/components/profile/LoyaltyRewards';
import { DeleteAccountDialog } from '@/components/profile/DeleteAccountDialog';
import { useDarkMode } from '@/components/ui/dark-mode-provider';

export default function CustomerProfile() {
    const [user, setUser] = useState(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { isDark, toggleDarkMode } = useDarkMode();

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            base44.auth.redirectToLogin();
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
                <div className="mb-6">
                    <Link to={createPageUrl('Home')}>
                        <Button variant="ghost" className="mb-4">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Home
                        </Button>
                    </Link>
                </div>

                {/* Profile Header */}
                <Card className="mb-6 dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="pt-4 sm:pt-6">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center shrink-0">
                                <User className="h-8 w-8 sm:h-10 sm:w-10 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">{user.full_name || 'Customer'}</h1>
                                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{user.email}</p>
                                {user.phone && <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">{user.phone}</p>}
                            </div>
                            <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center w-full sm:w-auto">
                                <div>
                                    <p className="text-xl sm:text-2xl font-bold text-orange-600">{user.total_orders || 0}</p>
                                    <p className="text-xs text-gray-500">Orders</p>
                                </div>
                                <div>
                                    <p className="text-xl sm:text-2xl font-bold text-green-600">£{(user.total_spent || 0).toFixed(2)}</p>
                                    <p className="text-xs text-gray-500">Spent</p>
                                </div>
                                <div>
                                    <p className="text-xl sm:text-2xl font-bold text-purple-600">{user.loyalty_points || 0}</p>
                                    <p className="text-xs text-gray-500">Points</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Settings Section */}
                <Card className="mb-6 dark:bg-gray-800 dark:border-gray-700">
                    <CardContent className="pt-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Settings</h3>
                        <div className="space-y-3">
                            <Button
                                variant="outline"
                                onClick={toggleDarkMode}
                                className="w-full justify-start dark:border-gray-600"
                            >
                                {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                                {isDark ? 'Light Mode' : 'Dark Mode'}
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => setShowDeleteDialog(true)}
                                className="w-full justify-start"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Account
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Profile Tabs */}
                <Tabs defaultValue="orders">
                    <TabsList className="bg-white dark:bg-gray-800 dark:border-gray-700 mb-4 sm:mb-6 w-full grid grid-cols-2 sm:flex sm:w-auto">
                        <TabsTrigger value="orders" className="text-xs sm:text-sm">
                            <Package className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Order History</span>
                            <span className="sm:hidden">Orders</span>
                        </TabsTrigger>
                        <TabsTrigger value="favorites" className="text-xs sm:text-sm">
                            <Heart className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Favorites</span>
                            <span className="sm:hidden">♥️</span>
                        </TabsTrigger>
                        <TabsTrigger value="addresses" className="text-xs sm:text-sm">
                            <MapPin className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Addresses</span>
                            <span className="sm:hidden">📍</span>
                        </TabsTrigger>
                        <TabsTrigger value="loyalty" className="text-xs sm:text-sm">
                            <Award className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Rewards</span>
                            <span className="sm:hidden">🏆</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="orders">
                        <OrderHistory userEmail={user.email} />
                    </TabsContent>

                    <TabsContent value="favorites">
                        <FavoritesList user={user} onUpdate={loadUser} />
                    </TabsContent>

                    <TabsContent value="addresses">
                        <AddressManager user={user} onUpdate={loadUser} />
                    </TabsContent>

                    <TabsContent value="loyalty">
                        <LoyaltyRewards user={user} />
                    </TabsContent>
                </Tabs>

                <DeleteAccountDialog 
                    open={showDeleteDialog}
                    onClose={() => setShowDeleteDialog(false)}
                    userEmail={user.email}
                />
            </div>
        </div>
    );
}