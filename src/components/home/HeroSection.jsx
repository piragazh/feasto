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
            
            <div className="relative max-w-6xl mx-auto px-4 py-8 md:py-12">
                <div className="max-w-2xl">
                    <h1 className="text-2xl md:text-4xl font-bold text-white mb-3 leading-tight">
                        Delicious food,<br />
                        <span className="text-orange-100">delivered to you</span>
                    </h1>
                    <p className="text-orange-100 text-sm md:text-base mb-6">
                        Order from your favorite local restaurants with just a few taps
                    </p>
                    
                    <div className="bg-white rounded-xl p-1.5 shadow-xl shadow-orange-600/20">
                        <div className="flex flex-col md:flex-row gap-1.5">
                            <div className="flex-1">
                                <LocationPicker 
                                    onLocationSelect={onLocationChange}
                                    className="[&>div]:border-0 [&>div]:bg-gray-50 [&>div]:rounded-lg [&>button]:h-11 [&>button]:rounded-lg"
                                />
                            </div>
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                                <Input
                                    type="text"
                                    placeholder="Search restaurants..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 h-11 border-0 bg-gray-50 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-orange-500"
                                />
                            </div>
                            <Button className="h-11 px-6 bg-gray-900 hover:bg-gray-800 rounded-lg text-white text-sm font-medium transition-all hover:scale-[1.02]">
                                Find Food
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}