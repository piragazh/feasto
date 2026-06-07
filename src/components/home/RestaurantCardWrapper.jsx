import React from 'react';
import RestaurantCard from './RestaurantCard';
import RestaurantCardHorizontal from './RestaurantCardHorizontal';
import RestaurantCardDark from './RestaurantCardDark';

export default function RestaurantCardWrapper({ restaurant, distance, showFavoriteButton = true }) {
    const style = restaurant.card_style || 'standard';

    if (style === 'horizontal') {
        return <RestaurantCardHorizontal restaurant={restaurant} distance={distance} showFavoriteButton={showFavoriteButton} />;
    }
    if (style === 'dark_minimal') {
        return <RestaurantCardDark restaurant={restaurant} distance={distance} showFavoriteButton={showFavoriteButton} />;
    }
    return <RestaurantCard restaurant={restaurant} distance={distance} showFavoriteButton={showFavoriteButton} />;
}