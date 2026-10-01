/**
 * Capture what this screen is showing, as a base64 JPEG (no data: prefix).
 *
 * 1. MealDrop Screen Android app → native capture (MealDropNative.captureScreen)
 * 2. Browser → html2canvas (loaded only when needed). Browser captures can't
 *    include video frames, and images served without CORS headers come out blank.
 */
const MAX_WIDTH = 960;

export function nativeBridge() {
    return typeof window !== 'undefined' && window.MealDropNative ? window.MealDropNative : null;
}

export function nativeAppVersion() {
    try {
        const info = JSON.parse(nativeBridge()?.getInfo?.() || 'null');
        return info?.app_version ? `android-${info.app_version}` : null;
    } catch { return null; }
}

export async function captureScreen() {
    const bridge = nativeBridge();
    if (bridge?.captureScreen) {
        try {
            const b64 = bridge.captureScreen(MAX_WIDTH);
            if (b64 && b64.length > 100) return { image: b64, source: 'native' };
        } catch (e) {
            console.warn('[MediaScreen] native capture failed', e);
        }
    }

    const { default: html2canvas } = await import('html2canvas');
    const scale = Math.min(1, MAX_WIDTH / Math.max(1, window.innerWidth));
    const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#000000',
        scale,
        logging: false,
        imageTimeout: 4000,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    return { image: dataUrl.split(',')[1], source: 'browser' };
}
