import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function BillSplitDialog({ order, open, onClose, onUpdate, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
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
            // Store split information in order notes (routed via posUpdateOrder for tenant verification)
            const splitInfo = customSplits.map((s, idx) => 
                `Split ${idx + 1}: £${s.amount.toFixed(2)}`
            ).join(' | ');

            const res = await base44.functions.invoke('posUpdateOrder', {
                order_id: order.id,
                updates: {
                    notes: `${order.notes || ''} | BILL SPLIT: ${splitInfo}`,
                },
            });

            if (res?.data?.error) {
                throw new Error(res.data.error);
            }

            toast.success('Bill split saved');
            onUpdate();
            onClose();
        } catch (error) {
            toast.error('Failed to save bill split');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} max-w-2xl`}>
                <DialogHeader>
                    <DialogTitle className={isDark ? 'text-white' : 'text-gray-900'}>Split Bill - Order #{order?.id.slice(0, 8)}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Total */}
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} p-3 rounded`}>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Order Total</p>
                        <p className="text-orange-400 text-2xl font-bold">£{order?.total.toFixed(2)}</p>
                    </div>

                    {/* Number of Splits */}
                    {customSplits.length === 0 ? (
                        <div className="space-y-3">
                            <div>
                                <Label className={isDark ? 'text-white' : 'text-gray-900'}>Number of Splits</Label>
                                <Input
                                    type="number"
                                    min="2"
                                    value={splitCount}
                                    onChange={(e) => setSplitCount(parseInt(e.target.value) || 2)}
                                    className={isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}
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
                                    className={`flex-1 ${isDark ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600' : 'bg-gray-100 border-gray-300 text-gray-900 hover:bg-gray-200'}`}
                                >
                                    Custom Split
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Label className={isDark ? 'text-white' : 'text-gray-900'}>Payment Amounts</Label>
                            {customSplits.map((split, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <span className={`font-medium w-12 ${isDark ? 'text-white' : 'text-gray-900'}`}>Split {idx + 1}</span>
                                    <div className="flex-1">
                                        <Input
                                            type="number"
                                            value={split.amount}
                                            onChange={(e) => updateSplitAmount(idx, e.target.value)}
                                            step="0.01"
                                            placeholder="0.00"
                                            className={isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'}
                                        />
                                    </div>
                                    <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>£{split.amount.toFixed(2)}</span>
                                </div>
                            ))}
                            
                            {/* Validation Message */}
                            {customSplits.length > 0 && (
                                <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} p-2 rounded text-sm`}>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
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
                    <Button variant="outline" onClick={onClose} className={isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-100 border-gray-300 text-gray-900'}>Cancel</Button>
                    <Button onClick={finalizeSplit} className="bg-orange-500 hover:bg-orange-600" disabled={customSplits.length === 0}>
                        Complete Split
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}