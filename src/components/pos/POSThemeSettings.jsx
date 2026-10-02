import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Palette, Check, Info, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { POS_PALETTES, DEFAULT_PALETTE, paletteStyle, writeCachedPalette } from '@/lib/posThemes';

/**
 * Accent palette + light/dark picker for the POS.
 *
 * The palette is saved on the Restaurant record so every till at the site
 * matches; light/dark stays per-device (localStorage) because it depends on
 * where the screen physically sits and the ambient light there.
 */
export default function POSThemeSettings({ restaurantId, restaurant, onPaletteChange }) {
    const [selected, setSelected] = useState(restaurant?.pos_palette || DEFAULT_PALETTE);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState(() => localStorage.getItem('pos_theme') || 'dark');
    const [density, setDensity] = useState(() => {
        try { return localStorage.getItem('pos_grid_density') || 'standard'; } catch { return 'standard'; }
    });

    // Tile text size, separate from grid size on purpose: a counter may want big
    // tiles with modest text, or compact tiles with names staff can read at arm's
    // length. Tying them together forces a trade nobody asked for.
    const [textSize, setTextSize] = useState(() => {
        try { return localStorage.getItem('pos_tile_text_size') || 'm'; } catch { return 'm'; }
    });

    const chooseTextSize = (next) => {
        setTextSize(next);
        try { localStorage.setItem('pos_tile_text_size', next); } catch { /* ignore */ }
        window.location.reload();
    };

    const chooseDensity = (next) => {
        setDensity(next);
        try { localStorage.setItem('pos_grid_density', next); } catch { /* ignore */ }
        window.location.reload();
    };

    useEffect(() => {
        if (restaurant?.pos_palette) setSelected(restaurant.pos_palette);
    }, [restaurant?.pos_palette]);

    const choosePalette = async (key) => {
        const previous = selected;
        setSelected(key);
        // Apply immediately so the change is visible while it saves.
        writeCachedPalette(restaurantId, key);
        onPaletteChange?.(key);
        setSaving(true);
        try {
            await base44.entities.Restaurant.update(restaurantId, { pos_palette: key });
            toast.success(`${POS_PALETTES[key].label} applied to all tills`);
        } catch (e) {
            setSelected(previous);
            writeCachedPalette(restaurantId, previous);
            onPaletteChange?.(previous);
            toast.error('Could not save theme: ' + (e?.message || 'unknown error'));
        } finally {
            setSaving(false);
        }
    };

    const chooseMode = (next) => {
        setMode(next);
        localStorage.setItem('pos_theme', next);
        // Full reload keeps every component's theme tokens in step; the POS
        // reads pos_theme at mount in several places.
        window.location.reload();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    POS Appearance
                </CardTitle>
                <CardDescription>Set the accent colour and screen mode for this restaurant&rsquo;s tills</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Light / dark */}
                <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Screen Mode</Label>
                    <div className="grid grid-cols-2 gap-2 max-w-sm">
                        {[
                            { key: 'dark', label: 'Dark', icon: Moon, hint: 'Best for dim rooms' },
                            { key: 'light', label: 'Light', icon: Sun, hint: 'Best in bright daylight' },
                        ].map(({ key, label, icon: Icon, hint }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => chooseMode(key)}
                                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                                    mode === key
                                        ? 'border-accent-500 bg-accent-50 text-accent-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                }`}
                            >
                                <Icon className="h-5 w-5" />
                                <span className="text-sm font-semibold">{label}</span>
                                <span className="text-[11px] opacity-70">{hint}</span>
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                        Applies to <strong>this device only</strong> &mdash; a till by a window may need Light while the kitchen screen stays Dark.
                    </p>
                </div>

                {/* Tile text size - per device */}
                <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Item Text Size</Label>
                    <div className="grid grid-cols-3 gap-2 max-w-md" role="radiogroup" aria-label="Item text size">
                        {[
                            { key: 's', label: 'S', hint: 'More on a line' },
                            { key: 'm', label: 'M', hint: 'Balanced' },
                            { key: 'l', label: 'L', hint: 'Read at arm\u2019s length' },
                        ].map(({ key, label, hint }) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={textSize === key}
                                onClick={() => chooseTextSize(key)}
                                className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all ${
                                    textSize === key
                                        ? 'border-accent-500 bg-accent-50 text-accent-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                }`}
                            >
                                <span className={`font-bold ${key === 's' ? 'text-sm' : key === 'm' ? 'text-base' : 'text-xl'}`}>{label}</span>
                                <span className="text-[11px] opacity-70 text-center leading-tight">{hint}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid density - per device, like screen mode */}
                <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Menu Grid Size</Label>
                    <div className="grid grid-cols-3 gap-2 max-w-md" role="radiogroup" aria-label="Menu grid size">
                        {[
                            { key: 'comfortable', label: 'Large', hint: 'Fewer, bigger tiles' },
                            { key: 'standard', label: 'Standard', hint: 'Balanced' },
                            { key: 'compact', label: 'Compact', hint: 'More items on screen' },
                        ].map(({ key, label, hint }) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={density === key}
                                onClick={() => chooseDensity(key)}
                                className={`flex flex-col items-center gap-0.5 p-3 rounded-xl border-2 transition-all ${
                                    density === key
                                        ? 'border-accent-500 bg-accent-50 text-accent-700'
                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                }`}
                            >
                                <span className="text-sm font-semibold">{label}</span>
                                <span className="text-[11px] opacity-70">{hint}</span>
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                        Applies to <strong>this device only</strong> &mdash; a large till and a small tablet usually want different sizes.
                    </p>
                </div>

                {/* Accent palette */}
                <div>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Accent Colour</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.entries(POS_PALETTES).map(([key, palette]) => {
                            const active = selected === key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    disabled={saving}
                                    onClick={() => choosePalette(key)}
                                    title={palette.description}
                                    className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-60 ${
                                        active ? 'border-gray-900 shadow-sm' : 'border-gray-200 hover:border-gray-400'
                                    }`}
                                >
                                    {active && (
                                        <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-gray-900 flex items-center justify-center">
                                            <Check className="h-3 w-3 text-white" />
                                        </span>
                                    )}
                                    {/* Live preview of the ramp this palette produces */}
                                    <div className="flex gap-1" style={paletteStyle(key)}>
                                        <span className="h-7 w-7 rounded-lg bg-accent-500" />
                                        <span className="h-7 w-4 rounded-lg bg-accent-400" />
                                        <span className="h-7 w-2.5 rounded-lg bg-accent-200" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-800">{palette.label}</p>
                                        <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{palette.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                        The accent colour is saved to the restaurant, so <strong>every till at this site</strong> picks it up.
                        It applies to buttons, totals, selected items and status highlights across the POS.
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
