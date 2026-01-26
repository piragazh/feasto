import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, MessageSquare, Utensils, Clock, User, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ReviewManagement({ restaurantId }) {
    const [respondingTo, setRespondingTo] = useState(null);
    const [responseText, setResponseText] = useState('');
    const queryClient = useQueryClient();

    const { data: reviews = [] } = useQuery({
        queryKey: ['restaurant-reviews', restaurantId],
        queryFn: () => base44.entities.Review.filter({ 
            restaurant_id: restaurantId,
            moderation_status: 'approved'
        }),
        enabled: !!restaurantId,
    });

    const respondMutation = useMutation({
        mutationFn: ({ reviewId, response }) => 
            base44.entities.Review.update(reviewId, {
                restaurant_response: response,
                response_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-reviews']);
            toast.success('Response posted successfully');
            setRespondingTo(null);
            setResponseText('');
        },
    });

    const handleRespond = (review) => {
        setRespondingTo(review);
        setResponseText(review.restaurant_response || '');
    };

    const handleSubmitResponse = () => {
        if (!responseText.trim()) {
            toast.error('Please enter a response');
            return;
        }

        respondMutation.mutate({
            reviewId: respondingTo.id,
            response: responseText
        });
    };

    const averageRatings = reviews.reduce((acc, review) => {
        acc.overall += review.rating || 0;
        acc.food += review.food_quality_rating || 0;
        acc.delivery += review.delivery_time_rating || 0;
        acc.driver += review.driver_service_rating || 0;
        acc.count++;
        return acc;
    }, { overall: 0, food: 0, delivery: 0, driver: 0, count: 0 });

    const avgStats = reviews.length > 0 ? {
        overall: (averageRatings.overall / reviews.length).toFixed(1),
        food: (averageRatings.food / reviews.length).toFixed(1),
        delivery: (averageRatings.delivery / reviews.length).toFixed(1),
        driver: (averageRatings.driver / reviews.length).toFixed(1)
    } : { overall: 0, food: 0, delivery: 0, driver: 0 };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Customer Reviews & Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="text-center p-4 bg-yellow-50 rounded-lg">
                            <Star className="h-6 w-6 text-yellow-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{avgStats.overall}</div>
                            <div className="text-xs text-gray-600">Overall</div>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                            <Utensils className="h-6 w-6 text-orange-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{avgStats.food}</div>
                            <div className="text-xs text-gray-600">Food Quality</div>
                        </div>
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <Clock className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{avgStats.delivery}</div>
                            <div className="text-xs text-gray-600">Delivery Time</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                            <User className="h-6 w-6 text-green-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{avgStats.driver}</div>
                            <div className="text-xs text-gray-600">Driver Service</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {reviews.map((review) => (
                            <Card key={review.id} className="border-l-4 border-l-yellow-400">
                                <CardContent className="pt-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="font-semibold">{review.customer_name}</span>
                                                <div className="flex">
                                                    {[...Array(5)].map((_, i) => (
                                                        <Star
                                                            key={i}
                                                            className={`h-4 w-4 ${
                                                                i < review.rating
                                                                    ? 'fill-yellow-400 text-yellow-400'
                                                                    : 'text-gray-300'
                                                            }`}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {review.food_quality_rating && (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Utensils className="h-3 w-3 mr-1" />
                                                        Food: {review.food_quality_rating}/5
                                                    </Badge>
                                                )}
                                                {review.delivery_time_rating && (
                                                    <Badge variant="outline" className="text-xs">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        Delivery: {review.delivery_time_rating}/5
                                                    </Badge>
                                                )}
                                                {review.driver_service_rating && (
                                                    <Badge variant="outline" className="text-xs">
                                                        <User className="h-3 w-3 mr-1" />
                                                        Driver: {review.driver_service_rating}/5
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-500">
                                            {moment(review.created_date).fromNow()}
                                        </span>
                                    </div>

                                    {review.review_text && (
                                        <p className="text-gray-700 mb-4">{review.review_text}</p>
                                    )}

                                    {review.restaurant_response ? (
                                        <div className="bg-blue-50 p-4 rounded-lg mt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MessageSquare className="h-4 w-4 text-blue-600" />
                                                <span className="text-sm font-semibold text-blue-900">Your Response</span>
                                                <span className="text-xs text-gray-500 ml-auto">
                                                    {moment(review.response_date).fromNow()}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700">{review.restaurant_response}</p>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleRespond(review)}
                                                className="mt-2"
                                            >
                                                Edit Response
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={() => handleRespond(review)}
                                            variant="outline"
                                            className="mt-2"
                                        >
                                            <MessageSquare className="h-4 w-4 mr-2" />
                                            Respond to Review
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}

                        {reviews.length === 0 && (
                            <div className="text-center py-12 text-gray-500">
                                No reviews yet. Encourage customers to leave feedback!
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!respondingTo} onOpenChange={() => setRespondingTo(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Respond to Review</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {respondingTo && (
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-semibold">{respondingTo.customer_name}</span>
                                    <div className="flex">
                                        {[...Array(5)].map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`h-3 w-3 ${
                                                    i < respondingTo.rating
                                                        ? 'fill-yellow-400 text-yellow-400'
                                                        : 'text-gray-300'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-700">{respondingTo.review_text}</p>
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-medium mb-2 block">Your Response</label>
                            <Textarea
                                value={responseText}
                                onChange={(e) => setResponseText(e.target.value)}
                                placeholder="Thank you for your feedback..."
                                rows={4}
                            />
                        </div>

                        <div className="flex gap-3">
                            <Button onClick={handleSubmitResponse} className="flex-1">
                                Post Response
                            </Button>
                            <Button onClick={() => setRespondingTo(null)} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}