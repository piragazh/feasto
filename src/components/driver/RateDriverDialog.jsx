import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from 'lucide-react';
import { toast } from 'sonner';

export default function RateDriverDialog({ open, onClose, order, ratedBy = 'customer' }) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [feedback, setFeedback] = useState('');
    const queryClient = useQueryClient();

    const rateDriverMutation = useMutation({
        mutationFn: async () => {
            // Create rating
            await base44.entities.DriverRating.create({
                driver_id: order.driver_id,
                order_id: order.id,
                rating,
                feedback,
                rated_by: ratedBy
            });

            // Update driver's average rating
            const allRatings = await base44.entities.DriverRating.filter({ driver_id: order.driver_id });
            const avgRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
            await base44.entities.Driver.update(order.driver_id, { rating: parseFloat(avgRating.toFixed(1)) });
        },
        onSuccess: () => {
            queryClient.invalidateQueries();
            toast.success('Thank you for your feedback!');
            onClose();
        },
    });

    const handleSubmit = () => {
        if (rating === 0) {
            toast.error('Please select a rating');
            return;
        }
        rateDriverMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Rate Your Driver</DialogTitle>
                    <DialogDescription>
                        How was your delivery experience?
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHover(star)}
                                onMouseLeave={() => setHover(0)}
                                className="focus:outline-none transition-transform hover:scale-110"
                            >
                                <Star
                                    className={`h-10 w-10 ${
                                        star <= (hover || rating)
                                            ? 'fill-yellow-400 text-yellow-400'
                                            : 'text-gray-300'
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                    <div>
                        <Textarea
                            placeholder="Share your feedback (optional)"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            rows={3}
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={onClose} variant="outline" className="flex-1">
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSubmit} 
                            disabled={rateDriverMutation.isPending}
                            className="flex-1 bg-orange-500 hover:bg-orange-600"
                        >
                            Submit Rating
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}