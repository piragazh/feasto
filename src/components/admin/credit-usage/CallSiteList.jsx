import { GROUPS } from '@/lib/integration-credit-manifest';

const SURFACE_LABEL = {
  backend: 'Function',
  browser: 'Dashboard',
  both: 'Mixed',
};

function VolumePill({ volume }) {
  const tone = volume === 'High'
    ? 'bg-orange-100 text-orange-900'
    : volume === 'Medium'
      ? 'bg-amber-100 text-amber-900'
      : 'bg-gray-100 text-gray-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {volume}
    </span>
  );
}

export default function CallSiteList({ sites, selectedId, onSelect }) {
  return (
    <div className="space-y-8">
      {GROUPS.map((group) => {
        const rows = sites.filter((s) => s.group === group.id);
        if (!rows.length) return null;
        return (
          <section key={group.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">{group.label}</h2>
              <span className="text-xs text-gray-600">
                {rows.length} {rows.length === 1 ? 'call site' : 'call sites'}
              </span>
            </div>
            <p className="mb-3 text-sm text-gray-600">{group.description}</p>

            <ul className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {rows.map((site) => {
                const selected = site.id === selectedId;
                return (
                  <li key={site.id} className="border-b border-gray-100 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelect(site.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        selected ? 'bg-orange-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{site.feature}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-600">
                            {SURFACE_LABEL[site.surface] || 'Function'} · {site.source}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-800">
                            {site.endpoint}
                          </span>
                          {!site.noCredits && <VolumePill volume={site.volume} />}
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs text-gray-600">{site.frequency}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}