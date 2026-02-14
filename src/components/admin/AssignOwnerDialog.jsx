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
    const [currentManager, setCurrentManager] = useState(null);

    const queryClient = useQueryClient();

    useEffect(() => {
        const loadCurrentManager = async () => {
            if (open && restaurant) {
                const managers = await base44.entities.RestaurantManager.filter({});
                const manager = managers.find(m => m.restaurant_ids?.includes(restaurant.id));
                setCurrentManager(manager);
                setSelectedUserId('');
                setAssignmentType('existing');
                setNewUserEmail('');
                setNewUserName('');
            }
        };
        loadCurrentManager();
    }, [open, restaurant]);

    const assignOwnerMutation = useMutation({
        mutationFn: async ({ userId, restaurantId }) => {
            const userToAssign = users.find(u => u.id === userId);
            if (!userToAssign) {
                throw new Error('User not found');
            }

            const managerRecords = await base44.entities.RestaurantManager.filter({ user_email: userToAssign.email });
            if (managerRecords.length > 0) {
                const manager = managerRecords[0];
                const updatedRestaurantIds = [...new Set([...manager.restaurant_ids, restaurantId])];
                await base44.entities.RestaurantManager.update(manager.id, {
                    restaurant_ids: updatedRestaurantIds,
                    full_name: userToAssign.full_name || userToAssign.email,
                });
            } else {
                await base44.entities.RestaurantManager.create({
                    user_email: userToAssign.email,
                    full_name: userToAssign.full_name || userToAssign.email,
                    restaurant_ids: [restaurantId],
                });
            }
        },
        onMutate: async ({ userId, restaurantId }) => {
            // Optimistic update: update UI immediately
            const userToAssign = users.find(u => u.id === userId);
            if (userToAssign) {
                setCurrentManager({
                    user_email: userToAssign.email,
                    full_name: userToAssign.full_name || userToAssign.email,
                    restaurant_ids: [restaurantId]
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-managers']);
            queryClient.invalidateQueries(['all-users']);
            toast.success('Manager assigned successfully');
            onClose();
        },
        onError: () => {
            // Revert optimistic update on error
            const loadCurrentManager = async () => {
                const managers = await base44.entities.RestaurantManager.filter({});
                const manager = managers.find(m => m.restaurant_ids?.includes(restaurant.id));
                setCurrentManager(manager);
            };
            loadCurrentManager();
        }
    });

    const inviteAndAssignMutation = useMutation({
        mutationFn: async ({ email, name, restaurantId }) => {
            await base44.users.inviteUser(email, 'user');
            // Note: After invitation, the user needs to log in and their restaurant_id needs to be set
            toast.success('User invited! They need to log in, then you can assign them.');
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-managers']);
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

    const removeOwnerMutation = useMutation({
        mutationFn: async ({ managerId, restaurantId }) => {
            const manager = await base44.entities.RestaurantManager.filter({ id: managerId });
            if (manager.length > 0) {
                const updatedRestaurantIds = manager[0].restaurant_ids.filter(id => id !== restaurantId);
                if (updatedRestaurantIds.length === 0) {
                    await base44.entities.RestaurantManager.delete(managerId);
                } else {
                    await base44.entities.RestaurantManager.update(managerId, {
                        restaurant_ids: updatedRestaurantIds,
                    });
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['restaurant-managers']);
            queryClient.invalidateQueries(['all-users']);
            toast.success('Owner removed successfully');
            onClose();
        },
    });

    const handleRemoveOwner = () => {
        if (currentManager && confirm('Remove this owner from the restaurant?')) {
            removeOwnerMutation.mutate({
                managerId: currentManager.id,
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

                {currentManager && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-900">Current Owner</p>
                                <p className="text-sm text-blue-700">{currentManager.full_name || currentManager.user_email}</p>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={handleRemoveOwner}
                                disabled={removeOwnerMutation.isPending}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                )}

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