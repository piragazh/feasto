import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import ReviewModeration from './ReviewModeration';

export default function ReviewsManagement({ restaurantId }) {
    const [activeTab, setActiveTab] = useState('moderation');
    const [respondingTo, setRespondingTo] = useState(null);
    const [responseText, setResponseText] = useState('');
    const queryClient = useQueryClient();

    const { data: reviews = [], isLoading } = useQuery({
        queryKey: ['restaurant-reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ restaurant_id: restaurantId }, '-created_date'),
    });

    const respondMutation = useMutation({
        mutationFn: ({ reviewId, response }) =>
            base44.entities.Review.update(reviewId, {
                restaurant_response: response,
                response_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-reviews']);
            toast.success('Response posted');
            setRespondingTo(null);
            setResponseText('');
        },
    });

    const handleRespond = (reviewId) => {
        if (!responseText.trim()) return;
        respondMutation.mutate({ reviewId, response: responseText });
    };

    const averageRating = reviews.length > 0
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : 0;

    if (isLoading) return <div className="text-center py-4">Loading reviews...</div>;

    return (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6">
                <TabsTrigger value="moderation">Review Moderation</TabsTrigger>
                <TabsTrigger value="statistics">Statistics</TabsTrigger>
            </TabsList>

            <TabsContent value="moderation">
                <ReviewModeration restaurantId={restaurantId} />
            </TabsContent>

            <TabsContent value="statistics">
                <div>
            <div className="mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-bold">Customer Reviews</h2>
                    <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-lg">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="font-bold text-lg">{averageRating}</span>
                        <span className="text-gray-600">({reviews.length} reviews)</span>
                    </div>
                </div>
            </div>

            {reviews.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-16">
                        <MessageSquare className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Reviews Yet</h3>
                        <p className="text-gray-500">Customer reviews will appear here</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {reviews.map((review) => (
                        <Card key={review.id}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="font-semibold text-lg">{review.customer_name || 'Customer'}</p>
                                        <div className="flex items-center gap-1 mt-1">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <Star
                                                    key={star}
                                                    className={`h-5 w-5 ${
                                                        star <= review.rating
                                                            ? 'fill-yellow-400 text-yellow-400'
                                                            : 'text-gray-300'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-500">
                                        {format(new Date(review.created_date), 'MMM d, yyyy h:mm a')}
                                    </span>
                                </div>

                                {review.review_text && (
                                    <p className="text-gray-700 mb-3 text-base">{review.review_text}</p>
                                )}

                                <p className="text-xs text-gray-500 mb-3">
                                    Order #{review.order_id?.slice(-6)}
                                </p>

                                {review.restaurant_response ? (
                                    <div className="bg-orange-50 p-3 rounded-lg border-l-4 border-orange-500">
                                        <p className="text-sm font-semibold text-gray-900 mb-1">Your Response</p>
                                        <p className="text-sm text-gray-700">{review.restaurant_response}</p>
                                        {review.response_date && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                {format(new Date(review.response_date), 'MMM d, yyyy')}
                                            </p>
                                        )}
                                    </div>
                                ) : respondingTo === review.id ? (
                                    <div className="space-y-2">
                                        <Textarea
                                            placeholder="Write your response..."
                                            value={responseText}
                                            onChange={(e) => setResponseText(e.target.value)}
                                            rows={3}
                                            autoFocus
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleRespond(review.id)}
                                                disabled={respondMutation.isPending}
                                                className="bg-orange-500 hover:bg-orange-600"
                                            >
                                                Post Response
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setRespondingTo(null);
                                                    setResponseText('');
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setRespondingTo(review.id)}
                                    >
                                        <MessageSquare className="h-4 w-4 mr-2" />
                                        Respond to Review
                                    </Button>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}