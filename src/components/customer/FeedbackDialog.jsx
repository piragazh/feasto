import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Utensils, Clock, User } from 'lucide-react';
import { toast } from 'sonner';

export default function FeedbackDialog({ open, onClose, order }) {
    const [ratings, setRatings] = useState({
        overall: 0,
        food_quality: 0,
        delivery_time: 0,
        driver_service: 0
    });
    const [reviewText, setReviewText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const ratingCategories = [
        { key: 'overall', label: 'Overall Experience', icon: Star, color: 'text-yellow-500' },
        { key: 'food_quality', label: 'Food Quality', icon: Utensils, color: 'text-orange-500' },
        { key: 'delivery_time', label: 'Delivery Time', icon: Clock, color: 'text-blue-500' },
        { key: 'driver_service', label: 'Driver Service', icon: User, color: 'text-green-500' }
    ];

    const handleStarClick = (category, value) => {
        setRatings(prev => ({ ...prev, [category]: value }));
    };

    const handleSubmit = async () => {
        if (ratings.overall === 0) {
            toast.error('Please provide an overall rating');
            return;
        }

        setIsSubmitting(true);
        try {
            const user = await base44.auth.me();
            
            await base44.entities.Review.create({
                order_id: order.id,
                restaurant_id: order.restaurant_id,
                rating: ratings.overall,
                food_quality_rating: ratings.food_quality || ratings.overall,
                delivery_time_rating: ratings.delivery_time || ratings.overall,
                driver_service_rating: ratings.driver_service || ratings.overall,
                review_text: reviewText,
                customer_name: user.full_name,
                customer_email: user.email,
                moderation_status: 'approved'
            });

            toast.success('Thank you for your feedback!');
            onClose();
        } catch (error) {
            toast.error('Failed to submit feedback');
        } finally {
            setIsSubmitting(false);
        }
    };

    const StarRating = ({ category, label, icon: Icon, color }) => (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Icon className={`h-5 w-5 ${color}`} />
                <span className="text-sm font-medium">{label}</span>
            </div>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                    <button
                        key={value}
                        onClick={() => handleStarClick(category, value)}
                        className="focus:outline-none transition-transform hover:scale-110"
                    >
                        <Star
                            className={`h-8 w-8 ${
                                value <= ratings[category]
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                            }`}
                        />
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Rate Your Order</DialogTitle>
                    <p className="text-sm text-gray-500 mt-1">
                        From {order?.restaurant_name}
                    </p>
                </DialogHeader>

                <div className="space-y-6">
                    {ratingCategories.map((category) => (
                        <StarRating key={category.key} {...category} />
                    ))}

                    <div>
                        <label className="text-sm font-medium mb-2 block">
                            Additional Comments (Optional)
                        </label>
                        <Textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="Tell us more about your experience..."
                            rows={4}
                        />
                    </div>

                    <div className="flex gap-3">
                        <Button
                            onClick={handleSubmit}
                            disabled={isSubmitting || ratings.overall === 0}
                            className="flex-1"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                        </Button>
                        <Button onClick={onClose} variant="outline">
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}