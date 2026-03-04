import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, Percent, ArrowRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkPriceAdjustment() {
    const [selectedRestaurantId, setSelectedRestaurantId] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [adjustmentType, setAdjustmentType] = useState('percentage'); // percentage | fixed
    const [direction, setDirection] = useState('increase'); // increase | decrease
    const [value, setValue] = useState('');
    const [priceField, setPriceField] = useState('item_price'); // item_price | pos_price | both
    const [targetField, setTargetField] = useState('same'); // same | item_price | pos_price
    const [preview, setPreview] = useState(null);
    const [isApplying, setIsApplying] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: menuItems = [], isLoading: itemsLoading } = useQuery({
        queryKey: ['bulk-menu-items', selectedRestaurantId],
        queryFn: () => selectedRestaurantId === 'all'
            ? base44.entities.MenuItem.list()
            : base44.entities.MenuItem.filter({ restaurant_id: selectedRestaurantId }),
        enabled: true,
    });

    // Get unique categories from loaded items
    const categories = ['all', ...new Set(menuItems.map(i => i.category).filter(Boolean))];

    const filteredItems = menuItems.filter(item => {
        if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
        return true;
    });

    const calculateNewPrice = (originalPrice, numVal) => {
        if (!originalPrice || originalPrice <= 0) return originalPrice;
        let adjusted;
        if (adjustmentType === 'percentage') {
            adjusted = direction === 'increase'
                ? originalPrice * (1 + numVal / 100)
                : originalPrice * (1 - numVal / 100);
        } else {
            adjusted = direction === 'increase'
                ? originalPrice + numVal
                : originalPrice - numVal;
        }
        return Math.max(0, Math.round(adjusted * 100) / 100);
    };

    const buildPreview = () => {
        const numVal = parseFloat(value);
        if (!numVal || numVal <= 0) {
            toast.error('Please enter a valid adjustment value');
            return;
        }

        setIsPreviewing(true);
        const changes = filteredItems.map(item => {
            const sourcePrice = priceField === 'pos_price' ? (item.pos_price || item.price) : item.price;
            const newPrice = calculateNewPrice(sourcePrice, numVal);

            let newItemPrice = item.price;
            let newPosPrice = item.pos_price || null;

            if (targetField === 'same' || targetField === 'item_price') {
                if (priceField === 'item_price' || priceField === 'both') {
                    newItemPrice = calculateNewPrice(item.price, numVal);
                }
            }
            if (targetField === 'same' || targetField === 'pos_price') {
                if (priceField === 'pos_price' || priceField === 'both') {
                    newPosPrice = calculateNewPrice(item.pos_price || item.price, numVal);
                }
            }
            if (targetField === 'item_price' && priceField === 'pos_price') {
                newItemPrice = calculateNewPrice(item.pos_price || item.price, numVal);
                newPosPrice = item.pos_price || null;
            }
            if (targetField === 'pos_price' && priceField === 'item_price') {
                newPosPrice = calculateNewPrice(item.price, numVal);
                newItemPrice = item.price;
            }

            return {
                id: item.id,
                name: item.name,
                category: item.category,
                restaurant_id: item.restaurant_id,
                oldItemPrice: item.price,
                oldPosPrice: item.pos_price || null,
                newItemPrice,
                newPosPrice,
                changed: newItemPrice !== item.price || newPosPrice !== (item.pos_price || null),
            };
        }).filter(c => c.changed);

        setPreview(changes);
        setIsPreviewing(false);
    };

    const applyChanges = async () => {
        if (!preview || preview.length === 0) return;

        const confirmed = window.confirm(`Apply price changes to ${preview.length} items? This cannot be undone.`);
        if (!confirmed) return;

        setIsApplying(true);
        let successCount = 0;
        let failCount = 0;

        for (const change of preview) {
            try {
                const updateData = { price: change.newItemPrice };
                if (change.newPosPrice !== null) {
                    updateData.pos_price = change.newPosPrice;
                }
                await base44.entities.MenuItem.update(change.id, updateData);
                successCount++;
            } catch (e) {
                failCount++;
            }
        }

        setIsApplying(false);
        setPreview(null);

        if (failCount === 0) {
            toast.success(`✅ Successfully updated ${successCount} items`);
        } else {
            toast.warning(`Updated ${successCount} items, ${failCount} failed`);
        }
    };

    const restaurantName = (id) => restaurants.find(r => r.id === id)?.name || id;

    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Bulk Price Adjustment</h2>
                <p className="text-gray-500 text-sm mt-1">Centrally adjust menu item prices across restaurants without interrupting operations</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-orange-500" />
                        Configure Adjustment
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Step 1 - Target */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Restaurant</Label>
                            <Select value={selectedRestaurantId} onValueChange={(v) => { setSelectedRestaurantId(v); setSelectedCategory('all'); setPreview(null); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select restaurant..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Restaurants</SelectItem>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Category</Label>
                            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setPreview(null); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select category..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Step 2 - Price Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Source Price Field</Label>
                            <Select value={priceField} onValueChange={(v) => { setPriceField(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="item_price">Item Price → Item Price</SelectItem>
                                    <SelectItem value="pos_price">POS Price → POS Price</SelectItem>
                                    <SelectItem value="both">Both Item + POS Prices</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">Which price field to read the value from</p>
                        </div>
                        <div>
                            <Label>Target Price Field</Label>
                            <Select value={targetField} onValueChange={(v) => { setTargetField(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="same">Same as Source</SelectItem>
                                    <SelectItem value="item_price">Write to Item Price</SelectItem>
                                    <SelectItem value="pos_price">Write to POS Price</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500 mt-1">Where to write the adjusted price</p>
                        </div>
                    </div>

                    {/* Step 3 - Adjustment */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Direction</Label>
                            <Select value={direction} onValueChange={(v) => { setDirection(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="increase">Increase ↑</SelectItem>
                                    <SelectItem value="decrease">Decrease ↓</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Adjustment Type</Label>
                            <Select value={adjustmentType} onValueChange={(v) => { setAdjustmentType(v); setPreview(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                                    <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Value {adjustmentType === 'percentage' ? '(%)' : '(£)'}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={adjustmentType === 'percentage' ? 'e.g. 5' : 'e.g. 1.00'}
                                value={value}
                                onChange={(e) => { setValue(e.target.value); setPreview(null); }}
                            />
                        </div>
                    </div>

                    {/* Summary pill */}
                    {value && parseFloat(value) > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                            <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                            <span>
                                Will <strong>{direction}</strong> prices by <strong>{adjustmentType === 'percentage' ? `${value}%` : `£${value}`}</strong>
                                {' '}on <strong>{filteredItems.length} items</strong>
                                {selectedRestaurantId !== 'all' && ` from ${restaurantName(selectedRestaurantId)}`}
                                {selectedCategory !== 'all' && ` in category "${selectedCategory}"`}
                            </span>
                        </div>
                    )}

                    <Button
                        onClick={buildPreview}
                        disabled={!value || parseFloat(value) <= 0 || isPreviewing || itemsLoading}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        {isPreviewing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Preview Changes ({filteredItems.length} items)
                    </Button>
                </CardContent>
            </Card>

            {/* Preview Table */}
            {preview && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                Preview — {preview.length} items will change
                            </CardTitle>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
                                <Button
                                    onClick={applyChanges}
                                    disabled={isApplying || preview.length === 0}
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                    {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                                    Apply {preview.length} Changes
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-gray-500">
                                        <th className="pb-2 font-medium">Item</th>
                                        <th className="pb-2 font-medium">Category</th>
                                        {selectedRestaurantId === 'all' && <th className="pb-2 font-medium">Restaurant</th>}
                                        <th className="pb-2 font-medium text-right">Old Item Price</th>
                                        <th className="pb-2 font-medium text-right">New Item Price</th>
                                        <th className="pb-2 font-medium text-right">Old POS Price</th>
                                        <th className="pb-2 font-medium text-right">New POS Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {preview.slice(0, 100).map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="py-2 font-medium">{item.name}</td>
                                            <td className="py-2 text-gray-500">{item.category || '—'}</td>
                                            {selectedRestaurantId === 'all' && (
                                                <td className="py-2 text-gray-500">{restaurantName(item.restaurant_id)}</td>
                                            )}
                                            <td className="py-2 text-right text-gray-500">£{item.oldItemPrice?.toFixed(2)}</td>
                                            <td className={`py-2 text-right font-semibold ${item.newItemPrice !== item.oldItemPrice ? 'text-orange-600' : 'text-gray-400'}`}>
                                                £{item.newItemPrice?.toFixed(2)}
                                            </td>
                                            <td className="py-2 text-right text-gray-500">
                                                {item.oldPosPrice != null ? `£${item.oldPosPrice.toFixed(2)}` : '—'}
                                            </td>
                                            <td className={`py-2 text-right font-semibold ${item.newPosPrice !== item.oldPosPrice ? 'text-orange-600' : 'text-gray-400'}`}>
                                                {item.newPosPrice != null ? `£${item.newPosPrice.toFixed(2)}` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {preview.length > 100 && (
                                <p className="text-center text-sm text-gray-500 mt-3">
                                    Showing first 100 of {preview.length} items
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}