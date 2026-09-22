import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { allergenDisplay, STATE } from '@/lib/allergen-logic';

/**
 * The allergen line a customer sees, on the website and the kiosk.
 *
 * All three states are deliberately distinct, and the wording is the whole point:
 *
 *  - not provided  → says the information ISN'T AVAILABLE and to ask. It never
 *                    says the item is free of anything, because nobody has
 *                    checked. Every item in the live menu is in this state until
 *                    a restaurant fills it in, and silently showing them as
 *                    allergen-free would be dangerous.
 *  - none declared → someone checked and there are none of the 14, with the
 *                    cross-contamination caveat a shared kitchen requires.
 *  - declared      → the allergens, named in full.
 *
 * See src/lib/allergen-logic.js for the rule and its tests.
 */
export default function AllergenNotice({ item, compact = false, dark = false }) {
    const d = allergenDisplay(item);
    const notes = String(item?.allergen_notes || '').trim();

    if (d.state === STATE.NOT_PROVIDED) {
        return (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
                dark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                    <strong>Allergens:</strong> {d.message}
                </span>
            </div>
        );
    }

    if (d.state === STATE.NONE_DECLARED) {
        return (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
                dark ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
            }`}>
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{d.message}{notes ? ` ${notes}` : ''}</span>
            </div>
        );
    }

    return (
        <div className={`rounded-lg px-3 py-2 text-xs border ${
            dark ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
            <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                    <strong>Contains:</strong>{' '}
                    {compact ? d.labels.join(', ') : (
                        <span className="inline-flex flex-wrap gap-1 align-middle">
                            {d.labels.map(l => (
                                <span key={l} className={`px-1.5 py-0.5 rounded font-semibold ${
                                    dark ? 'bg-red-500/20' : 'bg-red-100'
                                }`}>{l}</span>
                            ))}
                        </span>
                    )}
                    {notes && <span className="block mt-1 opacity-90">{notes}</span>}
                    <span className="block mt-1 opacity-80">
                        Prepared in a kitchen that handles allergens, so traces are possible.
                    </span>
                </div>
            </div>
        </div>
    );
}
