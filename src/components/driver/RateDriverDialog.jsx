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
import { functionErrorMessage } from '@/lib/function-errors';

export default function RateDriverDialog({ open, onClose, order, ratedBy = 'customer' }) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [feedback, setFeedback] = useState('');
    const queryClient = useQueryClient();

    const rateDriverMutation = useMutation({
        mutationFn: async () => {
            // SECURITY: the server checks the order was delivered and not already
            // rated, saves the rating and recalculates the driver's average.
            const response = await base44.functions.invoke('submitDriverRating', {
                orderId: order.id,
                rating,
                feedback,
            });
            return response?.data || response;
        },
        onError: (error) => {
            toast.error(functionErrorMessage(error, 'Could not save your rating. Please try again.'));
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