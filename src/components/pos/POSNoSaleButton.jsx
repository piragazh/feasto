import React, { useState } from 'react';
import { DoorOpen, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { openCashDrawer } from '@/lib/printUtils';
import { base44 } from '@/api/base44Client';

/**
 * No Sale Button — opens the cash drawer without a sale and logs the action.
 * Shows a confirmation dialog before proceeding.
 */
export default function POSNoSaleButton({ restaurant, isDark, t }) {
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleConfirm = async () => {
        setLoading(true);
        try {
            // 1. Open the cash drawer
            await openCashDrawer(restaurant);

            // 2. Log the no-sale action
            const user = await base44.auth.me().catch(() => null);
            await base44.entities.DashboardActivity.create({
                user_email: user?.email || 'unknown',
                action: 'POS_NO_SALE',
                resource_type: 'Restaurant',
                resource_id: restaurant?.id || null,
                details: JSON.stringify({ description: 'No Sale — cash drawer opened', timestamp: new Date().toISOString() }),
                severity: 'warning',
            }).catch(() => {}); // Non-blocking — don't fail if logging fails

            toast.success('Cash drawer opened (No Sale logged)');
        } catch (e) {
            toast.error('Failed to open cash drawer: ' + (e?.message || 'Unknown error'));
        } finally {
            setLoading(false);
            setShowConfirm(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowConfirm(true)}
                className={`w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold border transition-colors ${
                    isDark
                        ? 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                        : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-700'
                }`}
            >
                <DoorOpen className="h-3.5 w-3.5" />
                No Sale
            </button>

            {/* Confirmation overlay */}
            {showConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
                    <div className={`${isDark ? 'bg-[#1a1d27] border-white/[0.1] text-white' : 'bg-white border-gray-200 text-gray-900'} border rounded-2xl p-5 w-80 shadow-2xl`}>
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0" />
                            <p className="font-bold text-sm">Open Cash Drawer?</p>
                        </div>
                        <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            This will open the cash drawer without a sale. The action will be recorded in the activity log.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                disabled={loading}
                                className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${isDark ? 'border-white/[0.1] text-gray-400 hover:bg-white/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="flex-1 py-2 rounded-xl text-xs font-semibold bg-yellow-500 hover:bg-yellow-600 text-white transition-colors flex items-center justify-center gap-1.5"
                            >
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DoorOpen className="h-3.5 w-3.5" />}
                                {loading ? 'Opening...' : 'Open Drawer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}