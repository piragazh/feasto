import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Cloud, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';
import MultiZoneDisplay from './MultiZoneDisplay';

export default function ScreenDisplay({ restaurantId, screenName }) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [videoLoopCount, setVideoLoopCount] = useState(0);
    const [wallContentIndex, setWallContentIndex] = useState(0);
    const heartbeatIntervalRef = useRef(null);
    const commandCheckIntervalRef = useRef(null);

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: () => base44.entities.Restaurant.filter({ id: restaurantId }).then(r => r[0]),
        enabled: !!restaurantId,
        staleTime: 60000,
    });

    const { data: screen, refetch: refetchScreen } = useQuery({
        queryKey: ['screen', restaurantId, screenName],
        queryFn: async () => {
            const screens = await base44.entities.Screen.filter({ 
                restaurant_id: restaurantId,
                screen_name: screenName
            });
            return screens[0];
        },
        enabled: !!restaurantId && !!screenName,
        staleTime: 60000,
    });

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
                    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return currentTime >= range.start_time && currentTime <= range.end_time;
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
        enabled: !!restaurantId && !!screen?.media_wall_config?.enabled,
        staleTime: 30000,
        refetchInterval: 30000,
    });

    const { data: content = [] } = useQuery({
        queryKey: ['screen-content', restaurantId, screenName],
        queryFn: async () => {
            const allContent = await base44.entities.PromotionalContent.filter({ 
                restaurant_id: restaurantId,
                screen_name: screenName,
                is_active: true
            });
            
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
                    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                    
                    if (!schedule.recurring.days_of_week?.includes(currentDay)) return false;
                    
                    const inTimeRange = schedule.recurring.time_ranges?.some(range => {
                        return currentTime >= range.start_time && currentTime <= range.end_time;
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
        staleTime: 30000,
        gcTime: 300000,
        refetchInterval: 30000,
    });

    const { data: weather } = useQuery({
        queryKey: ['weather', restaurant?.latitude, restaurant?.longitude],
        queryFn: async () => {
            if (!restaurant?.latitude || !restaurant?.longitude) return null;
            return await base44.functions.invoke('getWeather', {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude
            });
        },
        enabled: !!restaurant?.latitude && !!restaurant?.longitude,
        staleTime: 600000,
        refetchInterval: 600000,
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
        sendHeartbeat();

        // Send heartbeat every 30 seconds
        heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000);

        return () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
        };
    }, [screen?.id]);

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
                        default:
                            console.warn('Unknown command:', command);
                    }
                }
            } catch (error) {
                console.error('Command check failed:', error);
            }
        };

        // Check for commands every 5 seconds
        commandCheckIntervalRef.current = setInterval(checkCommands, 5000);

        return () => {
            if (commandCheckIntervalRef.current) {
                clearInterval(commandCheckIntervalRef.current);
            }
        };
    }, [screen?.id, refetchScreen]);

    useEffect(() => {
        setVideoLoopCount(0);
    }, [currentIndex]);

    const handleVideoEnd = (item) => {
        if (content.length <= 1) return;
        
        const targetLoops = item.video_loop_count || 1;
        setVideoLoopCount(prev => {
            const newCount = prev + 1;
            if (newCount >= targetLoops) {
                setTimeout(() => {
                    setCurrentIndex((prevIndex) => (prevIndex + 1) % content.length);
                }, 100);
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
                setCurrentIndex((prev) => (prev + 1) % content.length);
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [currentIndex, content]);

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

    // If screen is part of a media wall and has wall content, render wall content
    if (screen?.media_wall_config?.enabled && wallContent.length > 0) {
        const currentWallContent = wallContent[wallContentIndex % wallContent.length];
        const wallConfig = screen.media_wall_config;
        
        // Calculate position offset based on grid position
        const { row, col } = wallConfig.position;
        const { rows, cols } = wallConfig.grid_size;
        const bezel = wallConfig.bezel_compensation || 0;
        
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Calculate the portion of the full image this screen should display
        const offsetX = -(col * screenWidth) - (col * bezel);
        const offsetY = -(row * screenHeight) - (row * bezel);
        const totalWidth = (screenWidth * cols) + (bezel * (cols - 1));
        const totalHeight = (screenHeight * rows) + (bezel * (rows - 1));
        
        useEffect(() => {
            if (wallContent.length <= 1) return;
            
            const duration = (currentWallContent?.duration || 10) * 1000;
            const timer = setTimeout(() => {
                setWallContentIndex(prev => (prev + 1) % wallContent.length);
            }, duration);
            
            return () => clearTimeout(timer);
        }, [wallContentIndex, wallContent.length]);
        
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

    // If screen has a multi-zone layout, use MultiZoneDisplay
    if (screen?.layout_template?.zones && screen.layout_template.zones.length > 0) {
        return (
            <MultiZoneDisplay
                restaurantId={restaurantId}
                screenName={screenName}
                layout={screen.layout_template}
            />
        );
    }

    // Otherwise, use classic single-content display
    if (content.length === 0) {
        return (
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-500 to-red-600 text-white">
                <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4">{restaurant?.name}</h1>
                    <p className="text-xl">No content configured for this screen</p>
                </div>
            </div>
        );
    }

    const currentContent = content[currentIndex];

    return (
        <div className="h-screen w-screen bg-black relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent z-10 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {restaurant?.logo_url && (
                            <img 
                                src={restaurant.logo_url} 
                                alt={restaurant.name}
                                className="h-16 w-16 rounded-lg object-cover"
                            />
                        )}
                        <h1 className="text-3xl font-bold text-white">{restaurant?.name}</h1>
                    </div>
                    
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
                        
                        {weather?.data && (
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2">
                                {getWeatherIcon(weather.data.description)}
                                <div>
                                    <div className="text-xl font-bold">{weather.data.temperature}°C</div>
                                    <div className="text-xs opacity-80 capitalize">{weather.data.description}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="h-full w-full flex items-center justify-center relative">
                {content.map((item, index) => {
                    const isActive = index === currentIndex;
                    const transition = item.transition || 'fade';
                    
                    let transitionClass = '';
                    if (transition === 'fade') {
                        transitionClass = isActive 
                            ? 'opacity-100 scale-100' 
                            : 'opacity-0 scale-100';
                    } else if (transition === 'slide') {
                        transitionClass = isActive 
                            ? 'opacity-100 translate-x-0' 
                            : 'opacity-0 -translate-x-full';
                    } else if (transition === 'zoom') {
                        transitionClass = isActive 
                            ? 'opacity-100 scale-100' 
                            : 'opacity-0 scale-90';
                    } else {
                        transitionClass = isActive ? 'opacity-100' : 'opacity-0';
                    }

                    if (!isActive && transition === 'fade') {
                        return null;
                    }

                    return (
                        <div
                            key={item.id}
                            className={`absolute inset-0 flex items-center justify-center transition-all duration-1000 ease-in-out ${transitionClass}`}
                            style={{ pointerEvents: isActive ? 'auto' : 'none', zIndex: isActive ? 2 : 1 }}
                        >
                            {item.media_type === 'video' ? (
                                <video
                                    key={`${item.id}-${isActive}`}
                                    src={item.media_url}
                                    autoPlay
                                    muted
                                    loop={content.length === 1}
                                    onEnded={() => handleVideoEnd(item)}
                                    className="max-h-full max-w-full object-contain"
                                />
                            ) : (
                                <img
                                    src={item.media_url}
                                    alt={item.title}
                                    className="max-h-full max-w-full object-contain"
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
                                index === currentIndex 
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