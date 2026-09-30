/**
 * KioskIdleMediaOverlay
 *
 * Renders the kiosk's idle promos fullscreen:
 * - Plays from the prefetched promo feed (useKioskPromo) — no database reads,
 *   no heartbeat, no remote commands, so the kiosk never behaves like a
 *   signage screen and can't be reloaded remotely mid-session
 * - Embedded mode: ignores the promo screen's rotation setting (the kiosk page
 *   is already the right way up) and never triggers signage auto-recovery
 * - Fade-in on entry, any touch exits immediately
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Hand } from 'lucide-react';
import ScreenDisplay from '@/components/mediascreen/ScreenDisplay';
import { ScreenManifestContext } from '@/components/mediascreen/ScreenManifestContext';

export default function KioskIdleMediaOverlay({
    manifest,
    onExit
}) {
    const [isExiting, setIsExiting] = useState(false);

    const handleExit = () => {
        if (isExiting) return; // Prevent double-exits
        setIsExiting(true);
        onExit();
    };

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
                    <div className="w-full h-full">
                        {manifest && (
                            <ScreenManifestContext.Provider value={manifest}>
                                <ScreenDisplay
                                    restaurantId={manifest.screen.restaurant_id}
                                    screenName={manifest.screen.screen_name}
                                    embedded
                                />
                            </ScreenManifestContext.Provider>
                        )}
                    </div>

                    {/* Call to action */}
                    <div className="absolute bottom-10 left-0 right-0 flex justify-center z-[998] pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6, duration: 0.4 }}
                            className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur-sm px-7 py-4 text-white shadow-2xl"
                        >
                            <motion.span
                                animate={{ scale: [1, 1.15, 1] }}
                                transition={{ repeat: Infinity, duration: 1.6 }}
                                className="flex"
                            >
                                <Hand className="h-7 w-7" />
                            </motion.span>
                            <span className="text-2xl font-bold tracking-wide">Tap anywhere to order</span>
                        </motion.div>
                    </div>

                    {/* Invisible exit overlay (any touch/click anywhere exits) */}
                    <div
                        className="absolute inset-0 cursor-pointer z-[999]"
                        style={{ pointerEvents: 'auto' }}
                        onClick={handleExit}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            handleExit();
                        }}
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
