/**
 * Digest Snapshot History
 * 
 * Shows recent digest snapshots and acknowledgement status
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import AcknowledgeDigestModal from './AcknowledgeDigestModal';

export default function DigestSnapshotHistory({ scope = 'portfolio', scopeId = null }) {
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [ackModalOpen, setAckModalOpen] = useState(false);

  const query = scope === 'portfolio'
    ? { scope: 'portfolio' }
    : { scope: 'restaurant', scope_id: scopeId };

  const { data: snapshots = [], refetch } = useQuery({
    queryKey: ['digest-snapshots', scope, scopeId],
    queryFn: () => base44.entities.DigestSnapshot.filter(query, '-timestamp', 10)
  });

  if (snapshots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p>No digest snapshots yet</p>
      </div>
    );
  }

  const sorted = [...snapshots].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="space-y-3">
      {sorted.map((snap) => {
        const isOld = (new Date() - new Date(snap.timestamp)) > 24 * 60 * 60 * 1000;
        const isCritical = snap.critical_item_count > 0;
        const isUnacked = !snap.acknowledged;

        return (
          <Card key={snap.id} className={`border-0 shadow-sm ${isCritical && isUnacked ? 'bg-red-50 border border-red-200' : ''}`}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-gray-900">
                      {new Date(snap.timestamp).toLocaleString()}
                    </p>
                    {snap.critical_item_count > 0 && (
                      <Badge className="text-xs bg-red-100 text-red-800">
                        {snap.critical_item_count} critical
                      </Badge>
                    )}
                    {snap.worsening_item_count > 0 && (
                      <Badge className="text-xs bg-yellow-100 text-yellow-800">
                        {snap.worsening_item_count} worsening
                      </Badge>
                    )}
                    {snap.acknowledged ? (
                      <Badge className="text-xs bg-green-100 text-green-800 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Acked
                      </Badge>
                    ) : isCritical ? (
                      <Badge className="text-xs bg-red-100 text-red-800 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Needs Review
                      </Badge>
                    ) : null}
                  </div>

                  {snap.acknowledged && (
                    <div className="mt-2 text-xs text-gray-600">
                      <p>✅ Reviewed by {snap.acknowledged_by} at {new Date(snap.acknowledged_at).toLocaleString()}</p>
                      {snap.acknowledged_note && (
                        <p className="mt-1 italic">"{snap.acknowledged_note}"</p>
                      )}
                      {snap.recurring_concern && (
                        <p className="mt-1 text-orange-600 font-semibold">⚠️ Flagged as recurring</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedSnapshot(snap);
                      setAckModalOpen(true);
                    }}
                    className="text-xs h-7"
                    disabled={snap.acknowledged}
                  >
                    {snap.acknowledged ? '✓' : 'Ack'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(snap.plaintext_summary);
                      alert('Copied to clipboard');
                    }}
                    className="text-xs h-7"
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {selectedSnapshot && (
        <AcknowledgeDigestModal
          snapshot={selectedSnapshot}
          open={ackModalOpen}
          onClose={() => setAckModalOpen(false)}
          onAcknowledged={() => refetch()}
        />
      )}
    </div>
  );
}