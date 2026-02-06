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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Maximize2, Monitor, Plus, Trash2, Edit, Eye, Clock, Grid3x3, Activity, Settings as SettingsIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'sonner';
import ContentScheduler from './ContentScheduler';
import FileManager from './FileManager';
import ContentPreview from './ContentPreview';
import ScreenHealthMonitor from './ScreenHealthMonitor';
import MediaWallPlaylistManager from './MediaWallPlaylistManager';
import MediaWallSettings from './MediaWallSettings';
import MediaWallContentTimeline from './MediaWallContentTimeline';
import LayoutTemplateManager from './LayoutTemplateManager';
import WidgetConfigurationManager from './WidgetConfigurationManager';

export default function UnifiedMediaWallManager({ restaurantId, wallName, wallConfig }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('timeline');
    const [showContentDialog, setShowContentDialog] = useState(false);
    const [showFileManager, setShowFileManager] = useState(false);
    const [showScheduler, setShowScheduler] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [contentMode, setContentMode] = useState('fullwall'); // 'fullwall' or 'individual'
    const [selectedScreen, setSelectedScreen] = useState(null);
    const [editingContent, setEditingContent] = useState(null);
    const [schedulingContent, setSchedulingContent] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        priority: 1,
        is_active: true
    });

    // Fetch screens
    const { data: screens = [], isLoading: screensLoading } = useQuery({
        queryKey: ['wall-screens', restaurantId, wallName],
        queryFn: () => base44.entities.Screen.filter({ 
            restaurant_id: restaurantId,
            'media_wall_config.wall_name': wallName,
            'media_wall_config.enabled': true
        }),
        staleTime: 30000,
        enabled: !!restaurantId && !!wallName
    });

    // Fetch full-wall content
    const { data: fullWallContent = [], isLoading: wallContentLoading } = useQuery({
        queryKey: ['wall-content', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallContent.filter({ 
            restaurant_id: restaurantId,
            wall_name: wallName 
        }),
        staleTime: 30000,
        enabled: !!restaurantId && !!wallName
    });

    // Fetch individual screen content
    const { data: individualContent = [], isLoading: individualLoading } = useQuery({
        queryKey: ['individual-content', restaurantId, wallName],
        queryFn: async () => {
            if (!screens.length) return [];
            const allContent = [];
            for (const screen of screens) {
                const content = await base44.entities.PromotionalContent.filter({
                    restaurant_id: restaurantId,
                    screen_name: screen.screen_name
                });
                content.forEach(c => allContent.push({ 
                    ...c, 
                    screenId: screen.id,
                    position: screen.media_wall_config.position 
                }));
            }
            return allContent;
        },
        staleTime: 30000,
        enabled: !!restaurantId && !!wallName && screens.length > 0
    });

    // Fetch layout templates
    const { data: layoutTemplates = [] } = useQuery({
        queryKey: ['layout-templates', restaurantId],
        queryFn: () => base44.entities.LayoutTemplate.filter({ restaurant_id: restaurantId }),
        staleTime: 60000,
        enabled: !!restaurantId
    });

    // Mutations
    const createWallContentMutation = useMutation({
        mutationFn: (data) => base44.entities.MediaWallContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Full-wall content added');
            resetForm();
        }
    });

    const updateWallContentMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaWallContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Content updated');
            resetForm();
        }
    });

    const deleteWallContentMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaWallContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Content deleted');
        }
    });

    const createIndividualContentMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-content']);
            toast.success('Screen content added');
            resetForm();
        }
    });

    const updateIndividualContentMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-content']);
            toast.success('Content updated');
            resetForm();
        }
    });

    const deleteIndividualContentMutation = useMutation({
        mutationFn: (id) => base44.entities.PromotionalContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-content']);
            toast.success('Content deleted');
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

    const handleOpenDialog = (mode, screen = null, editItem = null) => {
        setContentMode(mode);
        setSelectedScreen(screen);
        setEditingContent(editItem);
        
        if (editItem) {
            setFormData({
                title: editItem.title,
                description: editItem.description,
                media_url: editItem.media_url,
                media_type: editItem.media_type,
                duration: editItem.duration,
                priority: editItem.priority,
                is_active: editItem.is_active
            });
        }
        
        setShowContentDialog(true);
    };

    const handleSubmit = async () => {
        if (!formData.media_url && !formData.media_type.startsWith('widget_')) {
            toast.error('Please upload media');
            return;
        }

        if (contentMode === 'fullwall') {
            const data = {
                restaurant_id: restaurantId,
                wall_name: wallName,
                title: formData.title || 'Untitled',
                description: formData.description,
                media_url: formData.media_type.startsWith('widget_') ? 'widget' : formData.media_url,
                media_type: formData.media_type,
                duration: formData.duration,
                priority: formData.priority,
                is_active: formData.is_active,
                display_order: editingContent?.display_order || fullWallContent.length,
                sync_enabled: true
            };

            if (editingContent) {
                await updateWallContentMutation.mutateAsync({ id: editingContent.id, data });
            } else {
                await createWallContentMutation.mutateAsync(data);
            }
        } else {
            if (!selectedScreen) {
                toast.error('No screen selected');
                return;
            }

            const data = {
                restaurant_id: restaurantId,
                screen_name: selectedScreen.screen_name,
                title: formData.title || 'Untitled',
                description: formData.description,
                media_url: formData.media_type.startsWith('widget_') ? 'widget' : formData.media_url,
                media_type: formData.media_type,
                duration: formData.duration,
                priority: formData.priority,
                is_active: formData.is_active,
                display_order: editingContent?.display_order || individualContent.filter(c => c.screenId === selectedScreen.id).length
            };

            if (editingContent) {
                await updateIndividualContentMutation.mutateAsync({ id: editingContent.id, data });
            } else {
                await createIndividualContentMutation.mutateAsync(data);
            }
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
        setSelectedScreen(null);
        setShowContentDialog(false);
    };

    const handleSchedule = (content, type) => {
        setSchedulingContent({ ...content, __type: type });
        setShowScheduler(true);
    };

    const isLoading = screensLoading || wallContentLoading || individualLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading media wall...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="fullwall">Full Wall</TabsTrigger>
                    <TabsTrigger value="screens">Screens</TabsTrigger>
                    <TabsTrigger value="playlists">Playlists</TabsTrigger>
                    <TabsTrigger value="health">Health</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                {/* Timeline View */}
                <TabsContent value="timeline" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <Grid3x3 className="h-5 w-5" />
                                    Content Timeline
                                </CardTitle>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleOpenDialog('fullwall')}>
                                        <Maximize2 className="h-4 w-4 mr-1" />
                                        Full Wall
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <MediaWallContentTimeline
                                content={individualContent}
                                layouts={layoutTemplates}
                                onAddToTimeline={() => {}}
                                onRemoveFromTimeline={() => {}}
                                onApplyLayout={() => {}}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Full Wall Content */}
                <TabsContent value="fullwall" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Full-Wall Content</CardTitle>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Content displayed synchronized across all {screens.length} screens
                                    </p>
                                </div>
                                <Button onClick={() => handleOpenDialog('fullwall')}>
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add Content
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {fullWallContent.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <Maximize2 className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                                    <p className="text-gray-600 mb-4">No full-wall content</p>
                                    <Button onClick={() => handleOpenDialog('fullwall')}>
                                        Add Your First Content
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {fullWallContent
                                        .sort((a, b) => a.display_order - b.display_order)
                                        .map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex gap-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg"
                                            >
                                                <div className="w-32 h-24 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                                                    {item.media_type === 'video' ? (
                                                        <video src={item.media_url} className="w-full h-full object-cover" />
                                                    ) : item.media_type.startsWith('widget_') ? (
                                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs">
                                                            {item.media_type === 'widget_time' && '🕐 Time'}
                                                            {item.media_type === 'widget_weather' && '🌤️ Weather'}
                                                            {item.media_type === 'widget_orders' && '📦 Orders'}
                                                        </div>
                                                    ) : (
                                                        <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                    )}
                                                </div>
                                                
                                                <div className="flex-1">
                                                    <h3 className="font-semibold">{item.title}</h3>
                                                    <p className="text-sm text-gray-600">{item.description}</p>
                                                    
                                                    <div className="flex gap-2 mt-2">
                                                        <Badge variant="outline">{item.media_type}</Badge>
                                                        <Badge variant="outline">{item.duration}s</Badge>
                                                        {item.priority > 1 && (
                                                            <Badge className="bg-orange-100 text-orange-700">
                                                                Priority: {item.priority}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        checked={item.is_active}
                                                        onCheckedChange={(checked) => 
                                                            updateWallContentMutation.mutate({ id: item.id, data: { is_active: checked } })
                                                        }
                                                    />
                                                    <Button size="sm" variant="ghost" onClick={() => handleSchedule(item, 'fullwall')}>
                                                        <Clock className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleOpenDialog('fullwall', null, item)}>
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => {
                                                        if (confirm('Delete this content?')) {
                                                            deleteWallContentMutation.mutate(item.id);
                                                        }
                                                    }}>
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Individual Screens */}
                <TabsContent value="screens" className="space-y-4">
                    {screens.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Monitor className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-gray-600">No screens configured</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4">
                            {screens.map(screen => {
                                const content = individualContent.filter(c => c.screenId === screen.id);
                                
                                return (
                                    <Card key={screen.id}>
                                        <CardHeader>
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <CardTitle className="flex items-center gap-2">
                                                        <Monitor className="h-4 w-4" />
                                                        {screen.screen_name}
                                                    </CardTitle>
                                                    <p className="text-sm text-gray-500 mt-1">
                                                        Position: Row {screen.media_wall_config.position.row}, Col {screen.media_wall_config.position.col}
                                                        {screen.layout_template && ` • Layout: ${screen.layout_template.name}`}
                                                    </p>
                                                </div>
                                                <Button size="sm" onClick={() => handleOpenDialog('individual', screen)}>
                                                    <Plus className="h-4 w-4 mr-1" />
                                                    Add Content
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {content.length === 0 ? (
                                                <p className="text-sm text-gray-500 text-center py-4">No content for this screen</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {content
                                                        .sort((a, b) => a.display_order - b.display_order)
                                                        .map((item) => (
                                                            <div
                                                                key={item.id}
                                                                className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"
                                                            >
                                                                <div className="w-16 h-12 bg-gray-900 rounded overflow-hidden">
                                                                    {item.media_type === 'video' ? (
                                                                        <video src={item.media_url} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <p className="font-medium text-sm">{item.title}</p>
                                                                    <div className="flex gap-1 mt-1">
                                                                        <Badge variant="outline" className="text-xs">{item.duration}s</Badge>
                                                                        <Badge variant="outline" className="text-xs">{item.media_type}</Badge>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Switch
                                                                        checked={item.is_active}
                                                                        onCheckedChange={(checked) => 
                                                                            updateIndividualContentMutation.mutate({ id: item.id, data: { is_active: checked } })
                                                                        }
                                                                        className="scale-75"
                                                                    />
                                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSchedule(item, 'individual')}>
                                                                        <Clock className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleOpenDialog('individual', screen, item)}>
                                                                        <Edit className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                                                                        if (confirm('Delete this content?')) {
                                                                            deleteIndividualContentMutation.mutate(item.id);
                                                                        }
                                                                    }}>
                                                                        <Trash2 className="h-3 w-3 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                    
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Grid3x3 className="h-5 w-5" />
                                Layout Templates
                            </CardTitle>
                            <p className="text-sm text-gray-500 mt-1">
                                Create zone layouts for individual screens
                            </p>
                        </CardHeader>
                        <CardContent>
                            <LayoutTemplateManager restaurantId={restaurantId} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Playlists */}
                <TabsContent value="playlists" className="space-y-4">
                    <MediaWallPlaylistManager restaurantId={restaurantId} wallName={wallName} />
                </TabsContent>

                {/* Health Monitor */}
                <TabsContent value="health" className="space-y-4">
                    <ScreenHealthMonitor restaurantId={restaurantId} wallName={wallName} />
                </TabsContent>

                {/* Settings */}
                <TabsContent value="settings" className="space-y-4">
                    <MediaWallSettings restaurantId={restaurantId} />
                </TabsContent>
            </Tabs>

            {/* Content Dialog */}
            <Dialog open={showContentDialog} onOpenChange={setShowContentDialog}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {contentMode === 'fullwall' ? (
                                <span className="flex items-center gap-2">
                                    <Maximize2 className="h-5 w-5" />
                                    {editingContent ? 'Edit' : 'Add'} Full-Wall Content
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Monitor className="h-5 w-5" />
                                    {editingContent ? 'Edit' : 'Add'} Content - {selectedScreen?.screen_name}
                                </span>
                            )}
                        </DialogTitle>
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
                                rows={2}
                            />
                        </div>

                        <div>
                            <Label>Content Type</Label>
                            <Select
                                value={formData.media_type}
                                onValueChange={(value) => setFormData(prev => ({ 
                                    ...prev, 
                                    media_type: value,
                                    media_url: value.startsWith('widget_') ? 'widget' : prev.media_url
                                }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="image">Image</SelectItem>
                                    <SelectItem value="video">Video</SelectItem>
                                    {contentMode === 'fullwall' && (
                                        <>
                                            <SelectItem value="widget_time">Widget: Time & Date</SelectItem>
                                            <SelectItem value="widget_weather">Widget: Weather</SelectItem>
                                            <SelectItem value="widget_orders">Widget: Collection Orders</SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {!formData.media_type.startsWith('widget_') && (
                            <div>
                                <Label>Media File</Label>
                                <div className="flex gap-2 mt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            setShowContentDialog(false);
                                            setShowFileManager(true);
                                        }}
                                        className="flex-1"
                                    >
                                        Browse Files
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => document.getElementById('file-upload').click()}
                                        className="flex-1"
                                    >
                                        Upload New
                                    </Button>
                                </div>
                                <Input
                                    id="file-upload"
                                    type="file"
                                    accept="image/*,video/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                {formData.media_url && formData.media_url !== 'widget' && (
                                    <p className="text-sm text-green-600 mt-2">✓ File selected</p>
                                )}
                            </div>
                        )}

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

                        <div className="flex gap-2 pt-2">
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

            {/* File Manager */}
            <FileManager
                restaurantId={restaurantId}
                open={showFileManager}
                onClose={() => setShowFileManager(false)}
                onSelectFile={(fileUrl, fileType) => {
                    const mediaType = fileType.startsWith('video/') ? 'video' : 'image';
                    setFormData(prev => ({ 
                        ...prev, 
                        media_url: fileUrl,
                        media_type: mediaType 
                    }));
                    setShowFileManager(false);
                    setShowContentDialog(true);
                    toast.success('File selected');
                }}
            />

            {/* Content Scheduler */}
            <ContentScheduler
                open={showScheduler}
                onClose={() => {
                    setShowScheduler(false);
                    setSchedulingContent(null);
                }}
                content={schedulingContent}
                onSave={async ({ schedule, priority }) => {
                    if (!schedulingContent) return;
                    
                    const isWallContent = schedulingContent.__type === 'fullwall';
                    const mutation = isWallContent ? updateWallContentMutation : updateIndividualContentMutation;
                    
                    await mutation.mutateAsync({
                        id: schedulingContent.id,
                        data: { schedule, priority }
                    });
                    
                    setShowScheduler(false);
                    setSchedulingContent(null);
                }}
            />

            {/* Content Preview */}
            <ContentPreview
                content={previewContent}
                open={showPreview}
                onClose={() => {
                    setShowPreview(false);
                    setPreviewContent(null);
                }}
                isFullWall={contentMode === 'fullwall'}
            />
        </div>
    );
}