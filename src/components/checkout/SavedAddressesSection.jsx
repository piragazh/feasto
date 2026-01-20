import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';

export default function SavedAddressesSection({ onAddressSelect }) {
    const [savedAddresses, setSavedAddresses] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
        loadSavedAddresses();
    }, []);

    const loadSavedAddresses = async () => {
        try {
            const userData = await base44.auth.me();
            if (userData.saved_addresses && userData.saved_addresses.length > 0) {
                setSavedAddresses(userData.saved_addresses);
            }
        } catch (error) {
            console.error('Failed to load saved addresses:', error);
        }
    };

    if (savedAddresses.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">Saved Addresses</p>
            <div className="space-y-2">
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
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-orange-300'
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <MapPin className={`h-4 w-4 mt-0.5 ${
                                selectedIndex === index ? 'text-orange-500' : 'text-gray-400'
                            }`} />
                            <div className="flex-1">
                                <p className="font-medium text-sm text-gray-900">
                                    {address.label || 'Saved Address'}
                                </p>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {address.door_number && `${address.door_number}, `}
                                    {address.address}
                                </p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            <div className="pt-1 border-t">
                <p className="text-xs text-gray-500">Or enter a new address below</p>
            </div>
        </div>
    );
}