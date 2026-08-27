import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Minus } from 'lucide-react';

export default function HeldOrderEditDialog({ open, onClose, heldOrder, onSave, isDark }) {
    const [label, setLabel] = useState(heldOrder?.label || '');
    const [items, setItems] = useState(heldOrder?.items || []);

    // Reset state when a different held order is opened
    useEffect(() => {
        if (open) {
            setLabel(heldOrder?.label || '');
            setItems(heldOrder?.items || []);
        }
    }, [open, heldOrder]);

    const handleQuantityChange = (idx, newQty) => {
        if (newQty <= 0) {
            setItems(items.filter((_, i) => i !== idx));
        } else {
            setItems(items.map((item, i) => i === idx ? { ...item, quantity: newQty } : item));
        }
    };

    const handleSave = () => {
        onSave({ ...heldOrder, label, items });
        onClose();
    };

    const total = items.reduce((s, i) => s + (i.pos_price != null ? i.pos_price : i.price) * i.quantity, 0);

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className={`${isDark ? 'bg-[#1a1d27] border-white/[0.06]' : 'bg-white border-gray-200'} max-w-md p-0 flex flex-col max-h-[85vh]`}>
                <DialogHeader className={`px-4 py-3 border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                    <DialogTitle className={isDark ? 'text-white' : 'text-gray-900'}>
                        Edit Held Order
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Label input */}
                    <div>
                        <label className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-600'} block mb-2`}>
                            Order Label
                        </label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g., Table 5, John Doe"
                            className={`${isDark ? 'bg-[#0f1117] border-white/[0.08]' : 'bg-gray-50 border-gray-200'} text-sm`}
                        />
                    </div>

                    {/* Items list */}
                    <div>
                        <label className={`text-xs font-bold ${isDark ? 'text-gray-400' : 'text-gray-600'} block mb-2`}>
                            Items ({items.length})
                        </label>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {items.map((item, idx) => (
                                <div key={idx} className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-[#0f1117] border-white/[0.06] border' : 'bg-gray-50 border border-gray-200'}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-gray-900'} truncate`}>{item.name}</p>
                                        <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                            £{((item.pos_price != null ? item.pos_price : item.price) * item.quantity).toFixed(2)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2">
                                        <button
                                            onClick={() => handleQuantityChange(idx, item.quantity - 1)}
                                            className={`h-6 w-6 rounded flex items-center justify-center ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-200 hover:bg-gray-300'}`}
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className={`text-xs font-bold w-6 text-center ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                            {item.quantity}
                                        </span>
                                        <button
                                            onClick={() => handleQuantityChange(idx, item.quantity + 1)}
                                            className={`h-6 w-6 rounded flex items-center justify-center ${isDark ? 'bg-orange-500/20 hover:bg-orange-500/30' : 'bg-orange-100 hover:bg-orange-200'}`}
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                        <button
                                            onClick={() => handleQuantityChange(idx, 0)}
                                            className={`h-6 w-6 rounded ml-1 flex items-center justify-center ${isDark ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-red-50 hover:bg-red-100'} text-red-400`}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Total */}
                    <div className={`p-3 rounded-lg ${isDark ? 'bg-blue-500/10 border-blue-500/30 border' : 'bg-blue-50 border-blue-200 border'}`}>
                        <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Total</p>
                        <p className={`text-2xl font-bold ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>£{total.toFixed(2)}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className={`flex gap-2 p-4 border-t ${isDark ? 'border-white/[0.06]' : 'border-gray-100'}`}>
                    <Button variant="outline" onClick={onClose} className="flex-1">
                        Cancel
                    </Button>
                    <Button onClick={handleSave} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                        Save Order
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}