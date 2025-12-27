import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle } from 'lucide-react';

export default function RequestRefundDialog({ open, onClose, order, onSubmit }) {
    const [refundType, setRefundType] = useState('partial'); // 'partial' or 'full'
    const [selectedItems, setSelectedItems] = useState([]);
    const [reason, setReason] = useState('');
    const [issueDescription, setIssueDescription] = useState('');

    const toggleItem = (itemIndex) => {
        setSelectedItems(prev => 
            prev.includes(itemIndex)
                ? prev.filter(i => i !== itemIndex)
                : [...prev, itemIndex]
        );
    };

    const calculateRefundAmount = () => {
        if (refundType === 'full') return order.total;
        return selectedItems.reduce((sum, index) => {
            const item = order.items[index];
            return sum + (item.price * item.quantity);
        }, 0);
    };

    const handleSubmit = () => {
        if (refundType === 'partial' && selectedItems.length === 0) {
            return;
        }
        if (!reason || !issueDescription.trim()) {
            return;
        }
        
        onSubmit({
            orderId: order.id,
            refundType,
            refundedItems: refundType === 'partial' ? selectedItems.map(i => order.items[i]) : order.items,
            refundAmount: calculateRefundAmount(),
            reason,
            issueDescription
        });
        
        // Reset form
        setRefundType('partial');
        setSelectedItems([]);
        setReason('');
        setIssueDescription('');
    };

    if (!order) return null;

    const refundAmount = calculateRefundAmount();
    const commonReasons = [
        'Wrong item received',
        'Missing items',
        'Food quality issue',
        'Cold/stale food',
        'Wrong order entirely',
        'Other'
    ];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Request Refund - Order #{order.id.slice(-6)}</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex gap-2">
                            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-900">
                                Your refund request will be reviewed by the restaurant. 
                                Please provide detailed information to help us process it quickly.
                            </p>
                        </div>
                    </div>

                    <div>
                        <Label className="text-base font-semibold mb-3 block">Refund Type</Label>
                        <RadioGroup value={refundType} onValueChange={setRefundType}>
                            <div className="flex items-center space-x-2 mb-2">
                                <RadioGroupItem value="partial" id="partial" />
                                <Label htmlFor="partial" className="cursor-pointer">
                                    Partial refund - Select specific items
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="full" id="full" />
                                <Label htmlFor="full" className="cursor-pointer">
                                    Full refund - Entire order
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {refundType === 'partial' && (
                        <div>
                            <Label className="text-base font-semibold mb-2 block">Select Items</Label>
                            <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                                {order.items.map((item, index) => (
                                    <div key={index} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded">
                                        <Checkbox
                                            checked={selectedItems.includes(index)}
                                            onCheckedChange={() => toggleItem(index)}
                                        />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">{item.quantity}x {item.name}</p>
                                            <p className="text-xs text-gray-600">£{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <Label className="mb-2 block">What went wrong? *</Label>
                        <RadioGroup value={reason} onValueChange={setReason}>
                            <div className="space-y-2">
                                {commonReasons.map(r => (
                                    <div key={r} className="flex items-center space-x-2">
                                        <RadioGroupItem value={r} id={r} />
                                        <Label htmlFor={r} className="cursor-pointer text-sm">
                                            {r}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </RadioGroup>
                    </div>

                    <div>
                        <Label>Describe the issue in detail *</Label>
                        <Textarea
                            placeholder="Please provide as much detail as possible about what went wrong..."
                            value={issueDescription}
                            onChange={(e) => setIssueDescription(e.target.value)}
                            rows={4}
                            className="mt-1"
                        />
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold">Refund Amount:</span>
                            <span className="text-2xl font-bold text-orange-600">
                                £{refundAmount.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={
                            (refundType === 'partial' && selectedItems.length === 0) ||
                            !reason ||
                            !issueDescription.trim()
                        }
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        Submit Refund Request
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}