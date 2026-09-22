import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Clock, Coffee, LogIn, LogOut, Loader2 } from 'lucide-react';
import { getStaffSessionToken } from '@/lib/posStaffSession';

/**
 * Time clock for the staff member currently signed in to the till.
 *
 * It acts on WHOEVER IS SIGNED IN - there is no "choose a name" option. That is
 * the point: to clock someone in, they sign in with their own PIN, which is what
 * stops a colleague clocking in a friend who is still on their way.
 */
export default function POSTimeClock({ restaurantId, activeStaffMember, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        text:  isDark ? 'text-white' : 'text-gray-900',
        sub:   isDark ? 'text-gray-400' : 'text-gray-500',
        btn:   isDark ? 'bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10' : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-200',
    };
    const qc = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [, forceTick] = useState(0);

    // Keep the running shift length current without refetching.
    useEffect(() => {
        const id = setInterval(() => forceTick(n => n + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const call = async (action) => {
        const res = await base44.functions.invoke('posTimeClock', {
            action, restaurant_id: restaurantId, staff_session: getStaffSessionToken(restaurantId),
        });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const key = ['time-clock', restaurantId, activeStaffMember?.id];
    const { data, isLoading } = useQuery({
        queryKey: key,
        queryFn: () => call('status'),
        enabled: !!restaurantId && !!activeStaffMember,
    });
    const entry = data?.entry || null;

    if (!activeStaffMember) {
        return (
            <div className={`${t.panel} border rounded-2xl p-4 flex items-center gap-3`}>
                <Clock className={`h-5 w-5 ${t.sub}`} />
                <p className={`${t.sub} text-sm`}>Sign in with your staff number and PIN to clock in or out.</p>
            </div>
        );
    }

    const act = async (action, msg) => {
        setBusy(true);
        try {
            await call(action);
            await qc.invalidateQueries({ queryKey: key });
            toast.success(msg);
        } catch (e) {
            toast.error(e?.message || 'Could not update your timesheet');
        } finally {
            setBusy(false);
        }
    };

    const since = (iso) => {
        const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
        return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
    };

    return (
        <div className={`${t.panel} border rounded-2xl p-4 space-y-3`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Clock className="h-5 w-5 text-orange-400 flex-shrink-0" />
                    <div className="min-w-0">
                        <p className={`${t.text} font-bold truncate`}>{activeStaffMember.full_name}</p>
                        <p className={`${t.sub} text-xs`}>
                            {isLoading ? 'Checking…'
                                : !entry ? 'Not clocked in'
                                : entry.on_break_since ? `On break · ${since(entry.on_break_since)}`
                                : `Clocked in · ${since(entry.clock_in)}`}
                        </p>
                    </div>
                </div>
                {busy && <Loader2 className={`h-5 w-5 animate-spin ${t.sub}`} />}
            </div>

            {!isLoading && !entry && (
                <button disabled={busy} onClick={() => act('clock_in', 'Clocked in')}
                    className="h-14 w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                    <LogIn className="h-5 w-5" /> Clock in
                </button>
            )}

            {!isLoading && entry && (
                <div className="grid grid-cols-2 gap-2">
                    {entry.on_break_since ? (
                        <button disabled={busy} onClick={() => act('break_end', 'Break ended')}
                            className={`h-14 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ${t.btn}`}>
                            <Coffee className="h-5 w-5" /> End break
                        </button>
                    ) : (
                        <button disabled={busy} onClick={() => act('break_start', 'Break started')}
                            className={`h-14 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40 ${t.btn}`}>
                            <Coffee className="h-5 w-5" /> Start break
                        </button>
                    )}
                    <button disabled={busy} onClick={() => act('clock_out', 'Clocked out')}
                        className="h-14 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                        <LogOut className="h-5 w-5" /> Clock out
                    </button>
                </div>
            )}
        </div>
    );
}
