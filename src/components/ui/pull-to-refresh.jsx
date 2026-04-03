import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, useAnimation } from 'framer-motion';

const THRESHOLD = 80;
const MAX_PULL = 120;

// Walk up the DOM from a touch target and return true if any ancestor
// (up to the container) can still scroll vertically OR horizontally.
function isTouchInsideScrollable(target, container) {
    let el = target;
    while (el && el !== container) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
        const canScrollX = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
        if (canScrollY || canScrollX) return true;
        el = el.parentElement;
    }
    return false;
}

// Returns true only when the page (or document element) is at the very top.
function isPageAtTop() {
    return (window.scrollY <= 1) && (document.documentElement.scrollTop <= 1) && (document.body.scrollTop <= 1);
}

export function PullToRefresh({ onRefresh, children }) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const startY = useRef(0);
    const startX = useRef(0);
    const isPulling = useRef(false);
    const gestureRejected = useRef(false); // once we decide to reject, ignore until touchend
    const containerRef = useRef(null);
    const controls = useAnimation();

    const handleTouchStart = useCallback((e) => {
        isPulling.current = false;
        gestureRejected.current = false;

        // Must be at page top
        if (!isPageAtTop()) {
            gestureRejected.current = true;
            return;
        }

        // Must not start inside any scrollable child
        if (isTouchInsideScrollable(e.target, containerRef.current)) {
            gestureRejected.current = true;
            return;
        }

        startY.current = e.touches[0].clientY;
        startX.current = e.touches[0].clientX;
        isPulling.current = true;
    }, []);

    const handleTouchMove = useCallback((e) => {
        if (gestureRejected.current || isRefreshing) return;
        if (!isPulling.current) return;

        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = currentY - startY.current;
        const deltaX = Math.abs(currentX - startX.current);

        // If horizontal movement dominates, cancel — this is a swipe not a pull
        if (deltaX > Math.abs(deltaY) && deltaX > 8) {
            isPulling.current = false;
            gestureRejected.current = true;
            setPullDistance(0);
            return;
        }

        // Re-check page is still at top (user may have scrolled via inertia)
        if (!isPageAtTop()) {
            isPulling.current = false;
            gestureRejected.current = true;
            setPullDistance(0);
            return;
        }

        if (deltaY > 0) {
            const capped = Math.min(deltaY * 0.5, MAX_PULL); // resistance factor
            setPullDistance(capped);
            // Block native scroll/bounce only once clearly pulling down
            if (deltaY > 10) {
                e.preventDefault();
            }
        } else {
            // Pulling up — reset
            setPullDistance(0);
            isPulling.current = false;
        }
    }, [isRefreshing]);

    const handleTouchEnd = useCallback(() => {
        if (!isPulling.current) {
            setPullDistance(0);
            return;
        }

        isPulling.current = false;
        gestureRejected.current = false;

        if (pullDistance >= THRESHOLD) {
            setShowConfirm(true);
        }

        setPullDistance(0);
        controls.start({ y: 0 });
    }, [controls, pullDistance]);

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

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener('touchstart', handleTouchStart, { passive: true });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: true });
        container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    const rotation = (pullDistance / MAX_PULL) * 360;
    const opacity = Math.min(pullDistance / (THRESHOLD * 0.5), 1);
    const isPastThreshold = pullDistance >= THRESHOLD;

    return (
        <div ref={containerRef} className="relative">
            {/* Pull indicator */}
            {pullDistance > 0 && (
                <div
                    className="absolute left-0 right-0 flex justify-center items-end pointer-events-none z-40"
                    style={{ top: -64, height: 64, opacity, transform: `translateY(${pullDistance}px)` }}
                >
                    <div className={`rounded-full p-3 shadow-lg transition-colors ${isPastThreshold ? 'bg-orange-500' : 'bg-white dark:bg-gray-800'}`}>
                        <RefreshCw
                            className={`h-5 w-5 transition-colors ${isPastThreshold ? 'text-white' : 'text-orange-500'}`}
                            style={{ transform: `rotate(${rotation}deg)` }}
                        />
                    </div>
                </div>
            )}

            {isRefreshing && (
                <div className="flex justify-center py-3 absolute top-0 left-0 right-0 z-40">
                    <div className="bg-orange-500 rounded-full p-2 shadow-lg">
                        <RefreshCw className="h-5 w-5 text-white animate-spin" />
                    </div>
                </div>
            )}

            {showConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl"
                    >
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Refresh Page?</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">Any unsaved changes will be lost.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 transition-colors"
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