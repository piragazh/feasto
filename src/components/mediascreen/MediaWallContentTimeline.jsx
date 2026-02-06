import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Layout, Plus, Trash2, Edit2, PlayCircle, PauseCircle, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

export default function MediaWallContentTimeline({ 
    content = [], 
    layouts = [], 
    onAddToTimeline, 
    onRemoveFromTimeline,
    onApplyLayout 
}) {
    const [selectedLayout, setSelectedLayout] = useState(null);
    const [timelineItems, setTimelineItems] = useState([]);
    const [selectedRow, setSelectedRow] = useState(0);
    const [rowLabels, setRowLabels] = useState({
        0: 'Row 1',
        1: 'Row 2', 
        2: 'Row 3',
        3: 'Row 4',
        4: 'Row 5'
    });
    const [editingRowLabel, setEditingRowLabel] = useState(null);
    const [tempRowLabel, setTempRowLabel] = useState('');
    const [playingRow, setPlayingRow] = useState(null);
    const [playbackProgress, setPlaybackProgress] = useState({});
    const [editingItem, setEditingItem] = useState(null);

    const handleApplyLayout = (item) => {
        if (!selectedLayout) {
            toast.error('Please select a layout');
            return;
        }

        // Find items in the selected row to determine start time
        const rowItems = timelineItems.filter(t => t.row === selectedRow);
        const lastItemInRow = rowItems.length > 0 
            ? rowItems.reduce((max, item) => {
                const endTime = item.startTime + item.duration;
                return endTime > max ? endTime : max;
            }, 0)
            : 0;

        const timelineItem = {
            id: `timeline-${Date.now()}`,
            contentId: item.id,
            contentTitle: item.title,
            contentMediaUrl: item.media_url,
            contentMediaType: item.media_type,
            layoutId: selectedLayout.id,
            layoutName: selectedLayout.name,
            duration: item.duration || 10,
            row: selectedRow,
            startTime: lastItemInRow
        };

        setTimelineItems([...timelineItems, timelineItem]);
        onApplyLayout(item, selectedLayout);
        toast.success(`Content added to ${rowLabels[selectedRow]}`);
    };

    const updateItemDuration = (id, newDuration) => {
        setTimelineItems(timelineItems.map(item => 
            item.id === id ? { ...item, duration: newDuration } : item
        ));
        toast.success('Duration updated');
    };

    const updateRowLabel = (rowNum) => {
        if (tempRowLabel.trim()) {
            setRowLabels({ ...rowLabels, [rowNum]: tempRowLabel.trim() });
        }
        setEditingRowLabel(null);
        setTempRowLabel('');
    };

    const playRow = (rowNum) => {
        if (playingRow === rowNum) {
            setPlayingRow(null);
            setPlaybackProgress({});
            return;
        }

        setPlayingRow(rowNum);
        const rowItems = timelineItems.filter(item => item.row === rowNum);
        const maxTime = Math.max(...rowItems.map(item => item.startTime + item.duration), 1);

        let currentTime = 0;
        const interval = setInterval(() => {
            currentTime += 0.1;
            if (currentTime >= maxTime) {
                clearInterval(interval);
                setPlayingRow(null);
                setPlaybackProgress({});
            } else {
                setPlaybackProgress({ [rowNum]: currentTime });
            }
        }, 100);
    };

    const removeFromTimeline = (id) => {
        setTimelineItems(timelineItems.filter(t => t.id !== id));
        onRemoveFromTimeline(id);
    };

    const getTotalDuration = () => {
        return timelineItems.reduce((sum, item) => sum + item.duration, 0);
    };

    const moveItem = (itemId, direction) => {
        const item = timelineItems.find(i => i.id === itemId);
        if (!item) return;

        const rowItems = timelineItems.filter(i => i.row === item.row).sort((a, b) => a.startTime - b.startTime);
        const currentIndex = rowItems.findIndex(i => i.id === itemId);
        
        if (direction === 'up' && currentIndex > 0) {
            const prevItem = rowItems[currentIndex - 1];
            const newStartTime = prevItem.startTime;
            const prevNewStartTime = item.startTime;
            
            setTimelineItems(timelineItems.map(i => {
                if (i.id === itemId) return { ...i, startTime: newStartTime };
                if (i.id === prevItem.id) return { ...i, startTime: prevNewStartTime };
                return i;
            }));
        } else if (direction === 'down' && currentIndex < rowItems.length - 1) {
            const nextItem = rowItems[currentIndex + 1];
            const newStartTime = nextItem.startTime;
            const nextNewStartTime = item.startTime;
            
            setTimelineItems(timelineItems.map(i => {
                if (i.id === itemId) return { ...i, startTime: newStartTime };
                if (i.id === nextItem.id) return { ...i, startTime: nextNewStartTime };
                return i;
            }));
        }
    };

    const COLUMNS = 3;

    return (
        <div className="space-y-4">
            {/* Content Library */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Available Content</CardTitle>
                </CardHeader>
                <CardContent>
                    {content.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">No content available</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                            {content.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex flex-col gap-2 p-2 bg-gray-50 rounded-lg border cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleApplyLayout(item)}
                                >
                                    <div className="w-full h-20 bg-gray-200 rounded overflow-hidden">
                                        {item.media_type === 'video' ? (
                                            <video src={item.media_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-xs truncate">{item.title}</p>
                                        <p className="text-[10px] text-gray-500">{item.duration}s</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Grid Timeline */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Timeline Grid - Each Column = Screen
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-0 border">
                        {/* Column Headers */}
                        <div className="flex border-b bg-gray-100">
                            <div className="w-24 flex-shrink-0 border-r"></div>
                            <div className="flex-1 grid grid-cols-3">
                                {[1, 2, 3].map(screenNum => (
                                    <div key={screenNum} className="border-r last:border-r-0 p-2 text-center">
                                        <div className="font-medium text-sm">Screen {screenNum}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Timeline Rows */}
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(rowNum => {
                            const rowItems = timelineItems.filter(item => item.row === rowNum);
                            const sortedItems = rowItems.sort((a, b) => a.startTime - b.startTime);

                            return (
                                <div key={rowNum} className="flex border-b">
                                    {/* Timeline Label Column */}
                                    <div className="w-24 flex-shrink-0 border-r p-3 bg-gray-50">
                                        <div className="flex flex-col items-center justify-center h-full">
                                            <div className="flex gap-1 mb-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-5 w-5 p-0"
                                                    disabled={sortedItems.length === 0}
                                                >
                                                    ↑
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-5 w-5 p-0"
                                                    disabled={sortedItems.length === 0}
                                                >
                                                    ↓
                                                </Button>
                                            </div>
                                            <div className="text-sm font-medium">#{rowNum + 1}</div>
                                            <div className="text-xs text-gray-500">{sortedItems.reduce((sum, i) => sum + i.duration, 0)}s</div>
                                        </div>
                                    </div>

                                    {/* Screen Content Columns */}
                                    <div className="flex-1 grid grid-cols-3">
                                        {[0, 1, 2].map(screenIndex => {
                                            const item = sortedItems[screenIndex];

                                            if (!item) {
                                                return (
                                                    <div key={screenIndex} className="border-r last:border-r-0 p-3 min-h-[120px]">
                                                        <Button
                                                            variant="outline"
                                                            className="w-full h-full border-dashed border-2 hover:bg-gray-50"
                                                            onClick={() => setSelectedRow(rowNum)}
                                                        >
                                                            <Plus className="h-4 w-4 mr-2" />
                                                            Add
                                                        </Button>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={screenIndex} className="border-r last:border-r-0 p-2">
                                                    <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 h-full">
                                                        <div className="flex gap-2 mb-2">
                                                            <div className="w-20 h-16 bg-gray-900 rounded overflow-hidden flex-shrink-0">
                                                                {item.contentMediaType === 'video' ? (
                                                                    <video src={item.contentMediaUrl} className="w-full h-full object-cover" />
                                                                ) : item.contentMediaType?.startsWith('widget_') ? (
                                                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs">
                                                                        {item.contentMediaType === 'widget_time' && '🕐'}
                                                                        {item.contentMediaType === 'widget_weather' && '🌤️'}
                                                                        {item.contentMediaType === 'widget_orders' && '📦'}
                                                                    </div>
                                                                ) : (
                                                                    <img src={item.contentMediaUrl} alt={item.contentTitle} className="w-full h-full object-cover" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium text-sm truncate">{item.contentTitle}</div>
                                                                <div className="text-xs text-gray-600 mt-1">
                                                                    {item.contentMediaType}
                                                                </div>
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <input type="checkbox" defaultChecked className="rounded" />
                                                                    <span className="text-xs text-gray-500">→</span>
                                                                    <span className="text-xs font-medium">{item.duration}s</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between text-gray-600">
                                                            <div className="flex gap-1">
                                                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                                                    <Clock className="h-3 w-3" />
                                                                </Button>
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="ghost" 
                                                                    className="h-6 w-6 p-0"
                                                                    onClick={() => setEditingItem(item.id)}
                                                                >
                                                                    <Edit2 className="h-3 w-3" />
                                                                </Button>
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="ghost" 
                                                                    className="h-6 w-6 p-0"
                                                                    onClick={() => removeFromTimeline(item.id)}
                                                                >
                                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}