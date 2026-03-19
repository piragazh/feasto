import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

export function PullToRefresh({ onRefresh, children }) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const startY = useRef(0);
    const isPulling = useRef(false);
    const containerRef = useRef(null);
    const controls = useAnimation();

    const threshold = 80;
    const maxPull = 120;

    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            startY.current = e.touches[0].clientY;
            isPulling.current = true;
        }
    };

    const handleTouchMove = (e) => {
        if (!isPulling.current || isRefreshing) return;

        const currentY = e.touches[0].clientY;
        const distance = currentY - startY.current;

        if (distance > 0 && window.scrollY === 0) {
            setPullDistance(Math.min(distance, maxPull));
            if (distance > 10) {
                e.preventDefault();
            }
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current || isRefreshing) return;
        
        isPulling.current = false;

        if (pullDistance >= threshold) {
            setIsRefreshing(true);
            await controls.start({ y: threshold });
            
            try {
                await onRefresh();
            } catch (error) {
                console.error('Refresh error:', error);
            }
            
            await controls.start({ y: 0, transition: { duration: 0.3 } });
            setIsRefreshing(false);
        }
        
        setPullDistance(0);
        controls.start({ y: 0 });
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
    }, [pullDistance, isRefreshing]);

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
            {children}
        </div>
    );
}