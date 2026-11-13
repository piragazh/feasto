import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Sparkles, AlertTriangle } from 'lucide-react';

/**
 * Each store has a weekly allowance of AI pictures, set by MealDrop
 * (Restaurant.ai_pictures_per_week). All AI pictures in the Ad Creator go
 * through the aiGenerate function, which checks and records the allowance.
 */

export const allowanceKey = (restaurantId) => ['ai-allowance', restaurantId];

export function useAiAllowance(restaurantId) {
    return useQuery({
        queryKey: allowanceKey(restaurantId),
        queryFn: async () => (await base44.functions.invoke('aiGenerate', { action: 'status', restaurant_id: restaurantId })).data,
        enabled: !!restaurantId,
        staleTime: 30000,
        retry: 1,
    });
}

/** True when this person can't make another AI picture this week. */
export const allowanceUsedUp = (a) => !!a && !a.exempt && a.remaining <= 0;

/**
 * Ask for 1–3 AI pictures. Returns { urls, note, status }.
 * Throws an Error with a plain-English message when the allowance is used up
 * or AI pictures are switched off (err.code = 'allowance_used' | 'ai_off').
 */
export async function generateAiPictures({ restaurantId, prompts, existingImageUrls = [], kind = 'menu_ad' }) {
    try {
        const res = await base44.functions.invoke('aiGenerate', {
            action: 'image', restaurant_id: restaurantId, prompts, existing_image_urls: existingImageUrls, kind,
        });
        const data = res.data || {};
        return { urls: Array.isArray(data.urls) ? data.urls : [], note: data.note || '', error: data.error || '', status: data.status || null };
    } catch (e) {
        const data = e?.response?.data || e?.data || {};
        const err = new Error(data.error || e?.message || 'The picture could not be made');
        err.code = data.code || '';
        err.status = data.status || null;
        throw err;
    }
}

/** Call after a generation so every allowance badge on the page updates. */
export function useRefreshAllowance(restaurantId) {
    const queryClient = useQueryClient();
    return (status) => {
        if (status) queryClient.setQueryData(allowanceKey(restaurantId), status);
        else queryClient.invalidateQueries({ queryKey: allowanceKey(restaurantId) });
    };
}

const resetDay = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Monday';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'short' }).format(d);
};

/** "3 of 5 AI pictures left this week" — shown wherever AI pictures can be made. */
export function AiAllowanceBadge({ restaurantId, className = '' }) {
    const { data: a } = useAiAllowance(restaurantId);
    if (!a) return null;
    if (a.exempt) {
        return (
            <p className={`text-[11px] text-gray-400 ${className}`} data-testid="ai-allowance">
                Admin: you are not limited. This store has used {a.used} of {a.limit} AI pictures this week.
            </p>
        );
    }
    if (a.limit === 0) {
        return (
            <p className={`text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5 flex gap-2 ${className}`} data-testid="ai-allowance">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                AI pictures are switched off for this store. You can still use your own photos. Contact MealDrop to turn them on.
            </p>
        );
    }
    if (a.remaining <= 0) {
        return (
            <p className={`text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5 flex gap-2 ${className}`} data-testid="ai-allowance">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>You've used all {a.limit} AI pictures for this week. More are added on {resetDay(a.resets_at)}. You can still use your own photos.</span>
            </p>
        );
    }
    return (
        <p className={`text-xs text-gray-600 flex items-center gap-1.5 ${className}`} data-testid="ai-allowance">
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
            <span><strong>{a.remaining} of {a.limit}</strong> AI pictures left this week</span>
        </p>
    );
}
