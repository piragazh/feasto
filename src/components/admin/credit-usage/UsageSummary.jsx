import CreditStatCard from './CreditStatCard';

const n = (v) => (Number(v) || 0).toLocaleString('en-GB');

export default function UsageSummary({ summary, measured, isLoading }) {
  const turns = measured?.ai_turns || {};
  const days = measured?.days || 30;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CreditStatCard
        title="Credit-consuming call sites"
        value={summary.callSites}
        details={[
          { label: 'Features', value: n(summary.sources) },
          { label: 'High volume', value: n(summary.highVolume) },
        ]}
        note="Written into the code today. An estimate of where credits can be spent, not a bill."
      />
      <CreditStatCard
        title={`AI replies, last ${days} days`}
        value={turns.total || 0}
        details={[
          { label: 'Website chat', value: n(turns.web_chat) },
          { label: 'WhatsApp', value: n(turns.whatsapp) },
        ]}
        note={isLoading ? 'Reading your AI usage log…' : 'Measured from your AI usage log. One credit per reply.'}
      />
      <CreditStatCard
        title={`AI pictures, last ${days} days`}
        value={measured?.pictures || 0}
        note={isLoading ? 'Reading your picture log…' : 'Measured from the Ad Creator picture log.'}
      />
      <CreditStatCard
        title={`Emails sent, last ${days} days`}
        value={measured?.emails || 0}
        note={isLoading ? 'Reading your message log…' : 'Measured from queued email jobs. One credit per email.'}
      />
    </div>
  );
}