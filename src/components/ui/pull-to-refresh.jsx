import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

export function PullToRefresh({ onRefresh, children }) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const startY = useRef(0);
    const isPulling = useRef(false);
    const containerRef = useRef(null);
    const controls = useAnimation();

    const threshold = 60;
    const maxPull = 100;

    const handleTouchStart = useCallback((e) => {
        if (window.scrollY === 0) {
            startY.current = e.touches[0].clientY;
            isPulling.current = true;
        }
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (!isPulling.current || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const distance = currentY - startY.current;

        if (distance > 0 && window.scrollY === 0) {
            setPullDistance((prev) => {
                const nextDistance = Math.min(distance, maxPull);
                return prev === nextDistance ? prev : nextDistance;
            });
            if (distance > 8) {
                e.preventDefault();
            }
        }
    }, [isRefreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling.current || isRefreshing) return;
        
        isPulling.current = false;

        if (pullDistance >= threshold) {
            setShowConfirm(true);
            await controls.start({ y: threshold });
        }
        
        setPullDistance(0);
        controls.start({ y: 0 });
    }, [controls, isRefreshing, pullDistance]);

    const handleConfirmRefresh = async () => {
        setShowConfirm(false);
        setIsRefreshing(true);
        
        try {
            await onRefresh();
        } catch (error) {
            console.error('Refresh error:', error);
        }
        
        setIsRefreshing(false);
    };

    const handleCancelRefresh = () => {
        setShowConfirm(false);
    };

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const rotation = (pullDistance / maxPull) * 360;
    const opacity = Math.min(pullDistance / threshold, 1);

    return (
        <div ref={containerRef} className="relative">
            <motion.div
                className="absolute top-0 left-0 right-0 flex justify-center items-center h-16 pointer-events-none"
                animate={controls}
                style={{
                    y: pullDistance,
                    opacity: opacity,
                }}
            >
                <div className="bg-white dark:bg-gray-800 rounded-full p-3 shadow-lg">
                    <RefreshCw
                        className={`h-6 w-6 text-orange-500 ${isRefreshing ? 'animate-spin' : ''}`}
                        style={{
                            transform: isRefreshing ? 'none' : `rotate(${rotation}deg)`,
                        }}
                    />
                </div>
            </motion.div>
            
            {showConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
                    >
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Refresh Page?</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">Are you sure you want to refresh the page? Any unsaved data will be lost.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelRefresh}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmRefresh}
                                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors"
                            >
                                Refresh
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
            
            {children}
        </div>
    );
}