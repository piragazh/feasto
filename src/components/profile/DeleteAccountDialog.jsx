import React, { useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

export function DeleteAccountDialog({ open, onClose, userEmail }) {
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (confirmText !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            return;
        }

        setIsDeleting(true);
        
        try {
            // Find and delete user record
            const users = await base44.asServiceRole.entities.User.filter({ email: userEmail });
            if (users.length > 0) {
                await base44.asServiceRole.entities.User.delete(users[0].id);
            }

            // Delete all user-related data
            const [favorites, addresses, loyaltyTransactions, orders] = await Promise.all([
                base44.asServiceRole.entities.Favorite.filter({ user_email: userEmail }),
                base44.asServiceRole.entities.User.filter({ email: userEmail }),
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
            
            // Logout and redirect
            setTimeout(() => {
                base44.auth.logout();
            }, 1000);
        } catch (error) {
            console.error('Delete account error:', error);
            toast.error('Failed to delete account. Please contact support.');
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onClose}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                        <Trash2 className="h-5 w-5" />
                        Delete Account
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                        <p>This action cannot be undone. This will permanently delete your account and remove all your data from our servers.</p>
                        <p className="font-semibold">This includes:</p>
                        <ul className="list-disc list-inside space-y-1 text-sm">
                            <li>Your profile and personal information</li>
                            <li>Order history</li>
                            <li>Saved addresses</li>
                            <li>Favorites</li>
                            <li>Loyalty points and rewards</li>
                        </ul>
                        <div className="pt-2">
                            <Label htmlFor="confirm-delete">Type <span className="font-bold">DELETE</span> to confirm</Label>
                            <Input
                                id="confirm-delete"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="mt-2"
                                autoComplete="off"
                            />
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={confirmText !== 'DELETE' || isDeleting}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}