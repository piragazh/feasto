import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const soundCache = new Map();

export default function NotificationSoundManager({ restaurantId }) {
    const activeAudioRef = useRef(null);
    const soundUrlRef = useRef(null);
    const activeOrderIdRef = useRef(null);

    // Fetch notification sound URL
    const { data: settings } = useQuery({
        queryKey: ['notification-sound-setting'],
        queryFn: async () => {
            const result = await base44.asServiceRole.entities.SystemSettings.filter({ 
                setting_key: 'notification_sound_url' 
            });
            return result?.[0]?.setting_value || null;
        }
    });

    // Fetch pending orders for the restaurant
    const { data: pendingOrders = [] } = useQuery({
        queryKey: ['pending-orders', restaurantId],
        queryFn: async () => {
            if (!restaurantId) return [];
            const orders = await base44.entities.Order.filter({ 
                restaurant_id: restaurantId, 
                status: 'pending' 
            }, '-created_date');
            return orders || [];
        },
        refetchInterval: 2000,
        enabled: !!restaurantId
    });

    // Manage notification sound
    useEffect(() => {
        if (!settings || !restaurantId) {
            stopSound();
            return;
        }

        soundUrlRef.current = settings;

        // If there are pending orders and no sound is playing, start sound for the first one
        if (pendingOrders.length > 0) {
            const firstPendingOrder = pendingOrders[0];
            
            // Only start if not already playing for this order
            if (activeOrderIdRef.current !== firstPendingOrder.id) {
                stopSound();
                activeOrderIdRef.current = firstPendingOrder.id;
                playRepeatingSound();
            }
        } else {
            // No pending orders, stop sound
            stopSound();
        }

        return () => {
            // Cleanup on unmount
            stopSound();
        };
    }, [pendingOrders, settings, restaurantId]);

    const playRepeatingSound = () => {
        const playSound = async () => {
            try {
                // Use cached audio if available, otherwise create new
                let audio = soundCache.get(soundUrlRef.current);
                
                if (!audio) {
                    audio = new Audio(soundUrlRef.current);
                    soundCache.set(soundUrlRef.current, audio);
                }

                // Reset and play
                audio.currentTime = 0;
                
                // Only play if not already playing and still have pending orders
                if (audio.paused && pendingOrders.length > 0) {
                    await audio.play().catch(err => console.log('Audio play prevented:', err));
                }
            } catch (err) {
                console.error('Sound play error:', err);
            }
        };

        // Play immediately
        playSound();

        // Play again after 3 seconds (sound duration + pause)
        activeAudioRef.current = setInterval(() => {
            if (pendingOrders.length > 0) {
                playSound();
            }
        }, 3500);
    };

    const stopSound = () => {
        if (activeAudioRef.current) {
            clearInterval(activeAudioRef.current);
            activeAudioRef.current = null;
        }
        activeOrderIdRef.current = null;

        // Stop currently playing audio
        soundCache.forEach(audio => {
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = 0;
            }
        });
    };

    // Return null - this is a management component
    return null;
}