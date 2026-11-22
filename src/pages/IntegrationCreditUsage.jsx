import { useState } from 'react';
import { Coins, ShieldAlert } from 'lucide-react';
import { CALL_SITES, CREDIT_SITES, DIRECT_APIS, summarise } from '@/lib/integration-credit-manifest';
import CallSiteList from '@/components/admin/credit-usage/CallSiteList';
import CallSiteDetail from '@/components/admin/credit-usage/CallSiteDetail';
import UsageSummary from '@/components/admin/credit-usage/UsageSummary';
import useCreditUsage from '@/components/admin/credit-usage/useCreditUsage';

export default function IntegrationCreditUsage() {
  const [selectedId, setSelectedId] = useState(CREDIT_SITES[0]?.id || null);
  const { data: measured, isLoading } = useCreditUsage();
  const summary = summarise();
  const selected = CALL_SITES.find((s) => s.id === selectedId) || null;
  const stores = measured?.top_restaurants || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-orange-700">
            <Coins className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide">Admin</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Integration credit usage
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
            Every place MealDrop calls a Base44 integration, which integration it uses and how often it
            fires. Figures are estimates from the code, measured from your logs where the app keeps a
            counter. Base44 does not expose a per-function bill here.
          </p>
        </header>

        <UsageSummary summary={summary} measured={measured} isLoading={isLoading} />

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <CallSiteList sites={CALL_SITES} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="lg:sticky lg:top-20 lg:self-start">
            <CallSiteDetail site={selected} measured={measured} />
          </div>
        </div>

        <div className={`mt-10 grid gap-6 ${stores.length ? 'lg:grid-cols-2' : ''}`}>
          {stores.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900">Busiest stores for AI ordering</h2>
              <p className="mt-1 text-sm text-gray-600">
                Measured AI replies in the last {measured?.days || 30} days.
              </p>
              <ul className="mt-4 space-y-2">
                {stores.map((store) => (
                  <li key={store.restaurant_id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-gray-900">{store.restaurant_name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-gray-900">
                      {store.ai_turns.toLocaleString('en-GB')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-gray-900">What does not use Base44 credits</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              These run on your own provider accounts and are billed by that provider, not by MealDrop's
              integration credits.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {DIRECT_APIS.map((api) => (
                <li key={api.name} className="rounded-xl bg-gray-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900">{api.name}</p>
                  <p className="text-xs text-gray-600">{api.usage} · billed by {api.billedBy}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}