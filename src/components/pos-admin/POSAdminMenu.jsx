import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function POSAdminMenu({ restaurantId }) {
    const [selectedCategory, setSelectedCategory] = useState(null);

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const result = await base44.entities.Restaurant.filter({ id: restaurantId });
            return result?.[0];
        },
    });

    const { data: items = [], isLoading } = useQuery({
        queryKey: ['menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId }),
    });

    const categories = restaurant?.menu_categories || [];
    const filteredItems = selectedCategory
        ? items.filter(i => i.category === selectedCategory)
        : items;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Categories */}
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Categories</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button
                            onClick={() => setSelectedCategory(null)}
                            variant={selectedCategory === null ? 'default' : 'ghost'}
                            className="w-full justify-start"
                        >
                            All Items ({items.length})
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                variant={selectedCategory === cat ? 'default' : 'ghost'}
                                className="w-full justify-start"
                            >
                                {cat} ({items.filter(i => i.category === cat).length})
                            </Button>
                        ))}
                        <Button className="w-full mt-2">
                            <Plus className="h-4 w-4 mr-2" />
                            New Category
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Items List */}
            <div className="lg:col-span-3">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">{selectedCategory || 'All Items'}</h2>
                    <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-center py-8">Loading items...</div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No items in this category</div>
                ) : (
                    <div className="space-y-3">
                        {filteredItems.map(item => (
                            <Card key={item.id}>
                                <CardContent className="pt-6">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{item.name}</h3>
                                                {!item.is_available && (
                                                    <Badge variant="secondary">Out of Stock</Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                            <div className="flex gap-2 mt-2">
                                                {item.is_vegetarian && <Badge className="text-xs">Vegetarian</Badge>}
                                                {item.is_spicy && <Badge className="text-xs">Spicy</Badge>}
                                                {item.is_popular && <Badge className="text-xs">Popular</Badge>}
                                            </div>
                                        </div>
                                        <div className="text-right ml-4">
                                            <p className="text-lg font-bold">£{item.price.toFixed(2)}</p>
                                            <div className="flex gap-2 mt-2">
                                                <Button size="sm" variant="outline">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button size="sm" variant="outline" className="text-red-600">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}