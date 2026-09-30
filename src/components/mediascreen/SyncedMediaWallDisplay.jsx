import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import CustomContentWidget from './CustomContentWidget';
import { filterActivePlaylists, isScheduleActive } from './scheduleUtils';
import { useScreenManifest } from './ScreenManifestContext';
import { serverNow, syncServerClock } from '@/lib/screenDevice';

const EMPTY = [];

// How far a video may drift from the shared timeline before we correct it.
const VIDEO_DRIFT_TOLERANCE_S = 1.5;

export default function SyncedMediaWallDisplay({ restaurantId, wallName, screenPosition = null, gridSize = null, bezelCompensation = 0 }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const videoRef = useRef(null);
    const currentIndexRef = useRef(-1);
    const itemOffsetRef = useRef(0);
    const manifest = useScreenManifest();
    const paired = !!manifest;

    // Keep this device's clock aligned with the server so every wall screen
    // computes the same position (paired devices sync on each heartbeat).
    useEffect(() => {
        if (paired) return;
        syncServerClock(true);
        const t = setInterval(() => syncServerClock(), 10 * 60 * 1000);
        return () => clearInterval(t);
    }, [paired]);

    const [scheduleTick, setScheduleTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setScheduleTick(n => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    // Active playlist (own cache key — ScreenDisplay keeps raw playlists under a different key)
    const { data: queriedPlaylists = EMPTY } = useQuery({
        queryKey: ['synced-wall-playlists', restaurantId, wallName],
        queryFn: async () => {
            const allPlaylists = await base44.entities.MediaWallPlaylist.filter({
                restaurant_id: restaurantId,
                wall_name: wallName,
                is_active: true
            });
            return filterActivePlaylists(allPlaylists);
        },
        enabled: !!restaurantId && !!wallName && !paired,
        refetchInterval: 30000
    });

    const playlists = useMemo(
        () => (paired ? filterActivePlaylists(manifest.playlists || EMPTY) : queriedPlaylists),
        [paired, manifest, queriedPlaylists, scheduleTick]
    );
    const activePlaylist = playlists[0];

    // Content: playlist content_ids (in playlist order), otherwise all wall content
    const { data: queriedPlaylistContent = EMPTY } = useQuery({
        queryKey: ['playlist-content', restaurantId, wallName, activePlaylist?.id],
        queryFn: async () => {
            const now = new Date();
            if (activePlaylist?.content_ids?.length) {
                const content = await Promise.all(
                    activePlaylist.content_ids.map(id =>
                        base44.entities.MediaWallContent.filter({ id })
                    )
                );
                return content.flat().filter(c => c && c.is_active !== false && isScheduleActive(c.schedule, now));
            }

            const content = await base44.entities.MediaWallContent.filter({
                restaurant_id: restaurantId,
                wall_name: wallName
            });
            return content
                .filter(c => c && c.is_active !== false && isScheduleActive(c.schedule, now))
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
        },
        enabled: !!restaurantId && !!wallName && !paired,
        refetchInterval: 30000
    });

    const pairedContent = useMemo(() => {
        if (!paired) return EMPTY;
        const now = new Date();
        const all = (manifest.wall_content || EMPTY).filter(c => c && c.is_active !== false && isScheduleActive(c.schedule, now));
        if (activePlaylist?.content_ids?.length) {
            const byId = new Map(all.map(c => [c.id, c]));
            return activePlaylist.content_ids.map(id => byId.get(id)).filter(Boolean);
        }
        return [...all].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    }, [paired, manifest, activePlaylist, scheduleTick]);

    const pairedSig = pairedContent.map(c => `${c.id}:${c.updated_date || ''}`).join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const stablePairedContent = useMemo(() => pairedContent, [pairedSig]);
    const playlistContent = paired ? stablePairedContent : queriedPlaylistContent;

    // Shared-timeline sync: every screen derives the same item + offset from the clock.
    // Only switches item when the index actually changes, and only seeks a video
    // when it has drifted — previously the video was re-seeked every second.
    useEffect(() => {
        if (!playlistContent.length) return;

        const totalDuration = playlistContent.reduce((sum, c) => sum + (c.duration || 10), 0);

        const sync = () => {
            const elapsedInCycle = (serverNow() / 1000) % totalDuration;
            let accumulated = 0;
            let index = 0;
            let offset = 0;
            for (let i = 0; i < playlistContent.length; i++) {
                const duration = playlistContent[i].duration || 10;
                if (elapsedInCycle < accumulated + duration) {
                    index = i;
                    offset = elapsedInCycle - accumulated;
                    break;
                }
                accumulated += duration;
            }
            itemOffsetRef.current = offset;

            if (index !== currentIndexRef.current) {
                currentIndexRef.current = index;
                setCurrentIndex(index);
                return; // the new <video> seeks itself on loadedmetadata
            }

            const video = videoRef.current;
            if (video && playlistContent[index]?.media_type === 'video' && video.duration) {
                const target = offset % video.duration;
                if (Math.abs(video.currentTime - target) > VIDEO_DRIFT_TOLERANCE_S) {
                    video.currentTime = target;
                }
                if (video.paused) video.play().catch(() => {});
            }
        };

        currentIndexRef.current = -1;
        sync();
        const interval = setInterval(sync, 1000);
        return () => clearInterval(interval);
    }, [playlistContent]);

    // Preload the next item
    useEffect(() => {
        if (!playlistContent.length) return;
        const nextContent = playlistContent[(currentIndex + 1) % playlistContent.length];
        if (!nextContent?.media_url || nextContent.media_type?.startsWith('widget_')) return;
        if (nextContent.media_type === 'video') {
            const preloadVideo = document.createElement('video');
            preloadVideo.preload = 'auto';
            preloadVideo.src = nextContent.media_url;
        } else {
            const preloadImg = new Image();
            preloadImg.src = nextContent.media_url;
        }
    }, [currentIndex, playlistContent]);

    if (!playlistContent.length) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
                <div className="text-center opacity-60">
                    <p className="text-lg">No content available</p>
                    <p className="text-sm mt-1">Add content to this wall to begin displaying</p>
                </div>
            </div>
        );
    }

    const currentContent = playlistContent[currentIndex % playlistContent.length];
    if (!currentContent) return null;

    const isWidget = currentContent.media_type?.startsWith('widget_');
    const widgetType = isWidget ? currentContent.media_type.replace('widget_', '') : null;

    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
    const hasPosition = screenPosition && gridSize;
    const { row = 0, col = 0 } = screenPosition || {};
    const { rows = 1, cols = 1 } = gridSize || {};
    const bezel = bezelCompensation || 0;
    const offsetX = hasPosition ? -(col * screenWidth) - (col * bezel) : 0;
    const offsetY = hasPosition ? -(row * screenHeight) - (row * bezel) : 0;
    const totalWidth = hasPosition ? (screenWidth * cols) + (bezel * (cols - 1)) : screenWidth;
    const totalHeight = hasPosition ? (screenHeight * rows) + (bezel * (rows - 1)) : screenHeight;

    const mediaStyle = hasPosition ? {
        position: 'absolute',
        left: `${offsetX}px`,
        top: `${offsetY}px`,
        width: `${totalWidth}px`,
        height: `${totalHeight}px`,
        objectFit: 'cover'
    } : undefined;

    return (
        <div className="h-screen w-screen overflow-hidden bg-gray-900 relative">
            {isWidget ? (
                <CustomContentWidget
                    restaurantId={restaurantId}
                    widgetType={widgetType}
                    config={currentContent.widget_config || {}}
                />
            ) : currentContent.media_type === 'video' ? (
                <video
                    key={currentContent.id}
                    ref={videoRef}
                    src={currentContent.media_url}
                    className={hasPosition ? 'absolute' : 'w-full h-full object-cover'}
                    style={mediaStyle}
                    muted
                    autoPlay
                    playsInline
                    loop
                    onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        if (v.duration) v.currentTime = itemOffsetRef.current % v.duration;
                        v.play().catch(() => {});
                    }}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => setIsBuffering(false)}
                    onError={() => setIsBuffering(false)}
                />
            ) : (
                <img
                    key={currentContent.id}
                    src={currentContent.media_url}
                    alt={currentContent.title}
                    className={hasPosition ? 'absolute' : 'w-full h-full object-cover'}
                    style={mediaStyle}
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
            )}

            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                    <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
}
