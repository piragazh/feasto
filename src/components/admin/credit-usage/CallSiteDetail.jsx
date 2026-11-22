import { FileCode2, Info } from 'lucide-react';
import { INTEGRATION_ENDPOINTS } from '@/lib/integration-credit-manifest';

const MEASURED_LABEL = {
  web_chat: 'AI replies in website chat',
  whatsapp: 'AI replies on WhatsApp',
  pictures: 'AI pictures made',
  emails: 'Emails sent',
};

const SURFACE_LABEL = {
  backend: 'Backend function',
  browser: 'Dashboard (browser)',
  both: 'Browser and backend',
};

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default function CallSiteDetail({ site, measured }) {
  if (!site) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
        Pick an entry to see the function, the integration it calls and how often it fires.
      </div>
    );
  }

  const endpoint = INTEGRATION_ENDPOINTS[site.endpoint];
  const lines = site.lines || (site.line ? [site.line] : []);
  const measuredValue = site.measuredKey && measured ? measured[site.measuredKey] : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
        {site.noCredits ? 'No credit charge' : endpoint?.label || site.endpoint}
      </p>
      <h3 className="mt-1 text-lg font-semibold leading-tight text-gray-900">{site.feature}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {site.noCredits ? 'Uses storage, not integration credits.' : endpoint?.creditNote}
      </p>

      <dl className="mt-4">
        <Row label="Runs in">{SURFACE_LABEL[site.surface] || site.surface}</Row>
        <Row label="Source">{site.source}</Row>
        {site.model && site.model !== 'n/a' && <Row label="Model">{site.model}</Row>}
        <Row label="How often">{site.frequency}</Row>
        {!site.noCredits && <Row label="Volume">{site.volume}</Row>}
        {site.measuredKey && (
          <Row label={`Measured · ${MEASURED_LABEL[site.measuredKey] || 'last 30 days'}`}>
            {measuredValue == null
              ? <span className="text-gray-500">Not measured</span>
              : <span className="font-semibold">{measuredValue.toLocaleString('en-GB')}</span>}
          </Row>
        )}
      </dl>

      {site.note && (
        <div className="mt-4 flex gap-2 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          <p>{site.note}</p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
        <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <p className="break-all">
          {site.file}
          {lines.length > 0 && <span className="text-gray-500"> · line {lines.join(', ')}</span>}
        </p>
      </div>
    </div>
  );
}