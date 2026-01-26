import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Upload, Sparkles, Trash2, Edit, ArrowUp, ArrowDown, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ContentManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [editingContent, setEditingContent] = useState(null);
    const [selectedScreen, setSelectedScreen] = useState('all');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        screen_name: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        display_order: 0,
        is_active: true
    });

    const { data: allContent = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: () => base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const sortedContent = [...allContent].sort((a, b) => a.display_order - b.display_order);

    const filteredContent = selectedScreen === 'all' 
        ? sortedContent 
        : sortedContent.filter(c => c.screen_name === selectedScreen);

    const screenNames = [...new Set(allContent.map(c => c.screen_name).filter(Boolean))];

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content created successfully');
            resetForm();
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content updated successfully');
            resetForm();
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.PromotionalContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content deleted');
        },
    });

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const mediaType = file.type.startsWith('video/') ? 'video' : 
                            file.type === 'image/gif' ? 'gif' : 'image';
            
            setFormData(prev => ({ 
                ...prev, 
                media_url: file_url,
                media_type: mediaType 
            }));
            toast.success('File uploaded successfully');
        } catch (error) {
            toast.error('Failed to upload file');
        }
    };

    const handleSubmit = () => {
        if (!formData.media_url || !formData.screen_name) {
            toast.error('Please provide media and screen name');
            return;
        }

        const data = {
            ...formData,
            restaurant_id: restaurantId,
        };

        if (editingContent) {
            updateMutation.mutate({ id: editingContent.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleGenerateAI = async () => {
        if (!aiPrompt) {
            toast.error('Please enter a prompt');
            return;
        }

        setIsGenerating(true);
        try {
            const { url } = await base44.integrations.Core.GenerateImage({ 
                prompt: aiPrompt 
            });
            
            setFormData(prev => ({ 
                ...prev, 
                media_url: url,
                media_type: 'image',
                ai_generated: true,
                ai_prompt: aiPrompt
            }));
            
            toast.success('Image generated successfully!');
            setShowAIDialog(false);
            setShowDialog(true);
        } catch (error) {
            toast.error('Failed to generate image');
        } finally {
            setIsGenerating(false);
        }
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            screen_name: '',
            media_url: '',
            media_type: 'image',
            duration: 10,
            display_order: 0,
            is_active: true
        });
        setEditingContent(null);
        setShowDialog(false);
    };

    const handleEdit = (content) => {
        setFormData({
            title: content.title || '',
            description: content.description || '',
            screen_name: content.screen_name || '',
            media_url: content.media_url || '',
            media_type: content.media_type || 'image',
            duration: content.duration || 10,
            display_order: content.display_order || 0,
            is_active: content.is_active !== false
        });
        setEditingContent(content);
        setShowDialog(true);
    };

    const moveContent = async (content, direction) => {
        const currentIndex = sortedContent.findIndex(c => c.id === content.id);
        if (
            (direction === 'up' && currentIndex === 0) || 
            (direction === 'down' && currentIndex === sortedContent.length - 1)
        ) {
            return;
        }

        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        const swapContent = sortedContent[swapIndex];

        await updateMutation.mutateAsync({ 
            id: content.id, 
            data: { display_order: swapContent.display_order } 
        });
        await updateMutation.mutateAsync({ 
            id: swapContent.id, 
            data: { display_order: content.display_order } 
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Promotional Content</CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Manage media for your restaurant screens
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setShowAIDialog(true)} variant="outline">
                                <Sparkles className="h-4 w-4 mr-2" />
                                Generate with AI
                            </Button>
                            <Button onClick={() => setShowDialog(true)}>
                                <Upload className="h-4 w-4 mr-2" />
                                Add Content
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Label>Filter by Screen</Label>
                        <Select value={selectedScreen} onValueChange={setSelectedScreen}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Screens</SelectItem>
                                {screenNames.map(name => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-4">
                        {filteredContent.map((content) => (
                            <Card key={content.id}>
                                <CardContent className="p-4">
                                    <div className="flex gap-4">
                                        <div className="w-32 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            {content.media_type === 'video' ? (
                                                <video src={content.media_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={content.media_url} alt={content.title} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold truncate">{content.title || 'Untitled'}</h3>
                                                    <p className="text-sm text-gray-500 truncate">{content.description}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <Switch
                                                        checked={content.is_active}
                                                        onCheckedChange={(checked) => 
                                                            updateMutation.mutate({ 
                                                                id: content.id, 
                                                                data: { is_active: checked } 
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <Badge variant="outline">{content.screen_name}</Badge>
                                                <Badge variant="outline">{content.media_type}</Badge>
                                                {content.media_type !== 'video' && (
                                                    <Badge variant="outline">{content.duration}s</Badge>
                                                )}
                                                {content.ai_generated && (
                                                    <Badge className="bg-purple-100 text-purple-800">
                                                        <Sparkles className="h-3 w-3 mr-1" />
                                                        AI Generated
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => moveContent(content, 'up')}
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => moveContent(content, 'down')}
                                            >
                                                <ArrowDown className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleEdit(content)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => deleteMutation.mutate(content.id)}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {filteredContent.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            No content yet. Add your first promotional content!
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingContent ? 'Edit Content' : 'Add New Content'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Title</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="e.g., Summer Special Offer"
                            />
                        </div>

                        <div>
                            <Label>Description (Optional)</Label>
                            <Textarea
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Brief description"
                            />
                        </div>

                        <div>
                            <Label>Screen Name</Label>
                            <Input
                                value={formData.screen_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, screen_name: e.target.value }))}
                                placeholder="e.g., Main Entrance, Counter, Drive-Thru"
                            />
                        </div>

                        <div>
                            <Label>Upload Media</Label>
                            <Input
                                type="file"
                                accept="image/*,video/*"
                                onChange={handleFileUpload}
                            />
                            {formData.media_url && (
                                <div className="mt-2">
                                    <p className="text-sm text-green-600">File uploaded successfully</p>
                                </div>
                            )}
                        </div>

                        {formData.media_type !== 'video' && (
                            <div>
                                <Label>Duration (seconds)</Label>
                                <Input
                                    type="number"
                                    value={formData.duration}
                                    onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                                    min="1"
                                />
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button onClick={handleSubmit} className="flex-1">
                                {editingContent ? 'Update Content' : 'Add Content'}
                            </Button>
                            <Button onClick={resetForm} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate Content with AI</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Describe what you want to create</Label>
                            <Textarea
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="e.g., A vibrant image promoting our new burger menu with flames and fresh ingredients"
                                rows={4}
                            />
                        </div>
                        <Button 
                            onClick={handleGenerateAI} 
                            className="w-full"
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Generate Image
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}