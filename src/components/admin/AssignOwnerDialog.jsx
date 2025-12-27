import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';

export default function AssignOwnerDialog({ open, onClose, restaurant, users }) {
    const [assignmentType, setAssignmentType] = useState('existing');
    const [selectedUserId, setSelectedUserId] = useState('');
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');

    const queryClient = useQueryClient();

    useEffect(() => {
        if (open && restaurant) {
            const currentOwner = users.find(u => u.restaurant_id === restaurant.id);
            setSelectedUserId(currentOwner?.id || '');
            setAssignmentType('existing');
            setNewUserEmail('');
            setNewUserName('');
        }
    }, [open, restaurant, users]);

    const assignOwnerMutation = useMutation({
        mutationFn: async ({ userId, restaurantId }) => {
            return base44.auth.updateMe({ restaurant_id: restaurantId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['all-users']);
            toast.success('Owner assigned successfully');
            onClose();
        },
    });

    const inviteAndAssignMutation = useMutation({
        mutationFn: async ({ email, name, restaurantId }) => {
            await base44.users.inviteUser(email, 'user');
            // Note: After invitation, the user needs to log in and their restaurant_id needs to be set
            toast.success('User invited! They need to log in, then you can assign them.');
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['all-users']);
            onClose();
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (assignmentType === 'existing') {
            if (!selectedUserId) {
                toast.error('Please select a user');
                return;
            }
            assignOwnerMutation.mutate({
                userId: selectedUserId,
                restaurantId: restaurant.id
            });
        } else {
            if (!newUserEmail || !newUserName) {
                toast.error('Please fill in all fields');
                return;
            }
            inviteAndAssignMutation.mutate({
                email: newUserEmail,
                name: newUserName,
                restaurantId: restaurant.id
            });
        }
    };

    if (!restaurant) return null;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Assign Owner to {restaurant.name}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <RadioGroup value={assignmentType} onValueChange={setAssignmentType}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="existing" id="existing" />
                            <Label htmlFor="existing">Assign Existing User</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="new" id="new" />
                            <Label htmlFor="new">Invite New User</Label>
                        </div>
                    </RadioGroup>

                    {assignmentType === 'existing' ? (
                        <div>
                            <Label>Select User</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a user" />
                                </SelectTrigger>
                                <SelectContent>
                                    {users.map(user => (
                                        <SelectItem key={user.id} value={user.id}>
                                            {user.full_name || user.email} {user.restaurant_id ? '(Has restaurant)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <>
                            <div>
                                <Label>Email Address *</Label>
                                <Input
                                    type="email"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    placeholder="owner@example.com"
                                />
                            </div>
                            <div>
                                <Label>Full Name *</Label>
                                <Input
                                    value={newUserName}
                                    onChange={(e) => setNewUserName(e.target.value)}
                                    placeholder="John Doe"
                                />
                            </div>
                            <p className="text-xs text-gray-500">
                                Note: The user will be invited and need to log in before being fully assigned.
                            </p>
                        </>
                    )}

                    <div className="flex gap-3 justify-end">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button 
                            type="submit" 
                            className="bg-orange-500 hover:bg-orange-600"
                            disabled={assignOwnerMutation.isPending || inviteAndAssignMutation.isPending}
                        >
                            {assignmentType === 'existing' ? 'Assign' : 'Invite'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}