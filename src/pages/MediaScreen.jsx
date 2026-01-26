import React, { useState, useEffect } from 'react';
import ScreenDisplay from '@/components/mediascreen/ScreenDisplay';

export default function MediaScreen() {
    const [restaurantId, setRestaurantId] = useState(null);
    const [screenName, setScreenName] = useState(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        setRestaurantId(params.get('restaurantId'));
        setScreenName(params.get('screenName') || 'Main Screen');
    }, []);

    return (
        <ScreenDisplay restaurantId={restaurantId} screenName={screenName} />
    );
}