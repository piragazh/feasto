import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign } from 'lucide-react';

export default function PartialRefundDialog({ open, onClose, order, onRefund }) {
    const [selectedItems, setSelectedItems] = useState([]);
    const [reason, setReason] = useState('');

    const toggleItem = (itemIndex) => {
        setSelectedItems(prev => 
            prev.includes(itemIndex)
                ? prev.filter(i => i !== itemIndex)
                : [...prev, itemIndex]
        );
    };

    const selectAll = () => {
        if (selectedItems.length === order.items.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(order.items.map((_, i) => i));
        }
    };

    const calculateRefundAmount = () => {
        return selectedItems.reduce((sum, index) => {
            const item = order.items[index];
            return sum + (item.price * item.quantity);
        }, 0);
    };

    const handleSubmit = () => {
        if (selectedItems.length === 0) {
            return;
        }
        onRefund({
            orderId: order.id,
            refundedItems: selectedItems.map(i => order.items[i]),
            refundAmount: calculateRefundAmount(),
            reason
        });
        setSelectedItems([]);
        setReason('');
    };

    if (!order) return null;

    const refundAmount = calculateRefundAmount();

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Process Refund - Order #{order.id.slice(-6)}</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <Label className="text-base font-semibold">Select Items to Refund</Label>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={selectAll}
                                className="text-xs"
                            >
                                {selectedItems.length === order.items.length ? 'Deselect All' : 'Select All'}
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {order.items.map((item, index) => (
                                <div key={index} className="flex items-start gap-3 p-2 border rounded hover:bg-gray-50">
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

                    <div>
                        <Label>Refund Reason</Label>
                        <Textarea
                            placeholder="Explain why refund is being issued..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
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
                        <p className="text-xs text-gray-600 mt-1">
                            Original total: £{order.total.toFixed(2)}
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={selectedItems.length === 0}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        <DollarSign className="h-4 w-4 mr-2" />
                        Process Refund
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}