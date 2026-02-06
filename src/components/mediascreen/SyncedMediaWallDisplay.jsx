import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function SyncedMediaWallDisplay({ restaurantId, wallName, screenPosition }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [syncTimestamp, setSyncTimestamp] = useState(null);
    const videoRef = useRef(null);

    // Fetch active playlist
    const { data: playlists = [] } = useQuery({
        queryKey: ['active-playlists', restaurantId, wallName],
        queryFn: async () => {
            const allPlaylists = await base44.entities.MediaWallPlaylist.filter({ 
                restaurant_id: restaurantId,
                wall_name: wallName,
                is_active: true
            });
            
            // Filter by schedule
            const now = new Date();
            return allPlaylists.filter(playlist => {
                if (!playlist.schedule?.enabled) return true;
                
                const schedule = playlist.schedule;
                if (schedule.start_date && new Date(schedule.start_date) > now) return false;
                if (schedule.end_date && new Date(schedule.end_date) < now) return false;
                
                if (schedule.recurring?.enabled) {
                    const currentDay = now.getDay();
                    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return currentTime >= range.start_time && currentTime <= range.end_time;
                    });
                    
                    if (!inTimeRange) return false;
                }
                
                return true;
            }).sort((a, b) => (b.priority || 1) - (a.priority || 1));
        },
        refetchInterval: 30000
    });

    const activePlaylist = playlists[0];

    // Fetch content for active playlist
    const { data: playlistContent = [] } = useQuery({
        queryKey: ['playlist-content', activePlaylist?.id],
        queryFn: async () => {
            if (!activePlaylist?.content_ids) return [];
            
            const content = await Promise.all(
                activePlaylist.content_ids.map(id => 
                    base44.entities.MediaWallContent.filter({ id })
                )
            );
            
            return content.flat().filter(c => c && c.sync_enabled !== false);
        },
        enabled: !!activePlaylist,
        refetchInterval: 30000
    });

    // Synchronization logic
    useEffect(() => {
        if (!playlistContent.length) return;

        const calculateSyncPosition = () => {
            const totalDuration = playlistContent.reduce((sum, c) => sum + (c.duration || 10), 0);
            const now = Date.now();
            const baseTime = Math.floor(now / 1000) * 1000; // Round to nearest second
            const elapsedInCycle = (baseTime / 1000) % totalDuration;
            
            let accumulated = 0;
            for (let i = 0; i < playlistContent.length; i++) {
                const duration = playlistContent[i].duration || 10;
                if (elapsedInCycle < accumulated + duration) {
                    return {
                        index: i,
                        offset: (elapsedInCycle - accumulated) * 1000,
                        timestamp: baseTime
                    };
                }
                accumulated += duration;
            }
            return { index: 0, offset: 0, timestamp: baseTime };
        };

        const sync = () => {
            const { index, offset, timestamp } = calculateSyncPosition();
            
            if (index !== currentIndex || !syncTimestamp || timestamp !== syncTimestamp) {
                setCurrentIndex(index);
                setSyncTimestamp(timestamp);
                
                // Sync video playback
                if (videoRef.current && playlistContent[index]?.media_type === 'video') {
                    videoRef.current.currentTime = offset / 1000;
                    videoRef.current.play().catch(() => {});
                }
            }
        };

        // Initial sync
        sync();

        // Sync every second
        const interval = setInterval(sync, 1000);
        return () => clearInterval(interval);
    }, [playlistContent, currentIndex, syncTimestamp]);

    // Auto-advance content
    useEffect(() => {
        if (!playlistContent.length || currentIndex >= playlistContent.length) return;

        const currentContent = playlistContent[currentIndex];
        if (currentContent.media_type === 'video') return; // Videos auto-advance on end

        const duration = (currentContent.duration || 10) * 1000;
        const timeout = setTimeout(() => {
            const nextIndex = (currentIndex + 1) % playlistContent.length;
            setCurrentIndex(nextIndex);
        }, duration);

        return () => clearTimeout(timeout);
    }, [currentIndex, playlistContent]);

    if (!playlistContent.length) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
                <p>No synchronized content available</p>
            </div>
        );
    }

    const currentContent = playlistContent[currentIndex];
    if (!currentContent) return null;

    return (
        <div className="h-screen w-screen overflow-hidden bg-black">
            {currentContent.media_type === 'video' ? (
                <video
                    ref={videoRef}
                    src={currentContent.media_url}
                    className="w-full h-full object-cover"
                    muted
                    onEnded={() => {
                        const nextIndex = (currentIndex + 1) % playlistContent.length;
                        setCurrentIndex(nextIndex);
                    }}
                />
            ) : (
                <img
                    src={currentContent.media_url}
                    alt={currentContent.title}
                    className="w-full h-full object-cover"
                />
            )}
            
            {/* Sync indicator */}
            <div className="fixed bottom-4 right-4 bg-black/50 text-white px-3 py-1 rounded text-xs">
                Synced: {currentIndex + 1}/{playlistContent.length}
            </div>
        </div>
    );
}