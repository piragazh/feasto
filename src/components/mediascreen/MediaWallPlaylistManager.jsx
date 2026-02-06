import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Trash2, Edit, Play, Calendar, GripVertical, Shuffle, Repeat, Clock } from 'lucide-react';
import { toast } from 'sonner';
import ContentScheduler from './ContentScheduler';

export default function MediaWallPlaylistManager({ restaurantId, wallName }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [showScheduler, setShowScheduler] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState(null);
    const [schedulingPlaylist, setSchedulingPlaylist] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        content_ids: [],
        loop: true,
        shuffle: false,
        is_active: true
    });

    const { data: playlists = [] } = useQuery({
        queryKey: ['media-wall-playlists', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallPlaylist.filter({ 
            restaurant_id: restaurantId,
            wall_name: wallName 
        }),
        enabled: !!restaurantId && !!wallName
    });

    const { data: allContent = [] } = useQuery({
        queryKey: ['media-wall-content', restaurantId, wallName],
        queryFn: () => base44.entities.MediaWallContent.filter({ 
            restaurant_id: restaurantId,
            wall_name: wallName 
        }),
        enabled: !!restaurantId && !!wallName
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.MediaWallPlaylist.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-wall-playlists']);
            toast.success('Playlist created');
            resetForm();
        }
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.MediaWallPlaylist.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-wall-playlists']);
            toast.success('Playlist updated');
            resetForm();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.MediaWallPlaylist.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['media-wall-playlists']);
            toast.success('Playlist deleted');
        }
    });

    const handleSubmit = () => {
        if (!formData.name.trim()) {
            toast.error('Please enter a playlist name');
            return;
        }

        if (formData.content_ids.length === 0) {
            toast.error('Please add at least one content item');
            return;
        }

        const data = {
            restaurant_id: restaurantId,
            wall_name: wallName,
            name: formData.name,
            description: formData.description,
            content_ids: formData.content_ids,
            loop: formData.loop,
            shuffle: formData.shuffle,
            is_active: formData.is_active
        };

        if (editingPlaylist) {
            updateMutation.mutate({ id: editingPlaylist.id, data });
        } else {
            createMutation.mutate(data);
        }
    };

    const handleEdit = (playlist) => {
        setEditingPlaylist(playlist);
        setFormData({
            name: playlist.name,
            description: playlist.description || '',
            content_ids: playlist.content_ids || [],
            loop: playlist.loop !== false,
            shuffle: playlist.shuffle || false,
            is_active: playlist.is_active !== false
        });
        setShowDialog(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            content_ids: [],
            loop: true,
            shuffle: false,
            is_active: true
        });
        setEditingPlaylist(null);
        setShowDialog(false);
    };

    const handleDragEnd = (result) => {
        if (!result.destination) return;

        const items = Array.from(formData.content_ids);
        const [reordered] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reordered);

        setFormData(prev => ({ ...prev, content_ids: items }));
    };

    const addContent = (contentId) => {
        if (formData.content_ids.includes(contentId)) {
            toast.error('Content already in playlist');
            return;
        }
        setFormData(prev => ({ 
            ...prev, 
            content_ids: [...prev.content_ids, contentId] 
        }));
    };

    const removeContent = (contentId) => {
        setFormData(prev => ({ 
            ...prev, 
            content_ids: prev.content_ids.filter(id => id !== contentId) 
        }));
    };

    const getContentById = (id) => allContent.find(c => c.id === id);

    const getTotalDuration = (contentIds) => {
        return contentIds.reduce((sum, id) => {
            const content = getContentById(id);
            return sum + (content?.duration || 10);
        }, 0);
    };

    const handleSchedule = (playlist) => {
        setSchedulingPlaylist(playlist);
        setShowScheduler(true);
    };

    const handleSaveSchedule = async ({ schedule, priority }) => {
        if (!schedulingPlaylist) return;
        
        try {
            await updateMutation.mutateAsync({
                id: schedulingPlaylist.id,
                data: { schedule, priority }
            });
            toast.success('Playlist schedule updated');
            setShowScheduler(false);
            setSchedulingPlaylist(null);
        } catch (error) {
            toast.error('Failed to update schedule');
        }
    };

    const isPlaylistActive = (playlist) => {
        if (!playlist.schedule?.enabled) return playlist.is_active;
        
        const now = new Date();
        const schedule = playlist.schedule;
        
        // Check date range
        if (schedule.start_date && new Date(schedule.start_date) > now) return false;
        if (schedule.end_date && new Date(schedule.end_date) < now) return false;
        
        // Check recurring schedule
        if (schedule.recurring?.enabled) {
            const currentDay = now.getDay();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            
            if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
            
            const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                return currentTime >= range.start_time && currentTime <= range.end_time;
            });
            
            if (!inTimeRange) return false;
        }
        
        return playlist.is_active;
    };

    const availableContent = allContent.filter(c => !formData.content_ids.includes(c.id));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Media Wall Playlists</h3>
                <Button onClick={() => setShowDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Playlist
                </Button>
            </div>

            <div className="grid gap-4">
                {playlists.map(playlist => {
                    const isActive = isPlaylistActive(playlist);
                    const totalDuration = getTotalDuration(playlist.content_ids);
                    
                    return (
                        <Card key={playlist.id} className={isActive ? 'border-green-300 bg-green-50' : ''}>
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-semibold">{playlist.name}</h4>
                                            {isActive && (
                                                <Badge className="bg-green-600">
                                                    <Play className="h-3 w-3 mr-1" />
                                                    Active
                                                </Badge>
                                            )}
                                            {playlist.loop && (
                                                <Badge variant="outline">
                                                    <Repeat className="h-3 w-3 mr-1" />
                                                    Loop
                                                </Badge>
                                            )}
                                            {playlist.shuffle && (
                                                <Badge variant="outline">
                                                    <Shuffle className="h-3 w-3 mr-1" />
                                                    Shuffle
                                                </Badge>
                                            )}
                                            {playlist.schedule?.enabled && (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                    <Calendar className="h-3 w-3 mr-1" />
                                                    Scheduled
                                                </Badge>
                                            )}
                                        </div>
                                        {playlist.description && (
                                            <p className="text-sm text-gray-600 mb-2">{playlist.description}</p>
                                        )}
                                        <div className="flex gap-4 text-xs text-gray-500">
                                            <span>{playlist.content_ids.length} items</span>
                                            <span>{totalDuration}s total</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleSchedule(playlist)}
                                            title="Schedule"
                                        >
                                            <Clock className="h-4 w-4" />
                                        </Button>
                                        <Switch
                                            checked={playlist.is_active}
                                            onCheckedChange={(checked) => 
                                                updateMutation.mutate({ 
                                                    id: playlist.id, 
                                                    data: { is_active: checked } 
                                                })
                                            }
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(playlist)}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                if (window.confirm('Delete this playlist?')) {
                                                    deleteMutation.mutate(playlist.id);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}

                {playlists.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                        No playlists yet. Create your first playlist to organize content playback.
                    </div>
                )}
            </div>

            <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Playlist Name</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g., Morning Promotions"
                            />
                        </div>

                        <div>
                            <Label>Description (Optional)</Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Brief description"
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={formData.loop}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, loop: checked }))}
                                />
                                <Label>Loop playlist</Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={formData.shuffle}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, shuffle: checked }))}
                                />
                                <Label>Shuffle order</Label>
                            </div>
                        </div>

                        <div>
                            <Label>Playlist Content ({formData.content_ids.length} items, {getTotalDuration(formData.content_ids)}s total)</Label>
                            {formData.content_ids.length === 0 ? (
                                <div className="border-2 border-dashed rounded-lg p-8 text-center text-gray-500">
                                    No content added yet. Add content from the available list below.
                                </div>
                            ) : (
                                <DragDropContext onDragEnd={handleDragEnd}>
                                    <Droppable droppableId="playlist">
                                        {(provided) => (
                                            <div
                                                {...provided.droppableProps}
                                                ref={provided.innerRef}
                                                className="space-y-2 mt-2"
                                            >
                                                {formData.content_ids.map((contentId, index) => {
                                                    const content = getContentById(contentId);
                                                    if (!content) return null;

                                                    return (
                                                        <Draggable key={contentId} draggableId={contentId} index={index}>
                                                            {(provided) => (
                                                                <div
                                                                    ref={provided.innerRef}
                                                                    {...provided.draggableProps}
                                                                    {...provided.dragHandleProps}
                                                                    className="flex items-center gap-3 p-3 bg-gray-50 border rounded-lg"
                                                                >
                                                                    <GripVertical className="h-4 w-4 text-gray-400" />
                                                                    <div className="w-16 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                                                                        {content.media_type === 'video' ? (
                                                                            <video src={content.media_url} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <img src={content.media_url} alt={content.title} className="w-full h-full object-cover" />
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-medium text-sm truncate">{content.title}</p>
                                                                        <p className="text-xs text-gray-500">{content.duration}s</p>
                                                                    </div>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        onClick={() => removeContent(contentId)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    );
                                                })}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </DragDropContext>
                            )}
                        </div>

                        {availableContent.length > 0 && (
                            <div>
                                <Label>Available Content</Label>
                                <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto">
                                    {availableContent.map(content => (
                                        <button
                                            key={content.id}
                                            onClick={() => addContent(content.id)}
                                            className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 text-left"
                                        >
                                            <div className="w-12 h-9 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                                                {content.media_type === 'video' ? (
                                                    <video src={content.media_url} className="w-full h-full object-cover" />
                                                ) : (
                                                    <img src={content.media_url} alt={content.title} className="w-full h-full object-cover" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium truncate">{content.title}</p>
                                                <p className="text-xs text-gray-500">{content.duration}s</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-4">
                            <Button onClick={handleSubmit} className="flex-1">
                                {editingPlaylist ? 'Update Playlist' : 'Create Playlist'}
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
                    setSchedulingPlaylist(null);
                }}
                content={schedulingPlaylist}
                onSave={handleSaveSchedule}
            />
        </div>
    );
}