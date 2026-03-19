import React, { useState } from 'react';
import { usePWAInstall } from './usePWAInstall';
import { Download, X } from 'lucide-react';

/**
 * Minimal install banner shown at bottom of screen.
 * Only appears when browser fires beforeinstallprompt (Chrome/Edge/Android).
 */
export default function PWAInstallBanner() {
    const { canInstall, isInstalling, promptInstall } = usePWAInstall();
    const [dismissed, setDismissed] = useState(false);

    if (!canInstall || dismissed) return null;

    return (
        <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                    <img
                        src="https://res.cloudinary.com/dbbjc1cre/image/upload/v1770322839/final_logo_icon_only_rgoqoy.png"
                        alt="MealDrop"
                        className="w-7 h-7 rounded-lg object-cover"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">Install MealDrop</p>
                    <p className="text-xs text-gray-400 mt-0.5">Add to home screen for the best experience</p>
                </div>
                <button
                    onClick={() => promptInstall()}
                    disabled={isInstalling}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors shrink-0 disabled:opacity-60"
                >
                    {isInstalling ? '...' : 'Install'}
                </button>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-gray-400 hover:text-white transition-colors shrink-0 p-1"
                    aria-label="Dismiss"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}