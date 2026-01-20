import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { useGeolocation, reverseGeocode } from './useGeolocation';
import { toast } from 'sonner';

export default function LocationPicker({ onLocationSelect, className = '', value = '' }) {
    const [address, setAddress] = useState(value);
    const { location, loading, getCurrentLocation } = useGeolocation();
    const [isGettingAddress, setIsGettingAddress] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteRef = useRef(null);
    const [geocodingAddress, setGeocodingAddress] = useState(false);

    React.useEffect(() => {
        setAddress(value);
    }, [value]);

    const handleUseCurrentLocation = async () => {
        getCurrentLocation();
    };

    React.useEffect(() => {
        if (location) {
            setIsGettingAddress(true);
            reverseGeocode(location.latitude, location.longitude)
                .then(addr => {
                    setAddress(addr);
                    onLocationSelect({
                        address: addr,
                        coordinates: {
                            lat: location.latitude,
                            lng: location.longitude
                        }
                    });
                    toast.success('Location detected!');
                })
                .catch(err => {
                    console.error(err);
                    toast.error('Failed to get address');
                })
                .finally(() => setIsGettingAddress(false));
        }
    }, [location]);

    const handleAddressChange = (e) => {
        const value = e.target.value;
        setAddress(value);
        
        if (value.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            onLocationSelect({ address: value, coordinates: null });
            return;
        }

        // Geocode the address to get coordinates
        setGeocodingAddress(true);
        geocodeAddress(value)
            .then(results => {
                if (results && results.length > 0) {
                    setSuggestions(results);
                    setShowSuggestions(true);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                    onLocationSelect({ address: value, coordinates: null });
                }
            })
            .catch(err => {
                console.error('Geocoding error:', err);
                setSuggestions([]);
                onLocationSelect({ address: value, coordinates: null });
            })
            .finally(() => setGeocodingAddress(false));
    };

    const geocodeAddress = async (addressText) => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressText)}&countrycodes=GB&limit=5`
            );
            const results = await response.json();
            return results.map(result => ({
                address: result.display_name,
                coordinates: {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon)
                }
            }));
        } catch (error) {
            console.error('Geocoding failed:', error);
            return [];
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setAddress(suggestion.address);
        onLocationSelect(suggestion);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    return (
        <div className={`flex gap-2 ${className}`}>
            <div className="flex-1 relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                <Input
                    ref={autocompleteRef}
                    placeholder="Enter delivery address..."
                    value={address}
                    onChange={handleAddressChange}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    className="pl-10"
                />
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => handleSuggestionClick(suggestion)}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm text-gray-700 border-b last:border-b-0"
                            >
                                <div className="flex items-start gap-2">
                                    <MapPin className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                                    <span className="line-clamp-2">{suggestion.address}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <Button
                onClick={handleUseCurrentLocation}
                disabled={loading || isGettingAddress || geocodingAddress}
                variant="outline"
                className="shrink-0"
            >
                {(loading || isGettingAddress) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Navigation className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Use Current Location</span>
            </Button>
        </div>
    );
}