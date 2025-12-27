import React from 'react';
import { Search } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LocationPicker from '@/components/location/LocationPicker';

export default function HeroSection({ searchQuery, setSearchQuery, onLocationChange }) {
    return (
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white"></div>
                <div className="absolute bottom-20 right-20 w-48 h-48 rounded-full bg-white"></div>
                <div className="absolute top-1/2 left-1/3 w-24 h-24 rounded-full bg-white"></div>
            </div>
            
            <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24">
                <div className="max-w-2xl">
                    <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
                        Delicious food,<br />
                        <span className="text-orange-100">delivered to you</span>
                    </h1>
                    <p className="text-orange-100 text-lg md:text-xl mb-8">
                        Order from your favorite local restaurants with just a few taps
                    </p>
                    
                    <div className="bg-white rounded-2xl p-2 shadow-2xl shadow-orange-600/20">
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex-1">
                                <LocationPicker 
                                    onLocationSelect={onLocationChange}
                                    className="[&>div]:border-0 [&>div]:bg-gray-50 [&>div]:rounded-xl [&>button]:h-14 [&>button]:rounded-xl"
                                />
                            </div>
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
                                <Input
                                    type="text"
                                    placeholder="Search restaurants or dishes..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-12 h-14 border-0 bg-gray-50 rounded-xl text-gray-800 placeholder:text-gray-400 focus-visible:ring-orange-500"
                                />
                            </div>
                            <Button className="h-14 px-8 bg-gray-900 hover:bg-gray-800 rounded-xl text-white font-medium transition-all hover:scale-[1.02]">
                                Find Food
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}