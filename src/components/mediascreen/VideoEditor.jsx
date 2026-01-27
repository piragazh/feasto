import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scissors, Play, Pause, RotateCw, Download, Type, Plus, Trash2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function VideoEditor({ open, videoUrl, onClose, onSave }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [isTrimming, setIsTrimming] = useState(false);
    const [outputFormat, setOutputFormat] = useState('mp4');
    const [textOverlays, setTextOverlays] = useState([]);
    const [selectedOverlay, setSelectedOverlay] = useState(null);
    const [trimSegments, setTrimSegments] = useState([]);
    const [segmentTransition, setSegmentTransition] = useState('fade');
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (open && videoRef.current) {
            videoRef.current.load();
        }
    }, [open, videoUrl]);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            const dur = videoRef.current.duration;
            setDuration(dur);
            setTrimEnd(dur);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            
            // Auto-pause at trim end
            if (videoRef.current.currentTime >= trimEnd) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    const togglePlayPause = () => {
        if (!videoRef.current) return;
        
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            if (videoRef.current.currentTime >= trimEnd) {
                videoRef.current.currentTime = trimStart;
            }
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleSeek = (value) => {
        if (videoRef.current) {
            const newTime = value[0];
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    const setTrimStartToCurrent = () => {
        setTrimStart(currentTime);
        toast.success('Trim start set');
    };

    const setTrimEndToCurrent = () => {
        setTrimEnd(currentTime);
        toast.success('Trim end set');
    };

    const resetTrim = () => {
        setTrimStart(0);
        setTrimEnd(duration);
        if (videoRef.current) {
            videoRef.current.currentTime = 0;
        }
        toast.success('Trim reset');
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const addTrimSegment = () => {
        if (trimStart >= trimEnd) {
            toast.error('Invalid trim range');
            return;
        }
        setTrimSegments(prev => [...prev, { start: trimStart, end: trimEnd, id: Date.now() }]);
        toast.success('Segment added');
    };

    const removeTrimSegment = (id) => {
        setTrimSegments(prev => prev.filter(s => s.id !== id));
    };

    const addTextOverlay = () => {
        const newOverlay = {
            id: Date.now(),
            text: 'Your text here',
            x: 50,
            y: 50,
            fontSize: 32,
            color: '#ffffff',
            fontWeight: 'bold',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            startTime: currentTime,
            endTime: Math.min(currentTime + 5, duration),
            position: 'center'
        };
        setTextOverlays(prev => [...prev, newOverlay]);
        setSelectedOverlay(newOverlay.id);
        toast.success('Text overlay added');
    };

    const updateOverlay = (id, updates) => {
        setTextOverlays(prev => prev.map(overlay => 
            overlay.id === id ? { ...overlay, ...updates } : overlay
        ));
    };

    const removeOverlay = (id) => {
        setTextOverlays(prev => prev.filter(overlay => overlay.id !== id));
        if (selectedOverlay === id) setSelectedOverlay(null);
    };

    const getVisibleOverlays = () => {
        return textOverlays.filter(overlay => 
            currentTime >= overlay.startTime && currentTime <= overlay.endTime
        );
    };

    const handleTrim = async () => {
        setIsTrimming(true);
        try {
            const segments = trimSegments.length > 0 ? trimSegments : [{ start: trimStart, end: trimEnd }];
            
            const trimData = {
                videoUrl,
                segments,
                transition: segmentTransition,
                textOverlays,
                outputFormat,
                totalDuration: segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0)
            };
            
            toast.success('Video settings saved! Note: Format conversion requires server processing.');
            onSave?.(trimData);
            onClose();
        } catch (error) {
            toast.error('Failed to process video');
        } finally {
            setIsTrimming(false);
        }
    };

    const getTrimmedDuration = () => {
        if (trimSegments.length > 0) {
            return trimSegments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
        }
        return trimEnd - trimStart;
    };

    const getOverlayStyle = (overlay) => {
        const positions = {
            'top-left': { top: '10%', left: '10%' },
            'top-center': { top: '10%', left: '50%', transform: 'translateX(-50%)' },
            'top-right': { top: '10%', right: '10%' },
            'center': { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
            'bottom-left': { bottom: '10%', left: '10%' },
            'bottom-center': { bottom: '10%', left: '50%', transform: 'translateX(-50%)' },
            'bottom-right': { bottom: '10%', right: '10%' }
        };
        return positions[overlay.position] || positions.center;
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Video Editor</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Card className="p-4 bg-black relative">
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full rounded-lg"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                        />
                        {getVisibleOverlays().map(overlay => (
                            <div
                                key={overlay.id}
                                className="absolute pointer-events-none"
                                style={{
                                    ...getOverlayStyle(overlay),
                                    fontSize: `${overlay.fontSize}px`,
                                    color: overlay.color,
                                    fontWeight: overlay.fontWeight,
                                    backgroundColor: overlay.backgroundColor,
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    maxWidth: '80%'
                                }}
                            >
                                {overlay.text}
                            </div>
                        ))}
                    </Card>

                    <Tabs defaultValue="trim" className="space-y-4">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="playback">Playback</TabsTrigger>
                            <TabsTrigger value="trim">Trim</TabsTrigger>
                            <TabsTrigger value="text">Text</TabsTrigger>
                            <TabsTrigger value="export">Export</TabsTrigger>
                        </TabsList>

                        <TabsContent value="playback" className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <Label>Playback Position</Label>
                                    <span className="text-sm text-gray-500">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </span>
                                </div>
                                <Slider
                                    value={[currentTime]}
                                    onValueChange={handleSeek}
                                    max={duration || 100}
                                    step={0.1}
                                    className="mb-2"
                                />
                                <div className="flex justify-center">
                                    <Button
                                        variant="outline"
                                        size="lg"
                                        onClick={togglePlayPause}
                                        disabled={!duration}
                                    >
                                        {isPlaying ? (
                                            <Pause className="h-5 w-5" />
                                        ) : (
                                            <Play className="h-5 w-5" />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="trim" className="space-y-4">

                            <div className="flex items-center justify-between mb-4">
                                <Label className="text-base font-semibold flex items-center gap-2">
                                    <Scissors className="h-5 w-5" />
                                    Trim Video
                                </Label>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={resetTrim}
                                >
                                    <RotateCw className="h-4 w-4 mr-2" />
                                    Reset
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <Label>Start Time</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            type="number"
                                            value={trimStart.toFixed(1)}
                                            onChange={(e) => setTrimStart(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            max={duration}
                                            step="0.1"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={setTrimStartToCurrent}
                                            disabled={!duration}
                                        >
                                            Set
                                        </Button>
                                    </div>
                                </div>

                                <div>
                                    <Label>End Time</Label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            type="number"
                                            value={trimEnd.toFixed(1)}
                                            onChange={(e) => setTrimEnd(parseFloat(e.target.value) || duration)}
                                            min="0"
                                            max={duration}
                                            step="0.1"
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={setTrimEndToCurrent}
                                            disabled={!duration}
                                        >
                                            Set
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={addTrimSegment}
                                variant="outline"
                                size="sm"
                                className="w-full mb-4"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add as Segment
                            </Button>

                            {trimSegments.length > 0 && (
                                <div className="space-y-2 mb-4">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm">Segments ({trimSegments.length})</Label>
                                        <Select value={segmentTransition} onValueChange={setSegmentTransition}>
                                            <SelectTrigger className="w-32 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fade">Fade</SelectItem>
                                                <SelectItem value="dissolve">Dissolve</SelectItem>
                                                <SelectItem value="wipe">Wipe</SelectItem>
                                                <SelectItem value="none">Cut</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {trimSegments.map((seg, idx) => (
                                        <Card key={seg.id} className="p-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-600">
                                                    Segment {idx + 1}: {formatTime(seg.start)} → {formatTime(seg.end)}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeTrimSegment(seg.id)}
                                                >
                                                    <Trash2 className="h-3 w-3 text-red-500" />
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700">Total Duration:</span>
                                    <span className="font-semibold text-blue-700">
                                        {formatTime(getTrimmedDuration())}
                                    </span>
                                </div>
                            </div>

                            <div className="relative h-12 bg-gray-200 rounded-lg overflow-hidden">
                                {trimSegments.length > 0 ? (
                                    trimSegments.map((seg, idx) => (
                                        <div
                                            key={seg.id}
                                            className="absolute h-full bg-green-500/40 border-l-2 border-r-2 border-green-600"
                                            style={{
                                                left: `${(seg.start / duration) * 100}%`,
                                                width: `${((seg.end - seg.start) / duration) * 100}%`
                                            }}
                                        />
                                    ))
                                ) : (
                                    <div
                                        className="absolute h-full bg-blue-500/30"
                                        style={{
                                            left: `${(trimStart / duration) * 100}%`,
                                            width: `${((trimEnd - trimStart) / duration) * 100}%`
                                        }}
                                    />
                                )}
                                <div
                                    className="absolute h-full w-0.5 bg-red-500"
                                    style={{
                                        left: `${(currentTime / duration) * 100}%`
                                    }}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="text" className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold flex items-center gap-2">
                                    <Type className="h-5 w-5" />
                                    Text Overlays
                                </Label>
                                <Button onClick={addTextOverlay} size="sm">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Text
                                </Button>
                            </div>

                            {textOverlays.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 border-2 border-dashed rounded-lg">
                                    <Type className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No text overlays yet</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {textOverlays.map(overlay => (
                                        <Card key={overlay.id} className={`p-3 ${selectedOverlay === overlay.id ? 'border-blue-500 border-2' : ''}`}>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Input
                                                        value={overlay.text}
                                                        onChange={(e) => updateOverlay(overlay.id, { text: e.target.value })}
                                                        className="flex-1"
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeOverlay(overlay.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-xs">Position</Label>
                                                        <Select
                                                            value={overlay.position}
                                                            onValueChange={(value) => updateOverlay(overlay.id, { position: value })}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="top-left">Top Left</SelectItem>
                                                                <SelectItem value="top-center">Top Center</SelectItem>
                                                                <SelectItem value="top-right">Top Right</SelectItem>
                                                                <SelectItem value="center">Center</SelectItem>
                                                                <SelectItem value="bottom-left">Bottom Left</SelectItem>
                                                                <SelectItem value="bottom-center">Bottom Center</SelectItem>
                                                                <SelectItem value="bottom-right">Bottom Right</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div>
                                                        <Label className="text-xs">Font Size</Label>
                                                        <Input
                                                            type="number"
                                                            value={overlay.fontSize}
                                                            onChange={(e) => updateOverlay(overlay.id, { fontSize: parseInt(e.target.value) || 32 })}
                                                            min="12"
                                                            max="72"
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>

                                                    <div>
                                                        <Label className="text-xs">Text Color</Label>
                                                        <Input
                                                            type="color"
                                                            value={overlay.color}
                                                            onChange={(e) => updateOverlay(overlay.id, { color: e.target.value })}
                                                            className="h-8"
                                                        />
                                                    </div>

                                                    <div>
                                                        <Label className="text-xs">Background</Label>
                                                        <Select
                                                            value={overlay.backgroundColor}
                                                            onValueChange={(value) => updateOverlay(overlay.id, { backgroundColor: value })}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="rgba(0, 0, 0, 0.5)">Dark</SelectItem>
                                                                <SelectItem value="rgba(255, 255, 255, 0.5)">Light</SelectItem>
                                                                <SelectItem value="rgba(0, 0, 0, 0)">None</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-xs">Start Time</Label>
                                                        <Input
                                                            type="number"
                                                            value={overlay.startTime.toFixed(1)}
                                                            onChange={(e) => updateOverlay(overlay.id, { startTime: parseFloat(e.target.value) || 0 })}
                                                            min="0"
                                                            max={duration}
                                                            step="0.1"
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs">End Time</Label>
                                                        <Input
                                                            type="number"
                                                            value={overlay.endTime.toFixed(1)}
                                                            onChange={(e) => updateOverlay(overlay.id, { endTime: parseFloat(e.target.value) || duration })}
                                                            min="0"
                                                            max={duration}
                                                            step="0.1"
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="export" className="space-y-4">
                            <div>
                                <Label className="text-base font-semibold flex items-center gap-2 mb-4">
                                    <Sparkles className="h-5 w-5" />
                                    Export Settings
                                </Label>

                                <div className="space-y-4">
                                    <div>
                                        <Label>Output Format</Label>
                                        <Select value={outputFormat} onValueChange={setOutputFormat}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mp4">MP4 (Original)</SelectItem>
                                                <SelectItem value="webm">WebM (Web Optimized)</SelectItem>
                                                <SelectItem value="mov">MOV (High Quality)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {outputFormat === 'webm' && 'Recommended for web - smaller file size, good quality'}
                                            {outputFormat === 'mp4' && 'Universal format, compatible with all devices'}
                                            {outputFormat === 'mov' && 'Best quality, larger file size'}
                                        </p>
                                    </div>

                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                        <p className="text-xs text-amber-800">
                                            <strong>Note:</strong> Format conversion and video processing require server-side rendering. 
                                            Current settings will be saved and applied when processing.
                                        </p>
                                    </div>

                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-700">Segments:</span>
                                            <span className="font-medium">{trimSegments.length || 1}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-700">Text Overlays:</span>
                                            <span className="font-medium">{textOverlays.length}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-700">Transition:</span>
                                            <span className="font-medium capitalize">{segmentTransition}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-700">Format:</span>
                                            <span className="font-medium uppercase">{outputFormat}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>

                    <div className="flex gap-2 pt-4 border-t">
                        <Button
                            onClick={handleTrim}
                            disabled={isTrimming || !duration}
                            className="flex-1"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            {isTrimming ? 'Processing...' : 'Save Video Settings'}
                        </Button>
                        <Button onClick={onClose} variant="outline">
                            Cancel
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}