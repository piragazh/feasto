import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { useGeolocation, reverseGeocode } from './useGeolocation';
import { toast } from 'sonner';

// UK postcode regex
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export default function LocationPicker({ onLocationSelect, className = '', value = '' }) {
    const [address, setAddress] = useState(value);
    const { location, loading, getCurrentLocation } = useGeolocation();
    const [isGettingAddress, setIsGettingAddress] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const autocompleteRef = useRef(null);
    const [geocodingAddress, setGeocodingAddress] = useState(false);
    const debounceRef = useRef(null);

    useEffect(() => {
        setAddress(value);
    }, [value]);

    // Handle GPS location resolved
    useEffect(() => {
        if (location) {
            setIsGettingAddress(true);
            reverseGeocode(location.latitude, location.longitude)
                .then(addr => {
                    setAddress(addr);
                    onLocationSelect({
                        address: addr,
                        coordinates: { lat: location.latitude, lng: location.longitude }
                    });
                    toast.success('Location detected!');
                })
                .catch(() => toast.error('Failed to get address'))
                .finally(() => setIsGettingAddress(false));
        }
    }, [location]);

    const geocodeAddress = async (text) => {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=GB&limit=5&addressdetails=1`
        );
        const results = await response.json();
        return results.map(r => ({
            address: r.display_name,
            coordinates: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) }
        }));
    };

    const handleAddressChange = (e) => {
        const val = e.target.value;
        setAddress(val);

        if (val.length < 3) {
            setSuggestions([]);
            setShowSuggestions(false);
            onLocationSelect({ address: val, coordinates: null });
            clearTimeout(debounceRef.current);
            return;
        }

        // Clear previous debounce
        clearTimeout(debounceRef.current);

        // Debounce: wait 400ms after user stops typing
        debounceRef.current = setTimeout(async () => {
            setGeocodingAddress(true);
            try {
                // If it looks like a UK postcode, search immediately
                const query = UK_POSTCODE_RE.test(val.trim()) ? `${val.trim()}, UK` : val;
                const results = await geocodeAddress(query);
                if (results.length > 0) {
                    setSuggestions(results);
                    setShowSuggestions(true);
                } else {
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } catch (err) {
                console.error('Geocoding error:', err);
                setSuggestions([]);
            } finally {
                setGeocodingAddress(false);
            }
        }, 400);
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
                {geocodingAddress && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin z-10" />
                )}
                <Input
                    ref={autocompleteRef}
                    placeholder="Enter postcode or street address..."
                    value={address}
                    onChange={handleAddressChange}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    className="pl-10"
                />
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-56 overflow-y-auto">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onMouseDown={() => handleSuggestionClick(suggestion)}
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
                type="button"
                onClick={() => getCurrentLocation()}
                disabled={loading || isGettingAddress}
                variant="outline"
                className="shrink-0"
            >
                {(loading || isGettingAddress) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Navigation className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Use Location</span>
            </Button>
        </div>
    );
}