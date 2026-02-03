import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Maximize2, Plus, Edit, Trash2, Clock, ArrowUp, ArrowDown, Calendar, Image as ImageIcon, FolderOpen, Upload } from 'lucide-react';
import { toast } from 'sonner';
import ContentScheduler from './ContentScheduler';

export default function MediaWallContentManager({ restaurantId, wallName }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showScheduler, setShowScheduler] = useState(false);
    const [editingContent, setEditingContent] = useState(null);
    const [schedulingContent, setSchedulingContent] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        priority: 1,
        is_active: true
    });

    const { data: content = [] } = useQuery({
        queryKey: ['wall-content', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallContent.filter({ 
            restaurant_id: restaurantId,
            wall_name: wallName 
        }),
        enabled: !!restaurantId && !!wallName
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MediaWallContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content created');
            resetForm();
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaWallContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content updated');
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaWallContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content deleted');
        }
    });

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            toast.loading('Uploading...');
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
            setFormData(prev => ({ ...prev, media_url: file_url, media_type: mediaType }));
            toast.dismiss();
            toast.success('File uploaded');
        } catch (error) {
            toast.dismiss();
            toast.error('Upload failed');
        }
    };

    const handleSubmit = async () => {
        if (!formData.media_url) {
            toast.error('Please upload media');
            return;
        }

        const data = {
            restaurant_id: restaurantId,
            wall_name: wallName,
            title: formData.title || 'Untitled',
            description: formData.description,
            media_url: formData.media_url,
            media_type: formData.media_type,
            duration: formData.duration,
            priority: formData.priority,
            is_active: formData.is_active,
            display_order: editingContent ? editingContent.display_order : content.length
        };

        if (editingContent) {
            await updateMutation.mutateAsync({ id: editingContent.id, data });
        } else {
            await createMutation.mutateAsync(data);
        }
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            media_url: '',
            media_type: 'image',
            duration: 10,
            priority: 1,
            is_active: true
        });
        setEditingContent(null);
        setShowDialog(false);
    };

    const handleEdit = (item) => {
        setFormData({
            title: item.title || '',
            description: item.description || '',
            media_url: item.media_url,
            media_type: item.media_type,
            duration: item.duration,
            priority: item.priority || 1,
            is_active: item.is_active !== false
        });
        setEditingContent(item);
        setShowDialog(true);
    };

    const handleSchedule = (item) => {
        setSchedulingContent(item);
        setShowScheduler(true);
    };

    const handleSaveSchedule = async ({ schedule, priority }) => {
        if (!schedulingContent) return;
        
        try {
            await updateMutation.mutateAsync({
                id: schedulingContent.id,
                data: { schedule, priority }
            });
            toast.success('Schedule updated');
            setShowScheduler(false);
            setSchedulingContent(null);
        } catch (error) {
            toast.error('Failed to update schedule');
        }
    };

    const moveContent = async (item, direction) => {
        const sorted = [...content].sort((a, b) => a.display_order - b.display_order);
        const currentIndex = sorted.findIndex(c => c.id === item.id);
        
        if ((direction === 'up' && currentIndex === 0) || 
            (direction === 'down' && currentIndex === sorted.length - 1)) {
            return;
        }

        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const swapContent = sorted[swapIndex];

        await updateMutation.mutateAsync({ 
            id: item.id, 
            data: { display_order: swapContent.display_order } 
        });
        await updateMutation.mutateAsync({ 
            id: swapContent.id, 
            data: { display_order: item.display_order } 
        });
    };

    const sortedContent = [...content].sort((a, b) => a.display_order - b.display_order);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Maximize2 className="h-5 w-5" />
                        Full-Screen Wall Content
                    </CardTitle>
                    <Button onClick={() => setShowDialog(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Content
                    </Button>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                    Content that spans across all screens in "{wallName}"
                </p>
            </CardHeader>
            <CardContent>
                {sortedContent.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
                        <Maximize2 className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                        <p>No wall content yet</p>
                        <p className="text-sm mt-1">Add content to display across all screens</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedContent.map((item) => (
                            <Card key={item.id}>
                                <CardContent className="p-4">
                                    <div className="flex gap-4">
                                        <div className="w-32 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            {item.media_type === 'video' ? (
                                                <video src={item.media_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        
                                        <div className="flex-1">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h3 className="font-semibold">{item.title}</h3>
                                                    <p className="text-sm text-gray-500">{item.description}</p>
                                                </div>
                                                <Switch
                                                    checked={item.is_active}
                                                    onCheckedChange={(checked) => 
                                                        updateMutation.mutate({ 
                                                            id: item.id, 
                                                            data: { is_active: checked } 
                                                        })
                                                    }
                                                />
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <Badge variant="outline">{item.media_type}</Badge>
                                                <Badge variant="outline">{item.duration}s</Badge>
                                                {item.priority > 1 && (
                                                    <Badge className="bg-orange-50 text-orange-700 border-orange-200">
                                                        Priority: {item.priority}
                                                    </Badge>
                                                )}
                                                {item.schedule?.enabled && (
                                                    <Badge variant="outline" className="bg-green-50 text-green-700">
                                                        <Calendar className="h-3 w-3 mr-1" />
                                                        Scheduled
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleSchedule(item)}
                                            >
                                                <Clock className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => moveContent(item, 'up')}
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => moveContent(item, 'down')}
                                            >
                                                <ArrowDown className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleEdit(item)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteMutation.mutate(item.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingContent ? 'Edit' : 'Add'} Wall Content</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Title</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Content title"
                            />
                        </div>

                        <div>
                            <Label>Description</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Optional description"
                            />
                        </div>

                        <div>
                            <Label>Media File (Full Resolution)</Label>
                            <p className="text-xs text-gray-500 mb-2">Browse already uploaded files or upload a new file</p>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowDialog(false)}
                                    className="flex-1"
                                >
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    Browse Files
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('wall-file-upload-input').click()}
                                    className="flex-1"
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload New
                                </Button>
                            </div>
                            <Input
                                id="wall-file-upload-input"
                                type="file"
                                accept="image/*,video/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            {formData.media_url && (
                                <p className="text-sm text-green-600 mt-2">
                                    <ImageIcon className="h-3 w-3 inline mr-1" />
                                    File selected
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Duration (seconds)</Label>
                                <Input
                                    type="number"
                                    value={formData.duration}
                                    onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 10 }))}
                                    min="1"
                                />
                            </div>
                            <div>
                                <Label>Priority (1-10)</Label>
                                <Input
                                    type="number"
                                    value={formData.priority}
                                    onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                                    min="1"
                                    max="10"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={handleSubmit} className="flex-1">
                                {editingContent ? 'Update' : 'Add'} Content
                            </Button>
                            <Button onClick={resetForm} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ContentScheduler
                open={showScheduler}
                onClose={() => {
                    setShowScheduler(false);
                    setSchedulingContent(null);
                }}
                content={schedulingContent}
                onSave={handleSaveSchedule}
            />
        </Card>
    );
}