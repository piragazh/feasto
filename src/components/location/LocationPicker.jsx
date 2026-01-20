import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { useGeolocation, reverseGeocode } from './useGeolocation';
import { toast } from 'sonner';

export default function LocationPicker({ onLocationSelect, className = '', value = '' }) {
    const [address, setAddress] = useState(value);
    const { location, loading, getCurrentLocation } = useGeolocation();
    const [isGettingAddress, setIsGettingAddress] = useState(false);

    // Update internal state when value prop changes
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

    return (
        <div className={`flex gap-2 ${className}`}>
            <div className="flex-1 relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                    placeholder="Enter delivery address..."
                    value={address}
                    onChange={(e) => {
                        setAddress(e.target.value);
                        onLocationSelect({ address: e.target.value, coordinates: null });
                    }}
                    className="pl-10"
                />
            </div>
            <Button
                onClick={handleUseCurrentLocation}
                disabled={loading || isGettingAddress}
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