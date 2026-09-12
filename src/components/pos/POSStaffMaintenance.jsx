import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert, Hash, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';

/**
 * One-off staff maintenance.
 *
 * These are migrations rather than settings — run once, then largely forgotten.
 * They live here because the alternative is asking an owner to call a backend
 * function by hand, and the PIN migration in particular should not wait: until
 * it runs, any plaintext PIN is readable from the POS console by anyone who
 * opens developer tools.
 */
export default function POSStaffMaintenance({ restaurantId }) {
    const [pinResult, setPinResult] = useState(null);
    const [pinBusy, setPinBusy] = useState(false);
    const [numBusy, setNumBusy] = useState(false);
    const [numResult, setNumResult] = useState(null);

    const runPinMigration = async (dryRun) => {
        setPinBusy(true);
        try {
            const res = await base44.functions.invoke('posMigrateStaffPins', {
                restaurant_id: restaurantId,
                dry_run: dryRun,
            });
            const data = res?.data ?? res;
            if (data?.error) throw new Error(data.error);
            setPinResult({ ...data, dryRun });
            if (!dryRun) {
                toast.success(`${data.counts.migrated} PIN${data.counts.migrated === 1 ? '' : 's'} secured`);
            }
        } catch (e) {
            toast.error('Migration failed: ' + (e?.message || 'unknown error'));
        } finally {
            setPinBusy(false);
        }
    };

    const runNumberBackfill = async () => {
        setNumBusy(true);
        try {
            const res = await base44.functions.invoke('posAssignStaffNumber', {
                restaurant_id: restaurantId,
                action: 'backfill',
            });
            const data = res?.data ?? res;
            if (data?.error) throw new Error(data.error);
            setNumResult(data);
            toast.success(
                data.count === 0
                    ? 'Every staff member already has a unique number'
                    : `${data.count} staff number${data.count === 1 ? '' : 's'} assigned`,
            );
        } catch (e) {
            toast.error('Could not assign staff numbers: ' + (e?.message || 'unknown error'));
        } finally {
            setNumBusy(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    Staff Security &amp; Numbers
                </CardTitle>
                <CardDescription>One-off setup for PIN security and staff numbers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* ── PIN migration ─────────────────────────────────────────── */}
                <div className="space-y-3">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-xs text-amber-900">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold mb-0.5">Secure staff PINs</p>
                            <p>
                                PINs were stored as plain text, which meant anyone who opened developer tools on
                                the POS could read every colleague&rsquo;s PIN &mdash; managers included. This
                                converts them all to a secure one-way hash.
                                <strong> Nobody&rsquo;s PIN changes</strong> &mdash; staff carry on using the same digits.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => runPinMigration(true)} disabled={pinBusy}>
                            {pinBusy ? 'Checking…' : 'Preview'}
                        </Button>
                        <Button
                            onClick={() => runPinMigration(false)}
                            disabled={pinBusy}
                            className="bg-orange-500 hover:bg-orange-600 text-white"
                        >
                            {pinBusy ? 'Working…' : 'Secure All PINs'}
                        </Button>
                    </div>

                    {pinResult && (
                        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-xs space-y-1">
                            <p className="font-semibold text-gray-800">
                                {pinResult.dryRun ? 'Preview — nothing changed yet' : 'Done'}
                            </p>
                            <p className="text-gray-600">
                                {pinResult.counts.migrated} to secure · {pinResult.counts.already_hashed} already secure ·{' '}
                                {pinResult.counts.no_pin} with no PIN
                                {pinResult.counts.failed > 0 && ` · ${pinResult.counts.failed} failed`}
                            </p>
                            {pinResult.no_pin?.length > 0 && (
                                <p className="text-amber-700">
                                    No PIN set: {pinResult.no_pin.join(', ')} — they can log in without one, and
                                    cannot authorise anything for others.
                                </p>
                            )}
                            {pinResult.failed?.length > 0 && (
                                <p className="text-red-600">Failed: {pinResult.failed.join(', ')}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Staff numbers ─────────────────────────────────────────── */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold mb-0.5">Assign staff numbers</p>
                            <p>
                                Staff log in with a number and PIN. Numbers must be unique &mdash; a duplicate means
                                the wrong person can be signed in, and their sales, voids and discounts are recorded
                                against someone else. This gives a number to anyone missing one and renumbers
                                duplicates, keeping the longest-serving holder&rsquo;s number unchanged.
                            </p>
                        </div>
                    </div>

                    <Button variant="outline" onClick={runNumberBackfill} disabled={numBusy}>
                        <Hash className="h-4 w-4 mr-1.5" />
                        {numBusy ? 'Assigning…' : 'Assign Missing Staff Numbers'}
                    </Button>

                    {numResult && (
                        <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 text-xs">
                            {numResult.count === 0 ? (
                                <p className="text-green-700 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Everyone already has a unique number.
                                </p>
                            ) : (
                                <>
                                    <p className="font-semibold text-gray-800 mb-1">Assigned:</p>
                                    <ul className="space-y-0.5 text-gray-600">
                                        {numResult.assigned.map(a => (
                                            <li key={a.staff_id}>
                                                <strong>{a.full_name}</strong> → {a.now}
                                                {a.was ? ` (was ${a.was} — duplicate)` : ' (had none)'}
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-amber-700 mt-2">
                                        Tell these staff their new number — they need it to log in.
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
