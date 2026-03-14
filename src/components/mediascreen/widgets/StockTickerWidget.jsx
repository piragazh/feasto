import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const SPEED_MAP = { slow: 60, medium: 40, fast: 25 };

export default function StockTickerWidget({ config = {}, className = '' }) {
    const {
        symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'],
        refresh_interval = 60,
        show_change = true,
        scroll_speed = 'medium',
        theme = 'dark'
    } = config;

    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const tickerRef = useRef(null);

    const fetchQuotes = async () => {
        try {
            const res = await base44.functions.invoke('getStockData', { symbols });
            if (res.data?.quotes) {
                setQuotes(res.data.quotes);
                setLastUpdated(new Date());
            }
        } catch (e) {
            // Silently fail — keep showing last data
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchQuotes();
        const interval = setInterval(fetchQuotes, refresh_interval * 1000);
        return () => clearInterval(interval);
    }, [symbols.join(','), refresh_interval]);

    const themes = {
        dark: { bg: 'bg-gray-900', text: 'text-white', border: 'border-gray-700', label: 'bg-gray-800', labelText: 'text-gray-300' },
        light: { bg: 'bg-white', text: 'text-gray-900', border: 'border-gray-200', label: 'bg-gray-100', labelText: 'text-gray-600' },
        finance: { bg: 'bg-[#0a0f1e]', text: 'text-green-400', border: 'border-green-900', label: 'bg-[#0d1a2e]', labelText: 'text-green-600' },
    };
    const t = themes[theme] || themes.dark;
    const pxPerSec = SPEED_MAP[scroll_speed] || SPEED_MAP.medium;

    // Duplicate items to create seamless loop
    const displayQuotes = [...quotes, ...quotes];

    const animationDuration = quotes.length > 0 ? (quotes.length * 200) / pxPerSec : 20;

    if (loading) {
        return (
            <div className={`${t.bg} ${t.text} h-full flex items-center justify-center ${className}`}>
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-mono">Loading market data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className={`${t.bg} ${t.border} border-t flex items-center overflow-hidden h-full ${className}`}>
            {/* Label */}
            <div className={`${t.label} px-4 h-full flex items-center gap-2 border-r ${t.border} flex-shrink-0 z-10`}>
                <TrendingUp className={`h-4 w-4 ${t.text}`} />
                <span className={`text-xs font-bold uppercase tracking-widest ${t.labelText}`}>Markets</span>
            </div>

            {/* Scrolling ticker */}
            <div className="flex-1 overflow-hidden relative">
                <style>{`
                    @keyframes ticker-scroll {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .ticker-track { animation: ticker-scroll ${animationDuration}s linear infinite; }
                    .ticker-track:hover { animation-play-state: paused; }
                `}</style>
                <div className="ticker-track flex items-center whitespace-nowrap">
                    {displayQuotes.map((q, i) => {
                        const isUp = q.regularMarketChange > 0;
                        const isDown = q.regularMarketChange < 0;
                        return (
                            <div key={`${q.symbol}-${i}`} className="inline-flex items-center gap-2 px-6 h-full">
                                <span className={`font-bold text-sm font-mono ${t.text}`}>{q.symbol}</span>
                                <span className={`text-sm font-mono ${t.text}`}>
                                    ${q.regularMarketPrice?.toFixed(2) ?? '—'}
                                </span>
                                {show_change && (
                                    <span className={`text-xs font-semibold font-mono flex items-center gap-0.5 ${
                                        isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-gray-400'
                                    }`}>
                                        {isUp ? <TrendingUp className="h-3 w-3" /> : isDown ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                        {isUp ? '+' : ''}{q.regularMarketChangePercent?.toFixed(2)}%
                                    </span>
                                )}
                                <span className={`text-gray-600 ml-2`}>·</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Timestamp */}
            {lastUpdated && (
                <div className={`${t.labelText} text-[10px] px-3 flex-shrink-0 font-mono`}>
                    {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
            )}
        </div>
    );
}