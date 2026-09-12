import React, { useState } from 'react';
import { UtensilsCrossed, Delete } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cacheStaffPin, getCachedStaffPin } from './POSOfflineDB';
import { saveStaffSession } from '@/lib/posStaffSession';

async function computePinHash(staffId, pin, restaurantId) {
    const data = new TextEncoder().encode(`${staffId}:${pin}:${restaurantId}`);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ROLES = {
    waiter:        { label: 'Waiter',        color: 'bg-blue-500' },
    cashier:       { label: 'Cashier',       color: 'bg-green-500' },
    kitchen_staff: { label: 'Kitchen Staff', color: 'bg-orange-500' },
    manager:       { label: 'Manager',       color: 'bg-purple-500' },
};

function PinPad({ onDigit, onBackspace, onSubmit, pin, isDark }) {
    const t = {
        btn:    isDark ? 'bg-white/5 hover:bg-white/10 border border-white/[0.08] text-white' : 'bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-900',
        submit: 'bg-orange-500 hover:bg-orange-600 text-white border border-orange-500',
        del:    isDark ? 'bg-white/5 hover:bg-red-500/20 border border-white/[0.08] text-gray-400 hover:text-red-400' : 'bg-gray-100 hover:bg-red-50 border border-gray-200 text-gray-500 hover:text-red-500',
    };
    const digits = ['1','2','3','4','5','6','7','8','9'];
    return (
        <div className="space-y-2 w-full max-w-[200px]">
            {/* PIN dots */}
            <div className="flex justify-center gap-3 mb-4">
                {[0,1,2,3].map(i => (
                    <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                        i < pin.length
                            ? 'bg-orange-500 border-orange-500 scale-110'
                            : isDark ? 'border-gray-600' : 'border-gray-300'
                    }`} />
                ))}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-3 gap-2">
                {digits.map(d => (
                    <button key={d} onClick={() => onDigit(d)} disabled={pin.length >= 4}
                        className={`h-14 rounded-xl text-xl font-bold transition-all active:scale-95 ${t.btn}`}>
                        {d}
                    </button>
                ))}
                <button onClick={onBackspace}
                    className={`h-14 rounded-xl flex items-center justify-center transition-all active:scale-95 ${t.del}`}>
                    <Delete className="h-5 w-5" />
                </button>
                <button onClick={() => onDigit('0')} disabled={pin.length >= 4}
                    className={`h-14 rounded-xl text-xl font-bold transition-all active:scale-95 ${t.btn}`}>
                    0
                </button>
                <button onClick={onSubmit} disabled={pin.length < 4}
                    className={`h-14 rounded-xl text-base font-bold transition-all active:scale-95 disabled:opacity-30 ${t.submit}`}>
                    ✓
                </button>
            </div>
        </div>
    );
}

export default function POSStaffLogin({ staffList, restaurant, isDark, onLogin, onSkip }) {
    /**
     * Login mode.
     *
     * 'number' (default) — staff type their number then their PIN. Nothing on
     *   screen identifies who works here until both are correct, and it scales
     *   past the dozen or so people a name grid can show.
     * 'list' — the original name grid. Kept for very small teams where picking a
     *   face is genuinely faster, and as a fallback if someone forgets a number.
     */
    const [mode, setMode] = useState('number');
    const [staffNumber, setStaffNumber] = useState('');
    const [numberStep, setNumberStep] = useState('number');   // 'number' | 'pin'
    const [selected, setSelected] = useState(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [verifying, setVerifying] = useState(false);

    const activeStaff = staffList.filter(s => s.is_active);

    const handleSelect = (staff) => {
        setSelected(staff);
        setPin('');
        setError('');
    };

    const handleDigit = (d) => {
        if (pin.length < 4) {
            const next = pin + d;
            setPin(next);
            setError('');
            // Auto-submit when 4 digits entered
            if (next.length === 4) {
                setTimeout(() => verifyPin(next), 100);
            }
        }
    };

    const handleBackspace = () => {
        setPin(p => p.slice(0, -1));
        setError('');
    };

    /**
     * Verify by staff NUMBER.
     *
     * Deliberately does not look the number up in the local staff list first -
     * that list is fetched to the browser and doing so would confirm whether a
     * number exists before a PIN is entered. The server answers with a single
     * vague failure for both a wrong number and a wrong PIN.
     */
    const verifyByNumber = async (pinValue) => {
        setVerifying(true);
        setError('');
        try {
            const result = await base44.functions.invoke('posVerifyStaffPin', {
                staff_number: staffNumber,
                restaurant_id: restaurant?.id,
                pin: pinValue,
                terminal: typeof window !== 'undefined' ? window.location.search : undefined,
            });
            const data = result?.data ?? result;
            if (data?.valid) {
                if (data.pin_hash && data.staff) {
                    await cacheStaffPin(data.staff.id, data.staff.restaurant_id, data.pin_hash, data.staff);
                }
                saveStaffSession(data.staff?.restaurant_id || restaurant?.id, data.session, data.session_expires, data.staff);
                onLogin(data.staff);
            } else {
                setError(data?.error || 'Incorrect staff number or PIN');
                setPin('');
                if (data?.locked) { setNumberStep('number'); setStaffNumber(''); }
            }
        } catch (e) {
            // Offline: fall back to the cached hash for this staff number. The
            // cache is keyed by staff id, so we resolve the number locally here -
            // acceptable offline, where the alternative is nobody can log in.
            try {
                const match = (staffList || []).find(
                    st => String(st.staff_number || '').trim() === staffNumber.trim() && st.is_active !== false,
                );
                if (!match) { setError('Incorrect staff number or PIN'); setPin(''); return; }
                const cached = await getCachedStaffPin(match.id);
                if (!cached) {
                    setError('Offline — this staff member must log in online once on this terminal first.');
                    setPin('');
                    return;
                }
                const entered = await computePinHash(match.id, pinValue, match.restaurant_id);
                if (entered === cached.pin_hash) {
                    onLogin(cached.staff_info);
                } else {
                    setError('Incorrect staff number or PIN');
                    setPin('');
                }
            } catch {
                setError('Could not verify — try again');
                setPin('');
            }
        } finally {
            setVerifying(false);
        }
    };

    const verifyPin = async (p = pin) => {
        if (!selected || verifying) return;
        // No PIN set on the staff record — allow login without verification
        if (!selected.pin) {
            onLogin(selected);
            return;
        }
        setVerifying(true);
        setError('');

        // Offline fallback: verify against cached PIN hash
        if (!navigator.onLine) {
            try {
                const cached = await getCachedStaffPin(selected.id);
                if (!cached) {
                    setError('Offline — must log in online at least once on this terminal.');
                    setPin('');
                    return;
                }
                const enteredHash = await computePinHash(selected.id, p, selected.restaurant_id);
                if (enteredHash === cached.pin_hash) {
                    onLogin(cached.staff_info);
                } else {
                    setError('Incorrect PIN. Try again.');
                    setPin('');
                }
            } catch (e) {
                setError('Offline PIN verification failed.');
                setPin('');
            } finally {
                setVerifying(false);
            }
            return;
        }

        try {
            const result = await base44.functions.invoke('posVerifyStaffPin', {
                staff_id: selected.id,
                pin: p,
            });
            if (result?.data?.valid) {
                // Cache PIN hash for offline login on this terminal
                if (result.data.pin_hash) {
                    await cacheStaffPin(selected.id, selected.restaurant_id, result.data.pin_hash, result.data.staff);
                }
                // Keep the signed session so privileged actions can prove who is
                // acting without re-prompting for a PIN every time.
                saveStaffSession(
                    result.data.staff?.restaurant_id || selected.restaurant_id,
                    result.data.session,
                    result.data.session_expires,
                    result.data.staff,
                );
                onLogin(result.data.staff);
            } else {
                setError(result?.data?.error || 'Incorrect PIN. Try again.');
                setPin('');
            }
        } catch (e) {
            // Network failure mid-request — try offline cache as fallback
            try {
                const cached = await getCachedStaffPin(selected.id);
                if (cached) {
                    const enteredHash = await computePinHash(selected.id, p, selected.restaurant_id);
                    if (enteredHash === cached.pin_hash) {
                        onLogin(cached.staff_info);
                        return;
                    }
                }
            } catch (_) { /* fall through to error */ }
            setError('Verification failed. Please try again.');
            setPin('');
        } finally {
            setVerifying(false);
        }
    };

    const t = {
        bg:      isDark ? 'bg-[#0c0e16]' : 'bg-gray-50',
        card:    isDark ? 'bg-[#151720] border-white/[0.08]' : 'bg-white border-gray-200',
        text:    isDark ? 'text-white' : 'text-gray-900',
        sub:     isDark ? 'text-gray-400' : 'text-gray-500',
        staffCard: isDark
            ? 'bg-[#1a1d27] border-white/[0.06] hover:border-orange-500/50 text-white'
            : 'bg-white border-gray-200 hover:border-orange-400 text-gray-900',
        staffCardSelected: 'border-orange-500 bg-orange-500/10',
        skip:    isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600',
        // Keypad keys for the staff-number login. Large and high-contrast: this
        // is tapped dozens of times a shift, often in a hurry.
        key:     isDark
            ? 'bg-white/5 hover:bg-white/10 active:bg-white/20 border border-white/10 text-white'
            : 'bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 text-gray-900',
    };

    return (
        <div className={`min-h-screen ${t.bg} flex flex-col items-center justify-center p-6`}>
            {/* Header */}
            <div className="text-center mb-8">
                {restaurant?.logo_url ? (
                    <img src={restaurant.logo_url} alt={restaurant.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3" />
                ) : (
                    <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-orange-500/30">
                        <UtensilsCrossed className="h-8 w-8 text-white" />
                    </div>
                )}
                <h1 className={`${t.text} text-2xl font-bold`}>{restaurant?.name || 'POS'}</h1>
                <p className={`${t.sub} text-sm mt-1`}>
                    {selected ? `Enter PIN for ${selected.full_name}` : 'Who\'s working today?'}
                </p>
            </div>

            {mode === 'number' && !selected ? (
                /* ── Staff number + PIN ────────────────────────────────────────
                   Default because it reveals nothing before authentication and
                   works with any number of staff. */
                <div className="w-full max-w-xs">
                    <div className={`mb-4 h-16 rounded-2xl border flex items-center justify-center ${isDark ? 'bg-black/30 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                        {numberStep === 'number' ? (
                            <span className={`${t.text} text-3xl font-mono font-bold tracking-widest`}>
                                {staffNumber || <span className={`${t.sub} text-base font-sans font-normal tracking-normal`}>Staff number</span>}
                            </span>
                        ) : (
                            <span className={`${t.text} text-3xl font-bold tracking-widest`}>
                                {'●'.repeat(pin.length) || <span className={`${t.sub} text-base font-normal tracking-normal`}>PIN</span>}
                            </span>
                        )}
                    </div>

                    {error && <p className="text-red-400 text-sm text-center mb-3" role="alert">{error}</p>}

                    <div className="grid grid-cols-3 gap-2">
                        {[1,2,3,4,5,6,7,8,9].map(d => (
                            <button
                                key={d}
                                disabled={verifying}
                                onClick={() => {
                                    setError('');
                                    if (numberStep === 'number') {
                                        if (staffNumber.length < 6) setStaffNumber(staffNumber + d);
                                    } else {
                                        const next = pin + d;
                                        if (next.length <= 6) {
                                            setPin(next);
                                            // 4 digits is the common case - submit without an extra tap.
                                            if (next.length === 4) setTimeout(() => verifyByNumber(next), 80);
                                        }
                                    }
                                }}
                                className={`h-16 rounded-2xl text-2xl font-bold ${t.key} disabled:opacity-40`}
                            >
                                {d}
                            </button>
                        ))}
                        <button
                            disabled={verifying}
                            onClick={() => {
                                setError('');
                                if (numberStep === 'number') setStaffNumber(staffNumber.slice(0, -1));
                                else if (pin.length > 0) setPin(pin.slice(0, -1));
                                else { setNumberStep('number'); }
                            }}
                            className={`h-16 rounded-2xl flex items-center justify-center ${t.key} disabled:opacity-40`}
                        >
                            <Delete className="h-6 w-6" />
                        </button>
                        <button
                            disabled={verifying}
                            onClick={() => {
                                setError('');
                                if (numberStep === 'number') { if (staffNumber.length < 6) setStaffNumber(staffNumber + '0'); }
                                else if (pin.length < 6) setPin(pin + '0');
                            }}
                            className={`h-16 rounded-2xl text-2xl font-bold ${t.key} disabled:opacity-40`}
                        >
                            0
                        </button>
                        <button
                            disabled={verifying || (numberStep === 'number' ? staffNumber.length < 3 : pin.length === 0)}
                            onClick={() => {
                                if (numberStep === 'number') { setNumberStep('pin'); setError(''); }
                                else verifyByNumber(pin);
                            }}
                            className="h-16 rounded-2xl text-base font-bold bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white disabled:opacity-40"
                        >
                            {verifying ? '…' : numberStep === 'number' ? 'Next' : 'Enter'}
                        </button>
                    </div>

                    <div className="flex items-center justify-center gap-4 mt-5">
                        <button
                            onClick={() => { setMode('list'); setError(''); setPin(''); setStaffNumber(''); setNumberStep('number'); }}
                            className={`text-xs underline ${t.skip}`}
                        >
                            Pick from a list instead
                        </button>
                        {onSkip && (
                            <button onClick={onSkip} className={`text-xs underline ${t.skip}`}>
                                Continue as manager
                            </button>
                        )}
                    </div>
                </div>
            ) : !selected ? (
                /* Staff picker */
                <div className="w-full max-w-2xl">
                    {activeStaff.length === 0 ? (
                        <div className="text-center py-12">
                            <p className={`${t.sub} text-sm`}>No active staff members found.</p>
                            <button onClick={onSkip} className={`mt-4 text-xs underline ${t.skip}`}>
                                Continue as manager
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {activeStaff.map(s => {
                                const roleInfo = ROLES[s.role] || { label: s.role, color: 'bg-gray-500' };
                                const initials = s.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                                return (
                                    <button key={s.id} onClick={() => handleSelect(s)}
                                        className={`${t.staffCard} border rounded-2xl p-4 flex flex-col items-center gap-3 transition-all active:scale-95`}>
                                        <div className={`w-14 h-14 ${roleInfo.color} rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg`}>
                                            {initials}
                                        </div>
                                        <div className="text-center">
                                            <p className="font-semibold text-sm leading-tight">{s.full_name.split(' ')[0]}</p>
                                            {s.staff_number && (
                                                <p className={`${t.sub} text-[11px] font-mono mt-0.5`}>{s.staff_number}</p>
                                            )}
                                            <p className={`text-[11px] mt-1 ${t.sub}`}>{roleInfo.label}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div className="text-center mt-6">
                        <button onClick={onSkip} className={`text-xs ${t.skip} transition-colors`}>
                            Skip — continue without logging in
                        </button>
                    </div>
                </div>
            ) : (
                /* PIN entry */
                <div className={`${t.card} border rounded-2xl p-6 flex flex-col items-center gap-4 w-full max-w-xs`}>
                    {/* Selected staff avatar */}
                    <div className="flex flex-col items-center gap-2">
                        <div className={`w-16 h-16 ${ROLES[selected.role]?.color || 'bg-gray-500'} rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg`}>
                            {selected.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <p className={`${t.text} font-bold`}>{selected.full_name}</p>
                        {selected.staff_number && (
                            <p className={`${t.sub} text-xs font-mono`}>{selected.staff_number}</p>
                        )}
                    </div>

                    {!selected.pin ? (
                        /* No PIN set — just confirm */
                        <div className="text-center space-y-3 w-full">
                            <p className={`${t.sub} text-sm`}>No PIN set — tap to continue</p>
                            <button onClick={() => onLogin(selected)}
                                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all active:scale-95">
                                Log In
                            </button>
                        </div>
                    ) : (
                        <PinPad pin={pin} onDigit={handleDigit} onBackspace={handleBackspace} onSubmit={() => verifyPin()} isDark={isDark} />
                    )}

                    {error && (
                        <p className="text-red-400 text-xs text-center font-medium">{error}</p>
                    )}

                    <button onClick={() => setSelected(null)} className={`text-xs ${t.skip} transition-colors`}>
                        ← Back
                    </button>
                </div>
            )}
        </div>
    );
}