import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Star, User } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewsSection({ restaurantId }) {
    const { data: reviews = [], isLoading } = useQuery({
        queryKey: ['restaurant-reviews', restaurantId],
        queryFn: async () => {
            const allReviews = await base44.entities.Review.filter({ restaurant_id: restaurantId }, '-created_date', 50);
            // Only show approved reviews (or reviews without moderation status for backward compatibility)
            return allReviews.filter(r => !r.moderation_status || r.moderation_status === 'approved');
        },
        enabled: !!restaurantId,
    });

    const averageRating = reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : '0.0';

    const ratingDistribution = React.useMemo(() => {
        const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach(review => {
            dist[review.rating] = (dist[review.rating] || 0) + 1;
        });
        return dist;
    }, [reviews]);

    if (isLoading) {
        return (
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Reviews</h2>
                <Skeleton className="h-32 w-full mb-4" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Reviews</h2>

            {reviews.length > 0 ? (
                <>
                    {/* Ratings Summary */}
                    <Card className="mb-6">
                        <CardContent className="pt-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="text-center">
                                    <div className="text-5xl font-bold text-gray-900 mb-2">{averageRating}</div>
                                    <div className="flex items-center justify-center gap-1 mb-2">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`h-5 w-5 ${
                                                    star <= Math.round(averageRating)
                                                        ? 'fill-orange-400 text-orange-400'
                                                        : 'text-gray-300'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                    <p className="text-gray-600">{reviews.length} reviews</p>
                                </div>

                                <div className="space-y-2">
                                    {[5, 4, 3, 2, 1].map((rating) => {
                                        const count = ratingDistribution[rating];
                                        const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                                        return (
                                            <div key={rating} className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-3">{rating}</span>
                                                <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
                                                <div className="flex-1 bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className="bg-orange-400 h-2 rounded-full transition-all"
                                                        style={{ width: `${percentage}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm text-gray-600 w-8 text-right">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Individual Reviews */}
                    <div className="space-y-4">
                        {reviews.map((review) => (
                            <Card key={review.id}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                                            <User className="h-5 w-5 text-orange-600" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <h4 className="font-semibold text-gray-900">
                                                        {review.customer_name || 'Anonymous'}
                                                    </h4>
                                                    <p className="text-xs text-gray-500">
                                                        {format(new Date(review.created_date), 'MMM d, yyyy')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {[1, 2, 3, 4, 5].map((star) => (
                                                        <Star
                                                            key={star}
                                                            className={`h-4 w-4 ${
                                                                star <= review.rating
                                                                    ? 'fill-orange-400 text-orange-400'
                                                                    : 'text-gray-300'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            {review.review_text && (
                                                <p className="text-gray-700 mb-3">{review.review_text}</p>
                                            )}
                                            {review.restaurant_response && (
                                                <div className="bg-gray-50 rounded-lg p-3 mt-3">
                                                    <p className="text-xs font-semibold text-gray-700 mb-1">
                                                        Restaurant Response:
                                                    </p>
                                                    <p className="text-sm text-gray-600">{review.restaurant_response}</p>
                                                    {review.response_date && (
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            {format(new Date(review.response_date), 'MMM d, yyyy')}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </>
            ) : (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Star className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No reviews yet</p>
                        <p className="text-sm text-gray-400">Be the first to review this restaurant!</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}