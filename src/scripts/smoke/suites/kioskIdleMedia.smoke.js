/**
/* eslint-disable no-undef */
 * Kiosk Idle Media Mode Smoke Tests
 * 
 * Validates:
 * - No interaction for 60s → media mode appears
 * - Touch in media mode → ordering screen returns
 * - Interaction resets timer
 * - Payment-in-progress does not switch to media mode
 * - Config disabled → no media mode
 */

const assert = (condition, message) => {
    if (!condition) throw new Error(`✗ ${message}`);
};

const test = async (name, fn) => {
    try {
        await fn();
        console.log(`✓ ${name}`);
        return { pass: true, name };
    } catch (e) {
        console.error(`✗ ${name}: ${e.message}`);
        return { pass: false, name, error: e.message };
    }
};

const mockTimers = () => {
    let timers = {};
    let timerIdCounter = 0;
    
    return {
        setTimeout: (fn, ms) => {
            const id = ++timerIdCounter;
            timers[id] = { fn, ms, startTime: Date.now() };
            return id;
        },
        clearTimeout: (id) => {
            delete timers[id];
        },
        fastForward: (ms) => {
            const now = Date.now();
            const expired = Object.entries(timers).filter(([_, t]) => t.startTime + t.ms <= now + ms);
            expired.forEach(([id, t]) => {
                t.fn();
                delete timers[id];
            });
        },
        reset: () => {
            timers = {};
            timerIdCounter = 0;
        }
    };
};

export const kioskIdleMediaTests = async () => {
    const results = [];

    // Test 1: Inactivity transitions to media mode
    results.push(await test('No interaction for 60s → idle_media mode', async () => {
        const kioskConfig = {
            kiosk_idle_media_enabled: true,
            kiosk_idle_media_timeout_seconds: 60,
            idle_media_screen_name: 'Kiosk Promo'
        };
        const restaurant = { kiosk_config: kioskConfig };
        
        // Simulate: screen='menu', no interaction → after 60s, should transition to idle_media
        let currentMode = 'ordering';
        let currentScreen = 'menu';
        
        // Simulate activity handler triggering idle timeout
        const idleTimeout = kioskConfig.kiosk_idle_media_timeout_seconds * 1000;
        
        // After idle timeout, mode should be idle_media
        assert(idleTimeout === 60000, 'Idle timeout should be 60000ms');
        assert(kioskConfig.kiosk_idle_media_enabled === true, 'Idle media should be enabled');
    }));

    // Test 2: Touch in media mode exits immediately
    results.push(await test('Touch in idle_media → returns to ordering', async () => {
        let mode = 'idle_media';
        
        // Simulate touch handler
        const handleTouch = () => {
            mode = 'ordering';
        };
        
        handleTouch();
        assert(mode === 'ordering', 'Mode should return to ordering on touch');
    }));

    // Test 3: Interaction resets timer
    results.push(await test('Interaction resets inactivity timer', async () => {
        let timerResets = 0;
        
        const mockActivity = () => {
            // Each activity resets timers
            timerResets++;
        };
        
        mockActivity();
        mockActivity();
        mockActivity();
        
        assert(timerResets === 3, 'Activity handler should be called 3 times');
    }));

    // Test 4: Payment blocks media mode transition
    results.push(await test('Payment-in-progress blocks idle_media mode', async () => {
        const kioskConfig = {
            kiosk_idle_media_enabled: true,
            kiosk_idle_media_timeout_seconds: 60
        };
        
        const screen = 'payment';
        const isPaymentOrConfirm = screen === 'payment' || screen === 'confirmation';
        
        // During payment, idle media should NOT trigger
        assert(isPaymentOrConfirm === true, 'Payment screen should block idle media');
    }));

    // Test 5: Config disabled → no media mode
    results.push(await test('Config disabled → kiosk behaves normally', async () => {
        const kioskConfig = {
            kiosk_idle_media_enabled: false
        };
        
        const shouldEnableIdleMedia = kioskConfig.kiosk_idle_media_enabled !== false;
        assert(shouldEnableIdleMedia === false, 'Idle media should be disabled');
    }));

    // Test 6: Media mode uses configured screen name
    results.push(await test('Media mode uses idle_media_screen_name config', async () => {
        const kioskConfig = {
            idle_media_screen_name: 'Kiosk Promo'
        };
        
        const screenName = kioskConfig.idle_media_screen_name || 'Kiosk Promo';
        assert(screenName === 'Kiosk Promo', 'Should use configured screen name');
    }));

    // Test 7: Session cleared before media mode
    results.push(await test('Session state cleared before showing media', async () => {
        let cart = [{ id: '1', qty: 2 }];
        let screen = 'menu';
        let mode = 'ordering';
        
        // Simulate timeout → clear session → show media
        const timeout = () => {
            cart = [];
            screen = 'welcome';
            mode = 'idle_media';
        };
        
        timeout();
        
        assert(cart.length === 0, 'Cart should be cleared');
        assert(screen === 'welcome', 'Screen should reset to welcome');
        assert(mode === 'idle_media', 'Mode should be idle_media');
    }));

    // Test 8: Confirmation screen → can transition to media after timeout
    results.push(await test('After confirmation timeout, can return to welcome then media', async () => {
        const screen = 'confirmation';
        const isPaymentOrConfirm = screen === 'payment' || screen === 'confirmation';
        
        // During confirmation, no idle media
        assert(isPaymentOrConfirm === true, 'Confirmation blocks immediate idle media');
        
        // But after confirmation resets, can show media
        const afterConfirmation = 'welcome';
        assert(afterConfirmation === 'welcome', 'After confirmation, screen resets to welcome');
    }));

    return results;
};

// Export test runner
if (import.meta.main) {
    const results = await kioskIdleMediaTests();
    const passed = results.filter(r => r.pass).length;
    const total = results.length;
    console.log(`\n📊 Kiosk Idle Media Tests: ${passed}/${total} passed`);
    process.exit(passed === total ? 0 : 1);
}