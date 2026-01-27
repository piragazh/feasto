import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Scissors, Play, Pause, RotateCw, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function VideoEditor({ open, videoUrl, onClose, onSave }) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [isTrimming, setIsTrimming] = useState(false);
    const videoRef = useRef(null);

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

    const handleTrim = async () => {
        setIsTrimming(true);
        try {
            // Note: Actual video trimming requires server-side processing
            // For now, we'll pass the trim points to the parent component
            const trimData = {
                videoUrl,
                startTime: trimStart,
                endTime: trimEnd,
                duration: trimEnd - trimStart
            };
            
            toast.success('Video trim points saved');
            onSave?.(trimData);
            onClose();
        } catch (error) {
            toast.error('Failed to process video');
        } finally {
            setIsTrimming(false);
        }
    };

    const getTrimmedDuration = () => {
        return trimEnd - trimStart;
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Video Editor</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Card className="p-4 bg-black">
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            className="w-full rounded-lg"
                            onLoadedMetadata={handleLoadedMetadata}
                            onTimeUpdate={handleTimeUpdate}
                            onEnded={() => setIsPlaying(false)}
                        />
                    </Card>

                    <div className="space-y-4">
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

                        <div className="border-t pt-4">
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

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-700">Trimmed Duration:</span>
                                    <span className="font-semibold text-blue-700">
                                        {formatTime(getTrimmedDuration())}
                                    </span>
                                </div>
                            </div>

                            <div className="relative h-12 bg-gray-200 rounded-lg mt-4 overflow-hidden">
                                <div
                                    className="absolute h-full bg-blue-500/30"
                                    style={{
                                        left: `${(trimStart / duration) * 100}%`,
                                        width: `${((trimEnd - trimStart) / duration) * 100}%`
                                    }}
                                />
                                <div
                                    className="absolute h-full w-0.5 bg-red-500"
                                    style={{
                                        left: `${(currentTime / duration) * 100}%`
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-4 border-t">
                            <Button
                                onClick={handleTrim}
                                disabled={isTrimming || !duration}
                                className="flex-1"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                {isTrimming ? 'Processing...' : 'Apply Trim'}
                            </Button>
                            <Button onClick={onClose} variant="outline">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}