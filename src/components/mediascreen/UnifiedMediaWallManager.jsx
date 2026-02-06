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
import { Grid3x3, Monitor, Plus, Maximize2, Film, Image as ImageIcon, Clock, Calendar, Trash2, Edit, Eye, ArrowUp, ArrowDown, PlayCircle, Copy, MoveRight, FolderOpen, Upload, Users, Settings, Activity } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ContentScheduler from './ContentScheduler';
import FileManager from './FileManager';
import ContentPreview from './ContentPreview';
import ScreenHealthMonitor from './ScreenHealthMonitor';
import MediaWallPlaylistManager from './MediaWallPlaylistManager';

export default function UnifiedMediaWallManager({ restaurantId, wallName, wallConfig }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showFileManager, setShowFileManager] = useState(false);
    const [contentMode, setContentMode] = useState('individual'); // 'individual', 'row', 'group', or 'fullwall'
    const [selectedPosition, setSelectedPosition] = useState(null);
    const [selectedRow, setSelectedRow] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [editingContent, setEditingContent] = useState(null);
    const [showScheduler, setShowScheduler] = useState(false);
    const [schedulingContent, setSchedulingContent] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewIsFullWall, setPreviewIsFullWall] = useState(false);
    const [showGroupManager, setShowGroupManager] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [selectedScreensForGroup, setSelectedScreensForGroup] = useState([]);
    
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        media_url: '',
        media_type: 'image',
        duration: 10,
        priority: 1,
        is_active: true
    });

    const { data: individualContent = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId, wallName],
        queryFn: async () => {
            const screens = await base44.entities.Screen.filter({ 
                restaurant_id: restaurantId,
                'media_wall_config.wall_name': wallName,
                'media_wall_config.enabled': true
            });
            
            const allContent = [];
            for (const screen of screens) {
                const content = await base44.entities.PromotionalContent.filter({
                    restaurant_id: restaurantId,
                    screen_name: screen.screen_name,
                    is_active: true
                });
                content.forEach(c => allContent.push({ ...c, position: screen.media_wall_config.position }));
            }
            return allContent;
        },
        staleTime: 30000,
        gcTime: 60000,
        enabled: !!restaurantId && !!wallName
    });

    const { data: wallContent = [] } = useQuery({
        queryKey: ['wall-content', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallContent.filter({ 
            restaurant_id: restaurantId,
            wall_name: wallName 
        }),
        staleTime: 30000,
        gcTime: 60000,
        enabled: !!restaurantId && !!wallName
    });

    const { data: screens = [] } = useQuery({
        queryKey: ['wall-screens', restaurantId, wallName],
        queryFn: () => base44.entities.Screen.filter({ 
            restaurant_id: restaurantId,
            'media_wall_config.wall_name': wallName,
            'media_wall_config.enabled': true
        }),
        staleTime: 30000,
        gcTime: 60000,
        enabled: !!restaurantId && !!wallName
    });

    const createIndividualMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content added');
            resetForm();
        }
    });

    const createWallMutation = useMutation({
        mutationFn: (data) => base44.entities.MediaWallContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content added');
            resetForm();
        }
    });

    const updateIndividualMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content updated');
            resetForm();
        }
    });

    const updateWallMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaWallContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content updated');
            resetForm();
        }
    });

    const deleteIndividualMutation = useMutation({
        mutationFn: (id) => base44.entities.PromotionalContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['promotional-content']);
            toast.success('Content deleted');
        }
    });

    const deleteWallMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaWallContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['wall-content']);
            toast.success('Wall content deleted');
        }
    });



    const handleDuplicate = async (item) => {
        try {
            if (item.type === 'fullwall') {
                await createWallMutation.mutateAsync({
                    restaurant_id: restaurantId,
                    wall_name: wallName,
                    title: `${item.title} (Copy)`,
                    description: item.description,
                    media_url: item.media_url,
                    media_type: item.media_type,
                    duration: item.duration,
                    priority: item.priority,
                    is_active: item.is_active,
                    display_order: wallContent.length,
                    schedule: item.schedule
                });
            } else {
                const screen = screens.find(s => 
                    s.media_wall_config.position.row === item.position?.row &&
                    s.media_wall_config.position.col === item.position?.col
                );
                if (screen) {
                    await createIndividualMutation.mutateAsync({
                        restaurant_id: restaurantId,
                        screen_name: screen.screen_name,
                        title: `${item.title} (Copy)`,
                        description: item.description,
                        media_url: item.media_url,
                        media_type: item.media_type,
                        duration: item.duration,
                        priority: item.priority || 1,
                        is_active: item.is_active,
                        display_order: item.display_order + 1,
                        schedule: item.schedule
                    });
                }
            }
            toast.success('Content duplicated');
        } catch (error) {
            toast.error('Failed to duplicate');
        }
    };

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

    const handleAddContent = (mode, position = null, row = null, group = null) => {
        setContentMode(mode);
        setSelectedPosition(position);
        setSelectedRow(row);
        setSelectedGroup(group);
        setEditingContent(null);
        setShowDialog(true);
    };

    const handleSubmit = async () => {
        if (!formData.media_url) {
            toast.error('Please upload media');
            return;
        }

        if (contentMode === 'fullwall') {
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
                display_order: editingContent?.display_order || wallContent.length
            };

            if (editingContent) {
                await updateWallMutation.mutateAsync({ id: editingContent.id, data });
            } else {
                await createWallMutation.mutateAsync(data);
            }
        } else if (contentMode === 'row') {
            // Row-level content - add to all screens in the selected row
            const rowScreens = screens.filter(s => 
                s.media_wall_config.position.row === selectedRow
            );

            if (rowScreens.length === 0) {
                toast.error('No screens found in this row');
                return;
            }

            toast.loading(`Adding content to ${rowScreens.length} screens...`);
            
            try {
                // Create all content items in parallel using bulkCreate
                const contentItems = rowScreens.map(screen => ({
                    restaurant_id: restaurantId,
                    screen_name: screen.screen_name,
                    title: formData.title || 'Untitled',
                    description: formData.description,
                    media_url: formData.media_url,
                    media_type: formData.media_type,
                    duration: formData.duration,
                    priority: formData.priority,
                    is_active: formData.is_active,
                    display_order: 0
                }));
                
                await base44.entities.PromotionalContent.bulkCreate(contentItems);
                
                queryClient.invalidateQueries(['promotional-content']);
                toast.dismiss();
                toast.success(`Content added to row ${selectedRow}`);
                resetForm();
            } catch (error) {
                toast.dismiss();
                toast.error('Failed to add content to row');
            }
        } else if (contentMode === 'group') {
            // Group-level content - add to all screens in the selected group
            const groupScreens = screens.filter(s => 
                s.groups?.includes(selectedGroup)
            );

            if (groupScreens.length === 0) {
                toast.error('No screens found in this group');
                return;
            }

            toast.loading(`Adding content to ${groupScreens.length} screens...`);
            
            try {
                const contentItems = groupScreens.map(screen => ({
                    restaurant_id: restaurantId,
                    screen_name: screen.screen_name,
                    title: formData.title || 'Untitled',
                    description: formData.description,
                    media_url: formData.media_url,
                    media_type: formData.media_type,
                    duration: formData.duration,
                    priority: formData.priority,
                    is_active: formData.is_active,
                    display_order: 0
                }));
                
                await base44.entities.PromotionalContent.bulkCreate(contentItems);
                
                queryClient.invalidateQueries(['promotional-content']);
                toast.dismiss();
                toast.success(`Content added to group "${selectedGroup}"`);
                resetForm();
            } catch (error) {
                toast.dismiss();
                toast.error('Failed to add content to group');
            }
        } else {
            // Individual screen content
            const screen = screens.find(s => 
                s.media_wall_config.position.row === selectedPosition.row &&
                s.media_wall_config.position.col === selectedPosition.col
            );

            if (!screen) {
                toast.error('Screen not found');
                return;
            }

            const data = {
                restaurant_id: restaurantId,
                screen_name: screen.screen_name,
                title: formData.title || 'Untitled',
                description: formData.description,
                media_url: formData.media_url,
                media_type: formData.media_type,
                duration: formData.duration,
                priority: formData.priority,
                is_active: formData.is_active,
                display_order: editingContent?.display_order || 0
            };

            if (editingContent) {
                await updateIndividualMutation.mutateAsync({ id: editingContent.id, data });
            } else {
                await createIndividualMutation.mutateAsync(data);
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
        setSelectedRow(null);
        setSelectedGroup(null);
        setShowDialog(false);
    };

    const getScreenContent = (row, col) => {
        return individualContent.filter(c => 
            c.position?.row === row && c.position?.col === col
        );
    };

    const renderGridCell = (row, col) => {
        const screen = screens.find(s => 
            s.media_wall_config.position.row === row &&
            s.media_wall_config.position.col === col
        );
        const content = getScreenContent(row, col);
        const hasContent = content.length > 0;

        return (
            <div
                key={`${row}-${col}`}
                className={`border-2 rounded-lg p-3 relative transition-all ${
                    screen 
                        ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100' 
                        : 'border-gray-300 bg-gray-50 border-dashed'
                }`}
                style={{ minHeight: '120px' }}
            >
                {screen ? (
                    <>
                        <div className="text-center mb-2">
                            <Monitor className="h-6 w-6 mx-auto text-blue-600 mb-1" />
                            <p className="text-xs font-semibold text-blue-900">{screen.screen_name}</p>
                            <Badge variant="outline" className="text-[10px] mt-1">
                                {row},{col}
                            </Badge>
                        </div>

                        {hasContent ? (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <Badge className="bg-green-100 text-green-700 text-[10px]">
                                        {content.length} item{content.length > 1 ? 's' : ''}
                                    </Badge>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 w-5 p-0"
                                        onClick={() => setPreviewContent(content)}
                                    >
                                        <Eye className="h-3 w-3" />
                                    </Button>
                                </div>
                                <div className="text-[10px] text-gray-600">
                                    {content.reduce((sum, c) => sum + (c.duration || 10), 0)}s total
                                </div>
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-500 text-center">No content</p>
                        )}

                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full mt-2 h-7 text-[10px]"
                            onClick={() => handleAddContent('individual', { row, col })}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                        </Button>
                    </>
                ) : (
                    <div className="text-center">
                        <Monitor className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                        <p className="text-xs text-gray-500">Empty</p>
                    </div>
                )}
            </div>
        );
    };

    // Combine all content into timeline, sorted by display_order
    const timelineContent = [
        ...wallContent.map(c => ({ ...c, type: 'fullwall', screen: 'All Screens' })),
        ...individualContent.map(c => {
            const screen = screens.find(s => 
                s.media_wall_config.position.row === c.position?.row &&
                s.media_wall_config.position.col === c.position?.col
            );
            return { ...c, type: 'individual', screen: screen?.screen_name || 'Unknown' };
        })
    ].sort((a, b) => a.display_order - b.display_order);

    const moveInTimeline = async (item, direction) => {
        try {
            const currentIndex = timelineContent.findIndex(c => c.id === item.id && c.type === item.type);
            if (
                (direction === 'up' && currentIndex === 0) || 
                (direction === 'down' && currentIndex === timelineContent.length - 1)
            ) {
                return;
            }

            const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
            const swapItem = timelineContent[swapIndex];

            const tempOrder = 999999;
            const newOrder1 = swapItem.display_order;
            const newOrder2 = item.display_order;

            // Use temp value to avoid conflicts
            if (item.type === 'fullwall') {
                await updateWallMutation.mutateAsync({ 
                    id: item.id, 
                    data: { display_order: tempOrder } 
                });
            } else {
                await updateIndividualMutation.mutateAsync({ 
                    id: item.id, 
                    data: { display_order: tempOrder } 
                });
            }

            // Update swapped item
            if (swapItem.type === 'fullwall') {
                await updateWallMutation.mutateAsync({ 
                    id: swapItem.id, 
                    data: { display_order: newOrder2 } 
                });
            } else {
                await updateIndividualMutation.mutateAsync({ 
                    id: swapItem.id, 
                    data: { display_order: newOrder2 } 
                });
            }

            // Update original item with correct order
            if (item.type === 'fullwall') {
                await updateWallMutation.mutateAsync({ 
                    id: item.id, 
                    data: { display_order: newOrder1 } 
                });
            } else {
                await updateIndividualMutation.mutateAsync({ 
                    id: item.id, 
                    data: { display_order: newOrder1 } 
                });
            }
            
            toast.success('Reordered');
        } catch (error) {
            console.error('Move failed:', error);
            toast.error('Failed to reorder');
        }
    };

    const moveToScreen = async (item, newScreenPosition) => {
        const newScreen = screens.find(s => 
            s.media_wall_config.position.row === newScreenPosition.row &&
            s.media_wall_config.position.col === newScreenPosition.col
        );
        
        if (!newScreen) {
            toast.error('Screen not found');
            return;
        }

        await updateIndividualMutation.mutateAsync({
            id: item.id,
            data: { screen_name: newScreen.screen_name }
        });
        
        toast.success(`Moved to ${newScreen.screen_name}`);
    };

    return (
        <div className="space-y-6">
            <Tabs defaultValue="timeline">
                <TabsList className="grid w-full grid-cols-8">
                    <TabsTrigger value="health">Health</TabsTrigger>
                    <TabsTrigger value="playlists">Playlists</TabsTrigger>
                    <TabsTrigger value="timeline">Timeline</TabsTrigger>
                    <TabsTrigger value="visual">Visual</TabsTrigger>
                    <TabsTrigger value="groups">Groups</TabsTrigger>
                    <TabsTrigger value="rows">Rows</TabsTrigger>
                    <TabsTrigger value="individual">Individual</TabsTrigger>
                    <TabsTrigger value="fullwall">Full Wall</TabsTrigger>
                </TabsList>

                <TabsContent value="health" className="space-y-4">
                    <ScreenHealthMonitor restaurantId={restaurantId} wallName={wallName} />
                </TabsContent>

                <TabsContent value="playlists" className="space-y-4">
                    <MediaWallPlaylistManager restaurantId={restaurantId} wallName={wallName} />
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <PlayCircle className="h-5 w-5" />
                                        Content Timeline Grid
                                    </CardTitle>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Visual timeline showing content across all screens
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                   <Button size="sm" variant="outline" onClick={() => handleAddContent('fullwall')}>
                                       <Maximize2 className="h-4 w-4 mr-1" />
                                       Full-Wall
                                   </Button>
                                   <Select onValueChange={(value) => handleAddContent('row', null, parseInt(value))}>
                                       <SelectTrigger className="w-32 h-9">
                                           <SelectValue placeholder="Add to Row" />
                                       </SelectTrigger>
                                       <SelectContent>
                                           {Array.from(new Set(screens.map(s => s.media_wall_config.position.row))).sort().map(row => (
                                               <SelectItem key={row} value={row.toString()}>Row {row}</SelectItem>
                                           ))}
                                       </SelectContent>
                                   </Select>
                                   <Button size="sm" onClick={() => {
                                       if (screens.length > 0) {
                                           handleAddContent('individual', screens[0].media_wall_config.position);
                                       }
                                   }}>
                                       <Monitor className="h-4 w-4 mr-1" />
                                       Individual
                                   </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="overflow-x-auto">
                            {timelineContent.length === 0 && wallContent.length === 0 && individualContent.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <PlayCircle className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                                    <p className="text-gray-600 mb-4">No content in timeline</p>
                                    <div className="flex gap-2 justify-center">
                                        <Button size="sm" onClick={() => handleAddContent('fullwall')}>
                                            Add Full-Wall Content
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => {
                                            if (screens.length > 0) {
                                                handleAddContent('individual', screens[0].media_wall_config.position);
                                            }
                                        }}>
                                            Add Individual Content
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    {/* Header Row */}
                                    <div className="flex gap-2 mb-2 pb-2 border-b sticky top-0 bg-white z-10">
                                        <div className="w-32 flex-shrink-0 font-semibold text-sm text-gray-700">
                                            Timeline
                                        </div>
                                        {screens.map(screen => (
                                            <div key={screen.id} className="flex-1 min-w-[200px] max-w-[280px]">
                                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2 text-center">
                                                    <Monitor className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                                                    <p className="text-xs font-semibold text-blue-900 truncate">{screen.screen_name}</p>
                                                    <Badge variant="outline" className="text-[10px] mt-1">
                                                        {screen.media_wall_config.position.row},{screen.media_wall_config.position.col}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <AnimatePresence>
                                        {timelineContent.map((item, index) => (
                                            <motion.div
                                                key={`${item.type}-${item.id}`}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, x: -100 }}
                                                transition={{ duration: 0.2 }}
                                                className="mb-2"
                                            >
                                                {item.type === 'fullwall' ? (
                                                    <div className="flex gap-2">
                                                        <div className="w-32 flex-shrink-0 flex items-center gap-2 border-r pr-2">
                                                            <div className="flex gap-0.5">
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-5 w-5 p-0"
                                                                    onClick={() => moveInTimeline(item, 'up')}
                                                                    disabled={index === 0}
                                                                >
                                                                    <ArrowUp className="h-3 w-3" />
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-5 w-5 p-0"
                                                                    onClick={() => moveInTimeline(item, 'down')}
                                                                    disabled={index === timelineContent.length - 1}
                                                                >
                                                                    <ArrowDown className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                            <div className="flex flex-col items-center flex-1">
                                                                <Badge variant="outline" className="text-xs font-mono">#{index + 1}</Badge>
                                                                <div className="text-[10px] text-gray-500 mt-1">{item.duration}s</div>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-lg p-3 transition-all hover:shadow-md">
                                                            <div className="flex gap-3 items-center">
                                                                <div className="w-20 h-14 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                                                                    {item.media_type === 'video' ? (
                                                                        <video src={item.media_url} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <Badge className="bg-purple-600 text-white mb-1">
                                                                        <Maximize2 className="h-3 w-3 mr-1" />
                                                                        Full Wall - All Screens
                                                                    </Badge>
                                                                    <p className="font-semibold text-sm truncate">{item.title}</p>
                                                                    <div className="flex gap-1 mt-1">
                                                                       <Badge variant="outline" className="text-[10px]">{item.media_type}</Badge>
                                                                       <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                                       {item.priority > 1 && (
                                                                           <Badge variant="outline" className="text-[10px] bg-orange-50">P:{item.priority}</Badge>
                                                                       )}
                                                                       {item.schedule?.enabled && (
                                                                           <Badge variant="outline" className="text-[10px] bg-green-50">
                                                                               <Calendar className="h-2 w-2 mr-1" />Scheduled
                                                                           </Badge>
                                                                       )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1">
                                                                    <Switch
                                                                        checked={item.is_active}
                                                                        onCheckedChange={(checked) => updateWallMutation.mutate({ id: item.id, data: { is_active: checked } })}
                                                                    />
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDuplicate(item)} title="Duplicate">
                                                                        <Copy className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                                                        setPreviewContent([item]);
                                                                        setPreviewIsFullWall(true);
                                                                        setShowPreview(true);
                                                                    }} title="Preview">
                                                                        <Eye className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleSchedule(item, 'fullwall')}>
                                                                        <Clock className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                                                        setEditingContent(item);
                                                                        setContentMode('fullwall');
                                                                        setFormData({
                                                                            title: item.title,
                                                                            description: item.description,
                                                                            media_url: item.media_url,
                                                                            media_type: item.media_type,
                                                                            duration: item.duration,
                                                                            priority: item.priority,
                                                                            is_active: item.is_active
                                                                        });
                                                                        setShowDialog(true);
                                                                    }}>
                                                                        <Edit className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => deleteWallMutation.mutate(item.id)}>
                                                                        <Trash2 className="h-3 w-3 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <div className="w-32 flex-shrink-0 flex items-center gap-2 border-r pr-2">
                                                                <div className="flex gap-0.5">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={() => moveInTimeline(item, 'up')}
                                                                        disabled={index === 0}
                                                                    >
                                                                        <ArrowUp className="h-3 w-3" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-5 w-5 p-0"
                                                                        onClick={() => moveInTimeline(item, 'down')}
                                                                        disabled={index === timelineContent.length - 1}
                                                                    >
                                                                        <ArrowDown className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                                <div className="flex flex-col items-center flex-1">
                                                                    <Badge variant="outline" className="text-xs font-mono">#{index + 1}</Badge>
                                                                    <div className="text-[10px] text-gray-500 mt-1">{item.duration}s</div>
                                                                </div>
                                                            </div>
                                                            {screens.map((screen) => {
                                                                const isCurrentScreen = screen.media_wall_config.position.row === item.position?.row &&
                                                                    screen.media_wall_config.position.col === item.position?.col;
                                                                return (
                                                                    <div key={screen.id} className="flex-1 min-w-[200px] max-w-[280px]">
                                                                        {isCurrentScreen ? (
                                                                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-2 transition-all hover:shadow-md">
                                                                                <div className="flex gap-2 items-center">
                                                                                    <div className="w-16 h-12 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                                                                                        {item.media_type === 'video' ? (
                                                                                            <video src={item.media_url} className="w-full h-full object-cover" />
                                                                                        ) : (
                                                                                            <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex-1 min-w-0">
                                                                                       <p className="text-xs font-semibold truncate">{item.title}</p>
                                                                                       <div className="flex gap-1 mt-1">
                                                                                           <Badge variant="outline" className="text-[10px]">{item.media_type}</Badge>
                                                                                           <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                                                           {item.schedule?.enabled && (
                                                                                               <Badge variant="outline" className="text-[10px] bg-green-50">
                                                                                                   <Calendar className="h-2 w-2" />
                                                                                               </Badge>
                                                                                           )}
                                                                                       </div>
                                                                                        <div className="flex gap-0.5 mt-1 flex-wrap">
                                                                                           <Switch
                                                                                               checked={item.is_active}
                                                                                               onCheckedChange={(checked) => updateIndividualMutation.mutate({ id: item.id, data: { is_active: checked } })}
                                                                                               className="scale-75"
                                                                                           />
                                                                                           <Select onValueChange={(value) => {
                                                                                               const [row, col] = value.split(',').map(Number);
                                                                                               moveToScreen(item, { row, col });
                                                                                           }}>
                                                                                               <SelectTrigger className="h-5 w-5 p-0 border-0">
                                                                                                   <MoveRight className="h-2.5 w-2.5" />
                                                                                               </SelectTrigger>
                                                                                               <SelectContent>
                                                                                                   {screens.filter(s => 
                                                                                                       s.media_wall_config.position.row !== item.position?.row ||
                                                                                                       s.media_wall_config.position.col !== item.position?.col
                                                                                                   ).map(s => (
                                                                                                       <SelectItem key={s.id} value={`${s.media_wall_config.position.row},${s.media_wall_config.position.col}`}>
                                                                                                           {s.screen_name}
                                                                                                       </SelectItem>
                                                                                                   ))}
                                                                                               </SelectContent>
                                                                                           </Select>
                                                                                           <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleDuplicate(item)} title="Duplicate">
                                                                                               <Copy className="h-2.5 w-2.5" />
                                                                                           </Button>
                                                                                           <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => {
                                                                                               setPreviewContent([item]);
                                                                                               setPreviewIsFullWall(false);
                                                                                               setShowPreview(true);
                                                                                           }} title="Preview">
                                                                                               <Eye className="h-2.5 w-2.5" />
                                                                                           </Button>
                                                                                           <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleSchedule(item, 'individual')}>
                                                                                               <Clock className="h-2.5 w-2.5" />
                                                                                           </Button>
                                                                                           <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => {
                                                                                               setEditingContent(item);
                                                                                               setContentMode('individual');
                                                                                               setSelectedPosition(item.position);
                                                                                               setFormData({
                                                                                                   title: item.title,
                                                                                                   description: item.description,
                                                                                                   media_url: item.media_url,
                                                                                                   media_type: item.media_type,
                                                                                                   duration: item.duration,
                                                                                                   priority: item.priority || 1,
                                                                                                   is_active: item.is_active
                                                                                               });
                                                                                               setShowDialog(true);
                                                                                           }}>
                                                                                               <Edit className="h-2.5 w-2.5" />
                                                                                           </Button>
                                                                                           <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteIndividualMutation.mutate(item.id)}>
                                                                                               <Trash2 className="h-2.5 w-2.5 text-red-500" />
                                                                                           </Button>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="border-2 border-dashed border-gray-200 rounded-lg p-2 h-full bg-gray-50 flex items-center justify-center">
                                                                                <Button
                                                                                    size="sm"
                                                                                    variant="ghost"
                                                                                    className="text-xs h-7"
                                                                                    onClick={() => handleAddContent('individual', screen.media_wall_config.position)}
                                                                                >
                                                                                    <Plus className="h-3 w-3 mr-1" />
                                                                                    Add
                                                                                </Button>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                            
                            {(wallContent.length > 0 || individualContent.length > 0) && (
                                <div className="mt-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <p className="text-2xl font-bold text-indigo-900">
                                                {timelineContent.reduce((sum, c) => sum + (c.duration || 10), 0)}s
                                            </p>
                                            <p className="text-xs text-indigo-700">Total Duration</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-purple-900">
                                                {wallContent.length}
                                            </p>
                                            <p className="text-xs text-purple-700">Full-Wall Items</p>
                                        </div>
                                        <div>
                                            <p className="text-2xl font-bold text-blue-900">
                                                {individualContent.length}
                                            </p>
                                            <p className="text-xs text-blue-700">Individual Items</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="visual" className="space-y-4">
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-semibold text-indigo-900 flex items-center gap-2">
                                    <Grid3x3 className="h-5 w-5" />
                                    {wallName}
                                </h3>
                                <p className="text-sm text-indigo-700 mt-1">
                                    {wallConfig?.rows}×{wallConfig?.cols} Grid ({screens.length}/{wallConfig?.rows * wallConfig?.cols} configured)
                                </p>
                            </div>
                            <Button
                                onClick={() => handleAddContent('fullwall')}
                                className="bg-gradient-to-r from-purple-600 to-indigo-600"
                            >
                                <Maximize2 className="h-4 w-4 mr-2" />
                                Add Full-Wall Content
                            </Button>
                        </div>

                        <div 
                            className="grid gap-3 bg-white p-4 rounded-lg"
                            style={{
                                gridTemplateColumns: `repeat(${wallConfig?.cols || 2}, 1fr)`
                            }}
                        >
                            {Array.from({ length: wallConfig?.rows || 2 }, (_, row) =>
                                Array.from({ length: wallConfig?.cols || 2 }, (_, col) =>
                                    renderGridCell(row, col)
                                )
                            )}
                        </div>
                    </div>

                    {wallContent.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Maximize2 className="h-4 w-4" />
                                    Active Full-Wall Content
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {wallContent.map((item) => (
                                        <div key={item.id} className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                            <div className="w-16 h-12 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                                                {item.media_type === 'video' ? (
                                                    <video src={item.media_url} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm truncate">{item.title}</p>
                                                <div className="flex gap-1 mt-1">
                                                    <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                    <Badge variant="outline" className="text-[10px]">Priority: {item.priority}</Badge>
                                                    {item.schedule?.enabled && (
                                                        <Badge variant="outline" className="text-[10px] bg-green-50">
                                                            <Calendar className="h-2 w-2 mr-1" />
                                                            Scheduled
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <Switch
                                                checked={item.is_active}
                                                onCheckedChange={(checked) => 
                                                    updateWallMutation.mutate({ id: item.id, data: { is_active: checked } })
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="groups" className="space-y-4">
                    {(() => {
                        const allGroups = [...new Set(screens.flatMap(s => s.groups || []))];
                        
                        return (
                            <>
                                <Card>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Users className="h-4 w-4" />
                                                    Screen Groups
                                                </CardTitle>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {allGroups.length} groups defined
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => setShowGroupManager(true)}
                                            >
                                                <Settings className="h-3 w-3 mr-1" />
                                                Manage Groups
                                            </Button>
                                        </div>
                                    </CardHeader>
                                </Card>

                                {allGroups.length === 0 ? (
                                    <Card className="border-dashed">
                                        <CardContent className="py-12 text-center">
                                            <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                            <p className="text-gray-600 mb-2">No groups created yet</p>
                                            <p className="text-sm text-gray-500 mb-4">
                                                Create groups to manage content across multiple screens by location or purpose
                                            </p>
                                            <Button onClick={() => setShowGroupManager(true)}>
                                                Create First Group
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ) : (
                                    allGroups.map(group => {
                                        const groupScreens = screens.filter(s => s.groups?.includes(group));
                                        const groupContent = individualContent.filter(c => {
                                            const screen = screens.find(s => 
                                                s.media_wall_config.position.row === c.position?.row &&
                                                s.media_wall_config.position.col === c.position?.col
                                            );
                                            return screen?.groups?.includes(group);
                                        });
                                        
                                        return (
                                            <Card key={group}>
                                                <CardHeader>
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <CardTitle className="text-base flex items-center gap-2">
                                                                <Users className="h-4 w-4" />
                                                                {group}
                                                            </CardTitle>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {groupScreens.length} screens • {groupContent.length} content items
                                                            </p>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleAddContent('group', null, null, group)}
                                                        >
                                                            <Plus className="h-3 w-3 mr-1" />
                                                            Add to Group
                                                        </Button>
                                                    </div>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="grid grid-cols-3 gap-3 mb-4">
                                                        {groupScreens.map(screen => {
                                                            const screenContent = individualContent.filter(c => 
                                                                c.position?.row === screen.media_wall_config.position.row &&
                                                                c.position?.col === screen.media_wall_config.position.col
                                                            );
                                                            return (
                                                                <div key={screen.id} className="border rounded-lg p-2 bg-gradient-to-br from-purple-50 to-pink-50">
                                                                    <div className="text-center mb-2">
                                                                        <Monitor className="h-4 w-4 mx-auto text-purple-600 mb-1" />
                                                                        <p className="text-xs font-semibold text-purple-900 truncate">{screen.screen_name}</p>
                                                                        <Badge variant="outline" className="text-[10px] mt-1">
                                                                            {screenContent.length} items
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    
                                                    {groupContent.length === 0 ? (
                                                        <p className="text-sm text-gray-500 text-center py-4">No content for this group</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-semibold text-gray-700 mb-2">Content across this group:</p>
                                                            {Array.from(new Set(groupContent.map(c => c.media_url))).map((mediaUrl, idx) => {
                                                                const items = groupContent.filter(c => c.media_url === mediaUrl);
                                                                const item = items[0];
                                                                return (
                                                                    <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                                                        <div className="w-16 h-12 bg-gray-900 rounded overflow-hidden">
                                                                            {item.media_type === 'video' ? (
                                                                                <video src={item.media_url} className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                            )}
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <p className="text-sm font-medium">{item.title}</p>
                                                                            <div className="flex gap-1 mt-1">
                                                                                <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                                                <Badge variant="outline" className="text-[10px]">On {items.length} screen{items.length > 1 ? 's' : ''}</Badge>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        );
                                    })
                                )}
                            </>
                        );
                    })()}
                </TabsContent>

                <TabsContent value="rows" className="space-y-4">
                    {screens.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="py-12 text-center">
                                <Grid3x3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-gray-600">No screens configured in this wall</p>
                            </CardContent>
                        </Card>
                    ) : (
                        Array.from(new Set(screens.map(s => s.media_wall_config.position.row))).sort().map(row => {
                            const rowScreens = screens.filter(s => s.media_wall_config.position.row === row);
                            const rowContent = individualContent.filter(c => c.position?.row === row);
                            
                            return (
                                <Card key={row}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Grid3x3 className="h-4 w-4" />
                                                    Row {row}
                                                </CardTitle>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {rowScreens.length} screens • {rowContent.length} content items
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleAddContent('row', null, row)}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Add to Row
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-3 gap-3 mb-4">
                                            {rowScreens.map(screen => {
                                                const screenContent = individualContent.filter(c => 
                                                    c.position?.row === screen.media_wall_config.position.row &&
                                                    c.position?.col === screen.media_wall_config.position.col
                                                );
                                                return (
                                                    <div key={screen.id} className="border rounded-lg p-2 bg-gradient-to-br from-blue-50 to-indigo-50">
                                                        <div className="text-center mb-2">
                                                            <Monitor className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                                                            <p className="text-xs font-semibold text-blue-900 truncate">{screen.screen_name}</p>
                                                            <Badge variant="outline" className="text-[10px] mt-1">
                                                                {screenContent.length} items
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        
                                        {rowContent.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">No content for this row</p>
                                        ) : (
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold text-gray-700 mb-2">Content across this row:</p>
                                                {Array.from(new Set(rowContent.map(c => c.media_url))).map((mediaUrl, idx) => {
                                                    const items = rowContent.filter(c => c.media_url === mediaUrl);
                                                    const item = items[0];
                                                    return (
                                                        <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                                            <div className="w-16 h-12 bg-gray-900 rounded overflow-hidden">
                                                                {item.media_type === 'video' ? (
                                                                    <video src={item.media_url} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium">{item.title}</p>
                                                                <div className="flex gap-1 mt-1">
                                                                    <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                                    <Badge variant="outline" className="text-[10px]">On {items.length} screen{items.length > 1 ? 's' : ''}</Badge>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </TabsContent>

                <TabsContent value="individual" className="space-y-4">
                    {screens.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="py-12 text-center">
                                <Monitor className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                <p className="text-gray-600">No screens configured in this wall</p>
                            </CardContent>
                        </Card>
                    ) : (
                        screens.map(screen => {
                            const content = individualContent.filter(c => 
                                c.position?.row === screen.media_wall_config.position.row &&
                                c.position?.col === screen.media_wall_config.position.col
                            );
                            
                            return (
                                <Card key={screen.id}>
                                    <CardHeader>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <CardTitle className="text-base flex items-center gap-2">
                                                    <Monitor className="h-4 w-4" />
                                                    {screen.screen_name}
                                                </CardTitle>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Position: Row {screen.media_wall_config.position.row}, Col {screen.media_wall_config.position.col}
                                                </p>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleAddContent('individual', screen.media_wall_config.position)}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Add Content
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {content.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">No content for this screen</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {content.map((item, idx) => (
                                                    <div key={item.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                                         <div className="flex gap-0.5">
                                                             <Button
                                                                 size="sm"
                                                                 variant="ghost"
                                                                 className="h-6 w-6 p-0"
                                                                 onClick={() => {
                                                                     if (idx > 0) {
                                                                         const swapItem = content[idx - 1];
                                                                         const tempOrder = 999999;
                                                                         updateIndividualMutation.mutate({
                                                                             id: item.id,
                                                                             data: { display_order: tempOrder }
                                                                         });
                                                                         setTimeout(() => {
                                                                             updateIndividualMutation.mutate({
                                                                                 id: swapItem.id,
                                                                                 data: { display_order: item.display_order }
                                                                             });
                                                                             setTimeout(() => {
                                                                                 updateIndividualMutation.mutate({
                                                                                     id: item.id,
                                                                                     data: { display_order: swapItem.display_order }
                                                                                 });
                                                                             }, 100);
                                                                         }, 100);
                                                                     }
                                                                 }}
                                                                 disabled={idx === 0}
                                                                 title="Move up"
                                                             >
                                                                 <ArrowUp className="h-3 w-3" />
                                                             </Button>
                                                             <Button
                                                                 size="sm"
                                                                 variant="ghost"
                                                                 className="h-6 w-6 p-0"
                                                                 onClick={() => {
                                                                     if (idx < content.length - 1) {
                                                                         const swapItem = content[idx + 1];
                                                                         const tempOrder = 999999;
                                                                         updateIndividualMutation.mutate({
                                                                             id: item.id,
                                                                             data: { display_order: tempOrder }
                                                                         });
                                                                         setTimeout(() => {
                                                                             updateIndividualMutation.mutate({
                                                                                 id: swapItem.id,
                                                                                 data: { display_order: item.display_order }
                                                                             });
                                                                             setTimeout(() => {
                                                                                 updateIndividualMutation.mutate({
                                                                                     id: item.id,
                                                                                     data: { display_order: swapItem.display_order }
                                                                                 });
                                                                             }, 100);
                                                                         }, 100);
                                                                     }
                                                                 }}
                                                                 disabled={idx === content.length - 1}
                                                                 title="Move down"
                                                             >
                                                                 <ArrowDown className="h-3 w-3" />
                                                             </Button>
                                                         </div>
                                                         <div className="w-12 h-9 bg-gray-900 rounded overflow-hidden">
                                                             {item.media_type === 'video' ? (
                                                                 <video src={item.media_url} className="w-full h-full object-cover" />
                                                             ) : (
                                                                 <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                             )}
                                                         </div>
                                                         <div className="flex-1 min-w-0">
                                                             <p className="text-sm font-medium truncate">{item.title}</p>
                                                             <div className="flex gap-1 mt-1">
                                                                 <Badge variant="outline" className="text-[10px]">{item.duration}s</Badge>
                                                                 {item.schedule?.enabled && (
                                                                     <Badge variant="outline" className="text-[10px] bg-green-50">Scheduled</Badge>
                                                                 )}
                                                             </div>
                                                         </div>
                                                         <div className="flex gap-1">
                                                             <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSchedule(item, 'individual')}>
                                                                 <Clock className="h-3 w-3" />
                                                             </Button>
                                                             <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteIndividualMutation.mutate(item.id)}>
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
                        })
                    )}
                </TabsContent>

                <TabsContent value="fullwall" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Full-Wall Content</CardTitle>
                                <Button size="sm" onClick={() => handleAddContent('fullwall')}>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Content
                                </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Content displayed across all {wallConfig?.rows * wallConfig?.cols} screens
                            </p>
                        </CardHeader>
                        <CardContent>
                            {wallContent.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed rounded-lg">
                                    <Maximize2 className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                                    <p className="text-gray-600">No full-wall content</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {wallContent.map((item) => (
                                        <Card key={item.id}>
                                            <CardContent className="p-4">
                                                <div className="flex gap-4">
                                                    <div className="w-32 h-24 bg-gray-900 rounded-lg overflow-hidden">
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
                                                                    updateWallMutation.mutate({ id: item.id, data: { is_active: checked } })
                                                                }
                                                            />
                                                        </div>
                                                        
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            <Badge variant="outline">{item.media_type}</Badge>
                                                            <Badge variant="outline">{item.duration}s</Badge>
                                                            {item.priority > 1 && (
                                                                <Badge className="bg-orange-50 text-orange-700">
                                                                    Priority: {item.priority}
                                                                </Badge>
                                                            )}
                                                            {item.schedule?.enabled && (
                                                                <Badge className="bg-green-50 text-green-700">
                                                                    <Calendar className="h-3 w-3 mr-1" />
                                                                    Scheduled
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        <Button size="sm" variant="ghost" onClick={() => handleSchedule(item, 'fullwall')}>
                                                            <Clock className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => deleteWallMutation.mutate(item.id)}>
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
                    </Card>
                </TabsContent>
            </Tabs>

            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {contentMode === 'fullwall' ? (
                                <span className="flex items-center gap-2">
                                    <Maximize2 className="h-5 w-5" />
                                    {editingContent ? 'Edit' : 'Add'} Full-Wall Content
                                </span>
                            ) : contentMode === 'row' ? (
                                <span className="flex items-center gap-2">
                                    <Grid3x3 className="h-5 w-5" />
                                    Add Content to Row {selectedRow}
                                </span>
                            ) : contentMode === 'group' ? (
                                <span className="flex items-center gap-2">
                                    <Users className="h-5 w-5" />
                                    Add Content to Group "{selectedGroup}"
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Monitor className="h-5 w-5" />
                                    {editingContent ? 'Edit' : 'Add'} Screen Content
                                </span>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {contentMode === 'row' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-sm text-blue-900">
                                    This content will be added to all {screens.filter(s => s.media_wall_config.position.row === selectedRow).length} screens in Row {selectedRow}
                                </p>
                            </div>
                        )}
                        {contentMode === 'group' && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                                <p className="text-sm text-purple-900">
                                    This content will be added to all {screens.filter(s => s.groups?.includes(selectedGroup)).length} screens in group "{selectedGroup}"
                                </p>
                            </div>
                        )}
                        
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
                            <Label>Media File {contentMode === 'fullwall' && '(High Resolution)'}</Label>
                            <p className="text-xs text-gray-500 mb-2">Browse already uploaded files or upload a new file</p>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setShowDialog(false);
                                        setShowFileManager(true);
                                    }}
                                    className="flex-1"
                                >
                                    <FolderOpen className="h-4 w-4 mr-2" />
                                    Browse Uploaded Files
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById('unified-file-upload-input').click()}
                                    className="flex-1"
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload New File
                                </Button>
                            </div>
                            <Input
                                id="unified-file-upload-input"
                                type="file"
                                accept="image/*,video/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            {formData.media_url && (
                                <p className="text-sm text-green-600 mt-2">✓ File selected</p>
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

                        <div className="flex gap-2 pt-2">
                            {formData.media_url && (
                                <Button 
                                    onClick={() => {
                                        setPreviewContent([{
                                            ...formData,
                                            id: editingContent?.id || 'preview',
                                            title: formData.title || 'Preview',
                                        }]);
                                        setPreviewIsFullWall(contentMode === 'fullwall');
                                        setShowPreview(true);
                                    }} 
                                    variant="outline"
                                    className="flex-1"
                                >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Preview
                                </Button>
                            )}
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
                onSave={async ({ schedule, priority }) => {
                    if (!schedulingContent) return;
                    
                    const isWallContent = schedulingContent.__type === 'fullwall';
                    const mutation = isWallContent ? updateWallMutation : updateIndividualMutation;
                    
                    await mutation.mutateAsync({
                        id: schedulingContent.id,
                        data: { schedule, priority }
                    });
                    
                    setShowScheduler(false);
                    setSchedulingContent(null);
                }}
            />

            <ContentPreview
                content={previewContent}
                open={showPreview}
                onClose={() => {
                    setShowPreview(false);
                    setPreviewContent(null);
                }}
                isFullWall={previewIsFullWall}
            />

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
                    setShowDialog(true);
                    toast.success('File selected');
                }}
            />

            <Dialog open={showGroupManager} onOpenChange={setShowGroupManager}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />
                            Manage Screen Groups
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-900">
                                Create groups to manage content across multiple screens based on location or purpose (e.g., "Entrance Displays", "Kitchen Screens")
                            </p>
                        </div>

                        <div className="border rounded-lg p-4">
                            <h3 className="font-semibold mb-3">Create New Group</h3>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Group name (e.g., Entrance Screens)"
                                    value={groupName}
                                    onChange={(e) => setGroupName(e.target.value)}
                                />
                                <Button
                                    onClick={async () => {
                                        if (!groupName.trim()) {
                                            toast.error('Enter a group name');
                                            return;
                                        }
                                        if (selectedScreensForGroup.length === 0) {
                                            toast.error('Select at least one screen');
                                            return;
                                        }

                                        try {
                                            for (const screenId of selectedScreensForGroup) {
                                                const screen = screens.find(s => s.id === screenId);
                                                const currentGroups = screen.groups || [];
                                                await base44.entities.Screen.update(screenId, {
                                                    groups: [...currentGroups, groupName]
                                                });
                                            }
                                            queryClient.invalidateQueries(['wall-screens']);
                                            toast.success(`Group "${groupName}" created`);
                                            setGroupName('');
                                            setSelectedScreensForGroup([]);
                                        } catch (error) {
                                            toast.error('Failed to create group');
                                        }
                                    }}
                                >
                                    Create Group
                                </Button>
                            </div>
                            
                            <div className="mt-4 space-y-2">
                                <p className="text-sm font-medium">Select screens for this group:</p>
                                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                                    {screens.map(screen => (
                                        <label key={screen.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedScreensForGroup.includes(screen.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedScreensForGroup([...selectedScreensForGroup, screen.id]);
                                                    } else {
                                                        setSelectedScreensForGroup(selectedScreensForGroup.filter(id => id !== screen.id));
                                                    }
                                                }}
                                                className="rounded"
                                            />
                                            <span className="text-sm">{screen.screen_name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="border rounded-lg p-4">
                            <h3 className="font-semibold mb-3">Existing Groups</h3>
                            {(() => {
                                const allGroups = [...new Set(screens.flatMap(s => s.groups || []))];
                                
                                if (allGroups.length === 0) {
                                    return <p className="text-sm text-gray-500">No groups created yet</p>;
                                }

                                return (
                                    <div className="space-y-2">
                                        {allGroups.map(group => {
                                            const groupScreens = screens.filter(s => s.groups?.includes(group));
                                            return (
                                                <div key={group} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                                                    <div>
                                                        <p className="font-medium text-sm">{group}</p>
                                                        <p className="text-xs text-gray-600">{groupScreens.length} screens</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={async () => {
                                                            if (!confirm(`Remove group "${group}"?`)) return;
                                                            
                                                            try {
                                                                for (const screen of groupScreens) {
                                                                    await base44.entities.Screen.update(screen.id, {
                                                                        groups: (screen.groups || []).filter(g => g !== group)
                                                                    });
                                                                }
                                                                queryClient.invalidateQueries(['wall-screens']);
                                                                toast.success('Group removed');
                                                            } catch (error) {
                                                                toast.error('Failed to remove group');
                                                            }
                                                        }}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );

    function handleSchedule(item, type) {
        setSchedulingContent({ ...item, __type: type });
        setShowScheduler(true);
    }
}