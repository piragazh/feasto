import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Star, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

export default function ReviewsList({ restaurantId }) {
    const { data: reviews = [], isLoading } = useQuery({
        queryKey: ['reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ restaurant_id: restaurantId }, '-created_date'),
    });

    if (isLoading) return <div className="text-center py-4">Loading reviews...</div>;

    if (reviews.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No reviews yet. Be the first to review!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {reviews.map((review) => (
                <Card key={review.id}>
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <p className="font-semibold">{review.customer_name || 'Customer'}</p>
                                <div className="flex items-center gap-1 mt-1">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <Star
                                            key={star}
                                            className={`h-4 w-4 ${
                                                star <= review.rating
                                                    ? 'fill-yellow-400 text-yellow-400'
                                                    : 'text-gray-300'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <span className="text-sm text-gray-500">
                                {format(new Date(review.created_date), 'MMM d, yyyy')}
                            </span>
                        </div>
                        
                        {review.review_text && (
                            <p className="text-gray-700 mb-3">{review.review_text}</p>
                        )}

                        {review.restaurant_response && (
                            <div className="bg-gray-50 p-3 rounded-lg border-l-4 border-orange-500">
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                    Response from Restaurant
                                </p>
                                <p className="text-sm text-gray-700">{review.restaurant_response}</p>
                                {review.response_date && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        {format(new Date(review.response_date), 'MMM d, yyyy')}
                                    </p>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}