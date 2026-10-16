import { base44 } from '@/api/base44Client';

/** Calls the whatsappAdmin backend function and unwraps the response or error. */
export async function waAdmin(action, params = {}) {
    try {
        const res = await base44.functions.invoke('whatsappAdmin', { action, ...params });
        const data = res && typeof res === 'object' && 'data' in res && !('channels' in res) ? res.data : res;
        if (data?.error) throw new Error(data.error);
        return data;
    } catch (e) {
        throw new Error(e?.response?.data?.error || e?.data?.error || e?.message || 'Request failed');
    }
}

let sdkPromise = null;

/** Loads Meta's JavaScript SDK once and initialises it with our app id. */
export function loadFacebookSdk(appId, version) {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
        if (window.FB) {
            window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            resolve(window.FB);
            return;
        }
        window.fbAsyncInit = () => {
            window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            resolve(window.FB);
        };
        const s = document.createElement('script');
        s.src = 'https://connect.facebook.net/en_US/sdk.js';
        s.async = true;
        s.defer = true;
        s.crossOrigin = 'anonymous';
        s.onerror = () => { sdkPromise = null; reject(new Error('Could not load Facebook login. Check ad blockers and try again.')); };
        document.body.appendChild(s);
    });
    return sdkPromise;
}

/**
 * Runs WhatsApp Embedded Signup in a Facebook popup.
 * Resolves with { code, waba_id, phone_number_id, coexistence }.
 * `coexistence` = the restaurant keeps using the WhatsApp Business app on its phone.
 */
export function runEmbeddedSignup({ appId, configId, version, coexistence }) {
    return loadFacebookSdk(appId, version).then((FB) => new Promise((resolve, reject) => {
        let session = null;
        let code = null;
        let settled = false;

        const finish = () => {
            if (settled || !code || !session) return;
            settled = true;
            window.removeEventListener('message', onMessage);
            resolve({ code, ...session });
        };

        const onMessage = (event) => {
            if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
            let data;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
            if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
            if (data.event === 'CANCEL') {
                settled = true;
                window.removeEventListener('message', onMessage);
                reject(new Error(data.data?.current_step ? `Signup cancelled at: ${data.data.current_step}` : 'Signup cancelled'));
                return;
            }
            if (String(data.event || '').startsWith('FINISH')) {
                session = {
                    waba_id: data.data?.waba_id,
                    phone_number_id: data.data?.phone_number_id,
                    coexistence: data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' || !!coexistence,
                };
                finish();
            }
        };
        window.addEventListener('message', onMessage);

        FB.login((response) => {
            code = response?.authResponse?.code || null;
            if (!code) {
                if (!settled) {
                    settled = true;
                    window.removeEventListener('message', onMessage);
                    reject(new Error('Facebook login was not completed'));
                }
                return;
            }
            finish();
            // The session message normally arrives first; give it a moment if not
            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    window.removeEventListener('message', onMessage);
                    reject(new Error('Meta did not return the phone number details. Please try again.'));
                }
            }, 8000);
        }, {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                setup: {},
                sessionInfoVersion: '3',
                ...(coexistence ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
            },
        });
    }));
}

export function waLink(displayNumber, text = 'Hi') {
    const digits = String(displayNumber || '').replace(/\D/g, '');
    return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}
