import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function InfoSectionSettings({ restaurantId, initialData }) {
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState(initialData?.info_section || {
        enabled: false,
        message: '',
        background_color: '#f0f9ff',
        text_color: '#0369a1',
        border_color: '#0ea5e9',
        icon: 'info'
    });

    const handleSave = async () => {
        if (data.enabled && !data.message?.trim()) {
            toast.error('Please enter a message');
            return;
        }

        setIsLoading(true);
        try {
            await base44.entities.Restaurant.update(restaurantId, {
                info_section: data
            });
            toast.success('Info section updated');
        } catch (error) {
            toast.error('Failed to update info section');
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Info Section</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Display a customizable message above promotions</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label htmlFor="enable-info">Enable Info Section</Label>
                    <Switch
                        id="enable-info"
                        checked={data.enabled}
                        onCheckedChange={(checked) =>
                            setData({ ...data, enabled: checked })
                        }
                    />
                </div>

                {data.enabled && (
                    <>
                        <div>
                            <Label htmlFor="message">Message *</Label>
                            <Textarea
                                id="message"
                                placeholder="Enter your message..."
                                value={data.message || ''}
                                onChange={(e) =>
                                    setData({ ...data, message: e.target.value })
                                }
                                rows={3}
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label htmlFor="icon">Icon</Label>
                            <Select
                                value={data.icon || 'info'}
                                onValueChange={(value) =>
                                    setData({ ...data, icon: value })
                                }
                            >
                                <SelectTrigger id="icon" className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="info">ℹ️ Info</SelectItem>
                                    <SelectItem value="alert">⚠️ Alert</SelectItem>
                                    <SelectItem value="star">⭐ Star</SelectItem>
                                    <SelectItem value="bell">🔔 Bell</SelectItem>
                                    <SelectItem value="heart">❤️ Heart</SelectItem>
                                    <SelectItem value="zap">⚡ Zap</SelectItem>
                                    <SelectItem value="none">None</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <Label htmlFor="bg-color">Background Color</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        id="bg-color"
                                        type="color"
                                        value={data.background_color || '#f0f9ff'}
                                        onChange={(e) =>
                                            setData({ ...data, background_color: e.target.value })
                                        }
                                        className="w-12 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={data.background_color || '#f0f9ff'}
                                        onChange={(e) =>
                                            setData({ ...data, background_color: e.target.value })
                                        }
                                        className="flex-1 text-xs font-mono"
                                        placeholder="#f0f9ff"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="text-color">Text Color</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        id="text-color"
                                        type="color"
                                        value={data.text_color || '#0369a1'}
                                        onChange={(e) =>
                                            setData({ ...data, text_color: e.target.value })
                                        }
                                        className="w-12 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={data.text_color || '#0369a1'}
                                        onChange={(e) =>
                                            setData({ ...data, text_color: e.target.value })
                                        }
                                        className="flex-1 text-xs font-mono"
                                        placeholder="#0369a1"
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="border-color">Border Color</Label>
                                <div className="flex gap-2 mt-1">
                                    <Input
                                        id="border-color"
                                        type="color"
                                        value={data.border_color || '#0ea5e9'}
                                        onChange={(e) =>
                                            setData({ ...data, border_color: e.target.value })
                                        }
                                        className="w-12 h-10 p-1 cursor-pointer"
                                    />
                                    <Input
                                        type="text"
                                        value={data.border_color || '#0ea5e9'}
                                        onChange={(e) =>
                                            setData({ ...data, border_color: e.target.value })
                                        }
                                        className="flex-1 text-xs font-mono"
                                        placeholder="#0ea5e9"
                                    />
                                </div>
                            </div>
                        </div>

                        <div
                            className="rounded-lg p-4 border-2 mt-4"
                            style={{
                                backgroundColor: data.background_color || '#f0f9ff',
                                borderColor: data.border_color || '#0ea5e9'
                            }}
                        >
                            <p
                                className="text-sm"
                                style={{ color: data.text_color || '#0369a1' }}
                            >
                                {data.message || 'Your message preview...'}
                            </p>
                        </div>
                    </>
                )}

                <Button
                    onClick={handleSave}
                    disabled={isLoading}
                    className="w-full bg-orange-500 hover:bg-orange-600"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        'Save Changes'
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}