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
                prompt: `You are a professional web scraper for restaurant menus. Extract menu data from this Just Eat page: ${url}

CRITICAL EXTRACTION RULES:
1. COMPLETENESS: Extract EVERY menu item visible on the page - check all sections, tabs, and categories
2. DATA ACCURACY: 
   - name: Exact dish name as shown (string)
   - description: Full description text (string, empty if none exists)
   - price: Clean numeric value only (number type: 12.99, 8.50, 15.00)
   - category: Section heading like "Pizza", "Burgers", "Starters", "Mains", "Sides", "Desserts", "Drinks" (string)
   - image_url: Complete URL starting with https:// (string, empty if no image)

3. PRICE CLEANING:
   - Remove all currency symbols (£, $)
   - Remove text like "from", "starting at"
   - Convert to number format: "£12.99" → 12.99
   - Handle price ranges by taking the first/base price

4. IMAGE EXTRACTION:
   - Look for <img> tags with src attributes
   - Check for CSS background-image URLs
   - Extract full URLs (https://...)
   - Validate image URLs are accessible

5. CATEGORY GROUPING:
   - Maintain original category structure from the page
   - Use exact category names from page headings
   - Ensure every item has a category assigned

6. DATA VALIDATION:
   - Every item MUST have: name, price, category
   - Price MUST be a positive number
   - Description and image_url can be empty strings

OUTPUT FORMAT: Return JSON with "items" array containing all extracted menu items.`,
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
                // Validate and clean extracted items
                const validItems = response.items.filter(item => {
                    const hasValidPrice = typeof item.price === 'number' && item.price > 0;
                    const hasName = item.name && item.name.trim().length > 0;
                    const hasCategory = item.category && item.category.trim().length > 0;
                    return hasValidPrice && hasName && hasCategory;
                }).map(item => ({
                    ...item,
                    description: item.description || '',
                    image_url: item.image_url || '',
                    price: parseFloat(item.price.toFixed(2))
                }));

                if (validItems.length > 0) {
                    setExtractedItems(validItems);
                    setSelectedItems(validItems.map((_, idx) => idx));
                    toast.success(`Successfully extracted ${validItems.length} menu items!`);
                    
                    if (validItems.length < response.items.length) {
                        toast.info(`${response.items.length - validItems.length} items were filtered out due to invalid data`);
                    }
                } else {
                    toast.error('No valid menu items found. The extracted data was incomplete or invalid.');
                }
            } else {
                toast.error('No menu items found. Please check the URL - make sure it\'s a Just Eat restaurant menu page.');
            }
        } catch (error) {
            console.error('Extraction error:', error);
            const errorMessage = error.message || 'Unknown error occurred';
            toast.error(`Failed to extract menu: ${errorMessage}. Try a different URL or check your internet connection.`);
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
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <p className="text-sm font-semibold text-blue-900 mb-2">
                                📋 How to Import Menu from Just Eat:
                            </p>
                            <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                                <li>Visit Just Eat UK (just-eat.co.uk) and search for your restaurant</li>
                                <li>Open your restaurant's menu page</li>
                                <li>Copy the full URL from your browser's address bar</li>
                                <li>Paste it below and click "Extract Menu"</li>
                                <li>Review extracted items and select which ones to import</li>
                            </ol>
                            <p className="text-xs text-blue-600 mt-2">
                                ⚡ The AI will automatically extract item names, descriptions, prices, categories, and images
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