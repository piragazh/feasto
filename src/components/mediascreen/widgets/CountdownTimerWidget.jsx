import React, { useState, useEffect } from 'react';
import { Timer, Sparkles } from 'lucide-react';

function pad(n) { return String(n).padStart(2, '0'); }

function getTimeLeft(targetDate) {
    const now = Date.now();
    const target = new Date(targetDate).getTime();
    const diff = Math.max(0, target - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds, done: diff === 0 };
}

const THEMES = {
    dark: {
        bg: 'bg-gray-900',
        text: 'text-white',
        sub: 'text-gray-400',
        card: 'bg-gray-800 border border-gray-700',
        accent: 'text-orange-400',
        labelText: 'text-gray-500'
    },
    light: {
        bg: 'bg-white',
        text: 'text-gray-900',
        sub: 'text-gray-500',
        card: 'bg-gray-50 border border-gray-200',
        accent: 'text-orange-500',
        labelText: 'text-gray-400'
    },
    fire: {
        bg: 'bg-gradient-to-br from-orange-950 via-red-950 to-orange-900',
        text: 'text-white',
        sub: 'text-orange-200',
        card: 'bg-orange-900/60 border border-orange-700',
        accent: 'text-yellow-300',
        labelText: 'text-orange-400'
    },
    celebration: {
        bg: 'bg-gradient-to-br from-violet-950 via-purple-950 to-indigo-900',
        text: 'text-white',
        sub: 'text-violet-300',
        card: 'bg-violet-900/60 border border-violet-600',
        accent: 'text-yellow-300',
        labelText: 'text-violet-400'
    }
};

export default function CountdownTimerWidget({ config = {}, className = '' }) {
    const {
        target_date,
        title = 'Event Starts In',
        subtitle = '',
        message_after = '🎉 Event Has Started!',
        theme = 'dark',
        show_seconds = true
    } = config;

    const [timeLeft, setTimeLeft] = useState(target_date ? getTimeLeft(target_date) : null);

    useEffect(() => {
        if (!target_date) return;
        const tick = () => setTimeLeft(getTimeLeft(target_date));
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [target_date]);

    const t = THEMES[theme] || THEMES.dark;

    if (!target_date) {
        return (
            <div className={`${t.bg} h-full flex flex-col items-center justify-center gap-4 ${className}`}>
                <Timer className="h-14 w-14 text-orange-500 opacity-50" />
                <p className={`text-sm ${t.sub}`}>No target date configured</p>
            </div>
        );
    }

    if (timeLeft?.done) {
        return (
            <div className={`${t.bg} h-full flex flex-col items-center justify-center gap-4 text-center px-6 ${className}`}>
                <Sparkles className={`h-16 w-16 ${t.accent}`} />
                <p className={`text-2xl font-bold ${t.text}`}>{message_after}</p>
            </div>
        );
    }

    const units = [
        { label: 'DAYS', value: timeLeft?.days ?? 0 },
        { label: 'HRS', value: timeLeft?.hours ?? 0 },
        { label: 'MIN', value: timeLeft?.minutes ?? 0 },
        ...(show_seconds ? [{ label: 'SEC', value: timeLeft?.seconds ?? 0 }] : [])
    ];

    // Hide days if 0 and more than one hour remaining
    const visibleUnits = timeLeft?.days === 0
        ? units.filter(u => u.label !== 'DAYS')
        : units;

    return (
        <div className={`${t.bg} h-full flex flex-col items-center justify-center gap-5 px-6 text-center ${className}`}>
            {/* Icon */}
            <div className={`w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center`}>
                <Timer className={`h-7 w-7 ${t.accent}`} />
            </div>

            {/* Title */}
            <div>
                <p className={`text-xl font-bold ${t.text} leading-tight`}>{title}</p>
                {subtitle && <p className={`text-sm ${t.sub} mt-1`}>{subtitle}</p>}
            </div>

            {/* Countdown blocks */}
            <div className="flex items-center gap-3">
                {visibleUnits.map((unit, i) => (
                    <React.Fragment key={unit.label}>
                        <div className={`${t.card} rounded-2xl px-4 py-3 min-w-[64px] flex flex-col items-center`}>
                            <span className={`text-4xl font-black font-mono ${t.text} leading-none tabular-nums`}>
                                {pad(unit.value)}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${t.labelText}`}>
                                {unit.label}
                            </span>
                        </div>
                        {i < visibleUnits.length - 1 && (
                            <span className={`text-3xl font-bold ${t.accent} -mt-3`}>:</span>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Target date */}
            <p className={`text-xs ${t.sub} font-mono`}>
                {new Date(target_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
        </div>
    );
}