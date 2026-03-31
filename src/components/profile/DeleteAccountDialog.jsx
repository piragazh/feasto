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
            const response = await base44.functions.invoke('deleteUserAccount', {});
            if (!response?.data?.success) {
                throw new Error(response?.data?.error || 'Deletion failed');
            }
            toast.success('Account deleted successfully');
            setTimeout(() => base44.auth.logout(), 1000);
        } catch (error) {
            console.error('Delete account error:', error);
            toast.error('Failed to delete account. Please contact support.');
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onClose}>
            <AlertDialogContent className="max-w-sm mx-auto">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                        Delete Account
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3 text-left">
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
                                className="mt-2 h-11"
                                autoComplete="off"
                                aria-label="Type DELETE to confirm account deletion"
                            />
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                    <AlertDialogCancel disabled={isDeleting} className="h-11">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        disabled={confirmText !== 'DELETE' || isDeleting}
                        className="bg-red-600 hover:bg-red-700 h-11"
                    >
                        {isDeleting ? 'Deleting...' : 'Delete Account'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}