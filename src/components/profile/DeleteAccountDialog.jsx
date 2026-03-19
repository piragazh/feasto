import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, ChevronRight, ArrowLeft, ShieldAlert } from 'lucide-react';

const DELETION_REASONS = [
    "I no longer use this service",
    "Privacy concerns",
    "Found a better alternative",
    "Too many emails/notifications",
    "Other",
];

export function DeleteAccountDialog({ open, onClose, userEmail }) {
    const [step, setStep] = useState(1);
    const [reason, setReason] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleClose = () => {
        setStep(1);
        setReason('');
        setConfirmText('');
        setIsDeleting(false);
        onClose();
    };

    const handleDelete = async () => {
        if (confirmText !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            return;
        }
        setIsDeleting(true);
        try {
            const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (users.length > 0) {
                await base44.asServiceRole.entities.User.delete(users[0].id);
            }

            const [favorites, loyaltyTransactions, orders] = await Promise.all([
                base44.asServiceRole.entities.Favorite.filter({ user_email: userEmail }),
                base44.asServiceRole.entities.LoyaltyTransaction.filter({ user_email: userEmail }),
                base44.asServiceRole.entities.Order.filter({ created_by: userEmail }),
            ]);

            await Promise.all([
                ...favorites.map(f => base44.asServiceRole.entities.Favorite.delete(f.id)),
                ...loyaltyTransactions.map(t => base44.asServiceRole.entities.LoyaltyTransaction.delete(t.id)),
                ...orders.map(o => base44.asServiceRole.entities.Order.update(o.id, {
                    created_by: 'deleted_user',
                    guest_email: userEmail,
                })),
            ]);

            toast.success('Account deleted successfully');
            setTimeout(() => base44.auth.logout(), 1000);
        } catch (error) {
            console.error('Delete account error:', error);
            toast.error('Failed to delete account. Please contact support.');
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-md">
                {step === 1 && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                                <ShieldAlert className="h-5 w-5" />
                                Delete Account
                            </DialogTitle>
                            <DialogDescription>
                                This action is permanent and cannot be undone.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-2">
                            <p className="text-sm font-semibold text-red-800 flex items-center gap-1">
                                <AlertTriangle className="h-4 w-4" /> What will be deleted:
                            </p>
                            <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                                <li>Your profile and personal information</li>
                                <li>Order history</li>
                                <li>Saved addresses</li>
                                <li>Favourites</li>
                                <li>Loyalty points and rewards</li>
                            </ul>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium">
                                Why are you deleting your account? <span className="text-gray-400 font-normal">(optional)</span>
                            </Label>
                            <div className="space-y-2">
                                {DELETION_REASONS.map(r => (
                                    <label key={r} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                                        <input
                                            type="radio"
                                            name="reason"
                                            value={r}
                                            checked={reason === r}
                                            onChange={() => setReason(r)}
                                            className="accent-red-600"
                                        />
                                        <span className="text-sm">{r}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button variant="outline" className="flex-1" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1 gap-1"
                                onClick={() => setStep(2)}
                            >
                                Continue <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}

                {step === 2 && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                                <Trash2 className="h-5 w-5" />
                                Final Confirmation
                            </DialogTitle>
                            <DialogDescription>
                                You're about to permanently delete <strong>{userEmail}</strong>. This cannot be reversed.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                            ⚠️ Once deleted, you will be immediately signed out and your account will be gone forever.
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-delete">
                                Type <span className="font-bold font-mono bg-gray-100 px-1 rounded">DELETE</span> to confirm
                            </Label>
                            <Input
                                id="confirm-delete"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="font-mono"
                                autoComplete="off"
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                className="flex-1 gap-1"
                                onClick={() => { setStep(1); setConfirmText(''); }}
                                disabled={isDeleting}
                            >
                                <ArrowLeft className="h-4 w-4" /> Go Back
                            </Button>
                            <Button
                                variant="destructive"
                                className="flex-1"
                                onClick={handleDelete}
                                disabled={confirmText !== 'DELETE' || isDeleting}
                            >
                                {isDeleting ? (
                                    <span className="flex items-center gap-2">
                                        <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Deleting…
                                    </span>
                                ) : 'Delete Account'}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}