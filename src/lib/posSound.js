/**
 * POS audio feedback.
 *
 * Tones are synthesised with the Web Audio API rather than loaded from sound
 * files. That matters here: the POS must stay fully functional offline, and
 * bundled audio assets can fail to load or be evicted from cache. An oscillator
 * always works, adds nothing to the bundle, and starts instantly (no decode
 * latency before the beep — important when staff are tapping quickly).
 *
 * Settings are stored per-device in localStorage, not on the restaurant record.
 * Volume is a property of where a till physically sits: a terminal next to a
 * noisy kitchen pass needs more volume than one in a quiet front counter, and
 * staff must be able to change it instantly without a network round-trip.
 */

const STORAGE_KEY = 'pos_sound_settings';

const DEFAULTS = {
    enabled: true,
    volume: 0.5, // 0..1
};

let ctx = null;
let cached = null;

// ── Settings ────────────────────────────────────────────────────────────────

export function getSoundSettings() {
    if (cached) return cached;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        cached = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
        cached = { ...DEFAULTS };
    }
    return cached;
}

export function setSoundSettings(patch) {
    const next = { ...getSoundSettings(), ...patch };
    next.volume = Math.min(1, Math.max(0, Number(next.volume) || 0));
    next.enabled = !!next.enabled;
    cached = next;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage unavailable (private mode / quota) — keep the in-memory value
        // so the current session still honours the change.
    }
    listeners.forEach(fn => fn({ ...next }));
    return next;
}

const listeners = new Set();
export function subscribeSoundSettings(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// ── Playback ────────────────────────────────────────────────────────────────

function getCtx() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    // Browsers suspend the context until a user gesture. Every POS sound is
    // triggered by a tap, so resuming here is always allowed.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

/**
 * Play a single tone.
 * @param {number} freq      frequency in Hz
 * @param {number} durationMs
 * @param {number} gainScale relative loudness within the user's volume setting
 * @param {number} delayMs   offset from now, for multi-tone patterns
 * @param {string} type      oscillator waveform
 */
function tone(freq, durationMs, gainScale = 1, delayMs = 0, type = 'sine') {
    const audio = getCtx();
    if (!audio) return;
    const { volume } = getSoundSettings();
    const peak = volume * gainScale * 0.3; // 0.3 keeps the loudest tone comfortable
    if (peak <= 0) return;

    const start = audio.currentTime + delayMs / 1000;
    const end = start + durationMs / 1000;

    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    // Short attack/decay ramps avoid the click you get from starting or stopping
    // a waveform at non-zero amplitude.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
}

function play(pattern) {
    try {
        if (!getSoundSettings().enabled) return;
        pattern();
    } catch {
        // Audio must never break an order flow.
    }
}

// ── Named POS sounds ────────────────────────────────────────────────────────

/** Item added to the cart — short, high, unobtrusive. The most frequent sound. */
export function playItemAdded() {
    play(() => tone(880, 70, 0.8));
}

/** Item removed / quantity decreased — same shape, lower pitch. */
export function playItemRemoved() {
    play(() => tone(440, 70, 0.7));
}

/** Payment taken / order sent — rising two-note confirmation. */
export function playSuccess() {
    play(() => {
        tone(660, 90, 0.9, 0);
        tone(990, 140, 0.9, 90);
    });
}

/** Something failed — low, doubled, deliberately different from success. */
export function playError() {
    play(() => {
        tone(300, 140, 1, 0, 'square');
        tone(240, 180, 1, 150, 'square');
    });
}

/** Attention needed (e.g. sync backlog, printer down) — three short pulses. */
export function playAlert() {
    play(() => {
        tone(760, 90, 0.9, 0);
        tone(760, 90, 0.9, 140);
        tone(760, 90, 0.9, 280);
    });
}

/** Used by the settings screen so staff can hear the level they're setting. */
export function playPreview() {
    // Bypasses the enabled check: pressing Test should always make a sound,
    // otherwise the button appears broken while sounds are off.
    try {
        tone(880, 70, 0.8);
    } catch {
        // ignore
    }
}

/**
 * Prime audio playback on the first user gesture.
 *
 * Browsers refuse to start audio until the page has been interacted with. That
 * matters here because POS alerts fire on a TIMER, not on a click - so without
 * priming, the very first "new online order" alert of a shift is silently
 * blocked, which is exactly the one you cannot afford to miss.
 *
 * Called once at POS start-up; it resumes the AudioContext and plays a silent
 * buffer through it, plus optionally primes an <audio> element, so later
 * timer-driven playback is permitted. Self-removes after the first gesture.
 */
export function primeAudioOnFirstGesture(audioEl) {
    if (typeof window === 'undefined') return () => {};
    let done = false;
    const unlock = () => {
        if (done) return;
        done = true;
        try {
            const audio = getCtx();
            if (audio) {
                const buf = audio.createBuffer(1, 1, 22050);
                const src = audio.createBufferSource();
                src.buffer = buf;
                src.connect(audio.destination);
                src.start(0);
            }
        } catch { /* ignore */ }
        try {
            if (audioEl) {
                const prevVolume = audioEl.volume;
                audioEl.volume = 0;
                audioEl.play().then(() => {
                    audioEl.pause();
                    audioEl.currentTime = 0;
                    audioEl.volume = prevVolume;
                }).catch(() => { audioEl.volume = prevVolume; });
            }
        } catch { /* ignore */ }
        remove();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const remove = () => events.forEach(e => window.removeEventListener(e, unlock));
    events.forEach(e => window.addEventListener(e, unlock, { once: false, passive: true }));
    return remove;
}
