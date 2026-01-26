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
import { Upload, Sparkles, Trash2, Edit, ArrowUp, ArrowDown, ExternalLink, Copy, Plus, Settings } from 'lucide-react';
import { toast } from 'sonner';
import AIContentGenerator from './AIContentGenerator';
import { createPageUrl } from '@/utils';

export default function ContentManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [showScreenDialog, setShowScreenDialog] = useState(false);
    const [editingContent, setEditingContent] = useState(null);
    const [selectedScreen, setSelectedScreen] = useState('all');
    const [restaurant, setRestaurant] = useState(null);
    const [screenAction, setScreenAction] = useState(null);
    const [screenName, setScreenName] = useState('');

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

    useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            if (restaurants[0]) setRestaurant(restaurants[0]);
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const sortedContent = [...allContent].sort((a, b) => a.display_order - b.display_order);

    const filteredContent = selectedScreen === 'all' 
        ? sortedContent 
        : sortedContent.filter(c => c.screen_name === selectedScreen);

    const screenNames = [...new Set(allContent.map(c => c.screen_name).filter(Boolean))];
    const maxScreensAllowed = restaurant?.max_screens_allowed || 1;
    const canAddNewScreen = screenNames.length < maxScreensAllowed;

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content created successfully');
            resetForm();
        },
        onError: (error) => {
            console.error('Create error:', error);
            toast.error('Failed to create content: ' + (error.message || 'Unknown error'));
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content updated successfully');
            resetForm();
        },
        onError: (error) => {
            console.error('Update error:', error);
            toast.error('Failed to update content: ' + (error.message || 'Unknown error'));
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

    const handleSubmit = async () => {
        if (!formData.media_url || !formData.screen_name) {
            toast.error('Please provide media and screen name');
            return;
        }

        if (!restaurantId) {
            toast.error('Restaurant ID is missing');
            return;
        }

        // Check screen limit when adding new screen
        if (!editingContent && !screenNames.includes(formData.screen_name)) {
            if (!canAddNewScreen) {
                toast.error(`Maximum ${maxScreensAllowed} screen${maxScreensAllowed > 1 ? 's' : ''} allowed. Please contact admin to increase limit.`);
                return;
            }
        }

        const data = {
            restaurant_id: restaurantId,
            title: formData.title || 'Untitled',
            description: formData.description || '',
            screen_name: formData.screen_name.trim(),
            media_url: formData.media_url,
            media_type: formData.media_type,
            duration: formData.duration || 10,
            display_order: formData.display_order || 0,
            is_active: formData.is_active !== false,
        };

        console.log('Submitting data:', data);

        try {
            if (editingContent) {
                await updateMutation.mutateAsync({ id: editingContent.id, data });
            } else {
                await createMutation.mutateAsync(data);
            }
        } catch (error) {
            console.error('Submit error:', error);
        }
    };

    const handleAIContentGenerated = (aiContent) => {
        setFormData(prev => ({ 
            ...prev, 
            ...aiContent
        }));
        setShowAIDialog(false);
        setShowDialog(true);
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

    const copyScreenUrl = (screenName) => {
        const baseUrl = window.location.origin;
        const url = `${baseUrl}${createPageUrl('MediaScreen')}?restaurantId=${restaurantId}&screenName=${encodeURIComponent(screenName)}`;
        navigator.clipboard.writeText(url);
        toast.success('Screen URL copied to clipboard');
    };

    const handleScreenAction = (action, name = '') => {
        setScreenAction(action);
        setScreenName(name);
        setShowScreenDialog(true);
    };

    const handleScreenSubmit = async () => {
        if (!screenName.trim()) {
            toast.error('Please enter a screen name');
            return;
        }

        if (screenAction === 'add') {
            if (screenNames.includes(screenName)) {
                toast.error('Screen name already exists');
                return;
            }
            if (!canAddNewScreen) {
                toast.error(`Maximum ${maxScreensAllowed} screens allowed`);
                return;
            }
            toast.success('Screen added. You can now add content to it.');
        } else if (screenAction === 'rename') {
            const oldName = screenAction.oldName;
            const contentToUpdate = allContent.filter(c => c.screen_name === oldName);
            
            for (const content of contentToUpdate) {
                await updateMutation.mutateAsync({
                    id: content.id,
                    data: { screen_name: screenName }
                });
            }
            toast.success('Screen renamed successfully');
        } else if (screenAction === 'delete') {
            const contentToDelete = allContent.filter(c => c.screen_name === screenName);
            
            if (contentToDelete.length > 0) {
                const confirm = window.confirm(`This will delete ${contentToDelete.length} content item(s). Continue?`);
                if (!confirm) return;
                
                for (const content of contentToDelete) {
                    await deleteMutation.mutateAsync(content.id);
                }
            }
            toast.success('Screen deleted successfully');
        }

        setShowScreenDialog(false);
        setScreenName('');
        setScreenAction(null);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Promotional Content</CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Manage media for your restaurant screens ({screenNames.length}/{maxScreensAllowed} screens used)
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => handleScreenAction('add')} variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                Manage Screens
                            </Button>
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
                    {screenNames.length > 0 && (
                        <Card className="mb-6 bg-blue-50 border-blue-200">
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings className="h-5 w-5 text-blue-600" />
                                    <h3 className="font-semibold text-blue-900">Your Screens</h3>
                                </div>
                                <div className="grid gap-2">
                                    {screenNames.map(name => {
                                        const contentCount = allContent.filter(c => c.screen_name === name).length;
                                        return (
                                            <div key={name} className="flex items-center justify-between p-3 bg-white rounded-lg">
                                                <div className="flex-1">
                                                    <p className="font-medium">{name}</p>
                                                    <p className="text-xs text-gray-500">{contentCount} content item(s)</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => copyScreenUrl(name)}
                                                    >
                                                        <Copy className="h-4 w-4 mr-1" />
                                                        Copy URL
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setScreenAction({ action: 'rename', oldName: name });
                                                            setScreenName(name);
                                                            setShowScreenDialog(true);
                                                        }}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleScreenAction('delete', name)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {canAddNewScreen && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleScreenAction('add')}
                                            className="w-full border-dashed"
                                        >
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add New Screen ({screenNames.length}/{maxScreensAllowed})
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

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
                            <Select
                                value={formData.screen_name}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, screen_name: value }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select or type new screen name" />
                                </SelectTrigger>
                                <SelectContent>
                                    {screenNames.map(name => (
                                        <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input
                                value={formData.screen_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, screen_name: e.target.value }))}
                                placeholder="Or type new screen name (e.g., Main Entrance)"
                                className="mt-2"
                            />
                            {!canAddNewScreen && !screenNames.includes(formData.screen_name) && formData.screen_name && (
                                <p className="text-xs text-red-600 mt-1">
                                    Maximum {maxScreensAllowed} screen{maxScreensAllowed > 1 ? 's' : ''} allowed
                                </p>
                            )}
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

            <AIContentGenerator
                open={showAIDialog}
                onClose={() => setShowAIDialog(false)}
                onContentGenerated={handleAIContentGenerated}
                restaurantName={restaurant?.name || 'Restaurant'}
            />

            <Dialog open={showScreenDialog} onOpenChange={setShowScreenDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {screenAction === 'add' ? 'Add New Screen' : 
                             screenAction === 'delete' ? 'Delete Screen' : 
                             'Rename Screen'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {screenAction === 'delete' ? (
                            <div>
                                <p className="text-sm text-gray-600 mb-4">
                                    Are you sure you want to delete the screen "{screenName}"?
                                </p>
                                {allContent.filter(c => c.screen_name === screenName).length > 0 && (
                                    <p className="text-sm text-red-600">
                                        This will also delete all content associated with this screen.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div>
                                <Label>Screen Name</Label>
                                <Input
                                    value={screenName}
                                    onChange={(e) => setScreenName(e.target.value)}
                                    placeholder="e.g., Main Entrance, Counter, Drive-Thru"
                                />
                                {!canAddNewScreen && screenAction === 'add' && (
                                    <p className="text-xs text-red-600 mt-1">
                                        Maximum {maxScreensAllowed} screen{maxScreensAllowed > 1 ? 's' : ''} allowed
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <Button 
                                onClick={handleScreenSubmit} 
                                className="flex-1"
                                variant={screenAction === 'delete' ? 'destructive' : 'default'}
                            >
                                {screenAction === 'add' ? 'Add Screen' : 
                                 screenAction === 'delete' ? 'Delete Screen' : 
                                 'Rename Screen'}
                            </Button>
                            <Button 
                                onClick={() => {
                                    setShowScreenDialog(false);
                                    setScreenName('');
                                    setScreenAction(null);
                                }} 
                                variant="outline"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}