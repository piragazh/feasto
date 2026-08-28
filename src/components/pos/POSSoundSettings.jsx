import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX, Play, Info } from 'lucide-react';
import {
    getSoundSettings,
    setSoundSettings,
    subscribeSoundSettings,
    playPreview,
    playSuccess,
    playError,
} from '@/lib/posSound';

/**
 * Sound settings for this till. Stored per-device (localStorage) rather than on
 * the restaurant record — see src/lib/posSound.js for why.
 */
export default function POSSoundSettings() {
    const [settings, setSettings] = useState(getSoundSettings());

    useEffect(() => subscribeSoundSettings(setSettings), []);

    const update = (patch) => setSettings(setSoundSettings(patch));

    const volumePct = Math.round(settings.volume * 100);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    {settings.enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                    Sound Feedback
                </CardTitle>
                <CardDescription>
                    Audible confirmation when items are added, payments complete, or something fails
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                        This setting applies to <strong>this device only</strong>, so a till next to a noisy
                        kitchen can be louder than one at a quiet counter. Set it on each till separately.
                    </span>
                </div>

                {/* Enable / disable */}
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <Label className="text-sm font-semibold">Enable sounds</Label>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Turn off completely for quiet dining rooms
                        </p>
                    </div>
                    <Switch
                        checked={settings.enabled}
                        onCheckedChange={(v) => {
                            update({ enabled: v });
                            if (v) playPreview();
                        }}
                    />
                </div>

                {/* Volume */}
                <div className={settings.enabled ? '' : 'opacity-40 pointer-events-none'}>
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold">Volume</Label>
                        <span className="text-sm font-bold tabular-nums text-orange-600">{volumePct}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <VolumeX className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={volumePct}
                            onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
                            onMouseUp={() => playPreview()}
                            onTouchEnd={() => playPreview()}
                            className="flex-1 h-2 accent-orange-500 cursor-pointer"
                            aria-label="Sound volume"
                        />
                        <Volume2 className="h-4 w-4 text-gray-500 flex-shrink-0" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                        Drag to set the level — you'll hear a sample as you release.
                    </p>
                </div>

                {/* Test buttons */}
                <div className={settings.enabled ? '' : 'opacity-40 pointer-events-none'}>
                    <Label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">
                        Test sounds
                    </Label>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => playPreview()}>
                            <Play className="h-3.5 w-3.5 mr-1.5" />Item added
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => playSuccess()}>
                            <Play className="h-3.5 w-3.5 mr-1.5" />Payment done
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => playError()}>
                            <Play className="h-3.5 w-3.5 mr-1.5" />Error
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
