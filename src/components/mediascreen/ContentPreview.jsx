import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Play, Pause } from 'lucide-react';

export default function ContentPreview({ content, open, onClose, isFullWall = false }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [displayTime, setDisplayTime] = useState(0);

    useEffect(() => {
        if (!open || !content || content.length === 0) return;
        setCurrentIndex(0);
        setDisplayTime(0);
    }, [open, content]);

    useEffect(() => {
        if (!isPlaying || !content || content.length === 0) return;

        const timer = setInterval(() => {
            setDisplayTime(prev => prev + 0.1);
            const currentItem = content[currentIndex];
            const itemDuration = currentItem?.duration || 10;

            if (displayTime >= itemDuration - 0.1) {
                setDisplayTime(0);
                setCurrentIndex(prev => (prev + 1) % content.length);
            }
        }, 100);

        return () => clearInterval(timer);
    }, [isPlaying, displayTime, currentIndex, content]);

    if (!content || content.length === 0) return null;

    const currentItem = content[currentIndex];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b flex justify-between items-center">
                    <DialogTitle>
                        {isFullWall ? 'Full-Wall Content Preview' : 'Screen Content Preview'}
                    </DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onClose}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </DialogHeader>

                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Main Preview Area */}
                    <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
                        {currentItem.media_type === 'video' ? (
                            <video
                                key={currentItem.id}
                                src={currentItem.media_url}
                                className="max-w-full max-h-full w-auto h-auto object-contain"
                                autoPlay
                                muted
                            />
                        ) : (
                            <img
                                key={currentItem.id}
                                src={currentItem.media_url}
                                alt={currentItem.title}
                                className="max-w-full max-h-full w-auto h-auto object-contain"
                            />
                        )}

                        {/* Overlay Info */}
                        <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                            <div className="bg-black/50 backdrop-blur-sm text-white px-4 py-2 rounded-lg">
                                <p className="text-sm font-medium">{currentItem.title}</p>
                                <p className="text-xs text-gray-300">{currentItem.description}</p>
                            </div>
                            <Badge className="bg-black/50 text-white">
                                {currentIndex + 1} / {content.length}
                            </Badge>
                        </div>

                        {/* Duration Progress */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm h-1">
                            <div
                                className="h-full bg-orange-500 transition-all"
                                style={{
                                    width: `${(displayTime / (currentItem.duration || 10)) * 100}%`
                                }}
                            />
                        </div>
                    </div>

                    {/* Controls and Timeline */}
                    <div className="bg-gray-900 text-white p-4 space-y-4">
                        {/* Playback Controls */}
                        <div className="flex items-center justify-center gap-4">
                            <Button
                                variant="ghost"
                                className="text-white hover:bg-gray-800"
                                onClick={() => setCurrentIndex(prev => (prev - 1 + content.length) % content.length)}
                            >
                                ← Previous
                            </Button>
                            <Button
                                variant="ghost"
                                className="text-white hover:bg-gray-800"
                                onClick={() => setIsPlaying(!isPlaying)}
                            >
                                {isPlaying ? (
                                    <>
                                        <Pause className="h-4 w-4 mr-2" />
                                        Pause
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Play
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                className="text-white hover:bg-gray-800"
                                onClick={() => setCurrentIndex(prev => (prev + 1) % content.length)}
                            >
                                Next →
                            </Button>
                            <span className="text-sm text-gray-400 ml-4">
                                {displayTime.toFixed(1)}s / {(currentItem.duration || 10)}s
                            </span>
                        </div>

                        {/* Timeline */}
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 font-medium">Content Timeline</p>
                            <div className="grid grid-cols-5 gap-2 max-h-32 overflow-y-auto">
                                {content.map((item, idx) => (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            setCurrentIndex(idx);
                                            setDisplayTime(0);
                                            setIsPlaying(true);
                                        }}
                                        className={`p-2 rounded-lg transition-all border-2 ${
                                            idx === currentIndex
                                                ? 'border-orange-500 bg-orange-500/20'
                                                : 'border-gray-700 hover:border-gray-600'
                                        }`}
                                    >
                                        <div className="w-full aspect-video bg-gray-800 rounded overflow-hidden mb-1">
                                            {item.media_type === 'video' ? (
                                                <video src={item.media_url} className="w-full h-full object-cover" />
                                            ) : (
                                                <img src={item.media_url} alt={item.title} className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <p className="text-xs font-medium truncate">{item.title}</p>
                                        <p className="text-[10px] text-gray-400">{item.duration}s</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
                            <p>Total Duration: {content.reduce((sum, item) => sum + (item.duration || 10), 0)}s</p>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}