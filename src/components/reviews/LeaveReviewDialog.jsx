import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from 'lucide-react';
import { toast } from 'sonner';

export default function LeaveReviewDialog({ order, open, onClose }) {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const queryClient = useQueryClient();

    const reviewMutation = useMutation({
        mutationFn: async (data) => {
            const user = await base44.auth.me();
            return base44.entities.Review.create({
                ...data,
                customer_name: user.full_name || user.email
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['orders']);
            toast.success('Thank you for your review!');
            onClose();
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (rating === 0) {
            toast.error('Please select a rating');
            return;
        }

        reviewMutation.mutate({
            order_id: order?.id,
            restaurant_id: order?.restaurant_id,
            rating,
            review_text: reviewText
        });
    };

    if (!order) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rate Your Experience</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="text-center">
                        <p className="text-sm text-gray-600 mb-3">
                            How was your order from {order?.restaurant_name || 'this restaurant'}?
                        </p>
                        <div className="flex justify-center gap-2 mb-4">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setRating(star)}
                                    onMouseEnter={() => setHoverRating(star)}
                                    onMouseLeave={() => setHoverRating(0)}
                                    className="transition-transform hover:scale-110"
                                >
                                    <Star
                                        className={`h-10 w-10 ${
                                            star <= (hoverRating || rating)
                                                ? 'fill-yellow-400 text-yellow-400'
                                                : 'text-gray-300'
                                        }`}
                                    />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Textarea
                            placeholder="Tell us about your experience (optional)"
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            rows={4}
                        />
                    </div>

                    <div className="flex gap-3 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={reviewMutation.isPending}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            Submit Review
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}