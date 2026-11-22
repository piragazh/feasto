import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

/**
 * Measured integration usage for the last 30 days.
 *
 * Only figures the app genuinely logs are returned: AI replies (AiUsageDay),
 * AI pictures (AiGenerationLog) and emails sent (MessageJob). Everything else in
 * the credit inventory is a call-site estimate, never a billed amount.
 */
export default function useCreditUsage() {
  return useQuery({
    queryKey: ['integration-credit-usage'],
    queryFn: async () => {
      const res = await base44.functions.invoke('integrationCreditUsage', {});
      return res?.data?.measured || null;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}