import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
    Monitor, Plus, Trash2, GripVertical, Play, Image as ImageIcon,
    Film, Clock, Copy, ExternalLink, Edit, RotateCw, X,
    Zap, Cloud, ShoppingBag, TrendingUp, Users, Timer
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import ContentScheduler from './ContentScheduler';
import InlinePhotoEditor from './InlinePhotoEditor';
import VideoEditor from './VideoEditor';

const WIDGET_TYPE_META = {
    weather: { label: 'Weather', icon: Cloud, color: 'text-sky-500' },
    clock: { label: 'Clock', icon: Clock, color: 'text-violet-500' },
    orders: { label: 'Live Orders', icon: ShoppingBag, color: 'text-amber-500' },
    stock_ticker: { label: 'Stock Ticker', icon: TrendingUp, color: 'text-emerald-500' },
    queue_status: { label: 'Queue Status', icon: Users, color: 'text-orange-500' },
    countdown_timer: { label: 'Countdown', icon: Timer, color: 'text-pink-500' },
};

export default function StudioPlaylists({ restaurantId }) {
    const queryClient = useQueryClient();
    const [selectedScreen, setSelectedScreen] = useState(null);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showScheduler, setShowScheduler] = useState(false);
    const [schedulingContent, setSchedulingContent] = useState(null);
    const [showAddScreen, setShowAddScreen] = useState(false);
    const [newScreenName, setNewScreenName] = useState('');
    const [editingItem, setEditingItem] = useState(null);
    const [editingPhoto, setEditingPhoto] = useState(null); // { id, media_url }
    const [editingVideo, setEditingVideo] = useState(null);
    const [showWidgetPicker, setShowWidgetPicker] = useState(false);

    const { data: screens = [] } = useQuery({
        queryKey: ['screens', restaurantId],
        queryFn: () => base44.entities.Screen.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: allContent = [] } = useQuery({
        queryKey: ['promotional-content', restaurantId],
        queryFn: () => base44.entities.PromotionalContent.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: widgetConfigs = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: () => base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    const { data: mediaFiles = [] } = useQuery({
        queryKey: ['media-files', restaurantId],
        queryFn: () => base44.entities.MediaFile.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId,
    });

    useEffect(() => {
        if (screens.length > 0 && !selectedScreen) {
            setSelectedScreen(screens[0]);
        }
    }, [screens]);

    const createScreenMutation = useMutation({
        mutationFn: (data) => base44.entities.Screen.create(data),
        onSuccess: (newScreen) => {
            queryClient.invalidateQueries({ queryKey: ['screens', restaurantId] });
            setSelectedScreen(newScreen);
            setShowAddScreen(false);
            setNewScreenName('');
            toast.success('Screen added');
        }
    });

    const createContentMutation = useMutation({
        mutationFn: (data) => base44.entities.PromotionalContent.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content', restaurantId] });
            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
            setShowAddDialog(false);
            toast.success('Item added to playlist');
        }
    });

    const updateContentMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.PromotionalContent.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content', restaurantId] });
        }
    });

    const deleteContentMutation = useMutation({
        mutationFn: (id) => base44.entities.PromotionalContent.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['promotional-content', restaurantId] });
            toast.success('Item removed');
        }
    });

    const deleteScreenMutation = useMutation({
        mutationFn: (id) => base44.entities.Screen.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['screens', restaurantId] });
            setSelectedScreen(null);
            toast.success('Screen deleted');
        }
    });

    const screenPlaylist = selectedScreen
        ? [...allContent]
            .filter(c => c.screen_name === selectedScreen.screen_name)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
        : [];

    const totalDuration = screenPlaylist.reduce((sum, c) => sum + (c.duration || 10), 0);

    const handleDragEnd = async (result) => {
        if (!result.destination || result.source.index === result.destination.index) return;
        const items = Array.from(screenPlaylist);
        const [reordered] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reordered);
        const updates = items.map((item, index) =>
            updateContentMutation.mutateAsync({ id: item.id, data: { display_order: index } })
        );
        await Promise.all(updates);
    };

    const handleAddWidget = async (widgetConfig) => {
        if (!selectedScreen) { toast.error('Select a screen first'); return; }
        await createContentMutation.mutateAsync({
            restaurant_id: restaurantId,
            title: widgetConfig.name,
            screen_name: selectedScreen.screen_name,
            media_url: '',
            media_type: 'widget',
            widget_type: widgetConfig.widget_type,
            widget_config_id: widgetConfig.id,
            duration: 30,
            transition: 'fade',
            display_order: screenPlaylist.length,
            is_active: true
        });
        setShowWidgetPicker(false);
    };

    const handleAddFromLibrary = async (file) => {
        if (!selectedScreen) { toast.error('Select a screen first'); return; }
        const mediaType = file.file_type?.startsWith('video/') ? 'video' :
                         file.file_type === 'image/gif' ? 'gif' : 'image';
        await createContentMutation.mutateAsync({
            restaurant_id: restaurantId,
            title: file.file_name?.replace(/\.[^/.]+$/, '') || 'Untitled',
            screen_name: selectedScreen.screen_name,
            media_url: file.file_url,
            media_type: mediaType,
            duration: 10,
            video_loop_count: 1,
            transition: 'fade',
            display_order: screenPlaylist.length,
            is_active: true
        });
    };

    const handleAddScreen = async () => {
        if (!newScreenName.trim()) return;
        if (screens.some(s => s.screen_name === newScreenName.trim())) {
            toast.error('Screen name already exists');
            return;
        }
        await createScreenMutation.mutateAsync({
            restaurant_id: restaurantId,
            screen_name: newScreenName.trim(),
            is_active: true
        });
    };

    const copyScreenUrl = (screen) => {
        const url = `${window.location.origin}${createPageUrl('MediaScreen')}?restaurantId=${restaurantId}&screenName=${encodeURIComponent(screen.screen_name)}`;
        navigator.clipboard.writeText(url);
        toast.success('Screen URL copied');
    };

    const openScreenUrl = (screen) => {
        const url = `${window.location.origin}${createPageUrl('MediaScreen')}?restaurantId=${restaurantId}&screenName=${encodeURIComponent(screen.screen_name)}`;
        window.open(url, '_blank');
    };

    const handleDeleteScreen = (screen) => {
        const contentCount = allContent.filter(c => c.screen_name === screen.screen_name).length;
        const msg = contentCount > 0
            ? `Delete "${screen.screen_name}" and its ${contentCount} content item(s)?`
            : `Delete screen "${screen.screen_name}"?`;
        if (!window.confirm(msg)) return;
        allContent.filter(c => c.screen_name === screen.screen_name).forEach(c => deleteContentMutation.mutate(c.id));
        deleteScreenMutation.mutate(screen.id);
    };

    return (
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
            {/* Left: Screen list */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="font-bold text-gray-900 text-sm">Screens</h3>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddScreen(true)} className="h-7 w-7 p-0 text-gray-500 hover:text-orange-500">
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    {screens.length === 0 ? (
                        <div className="text-center py-10 px-4">
                            <Monitor className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-sm text-gray-500 font-medium">No screens yet</p>
                            <p className="text-xs text-gray-400 mt-1">Add a screen to get started</p>
                            <Button size="sm" onClick={() => setShowAddScreen(true)} className="mt-4 h-8 text-xs bg-orange-500 hover:bg-orange-600 w-full">
                                <Plus className="h-3.5 w-3.5 mr-1.5" />
                                Add Screen
                            </Button>
                        </div>
                    ) : (
                        screens.map(screen => {
                            const count = allContent.filter(c => c.screen_name === screen.screen_name).length;
                            const isSelected = selectedScreen?.id === screen.id;
                            return (
                                <div key={screen.id} className={`group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-r-2 ${isSelected ? 'bg-orange-50 border-orange-500' : 'border-transparent'}`}
                                    onClick={() => setSelectedScreen(screen)}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-orange-100' : 'bg-gray-100'}`}>
                                        <Monitor className={`h-4 w-4 ${isSelected ? 'text-orange-600' : 'text-gray-500'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-orange-700' : 'text-gray-900'}`}>{screen.screen_name}</p>
                                        <p className="text-[11px] text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteScreen(screen); }}
                                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Center: Playlist */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                {!selectedScreen ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center">
                            <Monitor className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-500 font-medium">Select a screen to manage its playlist</p>
                            <p className="text-gray-400 text-sm mt-1">Or add a new screen using the + button</p>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                            <div>
                                <h2 className="font-bold text-gray-900 text-lg">{selectedScreen.screen_name}</h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {screenPlaylist.length} items · Loop: {Math.floor(totalDuration / 60)}m {totalDuration % 60}s
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => copyScreenUrl(selectedScreen)}>
                                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                                    Copy URL
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => openScreenUrl(selectedScreen)}>
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    Preview
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setShowWidgetPicker(true)}>
                                    <Zap className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                                    Add Widget
                                </Button>
                                <Button size="sm" onClick={() => setShowAddDialog(true)} className="bg-orange-500 hover:bg-orange-600">
                                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                                    Add Media
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {screenPlaylist.length === 0 ? (
                                <div
                                    onClick={() => setShowAddDialog(true)}
                                    className="flex flex-col items-center justify-center h-full min-h-64 text-center border-2 border-dashed border-gray-300 rounded-2xl p-12 cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors"
                                >
                                    <Play className="h-14 w-14 text-gray-300 mb-4" />
                                    <h3 className="font-bold text-gray-600 text-xl">Empty Playlist</h3>
                                    <p className="text-gray-400 text-sm mt-1 mb-4">Add media items to start your playlist</p>
                                    <Button className="bg-orange-500 hover:bg-orange-600">
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add First Item
                                    </Button>
                                </div>
                            ) : (
                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="playlist">
                                        {(provided) => (
                                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                                {screenPlaylist.map((item, index) => (
                                                    <Draggable key={item.id} draggableId={item.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={`bg-white rounded-xl border transition-all ${snapshot.isDragging ? 'shadow-xl border-orange-400 rotate-1' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}`}
                                                            >
                                                                <div className="flex items-center gap-3 p-4">
                                                                    <div {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0">
                                                                        <GripVertical className="h-5 w-5" />
                                                                    </div>
                                                                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                                                                        {index + 1}
                                                                    </div>
                                                                    <div className="w-24 h-16 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                                                                        {item.media_type === 'widget' ? (
                                                                            (() => {
                                                                                const meta = WIDGET_TYPE_META[item.widget_type] || {};
                                                                                const Icon = meta.icon || Zap;
                                                                                return (
                                                                                    <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center gap-1">
                                                                                        <Icon className={`h-5 w-5 ${meta.color || 'text-yellow-400'}`} />
                                                                                        <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{meta.label || item.widget_type}</span>
                                                                                    </div>
                                                                                );
                                                                            })()
                                                                        ) : item.media_type === 'video' ? (
                                                                            <video src={item.media_url} className="w-full h-full object-cover" muted />
                                                                        ) : (
                                                                            <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-semibold text-gray-900 text-sm truncate">{item.title || 'Untitled'}</p>
                                                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                                            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 gap-1 ${item.media_type === 'widget' ? 'border-yellow-400 text-yellow-600 bg-yellow-50' : ''}`}>
                                                                                {item.media_type === 'widget' ? <Zap className="h-2.5 w-2.5" /> : item.media_type === 'video' ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                                                                                {item.media_type === 'widget' ? (WIDGET_TYPE_META[item.widget_type]?.label || item.widget_type) : item.media_type}
                                                                            </Badge>
                                                                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                                                                                {item.transition || 'fade'}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                                        {item.media_type !== 'video' ? (
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-xs text-gray-400">Duration:</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    value={item.duration || 10}
                                                                                    onChange={(e) => updateContentMutation.mutate({ id: item.id, data: { duration: parseInt(e.target.value) || 10 } })}
                                                                                    className="w-14 h-7 text-xs text-center p-1"
                                                                                    min="1"
                                                                                    onClick={e => e.stopPropagation()}
                                                                                />
                                                                                <span className="text-xs text-gray-400">s</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-center gap-1">
                                                                                <span className="text-xs text-gray-400">Loops:</span>
                                                                                <Input
                                                                                    type="number"
                                                                                    value={item.video_loop_count || 1}
                                                                                    onChange={(e) => updateContentMutation.mutate({ id: item.id, data: { video_loop_count: parseInt(e.target.value) || 1 } })}
                                                                                    className="w-14 h-7 text-xs text-center p-1"
                                                                                    min="1"
                                                                                />
                                                                            </div>
                                                                        )}
                                                                        <Select
                                                                            value={item.transition || 'fade'}
                                                                            onValueChange={(val) => updateContentMutation.mutate({ id: item.id, data: { transition: val } })}
                                                                        >
                                                                            <SelectTrigger className="h-7 w-24 text-xs">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="fade">Fade</SelectItem>
                                                                                <SelectItem value="slide">Slide</SelectItem>
                                                                                <SelectItem value="zoom">Zoom</SelectItem>
                                                                                <SelectItem value="none">None</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <Switch
                                                                            checked={item.is_active}
                                                                            onCheckedChange={(v) => updateContentMutation.mutate({ id: item.id, data: { is_active: v } })}
                                                                        />
                                                                        {item.media_type === 'image' && (
                                                                            <Button size="sm" variant="ghost" onClick={() => setEditingPhoto({ id: item.id, media_url: item.media_url })} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600" title="Edit photo">
                                                                                <Edit className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        )}
                                                                        {item.media_type === 'video' && (
                                                                            <Button size="sm" variant="ghost" onClick={() => setEditingVideo(item.media_url)} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600" title="Edit video">
                                                                                <RotateCw className="h-3.5 w-3.5" />
                                                                            </Button>
                                                                        )}
                                                                        <Button size="sm" variant="ghost" onClick={() => { setSchedulingContent(item); setShowScheduler(true); }} className="h-8 w-8 p-0 text-gray-400 hover:text-violet-600" title="Schedule">
                                                                            <Clock className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                        <Button size="sm" variant="ghost" onClick={() => deleteContentMutation.mutate(item.id)} className="h-8 w-8 p-0 text-gray-400 hover:text-red-600">
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right: Media picker */}
            <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
                <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="font-bold text-gray-900 text-sm">Media Library</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Click to add to playlist</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                    {mediaFiles.length === 0 ? (
                        <div className="text-center py-10">
                            <ImageIcon className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-sm text-gray-500 font-medium">No media yet</p>
                            <p className="text-xs text-gray-400 mt-1">Go to Media Library to upload files</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            {mediaFiles.map(file => (
                                <button
                                    key={file.id}
                                    onClick={() => handleAddFromLibrary(file)}
                                    className="group relative aspect-video bg-gray-100 rounded-xl overflow-hidden hover:ring-2 hover:ring-orange-500 transition-all"
                                    title={`Add "${file.file_name}" to playlist`}
                                >
                                    {file.file_type?.startsWith('video/') ? (
                                        <video src={file.file_url} className="w-full h-full object-cover" muted />
                                    ) : (
                                        <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                        <div className="bg-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Plus className="h-4 w-4 text-gray-900" />
                                        </div>
                                    </div>
                                    {file.file_type?.startsWith('video/') && (
                                        <div className="absolute top-1.5 left-1.5 bg-black/60 rounded px-1 py-0.5">
                                            <Film className="h-2.5 w-2.5 text-white" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Add Screen Dialog */}
            <Dialog open={showAddScreen} onOpenChange={setShowAddScreen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Add New Screen</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            value={newScreenName}
                            onChange={(e) => setNewScreenName(e.target.value)}
                            placeholder="e.g., Main Entrance, Counter, Drive-Thru"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddScreen()}
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <Button onClick={handleAddScreen} className="flex-1 bg-orange-500 hover:bg-orange-600" disabled={!newScreenName.trim() || createScreenMutation.isPending}>
                                Add Screen
                            </Button>
                            <Button variant="outline" onClick={() => setShowAddScreen(false)}>Cancel</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Media Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add Media to "{selectedScreen?.screen_name}"</DialogTitle>
                    </DialogHeader>
                    <AddMediaForm
                        restaurantId={restaurantId}
                        screenName={selectedScreen?.screen_name}
                        displayOrder={screenPlaylist.length}
                        onSuccess={() => {
                            queryClient.invalidateQueries({ queryKey: ['promotional-content', restaurantId] });
                            queryClient.invalidateQueries({ queryKey: ['media-files', restaurantId] });
                            setShowAddDialog(false);
                        }}
                        onCancel={() => setShowAddDialog(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Scheduler */}
            <ContentScheduler
                open={showScheduler}
                onClose={() => { setShowScheduler(false); setSchedulingContent(null); }}
                content={schedulingContent}
                onSave={async ({ schedule, priority }) => {
                    if (!schedulingContent) return;
                    await updateContentMutation.mutateAsync({ id: schedulingContent.id, data: { schedule, priority } });
                    toast.success('Schedule saved');
                    setShowScheduler(false);
                    setSchedulingContent(null);
                }}
            />

            {/* Photo editor */}
            <InlinePhotoEditor
                open={!!editingPhoto}
                imageUrl={editingPhoto?.media_url}
                onClose={() => setEditingPhoto(null)}
                onSave={async (newUrl) => {
                    if (editingPhoto?.id) {
                        await updateContentMutation.mutateAsync({ id: editingPhoto.id, data: { media_url: newUrl } });
                    }
                    setEditingPhoto(null);
                    toast.success('Photo updated');
                }}
            />

            {/* Widget Picker Dialog */}
            <Dialog open={showWidgetPicker} onOpenChange={setShowWidgetPicker}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            Add Widget to "{selectedScreen?.screen_name}"
                        </DialogTitle>
                    </DialogHeader>
                    {widgetConfigs.length === 0 ? (
                        <div className="text-center py-10">
                            <Zap className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                            <p className="text-gray-700 font-semibold">No widgets configured yet</p>
                            <p className="text-gray-400 text-sm mt-1">Go to <strong>Live Widgets</strong> in the sidebar to create widget configurations first, then come back here to add them to your playlist.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-500 mb-3">Select a widget to insert into the playlist. It will display for the configured duration before advancing to the next item.</p>
                            {widgetConfigs.map(cfg => {
                                const meta = WIDGET_TYPE_META[cfg.widget_type] || {};
                                const Icon = meta.icon || Zap;
                                return (
                                    <button
                                        key={cfg.id}
                                        onClick={() => handleAddWidget(cfg)}
                                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-all text-left group"
                                    >
                                        <div className={`w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-orange-100 flex items-center justify-center flex-shrink-0`}>
                                            <Icon className={`h-5 w-5 ${meta.color || 'text-gray-500'}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 text-sm">{cfg.name}</p>
                                            <p className="text-xs text-gray-500">{meta.label || cfg.widget_type} widget · displays for 30s</p>
                                        </div>
                                        <Plus className="h-4 w-4 text-gray-400 group-hover:text-orange-500 flex-shrink-0" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Video editor */}
            <VideoEditor
                open={!!editingVideo}
                videoUrl={editingVideo}
                onClose={() => setEditingVideo(null)}
                onSave={() => { setEditingVideo(null); toast.success('Video updated'); }}
            />
        </div>
    );
}

function AddMediaForm({ restaurantId, screenName, displayOrder, onSuccess, onCancel }) {
    const [title, setTitle] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaType, setMediaType] = useState('image');
    const [duration, setDuration] = useState(10);
    const [uploading, setUploading] = useState(false);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const type = file.type.startsWith('video/') ? 'video' : file.type === 'image/gif' ? 'gif' : 'image';
            await base44.entities.MediaFile.create({
                restaurant_id: restaurantId,
                file_url,
                file_name: file.name,
                file_type: file.type,
                file_size: file.size
            });
            setMediaUrl(file_url);
            setMediaType(type);
            if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ''));
            toast.success('File uploaded');
        } catch {
            toast.error('Upload failed');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleSubmit = async () => {
        if (!mediaUrl || !screenName) return;
        await base44.entities.PromotionalContent.create({
            restaurant_id: restaurantId,
            title: title || 'Untitled',
            screen_name: screenName,
            media_url: mediaUrl,
            media_type: mediaType,
            duration,
            video_loop_count: 1,
            transition: 'fade',
            display_order: displayOrder,
            is_active: true
        });
        onSuccess();
    };

    return (
        <div className="space-y-4">
            <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${uploading ? 'border-orange-300 bg-orange-50' : mediaUrl ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-orange-400 hover:bg-orange-50'}`}>
                {mediaUrl ? (
                    <div className="w-full h-full p-2 flex items-center justify-center">
                        {mediaType === 'video' ? (
                            <video src={mediaUrl} className="max-h-full max-w-full rounded-lg object-contain" muted />
                        ) : (
                            <img src={mediaUrl} className="max-h-full max-w-full rounded-lg object-contain" alt="Preview" />
                        )}
                    </div>
                ) : (
                    <div className="text-center">
                        {uploading ? (
                            <>
                                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                                <p className="text-sm text-orange-500 font-medium">Uploading...</p>
                            </>
                        ) : (
                            <>
                                <ImageIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-500 font-medium">Click to upload</p>
                                <p className="text-xs text-gray-400 mt-0.5">Images, videos, GIFs</p>
                            </>
                        )}
                    </div>
                )}
                <input type="file" accept="image/*,video/*" onChange={handleFileUpload} className="hidden" />
            </label>
            <div>
                <label className="text-sm font-semibold text-gray-700 block mb-1.5">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Summer Special Offer" />
            </div>
            {mediaType !== 'video' && (
                <div>
                    <label className="text-sm font-semibold text-gray-700 block mb-1.5">Duration (seconds)</label>
                    <Input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 10)} min="1" max="3600" />
                </div>
            )}
            <div className="flex gap-2 pt-1">
                <Button onClick={handleSubmit} disabled={!mediaUrl || uploading} className="flex-1 bg-orange-500 hover:bg-orange-600">
                    Add to Playlist
                </Button>
                <Button variant="outline" onClick={onCancel}>Cancel</Button>
            </div>
        </div>
    );
}