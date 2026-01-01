import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, ExternalLink, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ImportFromJustEat({ restaurantId }) {
    const [url, setUrl] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [extractedItems, setExtractedItems] = useState([]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [isExtracting, setIsExtracting] = useState(false);
    const queryClient = useQueryClient();

    const importMutation = useMutation({
        mutationFn: async (items) => {
            const menuItems = items.map(item => ({
                restaurant_id: restaurantId,
                name: item.name,
                description: item.description || '',
                price: item.price,
                image_url: item.image_url || '',
                category: item.category || 'Main',
                is_available: true
            }));
            
            await base44.entities.MenuItem.bulkCreate(menuItems);
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['menu-items']);
            toast.success('Menu items imported successfully!');
            setIsOpen(false);
            setUrl('');
            setExtractedItems([]);
            setSelectedItems([]);
        },
    });

    const handleExtract = async () => {
        if (!url.trim()) {
            toast.error('Please enter a JustEat URL');
            return;
        }

        if (!url.includes('just-eat.co.uk')) {
            toast.error('Please enter a valid JustEat UK URL');
            return;
        }

        setIsExtracting(true);
        try {
            const response = await base44.integrations.Core.InvokeLLM({
                prompt: `I need you to scrape the menu from this Just Eat restaurant page: ${url}

IMPORTANT INSTRUCTIONS:
1. Extract EVERY SINGLE menu item you can find on the page
2. Look for menu sections/categories and the items within them
3. For each menu item, extract:
   - name: The exact name of the dish/item
   - description: Any description text (can be empty string if none)
   - price: The numeric price value (remove £ symbol, convert to number like 12.99)
   - category: The section name it belongs to (e.g., "Starters", "Mains", "Pizza", "Burgers", "Sides", "Desserts", "Drinks")
   - image_url: If there's an image, extract the full URL (must start with http:// or https://). Leave empty string if no image.

4. Be thorough - scan the entire page for all menu items
5. Group items by their categories as they appear on the page
6. Make sure ALL prices are numbers (e.g., 12.99 not "£12.99")
7. For image URLs, look for img tags, background images, or any image sources

Return a JSON object with an "items" array containing ALL menu items found.`,
                add_context_from_internet: true,
                response_json_schema: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    description: { type: "string" },
                                    price: { type: "number" },
                                    category: { type: "string" },
                                    image_url: { type: "string" }
                                },
                                required: ["name", "price", "category"]
                            }
                        }
                    },
                    required: ["items"]
                }
            });

            if (response.items && response.items.length > 0) {
                setExtractedItems(response.items);
                setSelectedItems(response.items.map((_, idx) => idx));
                toast.success(`Found ${response.items.length} menu items!`);
            } else {
                toast.error('No menu items found on this page. Please check the URL or try a different restaurant.');
            }
        } catch (error) {
            console.error('Extraction error:', error);
            toast.error('Failed to extract menu. The page might be inaccessible or the format is not supported.');
        } finally {
            setIsExtracting(false);
        }
    };

    const handleImport = () => {
        if (selectedItems.length === 0) {
            toast.error('Please select items to import');
            return;
        }
        const itemsToImport = extractedItems.filter((_, idx) => selectedItems.includes(idx));
        importMutation.mutate(itemsToImport);
    };

    const toggleSelectItem = (idx) => {
        setSelectedItems(prev => 
            prev.includes(idx) 
                ? prev.filter(i => i !== idx)
                : [...prev, idx]
        );
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === extractedItems.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(extractedItems.map((_, idx) => idx));
        }
    };

    return (
        <>
            <Button onClick={() => setIsOpen(true)} variant="outline" className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Import from Just Eat
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Import Menu from Just Eat</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-blue-800">
                                📋 <strong>Instructions:</strong> Paste a Just Eat restaurant menu page URL below. 
                                The system will automatically extract all menu items, prices, descriptions, and images.
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <Input
                                placeholder="https://www.just-eat.co.uk/restaurants-your-restaurant-name/menu"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                disabled={isExtracting}
                                className="flex-1"
                            />
                            <Button 
                                onClick={handleExtract}
                                disabled={isExtracting || !url.trim()}
                                className="whitespace-nowrap"
                            >
                                {isExtracting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Extracting...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Extract Menu
                                    </>
                                )}
                            </Button>
                        </div>

                        {extractedItems.length > 0 && (
                            <>
                                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.length === extractedItems.length}
                                            onChange={toggleSelectAll}
                                            className="h-4 w-4 rounded border-gray-300"
                                        />
                                        <div className="flex items-center gap-2">
                                            <CheckCircle className="h-5 w-5 text-green-600" />
                                            <span className="font-medium text-green-900">
                                                {selectedItems.length} of {extractedItems.length} items selected
                                            </span>
                                        </div>
                                    </div>
                                    <Button 
                                        onClick={handleImport}
                                        disabled={importMutation.isPending || selectedItems.length === 0}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {importMutation.isPending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Importing...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="h-4 w-4 mr-2" />
                                                Import Selected ({selectedItems.length})
                                            </>
                                        )}
                                    </Button>
                                </div>

                                <div className="grid gap-3 max-h-96 overflow-y-auto">
                                    {extractedItems.map((item, idx) => (
                                        <Card key={idx} className={selectedItems.includes(idx) ? 'ring-2 ring-green-500' : ''}>
                                            <CardContent className="p-4">
                                                <div className="flex gap-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.includes(idx)}
                                                        onChange={() => toggleSelectItem(idx)}
                                                        className="h-4 w-4 rounded border-gray-300 mt-1"
                                                    />
                                                    {item.image_url && (
                                                        <img 
                                                            src={item.image_url} 
                                                            alt={item.name}
                                                            className="w-20 h-20 rounded-lg object-cover"
                                                            onError={(e) => e.target.style.display = 'none'}
                                                        />
                                                    )}
                                                    <div className="flex-1">
                                                        <div className="flex items-start justify-between mb-1">
                                                            <h4 className="font-semibold text-gray-900">{item.name}</h4>
                                                            <span className="text-lg font-bold text-green-600">
                                                                £{item.price.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        {item.description && (
                                                            <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                                                        )}
                                                        <Badge variant="outline">{item.category}</Badge>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </>
                        )}

                        {isExtracting && (
                            <div className="text-center py-8">
                                <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
                                <p className="text-gray-600 font-medium">Extracting menu items from Just Eat...</p>
                                <p className="text-sm text-gray-500 mt-2">Scanning the page for menu items, prices, and images</p>
                                <p className="text-xs text-gray-400 mt-1">This usually takes 10-30 seconds</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}