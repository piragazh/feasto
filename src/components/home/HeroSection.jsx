import React from 'react';
import { Search } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LocationPicker from '@/components/location/LocationPicker';

export default function HeroSection({ searchQuery, setSearchQuery, onLocationChange }) {
    return (
        <div className="relative bg-gradient-to-br from-orange-500 via-orange-400 to-amber-400 overflow-hidden">
            {/* Animated decorative blobs */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 left-10 w-32 h-32 rounded-full bg-white blur-2xl animate-pulse"></div>
                <div className="absolute bottom-20 right-20 w-48 h-48 rounded-full bg-white blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute top-1/2 left-1/3 w-24 h-24 rounded-full bg-white blur-2xl animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>
            
            <div className="relative max-w-6xl mx-auto px-4 py-8 md:py-12">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg mb-4">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        <span className="text-sm font-semibold text-gray-800">Live ordering • Fast delivery</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 leading-tight tracking-tight">
                        Delicious food,<br />
                        <span className="bg-white text-transparent bg-clip-text">delivered to you</span>
                    </h1>
                    <p className="text-white/90 text-base md:text-lg mb-6 font-medium">
                        Order from your favorite local restaurants with just a few taps
                    </p>
                    
                    <div className="bg-white rounded-2xl p-2 shadow-2xl shadow-orange-600/30">
                        <div className="flex flex-col md:flex-row gap-2">
                            <div className="flex-1">
                                <LocationPicker 
                                    onLocationSelect={onLocationChange}
                                    className="[&>div]:border-0 [&>div]:bg-gray-50 [&>div]:rounded-xl [&>button]:h-12 [&>button]:rounded-xl"
                                />
                            </div>
                            <div className="flex-1 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
                                <Input
                                    type="text"
                                    placeholder="Search restaurants..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-12 h-12 border-0 bg-gray-50 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-orange-500"
                                />
                            </div>
                            <Button className="h-12 px-8 bg-gradient-to-r from-gray-900 to-gray-800 hover:from-gray-800 hover:to-gray-700 rounded-xl text-white text-sm font-semibold transition-all hover:scale-[1.02] shadow-lg">
                                Find Food
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}