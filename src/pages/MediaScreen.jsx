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

    useScreenGuardian();

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
                ? <ScreenDisplay restaurantId={mode.restaurantId} screenName={mode.screenName} />
                : <PairedScreenPlayer />}
        </ScreenErrorBoundary>
    );
}
