import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Users, Scissors } from 'lucide-react';
import { Separator } from "@/components/ui/separator";

export default function SplitBillDialog({ open, onClose, orders, table, onPaymentComplete }) {
    const [splitMethod, setSplitMethod] = useState('equal'); // 'equal' or 'custom'
    const [numberOfPeople, setNumberOfPeople] = useState(2);
    const [customSplits, setCustomSplits] = useState([]);
    const [selectedItems, setSelectedItems] = useState(new Set());

    const allItems = orders.flatMap(order => 
        order.items.map((item, idx) => ({
            ...item,
            orderId: order.id,
            uniqueKey: `${order.id}-${idx}`
        }))
    );

    const totalAmount = orders.reduce((sum, order) => sum + order.total, 0);

    const toggleItemSelection = (itemKey) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(itemKey)) {
            newSelected.delete(itemKey);
        } else {
            newSelected.add(itemKey);
        }
        setSelectedItems(newSelected);
    };

    const assignItemsToPerson = (personIndex) => {
        const items = allItems.filter(item => selectedItems.has(item.uniqueKey));
        const newSplits = [...customSplits];
        
        // Remove these items from other people
        newSplits.forEach(split => {
            split.items = split.items.filter(item => !selectedItems.has(item.uniqueKey));
        });

        // Add to selected person
        if (!newSplits[personIndex].items) {
            newSplits[personIndex].items = [];
        }
        newSplits[personIndex].items.push(...items);
        
        // Recalculate amounts
        newSplits[personIndex].amount = newSplits[personIndex].items.reduce(
            (sum, item) => sum + (item.price * item.quantity), 
            0
        );

        setCustomSplits(newSplits);
        setSelectedItems(new Set());
    };

    const handleProcessSplit = async () => {
        if (splitMethod === 'equal') {
            toast.success(`Bill split equally: £${(totalAmount / numberOfPeople).toFixed(2)} per person`);
            onClose();
        } else {
            const totalAssigned = customSplits.reduce((sum, split) => sum + split.amount, 0);
            if (Math.abs(totalAssigned - totalAmount) > 0.01) {
                toast.error('Split amounts do not match total bill');
                return;
            }
            toast.success('Bill split successfully!');
            onClose();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Scissors className="h-5 w-5" />
                        Split Bill - {table?.table_number}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Total Amount */}
                    <div className="bg-gray-100 p-4 rounded-lg">
                        <p className="text-sm text-gray-600">Total Bill Amount</p>
                        <p className="text-3xl font-bold text-gray-900">£{totalAmount.toFixed(2)}</p>
                    </div>

                    {/* Split Method Selection */}
                    <div className="flex gap-2">
                        <Button
                            onClick={() => setSplitMethod('equal')}
                            variant={splitMethod === 'equal' ? 'default' : 'outline'}
                            className="flex-1"
                        >
                            <Users className="h-4 w-4 mr-2" />
                            Equal Split
                        </Button>
                        <Button
                            onClick={() => {
                                setSplitMethod('custom');
                                setCustomSplits(Array.from({ length: 2 }, (_, i) => ({
                                    person: i + 1,
                                    amount: 0,
                                    items: []
                                })));
                            }}
                            variant={splitMethod === 'custom' ? 'default' : 'outline'}
                            className="flex-1"
                        >
                            <Scissors className="h-4 w-4 mr-2" />
                            Custom Split
                        </Button>
                    </div>

                    {/* Equal Split */}
                    {splitMethod === 'equal' && (
                        <div className="space-y-3">
                            <div>
                                <Label>Number of People</Label>
                                <Input
                                    type="number"
                                    min="2"
                                    value={numberOfPeople}
                                    onChange={(e) => setNumberOfPeople(parseInt(e.target.value) || 2)}
                                    className="mt-1"
                                />
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                <p className="text-sm text-blue-700 mb-1">Amount per person:</p>
                                <p className="text-2xl font-bold text-blue-900">
                                    £{(totalAmount / numberOfPeople).toFixed(2)}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Custom Split */}
                    {splitMethod === 'custom' && (
                        <div className="space-y-4">
                            {/* Items List */}
                            <div>
                                <Label className="text-sm font-semibold mb-2 block">Select Items</Label>
                                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                                    {allItems.map((item) => (
                                        <div key={item.uniqueKey} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded">
                                            <Checkbox
                                                checked={selectedItems.has(item.uniqueKey)}
                                                onCheckedChange={() => toggleItemSelection(item.uniqueKey)}
                                            />
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{item.name}</p>
                                                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                                            </div>
                                            <p className="font-bold text-sm">£{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* People Splits */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label className="text-sm font-semibold">Split Between</Label>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setCustomSplits([...customSplits, { 
                                            person: customSplits.length + 1, 
                                            amount: 0, 
                                            items: [] 
                                        }])}
                                    >
                                        Add Person
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {customSplits.map((split, idx) => (
                                        <div key={idx} className="border rounded-lg p-3 bg-gray-50">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="font-semibold">Person {split.person}</p>
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => assignItemsToPerson(idx)}
                                                        disabled={selectedItems.size === 0}
                                                        className="h-7"
                                                    >
                                                        Assign Selected
                                                    </Button>
                                                    <p className="font-bold text-lg">£{split.amount.toFixed(2)}</p>
                                                </div>
                                            </div>
                                            {split.items?.length > 0 && (
                                                <div className="text-xs text-gray-600 space-y-1">
                                                    {split.items.map((item, i) => (
                                                        <p key={i}>• {item.name} (x{item.quantity})</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <Separator />

                    {/* Actions */}
                    <div className="flex gap-2">
                        <Button onClick={onClose} variant="outline" className="flex-1">
                            Cancel
                        </Button>
                        <Button onClick={handleProcessSplit} className="flex-1 bg-green-600 hover:bg-green-700">
                            Process Split Payment
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}