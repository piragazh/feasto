import React, { useState, useEffect } from 'react';
import ScreenDisplay from '@/components/mediascreen/ScreenDisplay';
import PairedScreenPlayer from '@/components/mediascreen/PairedScreenPlayer';
import { ScreenErrorBoundary, useScreenGuardian } from '@/components/mediascreen/ScreenGuardian';

/**
 * /MediaScreen
 *   - No parameters → paired-device mode (shows a pairing code, then plays the
 *     screen it's paired to). This is the recommended setup.
 *   - ?restaurantId=…&screenName=… → legacy URL mode (kept so existing screens
 *     keep working until they are re-paired).
 */
export default function MediaScreen() {
    const [mode, setMode] = useState(null);
    const isPreview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';

    // Unattended-screen protections — not in a manager's preview tab
    useScreenGuardian(!isPreview);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const restaurantId = params.get('restaurantId');
        if (restaurantId) {
            setMode({ type: 'legacy', restaurantId, screenName: params.get('screenName') || 'Main Screen' });
        } else {
            setMode({ type: 'paired' });
        }
    }, []);

    if (!mode) return <div className="h-screen w-screen bg-black" />;

    return (
        <ScreenErrorBoundary>
            {mode.type === 'legacy'
                ? (
                    <>
                        <ScreenDisplay restaurantId={mode.restaurantId} screenName={mode.screenName} preview={isPreview} />
                        {isPreview && (
                            <div className="fixed top-3 left-3 z-[1000] rounded-full bg-black/70 text-white text-xs font-semibold px-3 py-1 pointer-events-none">
                                Preview
                            </div>
                        )}
                    </>
                )
                : <PairedScreenPlayer />}
        </ScreenErrorBoundary>
    );
}
