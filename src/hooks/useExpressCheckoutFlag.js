/**
 * useExpressCheckoutFlag
 *
 * Reads the `express_checkout_enabled` SystemSettings record at runtime.
 * Returns `true` (enabled) by default if the record is missing or fetch fails —
 * so a missing config never silently disables checkout.
 *
 * To disable Express Checkout in production without a deploy:
 *   Update the SystemSettings record: { setting_key: "express_checkout_enabled", setting_value: "false" }
 *
 * Cache: React Query 60s stale-time — a flag change propagates within ~1 minute.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useExpressCheckoutFlag() {
    const { data, isLoading } = useQuery({
        queryKey: ['system-setting', 'express_checkout_enabled'],
        queryFn: async () => {
            const results = await base44.entities.SystemSettings.filter({
                setting_key: 'express_checkout_enabled'
            });
            return results?.[0] ?? null;
        },
        staleTime: 60_000,       // re-fetch at most once per minute
        gcTime: 5 * 60_000,
        // Never throw — a missing config defaults to enabled
        throwOnError: false,
    });

    // If still loading, optimistically show Express Checkout (avoids flicker on first render)
    if (isLoading) return true;

    // No record → default enabled
    if (!data) return true;

    // Explicit "false" string disables it; anything else keeps it enabled
    return data.setting_value !== 'false';
}