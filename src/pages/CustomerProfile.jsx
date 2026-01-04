import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Package, Heart, MapPin, Award, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import OrderHistory from '@/components/profile/OrderHistory';
import FavoritesList from '@/components/profile/FavoritesList';
import AddressManager from '@/components/profile/AddressManager';
import LoyaltyRewards from '@/components/profile/LoyaltyRewards';

export default function CustomerProfile() {
    const [user, setUser] = useState(null);

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
        <div className="min-h-screen bg-gray-50">
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
                <Card className="mb-6">
                    <CardContent className="pt-4 sm:pt-6">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                                <User className="h-8 w-8 sm:h-10 sm:w-10 text-orange-600" />
                            </div>
                            <div className="flex-1 text-center sm:text-left">
                                <h1 className="text-xl sm:text-3xl font-bold text-gray-900">{user.full_name || 'Customer'}</h1>
                                <p className="text-sm sm:text-base text-gray-600">{user.email}</p>
                                {user.phone && <p className="text-gray-500 text-xs sm:text-sm">{user.phone}</p>}
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

                {/* Profile Tabs */}
                <Tabs defaultValue="orders">
                    <TabsList className="bg-white mb-4 sm:mb-6 w-full grid grid-cols-2 sm:flex sm:w-auto">
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
            </div>
        </div>
    );
}