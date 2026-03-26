/**
 * Acknowledge Digest Modal
 * 
 * Simple form to acknowledge/review a digest snapshot
 */

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AcknowledgeDigestModal({ snapshot, open, onClose, onAcknowledged }) {
  const [note, setNote] = useState('');
  const [recurringConcern, setRecurringConcern] = useState(false);
  const [actionTaken, setActionTaken] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await base44.functions.invoke('acknowledgeDigestSnapshot', {
        snapshot_id: snapshot.id,
        note: note || null,
        action_taken: actionTaken,
        recurring_concern: recurringConcern
      });

      toast.success('Digest acknowledged');
      setNote('');
      setRecurringConcern(false);
      setActionTaken(null);
      onAcknowledged();
      onClose();
    } catch (error) {
      toast.error('Failed to acknowledge: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Acknowledge Digest Review</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Critical count */}
          {snapshot?.critical_item_count > 0 && (
            <div className="p-3 bg-red-50 rounded border border-red-200">
              <p className="text-xs font-semibold text-red-900">
                🚨 {snapshot.critical_item_count} critical item(s) in this digest
              </p>
            </div>
          )}

          {/* Note field */}
          <div>
            <Label className="text-xs font-semibold">Review Note (optional)</Label>
            <Textarea
              placeholder="What did you review? Any actions taken?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-2 text-xs h-20"
            />
          </div>

          {/* Actions dropdown */}
          <div>
            <Label className="text-xs font-semibold">Action Taken</Label>
            <select
              value={actionTaken || ''}
              onChange={(e) => setActionTaken(e.target.value || null)}
              className="w-full mt-2 text-xs border border-gray-300 rounded px-2 py-1.5"
            >
              <option value="">None / Still investigating</option>
              <option value="contacted_manager">Contacted store manager</option>
              <option value="escalated">Escalated to owner</option>
              <option value="no_action">No action needed</option>
            </select>
          </div>

          {/* Recurring concern */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="recurring"
              checked={recurringConcern}
              onCheckedChange={setRecurringConcern}
            />
            <Label htmlFor="recurring" className="text-xs cursor-pointer">
              This is a recurring concern (monitor in future digests)
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading} size="sm">
            Cancel
          </Button>
          <Button onClick={handleAcknowledge} disabled={loading} size="sm">
            {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}