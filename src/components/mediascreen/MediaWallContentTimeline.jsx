import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Layout, Plus, Trash2 } from 'lucide-react';
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
            layoutId: selectedLayout.id,
            layoutName: selectedLayout.name,
            duration: item.duration || 10,
            row: selectedRow,
            startTime: lastItemInRow
        };

        setTimelineItems([...timelineItems, timelineItem]);
        onApplyLayout(item, selectedLayout);
        toast.success(`Content added to timeline row ${selectedRow + 1}`);
    };

    const removeFromTimeline = (id) => {
        setTimelineItems(timelineItems.filter(t => t.id !== id));
        onRemoveFromTimeline(id);
    };

    const getTotalDuration = () => {
        return timelineItems.reduce((sum, item) => sum + item.duration, 0);
    };

    return (
        <div className="space-y-4">
            {/* Layout Selector */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Layout className="h-4 w-4" />
                        Apply Layout to Content
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div>
                        <Label className="text-xs mb-2">Select Layout</Label>
                        <Select value={selectedLayout?.id || ''} onValueChange={(id) => {
                            const layout = layouts.find(l => l.id === id);
                            setSelectedLayout(layout);
                        }}>
                            <SelectTrigger className="text-sm">
                                <SelectValue placeholder="Choose a layout..." />
                            </SelectTrigger>
                            <SelectContent>
                                {layouts.map(layout => (
                                    <SelectItem key={layout.id} value={layout.id}>
                                        <div className="flex items-center gap-2">
                                            <span>{layout.name}</span>
                                            <Badge variant="outline" className="text-xs ml-2">
                                                {layout.grid.rows}x{layout.grid.cols}
                                            </Badge>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedLayout && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                            <div className="font-medium text-blue-900 mb-1">{selectedLayout.name}</div>
                            <div className="text-xs text-blue-700">
                                Grid: {selectedLayout.grid.rows}x{selectedLayout.grid.cols} • Zones: {selectedLayout.zones.length}
                            </div>
                        </div>
                    )}

                    <div>
                        <Label className="text-xs mb-2">Add to Timeline Row</Label>
                        <Select value={String(selectedRow)} onValueChange={(val) => setSelectedRow(parseInt(val))}>
                            <SelectTrigger className="text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {[0, 1, 2, 3, 4].map(row => (
                                    <SelectItem key={row} value={String(row)}>
                                        Row {row + 1}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Content List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Content to Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                    {content.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">No content available</p>
                    ) : (
                        <div className="space-y-2">
                            {content.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
                                >
                                    <div className="w-12 h-12 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                                        {item.media_type === 'video' ? (
                                            <video src={item.media_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{item.title}</p>
                                        <p className="text-xs text-gray-500">{item.duration}s • {item.media_type}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleApplyLayout(item)}
                                        disabled={!selectedLayout}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Timeline Visualization */}
            {timelineItems.length > 0 && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Timeline ({getTotalDuration()}s total)
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[0, 1, 2, 3, 4].map(rowNum => {
                                const rowItems = timelineItems.filter(item => item.row === rowNum);
                                if (rowItems.length === 0) return null;
                                
                                return (
                                    <div key={rowNum} className="space-y-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="outline" className="bg-blue-100 text-blue-800">
                                                Row {rowNum + 1}
                                            </Badge>
                                            <div className="text-xs text-gray-500">
                                                {rowItems.length} item{rowItems.length > 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <div className="space-y-2 pl-4 border-l-2 border-blue-200">
                                            {rowItems
                                                .sort((a, b) => a.startTime - b.startTime)
                                                .map((item, index) => (
                                                    <div
                                                        key={item.id}
                                                        className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200"
                                                    >
                                                        <div className="flex-shrink-0">
                                                            <Badge variant="outline" className="bg-white">
                                                                {index + 1}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-sm">
                                                                    {content.find(c => c.id === item.contentId)?.title || 'Unknown'}
                                                                </span>
                                                                <Badge className="bg-blue-100 text-blue-800 text-xs">
                                                                    {item.layoutName}
                                                                </Badge>
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-1">
                                                                Time: {item.startTime}s → {item.startTime + item.duration}s ({item.duration}s)
                                                            </div>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => removeFromTimeline(item.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Timeline Progress Bar by Rows */}
                        <div className="mt-4 p-3 bg-gray-100 rounded-lg space-y-3">
                            <div className="text-xs font-medium text-gray-700 mb-2">Playback Timeline</div>
                            {[0, 1, 2, 3, 4].map(rowNum => {
                                const rowItems = timelineItems.filter(item => item.row === rowNum);
                                if (rowItems.length === 0) return null;
                                
                                const maxTime = Math.max(...rowItems.map(item => item.startTime + item.duration));
                                
                                return (
                                    <div key={rowNum}>
                                        <div className="text-xs text-gray-600 mb-1">Row {rowNum + 1}</div>
                                        <div className="relative h-6 bg-white border rounded overflow-hidden">
                                            {rowItems.map((item) => {
                                                const width = (item.duration / maxTime) * 100;
                                                const offset = (item.startTime / maxTime) * 100;
                                                return (
                                                    <div
                                                        key={item.id}
                                                        className="absolute h-full bg-gradient-to-r from-blue-400 to-indigo-400 border-r border-blue-600"
                                                        style={{
                                                            width: `${width}%`,
                                                            left: `${offset}%`
                                                        }}
                                                        title={`${item.startTime}s - ${item.startTime + item.duration}s`}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}