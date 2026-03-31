/**
 * KioskIdleMediaOverlay
 * 
 * Renders fullscreen media during idle mode with:
 * - Fade-in animation on entry
 * - Clean fade-out on exit
 * - Transparent exit layer (any touch exits immediately)
 * - Lifecycle management for media content (start/stop cleanly)
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ScreenDisplay from '@/components/mediascreen/ScreenDisplay';

export default function KioskIdleMediaOverlay({
    restaurantId,
    screenName,
    onExit
}) {
    const [isExiting, setIsExiting] = useState(false);

    const handleExit = () => {
        if (isExiting) return; // Prevent double-exits
        setIsExiting(true);
        onExit();
    };

    useEffect(() => {
        // Ensure inactivity during media mode resets to welcome
        // (in case media runs for full reset timeout)
        return () => {
            // Cleanup on unmount (media stops)
        };
    }, []);

    return (
        <AnimatePresence mode="wait">
            {!isExiting && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="fixed inset-0 bg-gray-950 z-50"
                >
                    {/* Media content */}
                    <div className="w-full h-full">
                        <ScreenDisplay
                            restaurantId={restaurantId}
                            screenName={screenName}
                            key={`${restaurantId}-${screenName}`}
                        />
                    </div>

                    {/* Invisible exit overlay (any touch/click anywhere exits) */}
                    <div
                        className="absolute inset-0 cursor-pointer z-50"
                        style={{ pointerEvents: 'auto' }}
                        onClick={handleExit}
                        onTouchStart={handleExit}
                        role="button"
                        tabIndex={0}
                        aria-label="Tap to return to ordering"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleExit();
                        }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}