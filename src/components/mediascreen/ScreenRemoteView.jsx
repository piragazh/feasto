import React from 'react';
import { Button } from "@/components/ui/button";
import { Camera, Megaphone, Layout, Grid3x3, Zap, AlertTriangle, MonitorOff, Smartphone } from 'lucide-react';
import moment from 'moment';
import { isPairedScreen } from './screenHealth';

/**
 * "Now showing" for a paired screen (reported at every check-in) plus the
 * latest remote screenshot and a button to take a new one.
 */
const MODE_TEXT = {
    message: { icon: Megaphone, label: 'Screen message' },
    media_wall: { icon: Grid3x3, label: 'Media wall' },
    layout: { icon: Layout, label: 'Layout' },
    empty: { icon: MonitorOff, label: 'Nothing scheduled' },
    media_failed: { icon: AlertTriangle, label: 'Media failed to load' },
};

export default function ScreenRemoteView({ screen, offline, onScreenshot, requesting }) {
    if (!isPairedScreen(screen)) {
        return (
            <p className="text-xs text-gray-400 mt-2">
                Pair this screen to see what it's showing and take screenshots.
            </p>
        );
    }

    const now = screen.now_showing || null;
    const mode = now?.mode && MODE_TEXT[now.mode];
    const ModeIcon = mode?.icon;
    const showThumb = now?.mode === 'playlist' && now.media_url && now.media_type !== 'video';

    return (
        <div className="mt-3 flex gap-3 items-start">
            <div className="w-28 aspect-video rounded-md overflow-hidden bg-gray-900 flex items-center justify-center flex-shrink-0">
                {screen.last_screenshot_url ? (
                    <a href={screen.last_screenshot_url} target="_blank" rel="noreferrer" title="Open latest screenshot">
                        <img src={screen.last_screenshot_url} alt={`Screenshot of ${screen.screen_name}`} className="w-full h-full object-cover" />
                    </a>
                ) : showThumb ? (
                    <img src={now.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <Camera className="h-5 w-5 text-gray-600" />
                )}
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-500">Now showing</p>
                {now ? (
                    <p className="text-sm text-gray-900 truncate flex items-center gap-1">
                        {ModeIcon && <ModeIcon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />}
                        {now.mode === 'playlist' && now.media_type === 'widget' && <Zap className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />}
                        <span className="truncate">
                            {now.mode === 'playlist'
                                ? (now.title || 'Untitled')
                                : now.mode === 'layout'
                                    ? `${mode.label}: ${now.layout_name}`
                                    : now.title ? `${mode?.label}: ${now.title}` : mode?.label}
                        </span>
                    </p>
                ) : (
                    <p className="text-sm text-gray-400">Waiting for the screen to report…</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                    {now?.item_count != null && now.mode === 'playlist' ? `${now.item_count} item${now.item_count === 1 ? '' : 's'} in rotation` : ''}
                    {now?.failed_count ? ` · ${now.failed_count} failed to load` : ''}
                    {screen.last_screenshot_at ? ` · screenshot ${moment(screen.last_screenshot_at).fromNow()}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onScreenshot} disabled={offline || requesting}>
                        <Camera className="h-3 w-3 mr-1" />
                        {requesting ? 'Requested…' : 'Screenshot'}
                    </Button>
                    {now?.native_app && (
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                            <Smartphone className="h-3 w-3" /> MealDrop app
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
