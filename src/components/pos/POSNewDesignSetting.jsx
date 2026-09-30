import React, { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Sparkles } from 'lucide-react';
import { readNewDesign, writeNewDesign, NEW_DESIGN_EVENT } from '@/lib/posDesignV2';

/**
 * POS Settings card: turn the new POS design on or off FOR THIS TILL.
 * Per device on purpose - a restaurant can try it on one till first, and
 * "Back to classic design" in the new More menu undoes it instantly.
 */
export default function POSNewDesignSetting() {
    const [on, setOn] = useState(() => readNewDesign());
    useEffect(() => {
        const sync = () => setOn(readNewDesign());
        window.addEventListener(NEW_DESIGN_EVENT, sync);
        window.addEventListener('storage', sync);
        return () => { window.removeEventListener(NEW_DESIGN_EVENT, sync); window.removeEventListener('storage', sync); };
    }, []);

    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 flex items-start justify-between gap-6">
            <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <Sparkles className="h-5 w-5" />
                </div>
                <div>
                    <label htmlFor="pos-new-design" className="text-base font-bold text-gray-900 cursor-pointer">New POS design (beta)</label>
                    <p className="text-sm text-gray-600 mt-1 max-w-xl">
                        The redesigned POS, built for tablets and PCs. It changes <strong>this till only</strong>, and nothing
                        else - your menu, orders and settings stay the same. You can switch back any time from
                        <strong> More → Back to classic design</strong>.
                    </p>
                </div>
            </div>
            <Switch id="pos-new-design" checked={on} onCheckedChange={(v) => setOn(writeNewDesign(v))} />
        </div>
    );
}
