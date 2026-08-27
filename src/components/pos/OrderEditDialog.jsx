import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DISCOUNT_REASON_CODES = [
    { value: 'customer_complaint', label: 'Customer Complaint' },
    { value: 'staff_meal', label: 'Staff Meal' },
    { value: 'loyalty_gesture', label: 'Loyalty Gesture' },
    { value: 'promotional_event', label: 'Promotional Event' },
    { value: 'pricing_error_correction', label: 'Pricing Error Correction' },
    { value: 'manager_discretion', label: 'Manager Discretion' },
    { value: 'other', label: 'Other' },
];

export default function OrderEditDialog({ order, open, onClose, onUpdate, restaurantId }) {
    const [items, setItems] = useState(order?.items || []);
    const [discount, setDiscount] = useState(order?.discount || 0);
    const [discountReasonCode, setDiscountReasonCode] = useState('');
    const [confirmSave, setConfirmSave] = useState(false);
    const [pendingRemoveIdx, setPendingRemoveIdx] = useState(null);
    const [saving, setSaving] = useState(false);

    // Reset state when a different order is opened
    useEffect(() => {
        if (open) {
            setItems(order?.items || []);
            setDiscount(order?.discount || 0);
            setDiscountReasonCode('');
            setConfirmSave(false);
            setPendingRemoveIdx(null);
            setSaving(false);
        }
    }, [open, order?.id]);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    const updateQuantity = (index, quantity) => {
        if (quantity < 1) {
            removeItem(index);
            return;
        }
        const newItems = [...items];
        newItems[index] = { ...newItems[index], quantity };
        setItems(newItems);
    };

    const removeItem = (index) => {
        setPendingRemoveIdx(index);
    };

    const confirmRemoveItem = () => {
        setItems(items.filter((_, i) => i !== pendingRemoveIdx));
        setPendingRemoveIdx(null);
    };

    const addItem = (menuItem) => {
        const existing = items.find(i => i.menu_item_id === menuItem.id);
        if (existing) {
            updateQuantity(items.indexOf(existing), existing.quantity + 1);
        } else {
            setItems([...items, {
                menu_item_id: menuItem.id,
                name: menuItem.name,
                price: menuItem.pos_price != null ? menuItem.pos_price : menuItem.price,
                quantity: 1
            }]);
        }
        toast.success(`${menuItem.name} added`);
    };

    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = Math.max(0, subtotal - discount);

    // Discount changed from the original value → reason code required
    const discountChanged = Math.abs((discount || 0) - (order?.discount || 0)) > 0.001;
    const canSave = !saving && (!discountChanged || !!discountReasonCode);

    const handleSaveConfirmed = async () => {
        setConfirmSave(false);
        setSaving(true);
        try {
            const updates = {
                items,
                discount: parseFloat(discount) || 0,
            };
            if (discountChanged) {
                updates.discount_reason_code = discountReasonCode;
            }

            const res = await base44.functions.invoke('posUpdateOrder', {
                order_id: order.id,
                updates,
            });

            if (res?.data?.error) {
                throw new Error(res.data.error);
            }

            toast.success('Order updated successfully');
            onUpdate();
            onClose();
        } catch (error) {
            toast.error(error?.message || 'Failed to update order');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onClose}>
                <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl max-h-screen overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-white text-lg">Edit Order #{order?.id.slice(0, 8)}</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Items Section */}
                        <div className="col-span-2">
                            <Label className="text-white mb-2">Order Items</Label>
                            <div className="space-y-2 mb-4 bg-gray-700 p-3 rounded">
                                {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-gray-600 p-2 rounded">
                                        <div className="flex-1">
                                            <p className="text-white text-sm font-medium">{item.name}</p>
                                            <p className="text-gray-400 text-xs">£{item.price.toFixed(2)}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => updateQuantity(idx, item.quantity - 1)}
                                                className="h-6 w-6 text-white hover:bg-gray-700"
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className="text-white text-sm w-6 text-center">{item.quantity}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => updateQuantity(idx, item.quantity + 1)}
                                                className="h-6 w-6 text-white hover:bg-gray-700"
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => removeItem(idx)}
                                                className="h-6 w-6 text-red-400 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Add Items Section */}
                        <div className="col-span-2">
                            <Label className="text-white mb-2">Add Items</Label>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                {menuItems.map(item => (
                                    <Button
                                        key={item.id}
                                        onClick={() => addItem(item)}
                                        variant="outline"
                                        className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600 text-xs h-8"
                                    >
                                        {item.name}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Discount */}
                        <div>
                            <Label className="text-white text-sm">Discount (£)</Label>
                            <Input
                                type="number"
                                value={discount}
                                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="bg-gray-700 border-gray-600 text-white"
                            />
                            {discountChanged && (
                                <div className="mt-2 space-y-1">
                                    <Label className="text-orange-400 text-xs">Reason code required</Label>
                                    <Select value={discountReasonCode} onValueChange={setDiscountReasonCode}>
                                        <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                                            <SelectValue placeholder="Select reason" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DISCOUNT_REASON_CODES.map(rc => (
                                                <SelectItem key={rc.value} value={rc.value}>{rc.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="space-y-2">
                            <div>
                                <p className="text-gray-400 text-xs">Subtotal</p>
                                <p className="text-white font-bold">£{subtotal.toFixed(2)}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs">Total</p>
                                <p className="text-orange-400 text-2xl font-bold">£{total.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} className="bg-gray-700 border-gray-600 text-white">Cancel</Button>
                        <Button onClick={() => setConfirmSave(true)} disabled={!canSave} className="bg-orange-500 hover:bg-orange-600">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm save changes */}
            <AlertDialog open={confirmSave} onOpenChange={setConfirmSave}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-400" /> Save Order Changes?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will update the live order. New total: £{total.toFixed(2)}. Are you sure?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSaveConfirmed} className="bg-orange-500 hover:bg-orange-600 text-white">Save Changes</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm remove item */}
            <AlertDialog open={pendingRemoveIdx !== null} onOpenChange={() => setPendingRemoveIdx(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-400" /> Remove Item?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Remove "{pendingRemoveIdx !== null ? items[pendingRemoveIdx]?.name : ''}" from this order?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmRemoveItem} className="bg-red-500 hover:bg-red-600 text-white">Remove</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}