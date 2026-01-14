import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, Truck, Store, Star, Award, Facebook, Instagram, Twitter, Globe, Trophy } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Fix Leaflet marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function RestaurantInfoDialog({ open, onClose, restaurant }) {
    if (!restaurant) return null;

    const hasLocation = restaurant.latitude && restaurant.longitude;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Store className="h-5 w-5 text-orange-500" />
                            Restaurant Information
                        </div>
                        <span className="text-xs text-gray-400 font-normal">ID: {restaurant.id}</span>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Food Hygiene Rating */}
                    {restaurant.food_hygiene_rating !== null && restaurant.food_hygiene_rating !== undefined && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-start gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Award className="h-5 w-5 text-green-600" />
                                        <h3 className="font-semibold text-green-900">Food Hygiene Rating</h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="bg-green-600 text-white text-3xl font-bold rounded-lg px-4 py-2">
                                            {restaurant.food_hygiene_rating}
                                        </div>
                                        <div className="flex gap-1">
                                            {[...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    className={`h-6 w-6 ${
                                                        i < restaurant.food_hygiene_rating
                                                            ? 'fill-green-500 text-green-500'
                                                            : 'text-gray-300'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-sm text-green-700 mt-2">
                                        {restaurant.food_hygiene_rating === 5 && 'Very Good - Hygiene standards are very good'}
                                        {restaurant.food_hygiene_rating === 4 && 'Good - Hygiene standards are good'}
                                        {restaurant.food_hygiene_rating === 3 && 'Generally Satisfactory - Hygiene standards are generally satisfactory'}
                                        {restaurant.food_hygiene_rating < 3 && 'Improvement Necessary'}
                                    </p>
                                </div>
                                {restaurant.food_hygiene_certificate_url && (
                                    <a
                                        href={restaurant.food_hygiene_certificate_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-shrink-0"
                                    >
                                        <img
                                            src={restaurant.food_hygiene_certificate_url}
                                            alt="Food Hygiene Certificate"
                                            className="w-24 h-24 object-contain border rounded-lg bg-white cursor-pointer hover:scale-105 transition-transform"
                                        />
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {/* About */}
                    {restaurant.description && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-2">About</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">{restaurant.description}</p>
                        </div>
                    )}

                    {/* Location */}
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-orange-500" />
                            Location
                        </h3>
                        <p className="text-gray-600 text-sm mb-3">{restaurant.address}</p>
                        
                        {hasLocation && (
                            <div className="h-64 rounded-lg overflow-hidden border">
                                <MapContainer
                                    center={[restaurant.latitude, restaurant.longitude]}
                                    zoom={15}
                                    style={{ height: '100%', width: '100%' }}
                                    scrollWheelZoom={false}
                                >
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    <Marker position={[restaurant.latitude, restaurant.longitude]}>
                                        <Popup>{restaurant.name}</Popup>
                                    </Marker>
                                </MapContainer>
                            </div>
                        )}
                    </div>

                    {/* Opening Hours */}
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Clock className="h-5 w-5 text-orange-500" />
                            Opening Hours
                        </h3>
                        <div className="space-y-2">
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((dayKey, idx) => {
                                const hours = restaurant.opening_hours?.[dayKey];
                                const dayName = DAYS[idx];

                                return (
                                    <div key={dayKey} className="flex justify-between text-sm border-b pb-2">
                                        <span className="font-medium text-gray-700">{dayName}</span>
                                        <span className="text-gray-600">
                                            {!hours || hours.closed ? (
                                                <Badge variant="secondary">Closed</Badge>
                                            ) : (
                                                `${hours.open || '09:00'} - ${hours.close || '22:00'}`
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Delivery Hours */}
                    <div>
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Truck className="h-5 w-5 text-orange-500" />
                            Delivery Hours
                        </h3>
                        <div className="space-y-2">
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((dayKey, idx) => {
                                const hours = restaurant.delivery_hours?.[dayKey];
                                const dayName = DAYS[idx];

                                return (
                                    <div key={dayKey} className="flex justify-between text-sm border-b pb-2">
                                        <span className="font-medium text-gray-700">{dayName}</span>
                                        <span className="text-gray-600">
                                            {!hours || hours.closed ? (
                                                <Badge variant="secondary">No Delivery</Badge>
                                            ) : (
                                                `${hours.open || '09:00'} - ${hours.close || '22:00'}`
                                            )}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Collection Hours */}
                    {restaurant.collection_enabled && restaurant.collection_hours && Object.keys(restaurant.collection_hours).length > 0 && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Store className="h-5 w-5 text-orange-500" />
                                Collection Hours
                            </h3>
                            <div className="space-y-2">
                                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((dayKey, idx) => {
                                    const hours = restaurant.collection_hours[dayKey];
                                    const dayName = DAYS[idx];

                                    return (
                                        <div key={dayKey} className="flex justify-between text-sm border-b pb-2">
                                            <span className="font-medium text-gray-700">{dayName}</span>
                                            <span className="text-gray-600">
                                                {!hours || hours.closed ? (
                                                    <Badge variant="secondary">No Collection</Badge>
                                                ) : (
                                                    `${hours.open || '09:00'} - ${hours.close || '22:00'}`
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Gallery Photos */}
                    {restaurant.gallery_images && restaurant.gallery_images.length > 0 && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Award className="h-5 w-5 text-orange-500" />
                                Gallery
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {restaurant.gallery_images.map((image, idx) => (
                                    <img
                                        key={idx}
                                        src={image}
                                        alt={`${restaurant.name} photo ${idx + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border hover:scale-105 transition-transform cursor-pointer"
                                        onClick={() => window.open(image, '_blank')}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Awards & Certifications */}
                    {restaurant.awards_certifications && restaurant.awards_certifications.length > 0 && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-orange-500" />
                                Awards & Certifications
                            </h3>
                            <div className="space-y-4">
                                {restaurant.awards_certifications.map((award, idx) => (
                                    <div key={idx} className="flex gap-4 p-4 border rounded-lg bg-gray-50">
                                        {award.image_url && (
                                            <img
                                                src={award.image_url}
                                                alt={award.title}
                                                className="w-20 h-20 object-contain border rounded bg-white"
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h4 className="font-semibold text-gray-900">{award.title}</h4>
                                            {award.issuer && (
                                                <p className="text-sm text-gray-600">
                                                    {award.issuer} {award.year && `• ${award.year}`}
                                                </p>
                                            )}
                                            {award.description && (
                                                <p className="text-sm text-gray-500 mt-1">{award.description}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Social Media */}
                    {restaurant.social_media && Object.values(restaurant.social_media).some(url => url) && (
                        <div>
                            <h3 className="font-semibold text-gray-900 mb-3">Follow Us</h3>
                            <div className="flex flex-wrap gap-3">
                                {restaurant.social_media.facebook && (
                                    <a
                                        href={restaurant.social_media.facebook}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        <Facebook className="h-5 w-5 text-blue-600" />
                                        <span className="text-sm font-medium">Facebook</span>
                                    </a>
                                )}
                                {restaurant.social_media.instagram && (
                                    <a
                                        href={restaurant.social_media.instagram}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        <Instagram className="h-5 w-5 text-pink-600" />
                                        <span className="text-sm font-medium">Instagram</span>
                                    </a>
                                )}
                                {restaurant.social_media.twitter && (
                                    <a
                                        href={restaurant.social_media.twitter}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        <Twitter className="h-5 w-5 text-blue-400" />
                                        <span className="text-sm font-medium">Twitter</span>
                                    </a>
                                )}
                                {restaurant.social_media.website && (
                                    <a
                                        href={restaurant.social_media.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        <Globe className="h-5 w-5 text-gray-600" />
                                        <span className="text-sm font-medium">Website</span>
                                    </a>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}