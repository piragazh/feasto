import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { Home, Search, UtensilsCrossed, ChefHat } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center px-4">
            <div className="max-w-2xl w-full text-center">
                {/* Animated Food Icons */}
                <div className="relative mb-8">
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-64 h-64 bg-orange-100 rounded-full blur-3xl opacity-50"></div>
                    </div>
                    <div className="relative flex items-center justify-center gap-8 mb-4">
                        <UtensilsCrossed className="h-20 w-20 text-orange-300 animate-bounce" style={{ animationDelay: '0s' }} />
                        <ChefHat className="h-24 w-24 text-orange-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <UtensilsCrossed className="h-20 w-20 text-orange-300 animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                </div>

                {/* Error Code */}
                <h1 className="text-9xl font-bold text-orange-500 mb-4 tracking-tight">
                    404
                </h1>

                {/* Error Message */}
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                    Oops! This Page is Off the Menu
                </h2>
                <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
                    Looks like this dish doesn't exist. The page you're looking for might have been removed, had its name changed, or is temporarily unavailable.
                </p>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
                    <Link to={createPageUrl('Home')}>
                        <Button className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all">
                            <Home className="h-5 w-5 mr-2" />
                            Back to Home
                        </Button>
                    </Link>
                    <Link to={createPageUrl('Home')}>
                        <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-50 px-8 py-6 text-lg rounded-full">
                            <Search className="h-5 w-5 mr-2" />
                            Browse Restaurants
                        </Button>
                    </Link>
                </div>

                {/* Decorative Elements */}
                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto opacity-30">
                    <div className="h-2 bg-orange-300 rounded-full"></div>
                    <div className="h-2 bg-orange-400 rounded-full"></div>
                    <div className="h-2 bg-orange-300 rounded-full"></div>
                </div>

                {/* Fun Message */}
                <p className="text-sm text-gray-500 mt-8">
                    🍕 Don't worry, there's plenty of delicious food waiting for you on our homepage!
                </p>
            </div>
        </div>
    );
}