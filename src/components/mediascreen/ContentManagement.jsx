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
import { Upload, Sparkles, Trash2, Edit, ArrowUp, ArrowDown, ExternalLink, Copy, Plus, Settings, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import AIContentGenerator from './AIContentGenerator';
import AIContentAssistant from './AIContentAssistant';
import FileManager from './FileManager';
import LayoutDesigner from './LayoutDesigner';
import { createPageUrl } from '@/utils';

export default function ContentManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [showScreenDialog, setShowScreenDialog] = useState(false);
    const [showFileManager, setShowFileManager] = useState(false);
    const [showLayoutDesigner, setShowLayoutDesigner] = useState(false);
    const [editingContent, setEditingContent] = useState(null);
    const [selectedScreen, setSelectedScreen] = useState('all');
    const [restaurant, setRestaurant] = useState(null);
    const [screenAction, setScreenAction] = useState(null);
    const [screenName, setScreenName] = useState('');
    const [editingScreenLayout, setEditingScreenLayout] = useState(null);
    const [aiPrompt, setAIPrompt] = useState('');

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        screen_name: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        video_loop_count: 1,
        transition: 'fade',
        display_order: 0,
        is_active: true
    });

    const { data: allContent = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: () => base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
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

    const screenNames = screens.map(s => s.screen_name);
    const maxScreensAllowed = restaurant?.max_screens_allowed || 1;
    const canAddNewScreen = screens.length < maxScreensAllowed;

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

    const createScreenMutation = useMutation({
        mutationFn: (data) => base44.entities.Screen.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens']);
        },
    });

    const updateScreenMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Screen.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens']);
        },
    });

    const deleteScreenMutation = useMutation({
        mutationFn: (id) => base44.entities.Screen.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['screens']);
        },
    });

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const mediaType = file.type.startsWith('video/') ? 'video' : 
                            file.type === 'image/gif' ? 'gif' : 'image';
            
            // Save file metadata to MediaFile entity
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId,
                file_url: file_url,
                file_name: file.name,
                file_type: file.type,
                file_size: file.size
            });
            
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
            video_loop_count: formData.media_type === 'video' ? (formData.video_loop_count || 1) : undefined,
            transition: formData.transition || 'fade',
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
            video_loop_count: 1,
            transition: 'fade',
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
            video_loop_count: content.video_loop_count || 1,
            transition: content.transition || 'fade',
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

    const handleScreenAction = (action, name = '', oldName = '') => {
        setScreenAction({ type: action, oldName });
        setScreenName(name);
        setShowScreenDialog(true);
    };

    const handleScreenSubmit = async () => {
        if (screenAction.type !== 'delete' && !screenName.trim()) {
            toast.error('Please enter a screen name');
            return;
        }

        try {
            if (screenAction.type === 'add') {
                if (screenNames.includes(screenName)) {
                    toast.error('Screen name already exists');
                    return;
                }
                if (!canAddNewScreen) {
                    toast.error(`Maximum ${maxScreensAllowed} screens allowed`);
                    return;
                }
                
                await createScreenMutation.mutateAsync({
                    restaurant_id: restaurantId,
                    screen_name: screenName,
                    is_active: true
                });
                
                toast.success('Screen added successfully!');
            } else if (screenAction.type === 'rename') {
                if (screenNames.includes(screenName) && screenName !== screenAction.oldName) {
                    toast.error('Screen name already exists');
                    return;
                }
                
                const screen = screens.find(s => s.screen_name === screenAction.oldName);
                if (screen) {
                    await updateScreenMutation.mutateAsync({
                        id: screen.id,
                        data: { screen_name: screenName }
                    });
                }
                
                const contentToUpdate = allContent.filter(c => c.screen_name === screenAction.oldName);
                for (const content of contentToUpdate) {
                    await updateMutation.mutateAsync({
                        id: content.id,
                        data: { screen_name: screenName }
                    });
                }
                
                toast.success('Screen renamed successfully');
            } else if (screenAction.type === 'delete') {
                const screen = screens.find(s => s.screen_name === screenName);
                const contentToDelete = allContent.filter(c => c.screen_name === screenName);
                
                if (contentToDelete.length > 0) {
                    const confirm = window.confirm(`This will delete ${contentToDelete.length} content item(s). Continue?`);
                    if (!confirm) return;
                    
                    for (const content of contentToDelete) {
                        await deleteMutation.mutateAsync(content.id);
                    }
                }
                
                if (screen) {
                    await deleteScreenMutation.mutateAsync(screen.id);
                }
                
                toast.success('Screen deleted successfully');
            }

            setShowScreenDialog(false);
            setScreenName('');
            setScreenAction(null);
        } catch (error) {
            toast.error('Failed to update screen');
        }
    };

    const getScreenStats = (screenName) => {
        const screenContent = allContent.filter(c => c.screen_name === screenName);
        const activeContent = screenContent.filter(c => c.is_active).length;
        const totalDuration = screenContent.reduce((sum, c) => sum + (c.duration || 10), 0);
        return { total: screenContent.length, active: activeContent, duration: totalDuration };
    };

    const handleEditLayout = (screenName) => {
        const screen = screens.find(s => s.screen_name === screenName);
        setEditingScreenLayout(screen);
        setShowLayoutDesigner(true);
    };

    const handleSaveLayout = async (layout) => {
        if (!editingScreenLayout) return;

        try {
            await updateScreenMutation.mutateAsync({
                id: editingScreenLayout.id,
                data: { layout_template: layout }
            });
            toast.success('Layout saved successfully!');
            setShowLayoutDesigner(false);
            setEditingScreenLayout(null);
        } catch (error) {
            toast.error('Failed to save layout');
        }
    };

    const handleUseIdea = (idea) => {
        setFormData(prev => ({
            ...prev,
            title: idea.title,
            description: idea.description
        }));
        setAIPrompt(idea.visualSuggestions);
        setShowAIDialog(true);
    };

    return (
        <div className="space-y-6">
            <AIContentAssistant 
                restaurant={restaurant}
                onUseIdea={handleUseIdea}
            />
            
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Promotional Content</CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Manage media for your restaurant screens ({screenNames.length}/{maxScreensAllowed} screens used)
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => setShowFileManager(true)} variant="outline">
                                <FolderOpen className="h-4 w-4 mr-2" />
                                File Manager
                            </Button>
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
                        <Card className="mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Settings className="h-5 w-5 text-blue-600" />
                                        <h3 className="font-semibold text-blue-900">Screen Manager</h3>
                                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                            {screenNames.length}/{maxScreensAllowed}
                                        </Badge>
                                    </div>
                                    {canAddNewScreen && (
                                        <Button
                                            size="sm"
                                            onClick={() => handleScreenAction('add')}
                                            className="bg-blue-600 hover:bg-blue-700"
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            Add Screen
                                        </Button>
                                    )}
                                </div>
                                <div className="grid gap-3">
                                    {screenNames.map(name => {
                                        const stats = getScreenStats(name);
                                        const isEmpty = stats.total === 0;
                                        return (
                                            <div key={name} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <h4 className="font-semibold text-gray-900 truncate">{name}</h4>
                                                                {isEmpty ? (
                                                                    <Badge variant="outline" className="bg-gray-50 text-gray-500 text-xs">
                                                                        Empty
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                                                                        Active
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
                                                                <div>
                                                                    <span className="text-gray-500">Content:</span>
                                                                    <span className="ml-1 font-medium text-gray-900">{stats.total}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500">Active:</span>
                                                                    <span className="ml-1 font-medium text-green-600">{stats.active}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-gray-500">Duration:</span>
                                                                    <span className="ml-1 font-medium text-gray-900">{stats.duration}s</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleEditLayout(name)}
                                                                className="text-xs h-8 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                                                            >
                                                                <Settings className="h-3.5 w-3.5 mr-1" />
                                                                Layout
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => copyScreenUrl(name)}
                                                                className="text-xs h-8"
                                                            >
                                                                <Copy className="h-3.5 w-3.5 mr-1" />
                                                                URL
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleScreenAction('rename', name, name)}
                                                                className="text-xs h-8"
                                                            >
                                                                <Edit className="h-3.5 w-3.5 mr-1" />
                                                                Rename
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleScreenAction('delete', name)}
                                                                className="text-xs h-8 text-red-600 hover:bg-red-50"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                                    <p className="text-sm text-gray-500 line-clamp-2">{content.description}</p>
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
                                                {content.media_type === 'video' ? (
                                                    <Badge variant="outline">Loop: {content.video_loop_count || 1}x</Badge>
                                                ) : (
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
                            <div className="flex gap-2">
                                <Input
                                    type="file"
                                    accept="image/*,video/*"
                                    onChange={handleFileUpload}
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowFileManager(true)}
                                >
                                    <FolderOpen className="h-4 w-4" />
                                </Button>
                            </div>
                            {formData.media_url && (
                                <div className="mt-2">
                                    <p className="text-sm text-green-600">File selected</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {formData.media_type === 'video' ? (
                                <div>
                                    <Label>Loop Count</Label>
                                    <Input
                                        type="number"
                                        value={formData.video_loop_count}
                                        onChange={(e) => setFormData(prev => ({ ...prev, video_loop_count: parseInt(e.target.value) || 1 }))}
                                        min="1"
                                        max="10"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">How many times to loop the video</p>
                                </div>
                            ) : (
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
                            <div>
                                <Label>Transition Effect</Label>
                                <Select
                                    value={formData.transition}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, transition: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="fade">Fade</SelectItem>
                                        <SelectItem value="slide">Slide</SelectItem>
                                        <SelectItem value="zoom">Zoom</SelectItem>
                                        <SelectItem value="none">None</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

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
                onClose={() => {
                    setShowAIDialog(false);
                    setAIPrompt('');
                }}
                onContentGenerated={handleAIContentGenerated}
                restaurantName={restaurant?.name || 'Restaurant'}
                existingContent={editingContent}
                initialPrompt={aiPrompt}
            />

            <FileManager
                restaurantId={restaurantId}
                open={showFileManager}
                onClose={() => setShowFileManager(false)}
                onSelectFile={(fileUrl, fileType) => {
                    const mediaType = fileType.startsWith('video/') ? 'video' : 
                                    fileType === 'image/gif' ? 'gif' : 'image';
                    setFormData(prev => ({ 
                        ...prev, 
                        media_url: fileUrl,
                        media_type: mediaType 
                    }));
                    toast.success('File selected');
                }}
            />

            <LayoutDesigner
                open={showLayoutDesigner}
                onClose={() => {
                    setShowLayoutDesigner(false);
                    setEditingScreenLayout(null);
                }}
                onSave={handleSaveLayout}
                initialLayout={editingScreenLayout?.layout_template}
            />

            <Dialog open={showScreenDialog} onOpenChange={setShowScreenDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {screenAction?.type === 'add' ? 'Add New Screen' : 
                             screenAction?.type === 'delete' ? 'Delete Screen' : 
                             'Rename Screen'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {screenAction?.type === 'delete' ? (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-gray-700 mb-3">
                                    Are you sure you want to delete <strong>"{screenName}"</strong>?
                                </p>
                                {allContent.filter(c => c.screen_name === screenName).length > 0 && (
                                    <div className="bg-white rounded p-3 text-sm text-red-700 border border-red-200">
                                        ⚠️ This will permanently delete {allContent.filter(c => c.screen_name === screenName).length} content item(s) associated with this screen.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>
                                <Label>Screen Name</Label>
                                <Input
                                    value={screenName}
                                    onChange={(e) => setScreenName(e.target.value)}
                                    placeholder="e.g., Main Entrance, Counter, Drive-Thru"
                                    className="mt-1"
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Choose a descriptive name for easy identification
                                </p>
                                {!canAddNewScreen && screenAction?.type === 'add' && (
                                    <div className="bg-orange-50 border border-orange-200 rounded p-3 mt-3">
                                        <p className="text-xs text-orange-700">
                                            ⚠️ Maximum {maxScreensAllowed} screen{maxScreensAllowed > 1 ? 's' : ''} allowed for your plan
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <Button 
                                onClick={handleScreenSubmit} 
                                className="flex-1"
                                variant={screenAction?.type === 'delete' ? 'destructive' : 'default'}
                            >
                                {screenAction?.type === 'add' ? 'Add Screen' : 
                                 screenAction?.type === 'delete' ? 'Delete Screen' : 
                                 'Save Changes'}
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