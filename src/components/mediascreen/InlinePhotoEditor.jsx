import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RotateCw, FlipHorizontal, FlipVertical, ZoomIn, ZoomOut, Sun, Contrast, Droplet, Crop, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

export default function InlinePhotoEditor({ open, onClose, imageUrl, onSave }) {
    const canvasRef = useRef(null);
    const [image, setImage] = useState(null);
    const [filters, setFilters] = useState({
        brightness: 100,
        contrast: 100,
        saturation: 100,
        blur: 0,
        rotation: 0,
        flipH: false,
        flipV: false,
        zoom: 1
    });
    const [cropMode, setCropMode] = useState(false);
    const [cropDimensions, setCropDimensions] = useState({ x: 0, y: 0, width: 0, height: 0 });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (imageUrl && open) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                setImage(img);
                drawCanvas(img, filters);
            };
            img.src = imageUrl;
        }
    }, [imageUrl, open]);

    useEffect(() => {
        if (image) {
            drawCanvas(image, filters);
        }
    }, [filters]);

    const drawCanvas = (img, f) => {
        const canvas = canvasRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.save();
        
        // Apply transformations
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((f.rotation * Math.PI) / 180);
        ctx.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
        ctx.scale(f.zoom, f.zoom);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        // Apply filters
        ctx.filter = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) blur(${f.blur}px)`;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const handleRotate = () => {
        setFilters(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
    };

    const handleFlip = (direction) => {
        const key = direction === 'horizontal' ? 'flipH' : 'flipV';
        setFilters(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleReset = () => {
        setFilters({
            brightness: 100,
            contrast: 100,
            saturation: 100,
            blur: 0,
            rotation: 0,
            flipH: false,
            flipV: false,
            zoom: 1
        });
    };

    const handleSave = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        setSaving(true);
        try {
            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            
            // Upload the edited image
            const file = new File([blob], 'edited-image.jpg', { type: 'image/jpeg' });
            const { file_url } = await base44.integrations.Core.UploadFile({ file });

            onSave(file_url);
            toast.success('Image saved successfully!');
            onClose();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Failed to save image');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-6xl max-h-[95vh]">
                <DialogHeader>
                    <DialogTitle>Photo Editor</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-6">
                    {/* Canvas Preview */}
                    <div className="col-span-2">
                        <div className="bg-gray-900 rounded-lg p-4 flex items-center justify-center" style={{ minHeight: '500px' }}>
                            <canvas
                                ref={canvasRef}
                                className="max-w-full max-h-[500px] object-contain"
                            />
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-2 mt-4 justify-center">
                            <Button variant="outline" size="sm" onClick={handleRotate}>
                                <RotateCw className="h-4 w-4 mr-2" />
                                Rotate 90°
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleFlip('horizontal')}>
                                <FlipHorizontal className="h-4 w-4 mr-2" />
                                Flip H
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleFlip('vertical')}>
                                <FlipVertical className="h-4 w-4 mr-2" />
                                Flip V
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleReset}>
                                <X className="h-4 w-4 mr-2" />
                                Reset
                            </Button>
                        </div>
                    </div>

                    {/* Controls Panel */}
                    <div className="space-y-6 overflow-y-auto max-h-[600px]">
                        <Tabs defaultValue="adjust">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="adjust">Adjust</TabsTrigger>
                                <TabsTrigger value="transform">Transform</TabsTrigger>
                            </TabsList>

                            <TabsContent value="adjust" className="space-y-4 mt-4">
                                <div>
                                    <Label className="flex items-center gap-2">
                                        <Sun className="h-4 w-4" />
                                        Brightness
                                    </Label>
                                    <Slider
                                        value={[filters.brightness]}
                                        onValueChange={([value]) => handleFilterChange('brightness', value)}
                                        min={0}
                                        max={200}
                                        step={1}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.brightness}%</span>
                                </div>

                                <div>
                                    <Label className="flex items-center gap-2">
                                        <Contrast className="h-4 w-4" />
                                        Contrast
                                    </Label>
                                    <Slider
                                        value={[filters.contrast]}
                                        onValueChange={([value]) => handleFilterChange('contrast', value)}
                                        min={0}
                                        max={200}
                                        step={1}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.contrast}%</span>
                                </div>

                                <div>
                                    <Label className="flex items-center gap-2">
                                        <Droplet className="h-4 w-4" />
                                        Saturation
                                    </Label>
                                    <Slider
                                        value={[filters.saturation]}
                                        onValueChange={([value]) => handleFilterChange('saturation', value)}
                                        min={0}
                                        max={200}
                                        step={1}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.saturation}%</span>
                                </div>

                                <div>
                                    <Label>Blur</Label>
                                    <Slider
                                        value={[filters.blur]}
                                        onValueChange={([value]) => handleFilterChange('blur', value)}
                                        min={0}
                                        max={20}
                                        step={0.5}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.blur}px</span>
                                </div>
                            </TabsContent>

                            <TabsContent value="transform" className="space-y-4 mt-4">
                                <div>
                                    <Label className="flex items-center gap-2">
                                        <ZoomIn className="h-4 w-4" />
                                        Zoom
                                    </Label>
                                    <Slider
                                        value={[filters.zoom]}
                                        onValueChange={([value]) => handleFilterChange('zoom', value)}
                                        min={0.5}
                                        max={3}
                                        step={0.1}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.zoom}x</span>
                                </div>

                                <div>
                                    <Label className="flex items-center gap-2">
                                        <RotateCw className="h-4 w-4" />
                                        Rotation
                                    </Label>
                                    <Slider
                                        value={[filters.rotation]}
                                        onValueChange={([value]) => handleFilterChange('rotation', value)}
                                        min={0}
                                        max={360}
                                        step={1}
                                        className="mt-2"
                                    />
                                    <span className="text-xs text-gray-500">{filters.rotation}°</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        variant={filters.flipH ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleFlip('horizontal')}
                                        className="w-full"
                                    >
                                        <FlipHorizontal className="h-4 w-4 mr-2" />
                                        Flip H
                                    </Button>
                                    <Button
                                        variant={filters.flipV ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => handleFlip('vertical')}
                                        className="w-full"
                                    >
                                        <FlipVertical className="h-4 w-4 mr-2" />
                                        Flip V
                                    </Button>
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* Save/Cancel Buttons */}
                        <div className="flex gap-2 pt-4 border-t">
                            <Button onClick={handleSave} disabled={saving} className="flex-1">
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? 'Saving...' : 'Save Changes'}
                            </Button>
                            <Button onClick={onClose} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}