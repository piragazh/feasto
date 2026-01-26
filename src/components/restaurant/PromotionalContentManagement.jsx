import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Upload, Eye, MoveUp, MoveDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function PromotionalContentManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingContent, setEditingContent] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        display_order: 0,
        is_active: true
    });

    // Fetch promotional content
    const { data: content = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: async () => {
            const items = await base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId });
            return items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        },
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
            toast.success('Content added successfully');
            resetForm();
        },
    });

    // Update mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
            toast.success('Content updated successfully');
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.PromotionalContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content'] });
            toast.success('Content deleted');
        },
    });

    const handleFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const response = await base44.integrations.Core.UploadFile({ file });
            const mediaUrl = response.file_url;
            
            // Detect media type
            const fileType = file.type.startsWith('video/') ? 'video' : 
                           file.type === 'image/gif' ? 'gif' : 'image';
            
            setFormData(prev => ({ 
                ...prev, 
                media_url: mediaUrl,
                media_type: fileType 
            }));
            toast.success('File uploaded successfully');
        } catch (error) {
            toast.error('Failed to upload file');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const data = {
            ...formData,
            restaurant_id: restaurantId
        };

        if (editingContent) {
            updateMutation.mutate({ id: editingContent.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            media_url: '',
            media_type: 'image',
            duration: 10,
            display_order: content.length,
            is_active: true
        });
        setEditingContent(null);
        setIsDialogOpen(false);
    };

    const handleEdit = (item) => {
        setEditingContent(item);
        setFormData({
            title: item.title || '',
            description: item.description || '',
            media_url: item.media_url,
            media_type: item.media_type,
            duration: item.duration || 10,
            display_order: item.display_order || 0,
            is_active: item.is_active
        });
        setIsDialogOpen(true);
    };

    const moveItem = (index, direction) => {
        const newOrder = [...content];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        
        if (targetIndex < 0 || targetIndex >= newOrder.length) return;

        [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
        
        // Update display_order for both items
        updateMutation.mutate({ 
            id: newOrder[index].id, 
            data: { display_order: index } 
        });
        updateMutation.mutate({ 
            id: newOrder[targetIndex].id, 
            data: { display_order: targetIndex } 
        });
    };

    const mediaScreenUrl = `${window.location.origin}${createPageUrl('MediaScreen')}?restaurantId=${restaurantId}`;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold">Media Screen Content</h2>
                    <p className="text-sm text-gray-600">Manage promotional content for in-store displays</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => window.open(mediaScreenUrl, '_blank')}
                        className="gap-2"
                    >
                        <ExternalLink className="h-4 w-4" />
                        Open Media Screen
                    </Button>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2" onClick={() => {
                                resetForm();
                                setFormData(prev => ({ ...prev, display_order: content.length }));
                            }}>
                                <Plus className="h-4 w-4" />
                                Add Content
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {editingContent ? 'Edit Content' : 'Add New Content'}
                                </DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <Label>Title</Label>
                                    <Input
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="e.g., Summer Special"
                                    />
                                </div>

                                <div>
                                    <Label>Description (Optional)</Label>
                                    <Input
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        placeholder="Internal notes about this content"
                                    />
                                </div>

                                <div>
                                    <Label>Upload Media</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="file"
                                            accept="image/*,video/*"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                        />
                                        {uploading && <div className="text-sm text-gray-500">Uploading...</div>}
                                    </div>
                                    {formData.media_url && (
                                        <div className="mt-2">
                                            {formData.media_type === 'video' ? (
                                                <video src={formData.media_url} className="w-full h-48 object-cover rounded-lg" controls />
                                            ) : (
                                                <img src={formData.media_url} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {formData.media_type !== 'video' && (
                                    <div>
                                        <Label>Display Duration (seconds)</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                                        />
                                    </div>
                                )}

                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={formData.is_active}
                                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                    />
                                    <Label>Active</Label>
                                </div>

                                <div className="flex justify-end gap-2">
                                    <Button type="button" variant="outline" onClick={resetForm}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={!formData.media_url}>
                                        {editingContent ? 'Update' : 'Add'} Content
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Content List */}
            {content.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Upload className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Content Yet</h3>
                        <p className="text-gray-500">Add images, videos, or GIFs to display on your media screens</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {content.map((item, index) => (
                        <Card key={item.id} className={!item.is_active ? 'opacity-60' : ''}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="text-lg">{item.title || 'Untitled'}</CardTitle>
                                        {item.description && (
                                            <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => moveItem(index, 'up')}
                                            disabled={index === 0}
                                        >
                                            <MoveUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => moveItem(index, 'down')}
                                            disabled={index === content.length - 1}
                                        >
                                            <MoveDown className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {item.media_type === 'video' ? (
                                    <video src={item.media_url} className="w-full h-40 object-cover rounded-lg" />
                                ) : (
                                    <img src={item.media_url} alt={item.title} className="w-full h-40 object-cover rounded-lg" />
                                )}
                                
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-600">
                                        {item.media_type === 'video' ? 'Video' : `${item.duration}s`}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={item.is_active}
                                            onCheckedChange={(checked) => 
                                                updateMutation.mutate({ id: item.id, data: { is_active: checked } })
                                            }
                                        />
                                        <span className="text-xs text-gray-500">
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEdit(item)}
                                        className="flex-1"
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => {
                                            if (confirm('Delete this content?')) {
                                                deleteMutation.mutate(item.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Media Screen Link */}
            {content.length > 0 && (
                <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-semibold text-blue-900">Media Screen URL</h3>
                                <p className="text-sm text-blue-700 mt-1">Open this URL on your display device:</p>
                                <code className="text-xs bg-white px-2 py-1 rounded mt-2 inline-block">
                                    {mediaScreenUrl}
                                </code>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    navigator.clipboard.writeText(mediaScreenUrl);
                                    toast.success('URL copied to clipboard');
                                }}
                            >
                                Copy URL
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}