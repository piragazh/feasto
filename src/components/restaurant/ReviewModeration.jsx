import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, CheckCircle, XCircle, Flag, MessageSquare, AlertTriangle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ReviewModeration({ restaurantId, isAdmin = false }) {
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionDialog, setActionDialog] = useState({ open: false, review: null, action: null });
    const [actionReason, setActionReason] = useState('');
    const [responseText, setResponseText] = useState('');
    const queryClient = useQueryClient();

    const { data: reviews = [], isLoading } = useQuery({
        queryKey: ['moderation-reviews', restaurantId, isAdmin],
        queryFn: async () => {
            if (isAdmin) {
                // Admins see all reviews across platform
                return base44.entities.Review.list('-created_date', 200);
            } else {
                // Restaurants see their own reviews
                return base44.entities.Review.filter({ restaurant_id: restaurantId }, '-created_date');
            }
        },
    });

    const moderateMutation = useMutation({
        mutationFn: async ({ reviewId, status, reason }) => {
            const user = await base44.auth.me();
            return base44.entities.Review.update(reviewId, {
                moderation_status: status,
                ...(status === 'rejected' && { rejection_reason: reason }),
                ...(status === 'flagged' && { flagged_reason: reason }),
                moderated_by: user.email,
                moderated_date: new Date().toISOString()
            });
        },
        onSuccess: (_, { status }) => {
            queryClient.invalidateQueries(['moderation-reviews']);
            toast.success(`Review ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'flagged'}`);
            setActionDialog({ open: false, review: null, action: null });
            setActionReason('');
        },
    });

    const respondMutation = useMutation({
        mutationFn: ({ reviewId, response }) =>
            base44.entities.Review.update(reviewId, {
                restaurant_response: response,
                response_date: new Date().toISOString()
            }),
        onSuccess: () => {
            queryClient.invalidateQueries(['moderation-reviews']);
            toast.success('Response posted');
            setActionDialog({ open: false, review: null, action: null });
            setResponseText('');
        },
    });

    const filteredReviews = reviews.filter(review => {
        const matchesFilter = filter === 'all' || review.moderation_status === filter;
        const matchesSearch = !searchQuery || 
            review.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            review.review_text?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const stats = {
        pending: reviews.filter(r => r.moderation_status === 'pending').length,
        approved: reviews.filter(r => r.moderation_status === 'approved' || !r.moderation_status).length,
        rejected: reviews.filter(r => r.moderation_status === 'rejected').length,
        flagged: reviews.filter(r => r.moderation_status === 'flagged').length,
    };

    const handleAction = (review, action) => {
        setActionDialog({ open: true, review, action });
        setActionReason('');
        setResponseText('');
    };

    const confirmAction = () => {
        const { review, action } = actionDialog;
        
        if (action === 'respond') {
            if (!responseText.trim()) {
                toast.error('Please enter a response');
                return;
            }
            respondMutation.mutate({ reviewId: review.id, response: responseText });
        } else {
            if ((action === 'rejected' || action === 'flagged') && !actionReason.trim()) {
                toast.error('Please provide a reason');
                return;
            }
            moderateMutation.mutate({ 
                reviewId: review.id, 
                status: action, 
                reason: actionReason 
            });
        }
    };

    if (isLoading) return <div className="text-center py-8">Loading reviews...</div>;

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{stats.pending}</div>
                            <div className="text-sm text-gray-600">Pending</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{stats.approved}</div>
                            <div className="text-sm text-gray-600">Approved</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{stats.rejected}</div>
                            <div className="text-sm text-gray-600">Rejected</div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <Flag className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                            <div className="text-2xl font-bold">{stats.flagged}</div>
                            <div className="text-sm text-gray-600">Flagged</div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                    placeholder="Search reviews..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={filter === 'all' ? 'default' : 'outline'}
                                onClick={() => setFilter('all')}
                                size="sm"
                            >
                                All
                            </Button>
                            <Button
                                variant={filter === 'pending' ? 'default' : 'outline'}
                                onClick={() => setFilter('pending')}
                                size="sm"
                            >
                                Pending
                            </Button>
                            <Button
                                variant={filter === 'approved' ? 'default' : 'outline'}
                                onClick={() => setFilter('approved')}
                                size="sm"
                            >
                                Approved
                            </Button>
                            <Button
                                variant={filter === 'rejected' ? 'default' : 'outline'}
                                onClick={() => setFilter('rejected')}
                                size="sm"
                            >
                                Rejected
                            </Button>
                            <Button
                                variant={filter === 'flagged' ? 'default' : 'outline'}
                                onClick={() => setFilter('flagged')}
                                size="sm"
                            >
                                Flagged
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Reviews List */}
            {filteredReviews.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No reviews found</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredReviews.map((review) => {
                        const status = review.moderation_status || 'approved';
                        return (
                            <Card key={review.id} className={status === 'rejected' ? 'opacity-60' : ''}>
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h4 className="font-semibold text-lg">
                                                    {review.customer_name || 'Anonymous'}
                                                </h4>
                                                {status === 'pending' && (
                                                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                                        Pending Review
                                                    </Badge>
                                                )}
                                                {status === 'approved' && (
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                                        <CheckCircle className="h-3 w-3 mr-1" />
                                                        Approved
                                                    </Badge>
                                                )}
                                                {status === 'rejected' && (
                                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                                                        <XCircle className="h-3 w-3 mr-1" />
                                                        Rejected
                                                    </Badge>
                                                )}
                                                {status === 'flagged' && (
                                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                                                        <Flag className="h-3 w-3 mr-1" />
                                                        Flagged
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 mb-2">
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
                                            <p className="text-sm text-gray-500">
                                                {format(new Date(review.created_date), 'MMM d, yyyy h:mm a')}
                                                {isAdmin && review.restaurant_id && (
                                                    <span className="ml-2">• Order #{review.order_id?.slice(-6)}</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {review.review_text && (
                                        <p className="text-gray-700 mb-4">{review.review_text}</p>
                                    )}

                                    {(review.rejection_reason || review.flagged_reason) && (
                                        <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                            <p className="text-sm font-semibold text-gray-700 mb-1">
                                                {status === 'rejected' ? 'Rejection Reason:' : 'Flagged Reason:'}
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                {review.rejection_reason || review.flagged_reason}
                                            </p>
                                            {review.moderated_by && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    By {review.moderated_by} • {format(new Date(review.moderated_date), 'MMM d, yyyy')}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {review.restaurant_response && (
                                        <div className="bg-orange-50 rounded-lg p-3 mb-4 border-l-4 border-orange-500">
                                            <p className="text-sm font-semibold text-gray-700 mb-1">Restaurant Response:</p>
                                            <p className="text-sm text-gray-600">{review.restaurant_response}</p>
                                            {review.response_date && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {format(new Date(review.response_date), 'MMM d, yyyy')}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        {status !== 'approved' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAction(review, 'approved')}
                                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                            >
                                                <CheckCircle className="h-4 w-4 mr-2" />
                                                Approve
                                            </Button>
                                        )}
                                        {status !== 'rejected' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAction(review, 'rejected')}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <XCircle className="h-4 w-4 mr-2" />
                                                Reject
                                            </Button>
                                        )}
                                        {status !== 'flagged' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAction(review, 'flagged')}
                                                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                            >
                                                <Flag className="h-4 w-4 mr-2" />
                                                Flag
                                            </Button>
                                        )}
                                        {!review.restaurant_response && status === 'approved' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleAction(review, 'respond')}
                                            >
                                                <MessageSquare className="h-4 w-4 mr-2" />
                                                Respond
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Action Dialog */}
            <Dialog open={actionDialog.open} onOpenChange={(open) => {
                if (!open) setActionDialog({ open: false, review: null, action: null });
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionDialog.action === 'approved' && 'Approve Review'}
                            {actionDialog.action === 'rejected' && 'Reject Review'}
                            {actionDialog.action === 'flagged' && 'Flag Review'}
                            {actionDialog.action === 'respond' && 'Respond to Review'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {actionDialog.action === 'respond' ? (
                            <>
                                <div>
                                    <Label>Your Response</Label>
                                    <Textarea
                                        value={responseText}
                                        onChange={(e) => setResponseText(e.target.value)}
                                        placeholder="Write your response to the customer..."
                                        rows={4}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                {actionDialog.action === 'approved' ? (
                                    <p className="text-sm text-gray-600">
                                        This review will be visible to customers on the restaurant page.
                                    </p>
                                ) : (
                                    <>
                                        <div>
                                            <Label>Reason *</Label>
                                            <Textarea
                                                value={actionReason}
                                                onChange={(e) => setActionReason(e.target.value)}
                                                placeholder={`Why are you ${actionDialog.action === 'rejected' ? 'rejecting' : 'flagging'} this review?`}
                                                rows={3}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {actionDialog.action === 'rejected' 
                                                ? 'Rejected reviews will not be visible to customers.'
                                                : 'Flagged reviews require admin attention but remain visible.'}
                                        </p>
                                    </>
                                )}
                            </>
                        )}
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setActionDialog({ open: false, review: null, action: null })}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmAction}
                                disabled={moderateMutation.isPending || respondMutation.isPending}
                                className={
                                    actionDialog.action === 'approved' 
                                        ? 'bg-green-600 hover:bg-green-700'
                                        : actionDialog.action === 'rejected'
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : actionDialog.action === 'flagged'
                                        ? 'bg-orange-600 hover:bg-orange-700'
                                        : 'bg-orange-500 hover:bg-orange-600'
                                }
                            >
                                {actionDialog.action === 'respond' ? 'Post Response' : 'Confirm'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}