import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, X, Delete } from 'lucide-react';

/**
 * Manager override prompt.
 *
 * Shown when a staff member attempts something their role doesn't allow. Rather
 * than blocking, the POS asks someone with the permission to authorise. Both
 * identities are recorded server-side.
 *
 * Blocking outright would be worse than useless during service: staff work
 * around it by borrowing a manager's PIN, which destroys attribution completely.
 * This way the action still happens, and the audit trail stays honest.
 *
 * Keypad rather than a text field — this is used on a touch terminal, often in a
 * hurry, and a numeric pad is faster and less error-prone than a keyboard.
 */
export default function ManagerOverrideDialog({
    open,
    onClose,
    onAuthorized,
    permission,
    permissionLabel,
    restaurantId,
    actingStaff,
    context,
    orderId,
    amount,
    terminal,
    isDark = true,
}) {
    const [step, setStep] = useState('number');   // 'number' | 'pin'
    const [staffNumber, setStaffNumber] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [checking, setChecking] = useState(false);
    const submittedRef = useRef(false);

    useEffect(() => {
        if (open) {
            setStep('number');
            setStaffNumber('');
            setPin('');
            setError('');
            setChecking(false);
            submittedRef.current = false;
        }
    }, [open]);

    if (!open) return null;

    const value = step === 'number' ? staffNumber : pin;
    const setValue = step === 'number' ? setStaffNumber : setPin;

    const press = (digit) => {
        setError('');
        if (value.length >= 6) return;
        const next = value + digit;
        setValue(next);
        // Auto-submit at 4 digits on the PIN step - the common case, and it saves
        // a tap during service.
        if (step === 'pin' && next.length === 4) {
            setTimeout(() => submit(next), 80);
        }
    };

    const backspace = () => { setError(''); setValue(value.slice(0, -1)); };

    const submit = async (pinValue = pin) => {
        if (step === 'number') {
            if (staffNumber.length < 3) { setError('Enter a staff number'); return; }
            setStep('pin');
            setError('');
            return;
        }
        if (submittedRef.current) return;
        submittedRef.current = true;
        setChecking(true);
        try {
            const res = await base44.functions.invoke('posAuthorizeAction', {
                restaurant_id: restaurantId,
                permission,
                staff_number: staffNumber,
                pin: pinValue,
                acting_staff_id: actingStaff?.id,
                acting_staff_name: actingStaff?.full_name,
                acting_staff_role: actingStaff?.role,
                context,
                order_id: orderId,
                amount,
                terminal,
            });
            const data = res?.data ?? res;
            if (data?.authorized) {
                onAuthorized?.(data.override, data.approver);
                onClose?.();
            } else {
                setError(data?.error || 'Not authorised');
                setPin('');
                submittedRef.current = false;
            }
        } catch (e) {
            setError('Could not check that — try again');
            setPin('');
            submittedRef.current = false;
        } finally {
            setChecking(false);
        }
    };

    const panel = isDark ? 'bg-[#151720] border-white/10' : 'bg-white border-gray-200';
    const text = isDark ? 'text-white' : 'text-gray-900';
    const sub = isDark ? 'text-gray-400' : 'text-gray-500';
    const keyCls = isDark
        ? 'bg-white/5 hover:bg-white/10 active:bg-white/20 text-white border border-white/10'
        : 'bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-900 border border-gray-200';

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
            <div className={`${panel} border rounded-2xl w-full max-w-sm p-5 shadow-2xl`}>
                <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-amber-400" />
                        <h3 className={`${text} font-bold text-base`}>Authorisation required</h3>
                    </div>
                    <button onClick={onClose} aria-label="Cancel" className={`${sub} hover:${text} h-8 w-8 flex items-center justify-center`}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <p className={`${sub} text-xs mb-1`}>
                    {actingStaff?.full_name || 'This user'} can&rsquo;t {permissionLabel || 'do this'}.
                </p>
                <p className={`${sub} text-xs mb-4`}>
                    Ask a manager to enter their staff number and PIN. Both names are recorded.
                </p>

                <div className={`mb-3 h-14 rounded-xl border flex items-center justify-center gap-2 ${isDark ? 'bg-black/30 border-white/10' : 'bg-gray-50 border-gray-200'}`}>
                    {step === 'number' ? (
                        <span className={`${text} text-2xl font-mono font-bold tracking-widest`}>
                            {staffNumber || <span className={sub}>Staff number</span>}
                        </span>
                    ) : (
                        <span className={`${text} text-2xl font-bold tracking-widest`}>
                            {'●'.repeat(pin.length) || <span className={`${sub} text-base font-normal`}>PIN</span>}
                        </span>
                    )}
                </div>

                {error && (
                    <p className="text-red-400 text-xs text-center mb-3" role="alert">{error}</p>
                )}

                <div className="grid grid-cols-3 gap-2">
                    {[1,2,3,4,5,6,7,8,9].map(d => (
                        <button key={d} onClick={() => press(String(d))} disabled={checking}
                            className={`h-14 rounded-xl text-xl font-bold ${keyCls} disabled:opacity-40`}>
                            {d}
                        </button>
                    ))}
                    <button onClick={backspace} disabled={checking}
                        className={`h-14 rounded-xl flex items-center justify-center ${keyCls} disabled:opacity-40`}>
                        <Delete className="h-5 w-5" />
                    </button>
                    <button onClick={() => press('0')} disabled={checking}
                        className={`h-14 rounded-xl text-xl font-bold ${keyCls} disabled:opacity-40`}>
                        0
                    </button>
                    <button onClick={() => submit()} disabled={checking || value.length === 0}
                        className="h-14 rounded-xl text-sm font-bold bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white disabled:opacity-40">
                        {checking ? '…' : step === 'number' ? 'Next' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
}
