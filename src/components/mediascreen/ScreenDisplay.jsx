import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';
import MultiZoneDisplay from './MultiZoneDisplay';
import SyncedMediaWallDisplay from './SyncedMediaWallDisplay';
import WidgetRenderer from './WidgetRenderer';
import { useMediaPrecache } from '@/hooks/useMediaPrecache';
import { filterActiveContent, filterActivePlaylists, clearScreenCache } from './scheduleUtils';
import { useScreenManifest } from './ScreenManifestContext';
import TakeoverScreen, { isTakeoverActive } from './TakeoverScreen';

// --- localStorage cache helpers ---
// The cache stores RAW records; schedules are applied at display time so an
// offline / cold start can never play expired or not-yet-started content.
const CACHE_VERSION = 'v1';
const cacheKey = (key) => `screen_cache_${CACHE_VERSION}_${key}`;

function readCache(key) {
    try {
        const raw = localStorage.getItem(cacheKey(key));
        if (!raw) return { data: undefined, ts: 0 };
        const { data, ts } = JSON.parse(raw);
        return { data, ts: ts || 0 };
    } catch { return { data: undefined, ts: 0 }; }
}

function writeCache(key, data) {
    try {
        localStorage.setItem(cacheKey(key), JSON.stringify({ data, ts: Date.now() }));
    } catch {}
}

// Returns the same array instance while the list's items are unchanged, so
// periodic schedule re-checks don't reset rotation timers.
const listSignature = (list) =>
    (list || []).map((c) => `${c.id}:${c.updated_date || ''}`).join('|');

function useStableList(list) {
    const sig = listSignature(list);
    return useMemo(() => list, [sig]);
}

const TRANSITION_DURATION = 700; // ms
const VIDEO_STALL_GUARD_MS = 15 * 60 * 1000; // advance if a video never fires 'ended'
const FAILED_MEDIA_RETRY_MS = 5 * 60 * 1000; // retry media that failed to load
const ROTATION_STALL_MS = 20 * 60 * 1000; // no rotation for this long → ask the page to recover
const EMPTY = [];

const getWeatherIcon = (description) => {
    const desc = description?.toLowerCase() || '';
    if (desc.includes('rain')) return <CloudRain className="h-6 w-6" />;
    if (desc.includes('snow')) return <CloudSnow className="h-6 w-6" />;
    if (desc.includes('cloud')) return <Cloud className="h-6 w-6" />;
    if (desc.includes('wind')) return <Wind className="h-6 w-6" />;
    return <Sun className="h-6 w-6" />;
};

// Clock + weather overlay has its own 1s timer so the rest of the player
// (and every mounted media item) no longer re-renders every second.
function ClockWeatherOverlay({ weather }) {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="absolute top-0 right-0 z-10 p-6">
            <div className="flex items-center justify-end">
                <div className="flex items-center gap-6 text-white">
                    <div className="text-right">
                        <div className="text-2xl font-bold">
                            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm opacity-80">
                            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </div>
                    </div>

                    {weather?.temperature != null && (
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                            {getWeatherIcon(weather.description)}
                            <div>
                                <div className="text-xl font-bold">{weather.temperature}°C</div>
                                <div className="text-xs opacity-80 capitalize">{weather.description}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function ScreenDisplay({ restaurantId, screenName, embedded = false, preview = false }) {
    // Paired-device mode: all data comes from the manifest (no direct entity reads)
    const manifest = useScreenManifest();
    const paired = !!manifest;

    const [currentIndex, setCurrentIndex] = useState(0);
    const [prevIndex, setPrevIndex] = useState(null);
    const [videoLoopCount, setVideoLoopCount] = useState(0);
    const [wallContentIndex, setWallContentIndex] = useState(0);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [scheduleTick, setScheduleTick] = useState(0);
    const [failedIds, setFailedIds] = useState(() => new Set());
    const [legacyTakeover, setLegacyTakeover] = useState(undefined);
    const heartbeatIntervalRef = useRef(null);
    const commandCheckIntervalRef = useRef(null);
    const transitionTimerRef = useRef(null);
    const videoRefs = useRef({});

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Re-evaluate schedules every 30s, even when offline
    useEffect(() => {
        const t = setInterval(() => setScheduleTick((n) => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    // Give failed media another chance periodically (e.g. file re-uploaded, network back)
    useEffect(() => {
        const t = setInterval(() => {
            setFailedIds((prev) => (prev.size ? new Set() : prev));
        }, FAILED_MEDIA_RETRY_MS);
        return () => clearInterval(t);
    }, []);

    useEffect(() => () => clearTimeout(transitionTimerRef.current), []);

    const { data: queriedRestaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const data = await base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]);
            writeCache(`restaurant_${restaurantId}`, data);
            return data;
        },
        enabled: !!restaurantId && isOnline && !paired,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`restaurant_${restaurantId}`).data,
        initialDataUpdatedAt: () => readCache(`restaurant_${restaurantId}`).ts,
        retry: 2,
    });

    const { data: queriedScreen, refetch: refetchScreen, isLoading: queriedScreenLoading } = useQuery({
        queryKey: ['screen', restaurantId, screenName],
        queryFn: async () => {
            const screens = await base44.entities.Screen.filter({
                restaurant_id: restaurantId,
                screen_name: screenName
            });
            const data = screens[0];
            writeCache(`screen_${restaurantId}_${screenName}`, data);
            return data;
        },
        enabled: !!restaurantId && !!screenName && isOnline && !paired,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`screen_${restaurantId}_${screenName}`).data,
        initialDataUpdatedAt: () => readCache(`screen_${restaurantId}_${screenName}`).ts,
        retry: 2,
    });

    const restaurant = paired ? manifest.restaurant : queriedRestaurant;
    const screen = paired ? manifest.screen : queriedScreen;
    const screenLoading = paired ? false : queriedScreenLoading;
    // Takeover: paired screens get it in the manifest; legacy screens via the 10s command check.
    // scheduleTick (30s) re-evaluates expiry.
    const activeTakeover = paired
        ? manifest.screen?.takeover
        : (legacyTakeover !== undefined ? legacyTakeover : queriedScreen?.takeover);

    const wallName = screen?.media_wall_config?.wall_name;
    const wallEnabled = !!screen?.media_wall_config?.enabled && !!wallName;

    // Raw playlists for this wall (own query key — SyncedMediaWallDisplay uses a different one)
    const { data: queriedPlaylists = EMPTY } = useQuery({
        queryKey: ['wall-playlists-raw', restaurantId, wallName],
        queryFn: async () => {
            const playlists = await base44.entities.MediaWallPlaylist.filter({
                restaurant_id: restaurantId,
                wall_name: wallName,
                is_active: true
            });
            writeCache(`playlists_${restaurantId}_${wallName}`, playlists);
            return playlists;
        },
        refetchInterval: isOnline ? 60000 : false,
        enabled: !!restaurantId && wallEnabled && !paired,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`playlists_${restaurantId}_${wallName}`).data ?? [],
        initialDataUpdatedAt: () => readCache(`playlists_${restaurantId}_${wallName}`).ts,
        retry: 2,
    });
    const rawPlaylists = paired ? (manifest.playlists || EMPTY) : queriedPlaylists;

    const activePlaylists = useMemo(
        () => (wallEnabled ? filterActivePlaylists(rawPlaylists) : []),
        [rawPlaylists, wallEnabled, scheduleTick]
    );
    const usePlaylistSync = activePlaylists.length > 0;

    const { data: queriedWallContent = EMPTY } = useQuery({
        queryKey: ['wall-content', restaurantId, wallName],
        queryFn: async () => {
            const content = await base44.entities.MediaWallContent.filter({
                restaurant_id: restaurantId,
                wall_name: wallName,
                is_active: true
            });
            writeCache(`wall_content_${restaurantId}_${wallName}`, content);
            return content;
        },
        enabled: !!restaurantId && wallEnabled && !usePlaylistSync && !paired,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchInterval: isOnline ? 60000 : false,
        initialData: () => readCache(`wall_content_${restaurantId}_${wallName}`).data ?? [],
        initialDataUpdatedAt: () => readCache(`wall_content_${restaurantId}_${wallName}`).ts,
        retry: 2,
    });
    const rawWallContent = useMemo(
        () => (paired ? (manifest.wall_content || EMPTY).filter(c => c.is_active !== false) : queriedWallContent),
        [paired, manifest, queriedWallContent]
    );

    const wallContent = useStableList(useMemo(
        () => (wallEnabled ? filterActiveContent(rawWallContent) : []),
        [rawWallContent, wallEnabled, scheduleTick]
    ));

    const { data: queriedContent = EMPTY, isLoading: queriedContentLoading } = useQuery({
        queryKey: ['screen-content', restaurantId, screenName],
        queryFn: async () => {
            const allContent = await base44.entities.PromotionalContent.filter({
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: true
            });
            writeCache(`content_${restaurantId}_${screenName}`, allContent);
            return allContent;
        },
        enabled: !!restaurantId && !!screenName && !paired,
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchInterval: isOnline ? 60000 : false,
        initialData: () => readCache(`content_${restaurantId}_${screenName}`).data ?? [],
        initialDataUpdatedAt: () => readCache(`content_${restaurantId}_${screenName}`).ts,
        retry: 2,
    });
    const rawContent = paired ? (manifest.content || EMPTY) : queriedContent;
    const contentLoading = paired ? false : queriedContentLoading;

    // Schedule-filtered, stably sorted content with failed media skipped
    const scheduledContent = useStableList(useMemo(
        () => filterActiveContent(rawContent),
        [rawContent, scheduleTick]
    ));
    const content = useStableList(useMemo(
        () => scheduledContent.filter((c) => !failedIds.has(c.id)),
        [scheduledContent, failedIds]
    ));
    const allMediaFailed = scheduledContent.length > 0 && content.length === 0;

    // Fetch widget configs for inline widget playlist items
    const { data: queriedWidgetConfigs = EMPTY } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: async () => {
            const data = await base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId });
            writeCache(`widgets_${restaurantId}`, data);
            return data;
        },
        enabled: !!restaurantId && isOnline && !paired,
        staleTime: 10 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchInterval: isOnline ? 5 * 60 * 1000 : false,
        initialData: () => readCache(`widgets_${restaurantId}`).data ?? [],
        initialDataUpdatedAt: () => readCache(`widgets_${restaurantId}`).ts,
        retry: 2,
    });
    const widgetConfigs = paired ? (manifest.widget_configs || EMPTY) : queriedWidgetConfigs;

    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            const resp = await base44.functions.invoke('getWeather', {
                lat: restaurant.latitude,
                lng: restaurant.longitude
            });
            // Normalise to just the data payload so cache and live data are consistent
            const payload = resp?.data ?? resp;
            writeCache(`weather_${restaurantId}`, payload);
            return payload;
        },
        enabled: !!restaurant?.latitude && !!restaurant?.longitude && isOnline,
        staleTime: 10 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchInterval: isOnline ? 10 * 60 * 1000 : false,
        initialData: () => readCache(`weather_${restaurantId}`).data,
        initialDataUpdatedAt: () => readCache(`weather_${restaurantId}`).ts,
        retry: 1,
    });

    // Heartbeat mechanism (legacy URL mode only — paired devices check in via screenDevice).
    // A Studio preview tab is not a screen: it never reports in.
    useEffect(() => {
        if (!screen?.id || paired || preview) return;

        const sendHeartbeat = async () => {
            try {
                await base44.entities.Screen.update(screen.id, {
                    last_heartbeat: new Date().toISOString(),
                    screen_info: {
                        browser: navigator.userAgent.split(' ').slice(-2).join(' '),
                        resolution: `${window.screen.width}x${window.screen.height}`,
                        os: navigator.platform
                    }
                });
            } catch (error) {
                console.error('Heartbeat failed:', error);
            }
        };

        if (isOnline) sendHeartbeat();

        heartbeatIntervalRef.current = setInterval(() => {
            if (isOnline) sendHeartbeat();
        }, 60000);

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, [screen?.id, isOnline, paired, preview]);

    // Command listener (legacy URL mode only)
    useEffect(() => {
        if (!screen?.id || paired) return;

        const checkCommands = async () => {
            try {
                const screens = await base44.entities.Screen.filter({
                    id: screen.id
                });
                const currentScreen = screens[0];

                // Priority message (emergency takeover) — picked up within 10s
                setLegacyTakeover(currentScreen?.takeover || null);

                // Preview tabs only watch; commands belong to the real screen
                if (preview) return;

                if (currentScreen?.pending_command) {
                    const command = currentScreen.pending_command;

                    // Clear the command so it doesn't run twice
                    await base44.entities.Screen.update(screen.id, {
                        pending_command: null,
                        command_timestamp: null
                    });

                    // Mark the matching command log as executed
                    try {
                        const logs = await base44.entities.ScreenCommandLog.filter({
                            screen_id: screen.id,
                            command: command,
                            status: 'pending'
                        }, '-created_date', 1);

                        if (logs[0]) {
                            await base44.entities.ScreenCommandLog.update(logs[0].id, {
                                status: 'executed',
                                executed_at: new Date().toISOString()
                            });
                        }
                    } catch (logError) {
                        console.error('Failed to update command log:', logError);
                    }

                    switch (command) {
                        case 'refresh_content':
                            refetchScreen();
                            window.location.reload();
                            break;
                        case 'reboot':
                        case 'reload':
                            window.location.reload();
                            break;
                        case 'clear_cache':
                            // Only this player's cached data — never auth tokens,
                            // kiosk settings or anything else on the device.
                            clearScreenCache();
                            window.location.reload();
                            break;
                        default:
                            console.log('Custom command executed:', command);
                    }
                }
            } catch (error) {
                console.error('Command check failed:', error);
            }
        };

        commandCheckIntervalRef.current = setInterval(() => {
            if (isOnline) checkCommands();
        }, 10000);

        return () => {
            if (commandCheckIntervalRef.current) {
                clearInterval(commandCheckIntervalRef.current);
            }
        };
    }, [screen?.id, refetchScreen, isOnline, paired, preview]);

    // Pre-cache all media assets for offline resilience
    useMediaPrecache(content, wallContent, isOnline);

    const safeIndex = content.length > 0 ? Math.min(currentIndex, content.length - 1) : 0;

    useEffect(() => {
        if (content.length > 0 && currentIndex >= content.length) {
            setCurrentIndex(content.length - 1);
        }
    }, [content.length]);

    // Active layout: per-item override takes priority over screen default
    const currentItem = content[safeIndex];
    const isPerItemLayout = currentItem?.layout_template?.zones?.length > 0;
    const activeLayout = isPerItemLayout ? currentItem.layout_template : screen?.layout_template;
    const isLayoutMode = !!(activeLayout?.zones && activeLayout.zones.length > 0);

    const advance = useCallback(() => {
        setCurrentIndex((prev) => {
            const len = content.length || 1;
            return (prev + 1) % len;
        });
    }, [content.length]);

    // Track the outgoing item for transitions (side effects kept out of setState updaters)
    const lastIndexRef = useRef(safeIndex);
    const lastProgressRef = useRef(Date.now());
    useEffect(() => {
        lastProgressRef.current = Date.now();
        if (lastIndexRef.current === safeIndex) return;
        setPrevIndex(lastIndexRef.current);
        lastIndexRef.current = safeIndex;
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = setTimeout(() => setPrevIndex(null), TRANSITION_DURATION + 100);
    }, [safeIndex]);

    // Mark a media item as failed and move on instead of stalling on it
    const handleMediaError = useCallback((item) => {
        if (!item?.id) return;
        console.warn('[MediaScreen] Media failed to load, skipping:', item.media_url);
        setFailedIds((prev) => {
            if (prev.has(item.id)) return prev;
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });
    }, []);

    // Play active video, pause others
    useEffect(() => {
        setVideoLoopCount(0);
        if (content.length === 0 || isLayoutMode) return;
        const activeId = content[safeIndex]?.id;
        const t = setTimeout(() => {
            Object.entries(videoRefs.current).forEach(([id, video]) => {
                if (!video) return;
                if (id === activeId) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                } else {
                    video.pause();
                    video.currentTime = 0;
                }
            });
        }, 50);
        return () => clearTimeout(t);
    }, [safeIndex, content, isLayoutMode]);

    const handleVideoEnd = (item) => {
        if (content.length <= 1) return;
        const targetLoops = item.video_loop_count || 1;
        setVideoLoopCount(prev => {
            const newCount = prev + 1;
            if (newCount >= targetLoops) {
                setTimeout(advance, 100);
                return 0;
            }
            return newCount;
        });
    };

    // Rotation timer
    useEffect(() => {
        if (content.length <= 1) return;
        const item = content[safeIndex];
        // In layout mode videos are not rendered by this component, so 'ended'
        // can never fire here — use the item's duration instead of waiting forever.
        const waitsForVideoEnd = item?.media_type === 'video' && !isLayoutMode;
        const duration = waitsForVideoEnd ? VIDEO_STALL_GUARD_MS : (item?.duration || 10) * 1000;
        const timer = setTimeout(advance, duration);
        return () => clearTimeout(timer);
    }, [safeIndex, content, isLayoutMode, advance]);

    // Wall content rotation
    useEffect(() => {
        lastProgressRef.current = Date.now();
        if (!screen?.media_wall_config?.enabled || wallContent.length <= 1) return;
        const currentWallContent = wallContent[wallContentIndex % wallContent.length];
        const duration = (currentWallContent?.duration || 10) * 1000;
        const timer = setTimeout(() => {
            setWallContentIndex(prev => (prev + 1) % wallContent.length);
        }, duration);
        return () => clearTimeout(timer);
    }, [wallContentIndex, wallContent, screen?.media_wall_config?.enabled]);

    // Stall detection: if a rotating playlist hasn't moved for 20 minutes, tell the
    // page guardian (MediaScreen page only — the kiosk overlay doesn't listen).
    const rotationExpected = !embedded && !usePlaylistSync && (
        (wallEnabled && wallContent.length > 1) || (!wallEnabled && content.length > 1)
    );
    useEffect(() => {
        if (!rotationExpected) return;
        lastProgressRef.current = Date.now();
        const t = setInterval(() => {
            if (Date.now() - lastProgressRef.current > ROTATION_STALL_MS) {
                window.dispatchEvent(new CustomEvent('mediascreen:stalled'));
            }
        }, 60000);
        return () => clearInterval(t);
    }, [rotationExpected]);

    // Proof of play: one "play" each time an item comes on screen, plus the seconds
    // it stayed there. Events are picked up by PairedScreenPlayer and sent with the
    // next check-in (legacy URL screens and the kiosk don't report). Single-screen
    // rotation only; layouts and media walls aren't counted yet.
    const trackedItem = (!embedded && !isLayoutMode && !wallEnabled && !isTakeoverActive(activeTakeover))
        ? content[safeIndex] : null;
    const trackedId = trackedItem?.id || null;
    const trackedItemRef = useRef(null);
    trackedItemRef.current = trackedItem;
    useEffect(() => {
        if (!paired || !trackedId) return;
        const item = trackedItemRef.current;
        let since = Date.now();
        const emit = (plays) => {
            const seconds = Math.round((Date.now() - since) / 1000);
            since = Date.now();
            if (!plays && seconds <= 0) return;
            window.dispatchEvent(new CustomEvent('mediascreen:played', {
                detail: { content_id: item.id, title: item.title || '', media_type: item.media_type || '', plays, seconds },
            }));
        };
        emit(1);
        const t = setInterval(() => emit(0), 60000);
        return () => { clearInterval(t); emit(0); };
    }, [paired, trackedId]);

    // Remote view: describe what's on screen; PairedScreenPlayer sends it with
    // each check-in so Live Control can show "Now showing".
    const nowShowing = (() => {
        if (isTakeoverActive(activeTakeover)) return { mode: 'message', title: activeTakeover.title || activeTakeover.message };
        if (wallEnabled) return { mode: 'media_wall', title: wallName, item_count: wallContent.length };
        if (isLayoutMode) return { mode: 'layout', layout_name: activeLayout?.name || 'Custom layout', item_count: content.length };
        const item = content[safeIndex];
        if (!item) return { mode: allMediaFailed ? 'media_failed' : 'empty', item_count: 0, failed_count: failedIds.size };
        return {
            mode: 'playlist', content_id: item.id, title: item.title || '', media_type: item.media_type,
            media_url: item.media_type === 'widget' ? null : item.media_url, widget_type: item.widget_type || null,
            item_count: content.length, failed_count: failedIds.size,
        };
    })();
    const nowShowingKey = JSON.stringify(nowShowing);
    useEffect(() => {
        if (!paired || embedded) return;
        window.dispatchEvent(new CustomEvent('mediascreen:nowshowing', { detail: JSON.parse(nowShowingKey) }));
    }, [nowShowingKey, paired, embedded]);

    if (!restaurantId || !screenName) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <p className="text-xl">Missing restaurant ID or screen name</p>
            </div>
        );
    }

    if (screenLoading || contentLoading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-gray-900">
                <div className="text-center text-white">
                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-lg opacity-70">Loading screen...</p>
                </div>
            </div>
        );
    }

    // Emergency / priority message replaces everything (never on the kiosk)
    if (!embedded && isTakeoverActive(activeTakeover)) {
        return <TakeoverScreen takeover={activeTakeover} orientation={screen?.orientation} />;
    }

    if (wallEnabled && usePlaylistSync) {
        return (
            <SyncedMediaWallDisplay
                restaurantId={restaurantId}
                wallName={wallName}
                screenPosition={screen.media_wall_config.position}
                gridSize={screen.media_wall_config.grid_size}
                bezelCompensation={screen.media_wall_config.bezel_compensation || 0}
            />
        );
    }

    if (wallEnabled && wallContent.length > 0) {
        const currentWallContent = wallContent[wallContentIndex % wallContent.length];
        const wallConfig = screen.media_wall_config;

        const { row, col } = wallConfig.position || { row: 0, col: 0 };
        const { rows, cols } = wallConfig.grid_size || { rows: 2, cols: 2 };
        const bezel = wallConfig.bezel_compensation || 0;

        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        const offsetX = -(col * screenWidth) - (col * bezel);
        const offsetY = -(row * screenHeight) - (row * bezel);
        const totalWidth = (screenWidth * cols) + (bezel * (cols - 1));
        const totalHeight = (screenHeight * rows) + (bezel * (rows - 1));
        const wallMediaStyle = {
            left: `${offsetX}px`,
            top: `${offsetY}px`,
            width: `${totalWidth}px`,
            height: `${totalHeight}px`,
            objectFit: 'cover'
        };

        return (
            <div
                className="h-screen w-screen bg-black overflow-hidden relative"
                style={{ transform: `rotate(${wallConfig.rotation || 0}deg)` }}
            >
                {currentWallContent.media_type === 'video' ? (
                    <video
                        key={currentWallContent.id}
                        src={currentWallContent.media_url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="absolute"
                        style={wallMediaStyle}
                    />
                ) : (
                    <img
                        key={currentWallContent.id}
                        src={currentWallContent.media_url}
                        alt={currentWallContent.title}
                        className="absolute"
                        style={wallMediaStyle}
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                    />
                )}
            </div>
        );
    }

    if (isLayoutMode) {
        return (
            <MultiZoneDisplay
                key={isPerItemLayout ? `item-layout-${currentItem.id}` : 'screen-layout'}
                restaurantId={restaurantId}
                screenName={screenName}
                layout={activeLayout}
            />
        );
    }

    if (content.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600 text-white">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl font-bold">{restaurant?.name || 'Restaurant'}</h1>
                    <p className="text-xl">
                        {!isOnline
                            ? '🌐 Waiting for connection…'
                            : allMediaFailed
                                ? '📺 Content temporarily unavailable'
                                : '📺 No content configured for this screen'}
                    </p>
                    <p className="text-sm opacity-80">Screen: {screenName}</p>
                </div>
            </div>
        );
    }

    const orientationRotation = embedded ? 0 : ({
        landscape: 0,
        portrait: 90,
        portrait_flipped: 270,
        landscape_flipped: 180
    }[screen?.orientation || 'landscape'] || 0);

    // For portrait rotation on a landscape screen: swap width/height so after rotation it fills the full viewport
    const isRotated = orientationRotation === 90 || orientationRotation === 270;
    const rotationStyle = isRotated ? {
        transform: `rotate(${orientationRotation}deg)`,
        transformOrigin: 'center center',
        width: '100vh',
        height: '100vw',
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: '-50vh',
        marginTop: '-50vw',
    } : orientationRotation ? {
        transform: `rotate(${orientationRotation}deg)`,
        transformOrigin: 'center center',
    } : undefined;

    const getItemStyle = (index) => {
        const isActive = index === safeIndex;
        const isPrev = index === prevIndex;
        const item = content[index];
        const transition = item?.transition || 'fade';
        const dur = `${TRANSITION_DURATION}ms ease-in-out`;

        if (transition === 'none') {
            if (isActive) return { opacity: 1, zIndex: 2, pointerEvents: 'auto' };
            return { opacity: 0, zIndex: 1, pointerEvents: 'none' };
        }

        if (transition === 'fade') {
            return {
                opacity: isActive ? 1 : 0,
                zIndex: isActive ? 2 : isPrev ? 1 : 0,
                transition: `opacity ${dur}`,
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }

        if (transition === 'slide') {
            let translateX = '100%';
            if (isActive) translateX = '0%';
            else if (isPrev) translateX = '-100%';
            return {
                transform: `translateX(${translateX})`,
                zIndex: isActive ? 2 : isPrev ? 1 : 0,
                transition: (isActive || isPrev) ? `transform ${dur}` : 'none',
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }

        if (transition === 'zoom') {
            const scale = isActive ? 1 : isPrev ? 1.05 : 0.95;
            return {
                opacity: isActive ? 1 : 0,
                transform: `scale(${scale})`,
                zIndex: isActive ? 2 : isPrev ? 1 : 0,
                transition: (isActive || isPrev) ? `opacity ${dur}, transform ${dur}` : 'none',
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }

        return {
            opacity: isActive ? 1 : 0,
            zIndex: isActive ? 2 : 1,
            transition: `opacity ${dur}`,
            pointerEvents: isActive ? 'auto' : 'none',
        };
    };

    return (
        <div
            className="h-screen w-screen bg-black relative overflow-hidden"
            style={rotationStyle}
        >
            <ClockWeatherOverlay weather={weather} />

            <div className="h-full w-full relative">
                {/* All items always rendered — no unmounting = no black flash. CSS transitions handle animation. */}
                {content.map((item, index) => {
                    const isActive = index === safeIndex;
                    const cfg = item.widget_config_id
                        ? widgetConfigs.find(w => w.id === item.widget_config_id)
                        : widgetConfigs.find(w => w.widget_type === item.widget_type && w.is_active);
                    const widgetType = item.widget_type || cfg?.widget_type;
                    const widgetConf = cfg ? (cfg.settings?.[widgetType] || {}) : {};

                    return (
                        <div
                            key={item.id}
                            className="absolute inset-0 flex items-center justify-center"
                            style={getItemStyle(index)}
                        >
                            {item.media_type === 'widget' ? (
                                <WidgetRenderer
                                    widgetType={widgetType}
                                    config={widgetConf}
                                    restaurantId={restaurantId}
                                    className="w-full h-full"
                                />
                            ) : item.media_type === 'video' ? (
                                <video
                                    ref={el => {
                                        if (el) videoRefs.current[item.id] = el;
                                        else delete videoRefs.current[item.id];
                                        if (el && isActive) {
                                            el.play().catch(() => {});
                                        }
                                    }}
                                    src={item.media_url}
                                    muted
                                    playsInline
                                    loop={content.length === 1}
                                    onCanPlay={(e) => {
                                        if (isActive) e.target.play().catch(() => {});
                                    }}
                                    onEnded={() => isActive && handleVideoEnd(item)}
                                    onError={() => handleMediaError(item)}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <img
                                    src={item.media_url}
                                    alt={item.title}
                                    onError={() => handleMediaError(item)}
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {content.length > 1 && !embedded && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2">
                    {content.map((item, index) => (
                        <div
                            key={item.id}
                            className={`h-2 rounded-full transition-all ${
                                index === safeIndex
                                    ? 'w-8 bg-white'
                                    : 'w-2 bg-white/50'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
