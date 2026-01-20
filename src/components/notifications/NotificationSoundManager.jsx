import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function NotificationSoundManager({ restaurantId }) {
    const activeAudioRef = useRef(null);
    const soundUrlRef = useRef(null);
    const isPlayingRef = useRef(false);

    // Fetch notification sound URL
    const { data: settings } = useQuery({
        queryKey: ['notification-sound-setting'],
        queryFn: async () => {
            try {
                const result = await base44.entities.SystemSettings.filter({ 
                    setting_key: 'notification_sound_url' 
                });
                return result?.[0]?.setting_value || null;
            } catch (err) {
                console.log('Failed to fetch notification sound:', err);
                return null;
            }
        },
        refetchInterval: 30000
    });

    // Fetch pending orders for the restaurant
    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return [];
            try {
                const orders = await base44.entities.Order.filter({ 
                    restaurant_id: restaurantId, 
                    status: 'pending' 
                }, '-created_date');
                return orders || [];
            } catch (err) {
                console.log('Failed to fetch pending orders:', err);
                return [];
            }
        },
        refetchInterval: 3000,
        enabled: !!restaurantId
    });

    useEffect(() => {
        if (!settings || !restaurantId || pendingOrders.length === 0) {
            stopSound();
            return;
        }

        soundUrlRef.current = settings;
        
        if (!isPlayingRef.current) {
            startRepeatSound();
        }

        return () => {
            stopSound();
        };
    }, [settings, restaurantId, pendingOrders.length]);

    const startRepeatSound = () => {
        isPlayingRef.current = true;

        const playSound = () => {
            if (!soundUrlRef.current || pendingOrders.length === 0) {
                isPlayingRef.current = false;
                return;
            }

            const audio = new Audio(soundUrlRef.current);
            audio.volume = 0.8;
            
            audio.play().catch(err => {
                console.log('Audio play error:', err);
            });
        };

        playSound();

        // Repeat every 3.5 seconds
        activeAudioRef.current = setInterval(() => {
            if (pendingOrders.length > 0) {
                playSound();
            } else {
                stopSound();
            }
        }, 3500);
    };

    const stopSound = () => {
        isPlayingRef.current = false;
        if (activeAudioRef.current) {
            clearInterval(activeAudioRef.current);
            activeAudioRef.current = null;
        }
    };

    return null;
}