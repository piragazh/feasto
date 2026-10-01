import React from 'react';
import { AlertTriangle, Info, Siren } from 'lucide-react';

/**
 * Full-screen priority message ("Card machines down — cash only",
 * "Closing early today"). Replaces all content while active.
 */

const STYLES = {
    info:      { bg: 'bg-blue-700',  icon: Info,          ring: 'ring-blue-300/40' },
    warning:   { bg: 'bg-amber-500', icon: AlertTriangle, ring: 'ring-amber-200/50' },
    emergency: { bg: 'bg-red-700',   icon: Siren,         ring: 'ring-red-300/50' },
};

const ROTATION = { landscape: 0, portrait: 90, portrait_flipped: 270, landscape_flipped: 180 };

export function isTakeoverActive(takeover, now = Date.now()) {
    if (!takeover?.active) return false;
    if (takeover.expires_at && new Date(takeover.expires_at).getTime() <= now) return false;
    return !!(takeover.message || takeover.title);
}

export default function TakeoverScreen({ takeover, orientation = 'landscape' }) {
    const s = STYLES[takeover.style] || STYLES.warning;
    const Icon = s.icon;
    const deg = ROTATION[orientation] || 0;
    const rotated = deg === 90 || deg === 270;
    const style = rotated ? {
        transform: `rotate(${deg}deg)`, width: '100vh', height: '100vw', position: 'absolute',
        top: '50%', left: '50%', marginLeft: '-50vh', marginTop: '-50vw',
    } : deg ? { transform: `rotate(${deg}deg)` } : undefined;

    return (
        <div className="h-screen w-screen bg-black overflow-hidden relative">
            <div className={`${s.bg} h-full w-full flex items-center justify-center p-10 text-white`} style={style} role="alert">
                <div className="text-center max-w-5xl">
                    <div className={`mx-auto mb-8 w-28 h-28 md:w-36 md:h-36 rounded-full bg-white/15 ring-8 ${s.ring} flex items-center justify-center ${takeover.style === 'emergency' ? 'animate-pulse' : ''}`}>
                        <Icon className="w-16 h-16 md:w-20 md:h-20" strokeWidth={2.2} />
                    </div>
                    {takeover.title && (
                        <h1 className="text-5xl md:text-8xl font-black leading-tight tracking-tight mb-6">{takeover.title}</h1>
                    )}
                    {takeover.message && (
                        <p className="text-3xl md:text-5xl font-semibold leading-snug opacity-95 whitespace-pre-line">{takeover.message}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
