import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Home, Briefcase, MapPin, Star } from 'lucide-react';

export default function SavedAddressesSection({ onAddressSelect }) {
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(null);

    useEffect(() => {
        loadSavedAddresses();
    }, []);

    const loadSavedAddresses = async () => {
        try {
            const userData = await base44.auth.me();
            if (userData.saved_addresses && userData.saved_addresses.length > 0) {
                setSavedAddresses(userData.saved_addresses);
                
                // Auto-select default address if exists
                const defaultIndex = userData.saved_addresses.findIndex(addr => addr.is_default);
                if (defaultIndex !== -1) {
                    setSelectedIndex(defaultIndex);
                    onAddressSelect(userData.saved_addresses[defaultIndex]);
                }
            }
        } catch (error) {
            console.error('Failed to load saved addresses:', error);
        }
    };

    const getAddressIcon = (label) => {
        switch (label) {
            case 'Home':
                return <Home className="h-4 w-4" />;
            case 'Work':
                return <Briefcase className="h-4 w-4" />;
            default:
                return <MapPin className="h-4 w-4" />;
        }
    };

    const getAddressEmoji = (label) => {
        switch (label) {
            case 'Home':
                return '🏠';
            case 'Work':
                return '💼';
            default:
                return '📍';
        }
    };

    if (savedAddresses.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3 pb-3 border-b">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Your Saved Addresses</p>
                <Badge variant="secondary" className="text-xs">
                    {savedAddresses.length} saved
                </Badge>
            </div>
            <div className="grid gap-2">
                {savedAddresses.map((address, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => {
                            setSelectedIndex(index);
                            onAddressSelect(address);
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                            selectedIndex === index
                                ? 'border-orange-500 bg-orange-50 shadow-sm'
                                : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${
                                selectedIndex === index ? 'bg-orange-100' : 'bg-gray-100'
                            }`}>
                                <div className={selectedIndex === index ? 'text-orange-600' : 'text-gray-500'}>
                                    {getAddressIcon(address.label)}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold text-sm text-gray-900">
                                        {getAddressEmoji(address.label)} {address.label || 'Address'}
                                    </p>
                                    {address.is_default && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                                            <Star className="h-2.5 w-2.5 mr-0.5 fill-orange-500 text-orange-500" />
                                            Default
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-gray-600 line-clamp-1">
                                    {address.door_number && `${address.door_number}, `}
                                    {address.address}
                                </p>
                                {address.instructions && (
                                    <p className="text-[11px] text-gray-500 mt-1 italic line-clamp-1">
                                        {address.instructions}
                                    </p>
                                )}
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                selectedIndex === index
                                    ? 'border-orange-500 bg-orange-500'
                                    : 'border-gray-300'
                            }`}>
                                {selectedIndex === index && (
                                    <div className="w-2 h-2 bg-white rounded-full" />
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <p className="text-xs text-gray-500 pt-1">Or enter a new address below</p>
        </div>
    );
}