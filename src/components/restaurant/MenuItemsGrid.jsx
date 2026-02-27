import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, EyeOff, Image as ImageIcon, Sparkles, Copy, Clipboard, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { MenuItemBadges } from './MenuItemAdvancedFields';

export default function MenuItemsGrid({
    items,
    selectedItems,
    copiedCustomizations,
    onToggleSelect,
    onToggleAvailability,
    onEdit,
    onDelete,
    onCopyCustomizations,
    onPasteCustomizations,
    onMoveItem,
    title = 'Menu Items'
}) {
    if (items.length === 0) return null;

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 capitalize">{title}</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                    <div key={item.id} className="relative">
                        <Card className={`${item.is_available === false ? 'opacity-60' : ''} ${selectedItems.includes(item.id) ? 'ring-2 ring-orange-500' : ''}`}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between mb-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedItems.includes(item.id)}
                                        onChange={() => onToggleSelect(item.id)}
                                        className="h-4 w-4 rounded border-gray-300 mt-1"
                                    />
                                </div>
                                <div className="relative">
                                    {item.image_url ? (
                                        <img
                                            src={item.image_url}
                                            alt={item.name}
                                            className="w-full h-32 object-cover rounded-lg mb-3"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-32 bg-gradient-to-br from-orange-100 to-orange-50 rounded-lg mb-3 flex items-center justify-center">
                                            <ImageIcon className="h-12 w-12 text-orange-300" />
                                        </div>
                                    )}
                                    {item.ai_generated_image && (
                                        <div className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                            <Sparkles className="h-3 w-3" />
                                            AI
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-start justify-between mb-2">
                                    <h3 className="font-semibold">{item.name}</h3>
                                    {item.is_available === false && (
                                        <Badge variant="destructive" className="text-xs">
                                            <EyeOff className="h-3 w-3 mr-1" />
                                            Unavailable
                                        </Badge>
                                    )}
                                </div>
                                <MenuItemBadges item={item} />
                                {item.availability_channel && item.availability_channel !== 'both' && (
                                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-1 mb-1 ${item.availability_channel === 'online_only' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                        {item.availability_channel === 'online_only' ? '🌐 Online Only' : '🏪 In-Store Only'}
                                    </span>
                                )}
                                <p className="text-sm text-gray-600 mb-2 line-clamp-2 mt-1">{item.description}</p>
                                <div className="flex items-baseline gap-2 mb-3">
                                    <p className="text-lg font-bold text-orange-600">£{item.price.toFixed(2)}</p>
                                    {item.pos_price != null && item.pos_price !== item.price && (
                                        <p className="text-sm text-purple-600 font-medium">POS: £{item.pos_price.toFixed(2)}</p>
                                    )}
                                </div>
                                {item.customization_options?.length > 0 && (
                                    <p className="text-xs text-gray-500 mb-3">
                                        {item.customization_options.length} customization{item.customization_options.length > 1 ? 's' : ''}
                                    </p>
                                )}
                                <div className="flex gap-2 flex-wrap">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onToggleAvailability(item)}
                                        className="flex-1"
                                    >
                                        {item.is_available === false ? 'Mark Available' : 'Mark Unavailable'}
                                    </Button>
                                    {item.customization_options?.length > 0 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onCopyCustomizations(item)}
                                            title="Copy all customizations from this item"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    )}
                                    {copiedCustomizations && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onPasteCustomizations(item)}
                                            title="Paste copied customizations to this item"
                                        >
                                            <Clipboard className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onEdit(item)}
                                    >
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            if (confirm('Delete this item?')) {
                                                onDelete(item.id);
                                            }
                                        }}
                                        className="text-red-600"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>
        </div>
    );
}