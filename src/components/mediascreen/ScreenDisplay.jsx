import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';
import MultiZoneDisplay from './MultiZoneDisplay';
import SyncedMediaWallDisplay from './SyncedMediaWallDisplay';
import WidgetRenderer from './WidgetRenderer';

// --- localStorage cache helpers ---
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

export default function ScreenDisplay({ restaurantId, screenName }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [prevIndex, setPrevIndex] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [videoLoopCount, setVideoLoopCount] = useState(0);
    const [wallContentIndex, setWallContentIndex] = useState(0);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const heartbeatIntervalRef = useRef(null);
    const commandCheckIntervalRef = useRef(null);
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

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const data = await base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]);
            writeCache(`restaurant_${restaurantId}`, data);
            return data;
        },
        enabled: !!restaurantId && isOnline,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`restaurant_${restaurantId}`).data,
        initialDataUpdatedAt: () => readCache(`restaurant_${restaurantId}`).ts,
        retry: 2,
    });

    const { data: screen, refetch: refetchScreen, isLoading: screenLoading } = useQuery({
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
        enabled: !!restaurantId && !!screenName && isOnline,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`screen_${restaurantId}_${screenName}`).data,
        initialDataUpdatedAt: () => readCache(`screen_${restaurantId}_${screenName}`).ts,
        retry: 2,
    });

    // Check if there's an active playlist for this media wall
    const { data: activePlaylists = [] } = useQuery({
        queryKey: ['active-playlists', restaurantId, screen?.media_wall_config?.wall_name],
        queryFn: async () => {
            if (!screen?.media_wall_config?.enabled || !screen?.media_wall_config?.wall_name) return [];

            const playlists = await base44.entities.MediaWallPlaylist.filter({ 
                restaurant_id: restaurantId,
                wall_name: screen.media_wall_config.wall_name,
                is_active: true
            });
            writeCache(`playlists_${restaurantId}_${screen.media_wall_config.wall_name}`, playlists);

            const now = new Date();
            return playlists.filter(playlist => {
                if (!playlist.schedule?.enabled) return true;
                
                const schedule = playlist.schedule;
                if (schedule.start_date && new Date(schedule.start_date) > now) return false;
                if (schedule.end_date && new Date(schedule.end_date) < now) return false;
                
                if (schedule.recurring?.enabled) {
                    const currentDay = now.getDay();
                    const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return nowTimeStr >= range.start_time && nowTimeStr <= range.end_time;
                    });
                    
                    if (!inTimeRange) return false;
                }
                
                return true;
            }).sort((a, b) => (b.priority || 1) - (a.priority || 1));
        },
        refetchInterval: isOnline ? 60000 : false,
        enabled: !!restaurantId && !!screen?.media_wall_config?.enabled,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        initialData: () => readCache(`playlists_${restaurantId}_${screen?.media_wall_config?.wall_name}`).data,
        initialDataUpdatedAt: () => readCache(`playlists_${restaurantId}_${screen?.media_wall_config?.wall_name}`).ts,
        retry: 2,
    });

    const usePlaylistSync = activePlaylists.length > 0;

    const { data: wallContent = [] } = useQuery({
        queryKey: ['wall-content', restaurantId, screen?.media_wall_config?.wall_name],
        queryFn: async () => {
            if (!screen?.media_wall_config?.enabled || !screen?.media_wall_config?.wall_name) return [];
            
            const content = await base44.entities.MediaWallContent.filter({
                restaurant_id: restaurantId,
                wall_name: screen.media_wall_config.wall_name,
                is_active: true
            });
            
            // Apply schedule filtering
            const now = new Date();
            const scheduledContent = content.filter(item => {
                if (!item.schedule?.enabled) return true;
                
                const schedule = item.schedule;
                if (schedule.start_date && new Date(schedule.start_date) > now) return false;
                if (schedule.end_date && new Date(schedule.end_date) < now) return false;
                
                if (schedule.recurring?.enabled) {
                    const currentDay = now.getDay();
                    const nowTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return nowTimeStr >= range.start_time && nowTimeStr <= range.end_time;
                    });
                    
                    if (!inTimeRange) return false;
                }
                
                return true;
            });
            
            return scheduledContent.sort((a, b) => {
                const priorityDiff = (b.priority || 1) - (a.priority || 1);
                if (priorityDiff !== 0) return priorityDiff;
                return a.display_order - b.display_order;
            });
        },
        enabled: !!restaurantId && !!screen?.media_wall_config?.enabled && !usePlaylistSync,
        staleTime: 5 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        refetchInterval: isOnline ? 60000 : false,
        retry: 2,
    });

    const { data: content = [], isLoading: contentLoading } = useQuery({
        queryKey: ['screen-content', restaurantId, screenName],
        queryFn: async () => {
            const allContent = await base44.entities.PromotionalContent.filter({ 
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: true
            });
            writeCache(`content_${restaurantId}_${screenName}`, allContent);
            
            // Filter by schedule and sort by priority, then display order
            const now = new Date();
            const scheduledContent = allContent.filter(item => {
                if (!item.schedule?.enabled) return true;
                
                const schedule = item.schedule;
                
                // Check date range
                if (schedule.start_date && new Date(schedule.start_date) > now) return false;
                if (schedule.end_date && new Date(schedule.end_date) < now) return false;
                
                // Check recurring schedule
                if (schedule.recurring?.enabled) {
                    const currentDay = now.getDay();
                    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return currentTimeStr >= range.start_time && currentTimeStr <= range.end_time;
                    });
                    
                    if (!inTimeRange) return false;
                }
                
                return true;
            });
            
            // Sort by priority (descending) then display_order (ascending)
            return scheduledContent.sort((a, b) => {
                const priorityDiff = (b.priority || 1) - (a.priority || 1);
                if (priorityDiff !== 0) return priorityDiff;
                return a.display_order - b.display_order;
            });
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchInterval: isOnline ? 60000 : false,
        initialData: () => readCache(`content_${restaurantId}_${screenName}`).data ?? [],
        initialDataUpdatedAt: () => readCache(`content_${restaurantId}_${screenName}`).ts,
        retry: 2,
    });

    // Fetch widget configs for inline widget playlist items
    const { data: widgetConfigs = [] } = useQuery({
        queryKey: ['widget-configurations', restaurantId],
        queryFn: async () => {
            const data = await base44.entities.WidgetConfiguration.filter({ restaurant_id: restaurantId });
            writeCache(`widgets_${restaurantId}`, data);
            return data;
        },
        enabled: !!restaurantId && isOnline,
        staleTime: 10 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchInterval: isOnline ? 5 * 60 * 1000 : false,
        initialData: () => readCache(`widgets_${restaurantId}`) ?? [],
        initialDataUpdatedAt: 0,
        retry: 2,
    });

    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            const resp = await base44.functions.invoke('getWeather', {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude
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
        initialData: () => readCache(`weather_${restaurantId}`),
        initialDataUpdatedAt: 0,
        retry: 1,
    });

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Heartbeat mechanism
    useEffect(() => {
        if (!screen?.id) return;

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

        // Send initial heartbeat
        if (isOnline) sendHeartbeat();

        // Send heartbeat every 60 seconds
        heartbeatIntervalRef.current = setInterval(() => {
            if (isOnline) sendHeartbeat();
        }, 60000);

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, [screen?.id, isOnline]);

    // Command listener
    useEffect(() => {
        if (!screen?.id) return;

        const checkCommands = async () => {
            try {
                const screens = await base44.entities.Screen.filter({ 
                    id: screen.id
                });
                const currentScreen = screens[0];

                if (currentScreen?.pending_command) {
                    const command = currentScreen.pending_command;
                    
                    // Clear the command immediately
                    await base44.entities.Screen.update(screen.id, {
                        pending_command: null,
                        command_timestamp: null
                    });

                    // Update command log status
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

                    // Execute command
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
                            localStorage.clear();
                            sessionStorage.clear();
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

        // Check for commands every 10 seconds (skip when offline)
        commandCheckIntervalRef.current = setInterval(() => {
            if (isOnline) checkCommands();
        }, 10000);

        return () => {
            if (commandCheckIntervalRef.current) {
                clearInterval(commandCheckIntervalRef.current);
            }
        };
    }, [screen?.id, refetchScreen, isOnline]);

    // Clamp currentIndex if content shrinks after a refetch — use useEffect to avoid setState-during-render
    const safeIndex = content.length > 0 ? Math.min(currentIndex, content.length - 1) : 0;

    useEffect(() => {
        if (content.length > 0 && currentIndex >= content.length) {
            setCurrentIndex(content.length - 1);
        }
    }, [content.length]);

    // Play active video, pause others — runs when index changes OR content loads
    useEffect(() => {
        setVideoLoopCount(0);
        if (content.length === 0) return;
        // Small delay to let the DOM update before attempting play
        const t = setTimeout(() => {
            Object.entries(videoRefs.current).forEach(([idx, video]) => {
                if (!video) return;
                if (parseInt(idx) === currentIndex) {
                    video.currentTime = 0;
                    video.play().catch(() => {});
                } else {
                    video.pause();
                    video.currentTime = 0;
                }
            });
        }, 50);
        return () => clearTimeout(t);
    }, [currentIndex, content]);

    const TRANSITION_DURATION = 700; // ms

    const advanceIndex = (currentLen) => {
        setCurrentIndex(prev => {
            const next = (prev + 1) % currentLen;
            setPrevIndex(prev);
            setIsTransitioning(true);
            setTimeout(() => {
                setPrevIndex(null);
                setIsTransitioning(false);
            }, TRANSITION_DURATION + 100);
            return next;
        });
    };

    const handleVideoEnd = (item) => {
        if (content.length <= 1) return;
        
        const targetLoops = item.video_loop_count || 1;
        setVideoLoopCount(prev => {
            const newCount = prev + 1;
            if (newCount >= targetLoops) {
                setTimeout(() => advanceIndex(content.length), 100);
                return 0;
            }
            return newCount;
        });
    };

    useEffect(() => {
        if (content.length === 0) return;

        const currentContent = content[currentIndex];
        
        if (currentContent?.media_type !== 'video') {
            const duration = (currentContent?.duration || 10) * 1000;
            const timer = setTimeout(() => {
                advanceIndex(content.length);
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, content]);

    // Wall content rotation (must be at top level, not inside conditional)
    useEffect(() => {
        if (!screen?.media_wall_config?.enabled || wallContent.length <= 1) return;
        const currentWallContent = wallContent[wallContentIndex % wallContent.length];
        const duration = (currentWallContent?.duration || 10) * 1000;
        const timer = setTimeout(() => {
            setWallContentIndex(prev => (prev + 1) % wallContent.length);
        }, duration);
        return () => clearTimeout(timer);
    }, [wallContentIndex, wallContent, screen?.media_wall_config?.enabled]);

    const getWeatherIcon = (description) => {
        const desc = description?.toLowerCase() || '';
        if (desc.includes('rain')) return <CloudRain className="h-6 w-6" />;
        if (desc.includes('snow')) return <CloudSnow className="h-6 w-6" />;
        if (desc.includes('cloud')) return <Cloud className="h-6 w-6" />;
        if (desc.includes('wind')) return <Wind className="h-6 w-6" />;
        return <Sun className="h-6 w-6" />;
    };

    if (!restaurantId || !screenName) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-900 text-white">
                <p className="text-xl">Missing restaurant ID or screen name</p>
            </div>
        );
    }

    // Show loading state while data is being fetched
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

    // Use synced playlist display if playlist is active
    if (screen?.media_wall_config?.enabled && usePlaylistSync) {
        return (
            <SyncedMediaWallDisplay
                restaurantId={restaurantId}
                wallName={screen.media_wall_config.wall_name}
                screenPosition={screen.media_wall_config.position}
                gridSize={screen.media_wall_config.grid_size}
                bezelCompensation={screen.media_wall_config.bezel_compensation || 0}
            />
        );
    }

    // If screen is part of a media wall and has wall content, render wall content
    if (screen?.media_wall_config?.enabled && wallContent.length > 0) {
        const currentWallContent = wallContent[wallContentIndex % wallContent.length];
        const wallConfig = screen.media_wall_config;
        
        // Calculate position offset based on grid position
        const { row, col } = wallConfig.position || { row: 0, col: 0 };
        const { rows, cols } = wallConfig.grid_size || { rows: 2, cols: 2 };
        const bezel = wallConfig.bezel_compensation || 0;
        
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Calculate the portion of the full image this screen should display
        const offsetX = -(col * screenWidth) - (col * bezel);
        const offsetY = -(row * screenHeight) - (row * bezel);
        const totalWidth = (screenWidth * cols) + (bezel * (cols - 1));
        const totalHeight = (screenHeight * rows) + (bezel * (rows - 1));
        
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
                        className="absolute"
                        style={{
                            left: `${offsetX}px`,
                            top: `${offsetY}px`,
                            width: `${totalWidth}px`,
                            height: `${totalHeight}px`,
                            objectFit: 'cover'
                        }}
                    />
                ) : (
                    <img
                        key={currentWallContent.id}
                        src={currentWallContent.media_url}
                        alt={currentWallContent.title}
                        className="absolute"
                        style={{
                            left: `${offsetX}px`,
                            top: `${offsetY}px`,
                            width: `${totalWidth}px`,
                            height: `${totalHeight}px`,
                            objectFit: 'cover'
                        }}
                    />
                )}
            </div>
        );
    }

    // Determine active layout: per-item override takes priority over screen default
    const currentItem = content[safeIndex];
    const activeLayout = currentItem?.layout_template?.zones?.length > 0
        ? currentItem.layout_template
        : screen?.layout_template;

    // If there's an active multi-zone layout, use MultiZoneDisplay
    // When using per-item templates, ScreenDisplay still drives the index timer (above),
    // so each item's duration controls how long its template shows before the next item.
    if (activeLayout?.zones && activeLayout.zones.length > 0) {
        return (
            <MultiZoneDisplay
                key={`layout-${safeIndex}-${activeLayout.name}`}
                restaurantId={restaurantId}
                screenName={screenName}
                layout={activeLayout}
            />
        );
    }

    if (content.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600 text-white">
                <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4">{restaurant?.name}</h1>
                    <p className="text-xl">
                        {!isOnline ? 'Waiting for connection…' : 'No content configured for this screen'}
                    </p>
                </div>
            </div>
        );
    }

    const currentContent = content[safeIndex];

    const orientationRotation = {
        landscape: 0,
        portrait: 90,
        portrait_flipped: 270,
        landscape_flipped: 180
    }[screen?.orientation || 'landscape'] || 0;

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

    // Get CSS style for each item based on its state (active / prev / inactive)
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
            const opacity = isActive ? 1 : 0;
            const z = isActive ? 2 : isPrev ? 1 : 0;
            return {
                opacity,
                zIndex: z,
                transition: `opacity ${dur}`,
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }

        if (transition === 'slide') {
            let translateX = '100%'; // offscreen right (inactive)
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
            const opacity = isActive ? 1 : 0;
            const scale = isActive ? 1 : isPrev ? 1.05 : 0.95;
            return {
                opacity,
                transform: `scale(${scale})`,
                zIndex: isActive ? 2 : isPrev ? 1 : 0,
                transition: (isActive || isPrev) ? `opacity ${dur}, transform ${dur}` : 'none',
                pointerEvents: isActive ? 'auto' : 'none',
            };
        }

        // fallback: fade
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
            <style>{``}</style>
            <div className="absolute top-0 right-0 z-10 p-6">
                <div className="flex items-center justify-end">
                    <div className="flex items-center gap-6 text-white">
                        <div className="text-right">
                            <div className="text-2xl font-bold">
                                {currentTime.toLocaleTimeString('en-GB', { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })}
                            </div>
                            <div className="text-sm opacity-80">
                                {currentTime.toLocaleDateString('en-GB', { 
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'short'
                                })}
                            </div>
                        </div>
                        
                        {weather?.temperature && (
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
                                        videoRefs.current[index] = el;
                                        // If this is the active item and video just mounted, play it
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
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <img
                                    src={item.media_url}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {content.length > 1 && (
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-2">
                    {content.map((_, index) => (
                        <div
                            key={index}
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