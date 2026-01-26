import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, AlertCircle, CheckCircle, XCircle, Flag, Utensils, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function ReviewModeration() {
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [moderatingReview, setModeratingReview] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const queryClient = useQueryClient();

    const { data: allReviews = [] } = useQuery({
        queryKey: ['all-reviews'],
        queryFn: () => base44.entities.Review.list(),
    });

    const moderateMutation = useMutation({
        mutationFn: async ({ reviewId, status, reason }) => {
            const user = await base44.auth.me();
            return base44.entities.Review.update(reviewId, {
                moderation_status: status,
                rejection_reason: reason || null,
                flagged_reason: status === 'flagged' ? reason : null,
                moderated_by: user.email,
                moderated_date: new Date().toISOString()
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['all-reviews']);
            toast.success('Review moderated successfully');
            setModeratingReview(null);
            setRejectionReason('');
        },
    });

    const filteredReviews = allReviews
        .filter(r => {
            if (filter === 'all') return true;
            return r.moderation_status === filter;
        })
        .filter(r => {
            if (!searchQuery) return true;
            return (
                r.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.review_text?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        });

    const statusCounts = {
        all: allReviews.length,
        pending: allReviews.filter(r => r.moderation_status === 'pending').length,
        approved: allReviews.filter(r => r.moderation_status === 'approved').length,
        rejected: allReviews.filter(r => r.moderation_status === 'rejected').length,
        flagged: allReviews.filter(r => r.moderation_status === 'flagged').length
    };

    const handleModerate = (review, status) => {
        if (status === 'rejected' || status === 'flagged') {
            setModeratingReview({ review, status });
        } else {
            moderateMutation.mutate({ reviewId: review.id, status });
        }
    };

    const handleSubmitModeration = () => {
        if (!rejectionReason.trim() && moderatingReview.status !== 'approved') {
            toast.error('Please provide a reason');
            return;
        }

        moderateMutation.mutate({
            reviewId: moderatingReview.review.id,
            status: moderatingReview.status,
            reason: rejectionReason
        });
    };

    const StatusBadge = ({ status }) => {
        const config = {
            pending: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
            approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
            rejected: { color: 'bg-red-100 text-red-800', icon: XCircle },
            flagged: { color: 'bg-orange-100 text-orange-800', icon: Flag }
        };

        const { color, icon: Icon } = config[status] || config.pending;

        return (
            <Badge className={color}>
                <Icon className="h-3 w-3 mr-1" />
                {status}
            </Badge>
        );
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Review Moderation</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Input
                            placeholder="Search reviews by customer name or content..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />

                        <Tabs value={filter} onValueChange={setFilter}>
                            <TabsList className="grid grid-cols-5 w-full">
                                <TabsTrigger value="all">All ({statusCounts.all})</TabsTrigger>
                                <TabsTrigger value="pending">Pending ({statusCounts.pending})</TabsTrigger>
                                <TabsTrigger value="approved">Approved ({statusCounts.approved})</TabsTrigger>
                                <TabsTrigger value="flagged">Flagged ({statusCounts.flagged})</TabsTrigger>
                                <TabsTrigger value="rejected">Rejected ({statusCounts.rejected})</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <div className="space-y-4">
                            {filteredReviews.map((review) => (
                                <Card key={review.id} className="border-l-4 border-l-blue-400">
                                    <CardContent className="pt-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex-1">
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
                                                    <StatusBadge status={review.moderation_status || 'pending'} />
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
                                                <p className="text-sm text-gray-500">
                                                    Order #{review.order_id?.slice(-8)} • {moment(review.created_date).format('MMM D, YYYY')}
                                                </p>
                                            </div>
                                        </div>

                                        {review.review_text && (
                                            <p className="text-gray-700 mb-4">{review.review_text}</p>
                                        )}

                                        {(review.rejection_reason || review.flagged_reason) && (
                                            <div className="bg-red-50 border border-red-200 p-3 rounded-lg mb-4">
                                                <p className="text-sm text-red-800">
                                                    <strong>Reason:</strong> {review.rejection_reason || review.flagged_reason}
                                                </p>
                                                {review.moderated_by && (
                                                    <p className="text-xs text-red-600 mt-1">
                                                        By {review.moderated_by} • {moment(review.moderated_date).fromNow()}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {review.restaurant_response && (
                                            <div className="bg-blue-50 p-3 rounded-lg mb-4">
                                                <p className="text-sm font-semibold text-blue-900 mb-1">Restaurant Response</p>
                                                <p className="text-sm text-gray-700">{review.restaurant_response}</p>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            {review.moderation_status !== 'approved' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleModerate(review, 'approved')}
                                                    className="bg-green-600 hover:bg-green-700"
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Approve
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleModerate(review, 'flagged')}
                                                className="text-orange-600 border-orange-600"
                                            >
                                                <Flag className="h-4 w-4 mr-1" />
                                                Flag
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleModerate(review, 'rejected')}
                                                className="text-red-600 border-red-600"
                                            >
                                                <XCircle className="h-4 w-4 mr-1" />
                                                Reject
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}

                            {filteredReviews.length === 0 && (
                                <div className="text-center py-12 text-gray-500">
                                    No reviews found
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!moderatingReview} onOpenChange={() => setModeratingReview(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {moderatingReview?.status === 'rejected' ? 'Reject Review' : 'Flag Review'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">
                            Please provide a reason for {moderatingReview?.status === 'rejected' ? 'rejecting' : 'flagging'} this review:
                        </p>

                        <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="E.g., Contains inappropriate language, spam, or violates community guidelines..."
                            rows={4}
                        />

                        <div className="flex gap-3">
                            <Button onClick={handleSubmitModeration} className="flex-1">
                                Submit
                            </Button>
                            <Button onClick={() => setModeratingReview(null)} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}