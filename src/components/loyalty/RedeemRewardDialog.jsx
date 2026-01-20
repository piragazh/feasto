import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function RedeemRewardDialog({ reward, open, onOpenChange, onSuccess }) {
    const [loading, setLoading] = useState(false);

    const handleRedeem = async () => {
        setLoading(true);
        try {
            const response = await base44.functions.invoke('redeemReward', { reward_id: reward.id });
            toast.success(response.data.message);
            onOpenChange(false);
            onSuccess?.(response.data);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Failed to redeem reward');
        } finally {
            setLoading(false);
        }
    };

    if (!reward) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Redeem Reward</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to redeem this reward?
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="bg-orange-50 p-4 rounded-lg">
                        <h3 className="font-bold text-lg">{reward.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">{reward.description}</p>
                        <div className="mt-3 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">Cost:</span>
                            <span className="font-bold text-orange-600">{reward.points_required} points</span>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleRedeem} disabled={loading} className="bg-orange-500 hover:bg-orange-600">
                        {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {loading ? 'Redeeming...' : 'Redeem Now'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}