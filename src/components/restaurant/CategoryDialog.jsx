import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Image as ImageIcon, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoryDialog({ open, onOpenChange, editingCategory, restaurant, onSave }) {
    const [name, setName] = useState(editingCategory || '');
    const [imageUrl, setImageUrl] = useState(
        editingCategory ? (restaurant?.category_images?.[editingCategory] || '') : ''
    );
    const [iconBgColor, setIconBgColor] = useState(restaurant?.theme_primary_color || '#f97316');
    const [iconBgStyle, setIconBgStyle] = useState('solid');
    const [iconStyle, setIconStyle] = useState('flat');
    const [generating, setGenerating] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Sync when editingCategory changes
    React.useEffect(() => {
        setName(editingCategory || '');
        setImageUrl(editingCategory ? (restaurant?.category_images?.[editingCategory] || '') : '');
    }, [editingCategory, restaurant]);

    const handleClose = () => {
        onOpenChange(false);
        setName('');
        setImageUrl('');
    };

    const generateIcon = async () => {
        if (!name.trim()) {
            toast.error('Please enter a category name first');
            return;
        }
        setGenerating(true);
        try {
            const cuisineHint = restaurant?.cuisine_type ? ` for a ${restaurant.cuisine_type} restaurant` : '';

            const styleDescriptions = {
                flat: 'clean minimal flat icon, simple bold shapes, no gradients, no shadows',
                illustrated: 'illustrated icon, slightly detailed, hand-drawn style, friendly and warm',
                realistic: 'realistic food photography style icon, vibrant colors, photographic quality',
                emoji: 'emoji-style icon, bold outlines, rounded shapes, playful and colorful',
            };

            const bgDescriptions = {
                solid: `solid ${iconBgColor} background`,
                gradient: `gradient background from ${iconBgColor} to a lighter shade`,
                rounded: `solid ${iconBgColor} background with rounded square (squircle) frame`,
                transparent: 'transparent background',
            };

            const iconColor = iconBgStyle === 'transparent' ? 'colorful' : 'white';
            const prompt = `A ${styleDescriptions[iconStyle]} representing "${name}" food category${cuisineHint}. Square format, ${iconColor} icon on a ${bgDescriptions[iconBgStyle]}, professional restaurant menu icon style, no text.`;
            const result = await base44.integrations.Core.GenerateImage({ prompt });
            setImageUrl(result.url);
            toast.success('Category icon generated!');
        } catch (error) {
            toast.error('Failed to generate icon');
        } finally {
            setGenerating(false);
        }
    };

    const handleUpload = async (file) => {
        setUploading(true);
        try {
            const result = await base44.integrations.Core.UploadFile({ file });
            setImageUrl(result.file_url);
            toast.success('Image uploaded');
        } catch (error) {
            toast.error('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = () => {
        if (!name.trim()) return;
        onSave({ name: name.trim(), imageUrl: imageUrl || null, oldName: editingCategory });
        handleClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingCategory ? 'Edit' : 'Add'} Menu Category</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Category Name</Label>
                        <Input
                            placeholder="e.g., Starters, Mains, Desserts, Drinks"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label>Category Icon / Image <span className="text-gray-400 font-normal">(optional)</span></Label>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={generateIcon}
                                disabled={generating || !name.trim()}
                                className="gap-2 text-xs"
                            >
                                <Wand2 className="h-3.5 w-3.5" />
                                {generating ? 'Generating...' : 'AI Generate Icon'}
                            </Button>
                        </div>

                        {/* AI Customisation */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 space-y-3">
                            <p className="text-xs font-medium text-gray-700">AI Icon Customisation</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">Icon Style</Label>
                                    <select
                                        value={iconStyle}
                                        onChange={(e) => setIconStyle(e.target.value)}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                    >
                                        <option value="flat">Flat / Minimal</option>
                                        <option value="illustrated">Illustrated</option>
                                        <option value="realistic">Realistic</option>
                                        <option value="emoji">Emoji Style</option>
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">Background</Label>
                                    <select
                                        value={iconBgStyle}
                                        onChange={(e) => setIconBgStyle(e.target.value)}
                                        className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                                    >
                                        <option value="solid">Solid Colour</option>
                                        <option value="gradient">Gradient</option>
                                        <option value="rounded">Rounded Square</option>
                                        <option value="transparent">Transparent</option>
                                    </select>
                                </div>
                            </div>
                            {iconBgStyle !== 'transparent' && (
                                <div>
                                    <Label className="text-xs text-gray-500 mb-1 block">Background Colour</Label>
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            type="color"
                                            value={iconBgColor}
                                            onChange={(e) => setIconBgColor(e.target.value)}
                                            className="w-10 h-8 p-0.5 cursor-pointer"
                                        />
                                        <Input
                                            type="text"
                                            value={iconBgColor}
                                            onChange={(e) => setIconBgColor(e.target.value)}
                                            placeholder="#f97316"
                                            className="flex-1 h-8 text-xs"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIconBgColor(restaurant?.theme_primary_color || '#f97316')}
                                            className="text-xs text-orange-600 hover:text-orange-700 whitespace-nowrap"
                                        >
                                            Use theme
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 items-start">
                            {imageUrl ? (
                                <div className="relative flex-shrink-0">
                                    <img src={imageUrl} alt="Category icon" className="w-16 h-16 rounded-lg object-cover border" />
                                    <button
                                        type="button"
                                        onClick={() => setImageUrl('')}
                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                                    >×</button>
                                </div>
                            ) : (
                                <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0">
                                    <ImageIcon className="h-6 w-6 text-gray-400" />
                                </div>
                            )}
                            <div className="flex-1 space-y-2">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                                    disabled={uploading || generating}
                                    className="text-xs"
                                />
                                <Input
                                    value={imageUrl}
                                    onChange={(e) => setImageUrl(e.target.value)}
                                    placeholder="Or paste image URL"
                                    className="text-xs"
                                />
                                {(uploading || generating) && (
                                    <p className="text-xs text-gray-500">
                                        {uploading ? 'Uploading...' : 'AI is creating your icon...'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleClose}>Cancel</Button>
                        <Button
                            onClick={handleSave}
                            disabled={!name.trim()}
                            className="bg-orange-500 hover:bg-orange-600"
                        >
                            {editingCategory ? 'Update' : 'Add'} Category
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}