import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AlertCircle } from 'lucide-react';

const REJECTION_REASONS = [
  "Restaurant is too busy",
  "Item(s) temporarily unavailable",
  "Delivery address out of range",
  "Unable to fulfill special requests",
  "Kitchen closing soon",
  "Other (specify below)"
];

export default function RejectOrderDialog({ open, onClose, onReject, orderNumber }) {
    const [selectedReason, setSelectedReason] = useState(REJECTION_REASONS[0]);
    const [customReason, setCustomReason] = useState('');

    const handleReject = () => {
        const finalReason = selectedReason === "Other (specify below)" 
            ? customReason 
            : selectedReason;
        
        if (!finalReason.trim()) return;
        
        onReject(finalReason);
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        Reject Order #{orderNumber}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        Please select a reason for rejecting this order. The customer will be notified.
                    </p>
                    
                    <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
                        {REJECTION_REASONS.map((reason) => (
                            <div key={reason} className="flex items-center space-x-2">
                                <RadioGroupItem value={reason} id={reason} />
                                <Label htmlFor={reason} className="cursor-pointer">{reason}</Label>
                            </div>
                        ))}
                    </RadioGroup>

                    {selectedReason === "Other (specify below)" && (
                        <Textarea
                            placeholder="Please specify the reason..."
                            value={customReason}
                            onChange={(e) => setCustomReason(e.target.value)}
                            rows={3}
                        />
                    )}

                    <div className="flex gap-3 justify-end pt-4">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={selectedReason === "Other (specify below)" && !customReason.trim()}
                        >
                            Reject Order
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}