import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function BillSplitDialog({ order, open, onClose, onUpdate }) {
    const [splitCount, setSplitCount] = useState(2);
    const [customSplits, setCustomSplits] = useState([]);
    const [selectedItems, setSelectedItems] = useState({});

    const handleSplitEvenly = async () => {
        try {
            const splitAmount = order.total / splitCount;
            const splits = Array(splitCount).fill(null).map(() => ({
                amount: parseFloat(splitAmount.toFixed(2)),
                items: []
            }));
            
            // Distribute items across splits
            order.items.forEach((item, idx) => {
                splits[idx % splitCount].items.push(item);
            });

            setCustomSplits(splits);
            toast.success(`Bill split into ${splitCount} equal parts`);
        } catch (error) {
            toast.error('Failed to split bill');
        }
    };

    const handleCustomSplit = () => {
        setCustomSplits(Array(splitCount).fill(null).map(() => ({ amount: 0, items: [] })));
        setSelectedItems({});
    };

    const updateSplitAmount = (idx, amount) => {
        const newSplits = [...customSplits];
        newSplits[idx].amount = parseFloat(amount) || 0;
        setCustomSplits(newSplits);
    };

    const finalizeSplit = async () => {
        const totalSplit = customSplits.reduce((sum, s) => sum + s.amount, 0);
        
        if (Math.abs(totalSplit - order.total) > 0.01) {
            toast.error(`Split total (£${totalSplit.toFixed(2)}) must equal order total (£${order.total.toFixed(2)})`);
            return;
        }

        try {
            // Store split information in order notes
            const splitInfo = customSplits.map((s, idx) => 
                `Split ${idx + 1}: £${s.amount.toFixed(2)}`
            ).join(' | ');

            await base44.entities.Order.update(order.id, {
                notes: `${order.notes || ''} | BILL SPLIT: ${splitInfo}`
            });

            toast.success('Bill split saved');
            onUpdate();
            onClose();
        } catch (error) {
            toast.error('Failed to save bill split');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Split Bill - Order #{order?.id.slice(0, 8)}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Total */}
                    <div className="bg-gray-700 p-3 rounded">
                        <p className="text-gray-400 text-sm">Order Total</p>
                        <p className="text-orange-400 text-2xl font-bold">£{order?.total.toFixed(2)}</p>
                    </div>

                    {/* Number of Splits */}
                    {customSplits.length === 0 ? (
                        <div className="space-y-3">
                            <div>
                                <Label className="text-white">Number of Splits</Label>
                                <Input
                                    type="number"
                                    min="2"
                                    value={splitCount}
                                    onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                                    className="bg-gray-700 border-gray-600 text-white"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleSplitEvenly}
                                    className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                    Split Evenly
                                </Button>
                                <Button
                                    onClick={handleCustomSplit}
                                    variant="outline"
                                    className="flex-1 bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                                >
                                    Custom Split
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Label className="text-white">Payment Amounts</Label>
                            {customSplits.map((split, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <span className="text-white font-medium w-12">Split {idx + 1}</span>
                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            value={split.amount}
                                            onChange={(e) => updateSplitAmount(idx, e.target.value)}
                                            step="0.01"
                                            placeholder="0.00"
                                            className="bg-gray-700 border-gray-600 text-white"
                                        />
                                    </div>
                                    <span className="text-gray-400">£{split.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            
                            {/* Validation Message */}
                            {customSplits.length > 0 && (
                                <div className="bg-gray-700 p-2 rounded text-sm">
                                    <p className="text-gray-400">
                                        Total: <span className={customSplits.reduce((sum, s) => sum + s.amount, 0) === order?.total ? 'text-green-400' : 'text-red-400'}>
                                            £{customSplits.reduce((sum, s) => sum + s.amount, 0).toFixed(2)}
                                        </span>
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="bg-gray-700 border-gray-600 text-white">Cancel</Button>
                    <Button onClick={finalizeSplit} className="bg-orange-500 hover:bg-orange-600" disabled={customSplits.length === 0}>
                        Complete Split
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}