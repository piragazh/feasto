// TableOrder page - loaded when a customer scans a QR code on their table
// It reads ?restaurant_id= and ?table_id= from the URL, then redirects to the
// Restaurant page with those params so the customer can browse and order.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';

export default function TableOrder() {
    const navigate = useNavigate();
    const urlParams = new URLSearchParams(window.location.search);
    const restaurantId = urlParams.get('restaurant_id');
    const tableId = urlParams.get('table_id');
    const [status, setStatus] = useState('Loading your table...');

    useEffect(() => {
        if (!restaurantId || !tableId) {
            setStatus('Invalid QR code. Please ask staff for assistance.');
            return;
        }

        const init = async () => {
            try {
                // Store dine-in context for the Restaurant page to pick up
                sessionStorage.setItem('dineIn_tableId', tableId);
                sessionStorage.setItem('dineIn_restaurantId', restaurantId);

                // Fetch table info for display
                const tables = await base44.entities.RestaurantTable.filter({ id: tableId, restaurant_id: restaurantId });
                const table = tables?.[0];
                if (table) {
                    setStatus(`Welcome to ${table.table_number}! Redirecting to menu...`);
                }

                // Redirect to the restaurant menu page
                setTimeout(() => {
                    navigate(createPageUrl('Restaurant') + `?id=${restaurantId}&table_id=${tableId}`);
                }, 800);
            } catch {
                // Even on error, still redirect to menu
                navigate(createPageUrl('Restaurant') + `?id=${restaurantId}&table_id=${tableId}`);
            }
        };

        init();
    }, [restaurantId, tableId]);

    return (
        <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
            <div className="text-center">
                <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <span className="text-4xl">🍽️</span>
                </div>
                <p className="text-xl font-semibold text-gray-800">{status}</p>
            </div>
        </div>
    );
}