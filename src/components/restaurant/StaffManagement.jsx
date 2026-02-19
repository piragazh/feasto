import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Users,
    Plus,
    Trash2,
    Mail,
    ShieldCheck,
    ChefHat,
    CreditCard,
    ToggleLeft,
    ToggleRight,
    Info,
    RefreshCw,
    CheckCircle2,
    Clock
} from 'lucide-react';
import { toast } from 'sonner';

const ROLE_CONFIG = {
    manager: {
        label: 'Manager',
        icon: ShieldCheck,
        color: 'bg-purple-100 text-purple-800',
        description: 'Full dashboard access — orders, menu, analytics, settings, staff.',
    },
    kitchen_staff: {
        label: 'Kitchen Staff',
        icon: ChefHat,
        color: 'bg-orange-100 text-orange-800',
        description: 'Can view incoming orders and update order status only.',
    },
    cashier: {
        label: 'Cashier',
        icon: CreditCard,
        color: 'bg-blue-100 text-blue-800',
        description: 'Access to POS system only.',
    },
};

export default function StaffManagement({ restaurantId }) {
    const queryClient = useQueryClient();
    const [showDialog, setShowDialog] = useState(false);
    const [form, setForm] = useState({ full_name: '', email: '', role: 'cashier', notes: '' });
    const [restaurant, setRestaurant] = useState(null);

    useEffect(() => {
        base44.entities.Restaurant.filter({ id: restaurantId }).then(r => {
            if (r.length) setRestaurant(r[0]);
        });
    }, [restaurantId]);

    const { data: staffMembers = [], isLoading } = useQuery({
        queryKey: ['staff-members', restaurantId],
        queryFn: () => base44.entities.StaffMember.filter({ restaurant_id: restaurantId }),
    });

    const createMutation = useMutation({
        mutationFn: async (data) => {
            // Create staff record
            const staff = await base44.entities.StaffMember.create({
                ...data,
                restaurant_id: restaurantId,
                invite_sent: false,
                onboarding_complete: false,
            });
            // Invite user to the app (so they can log in)
            await base44.users.inviteUser(data.email, 'user');
            // Send custom onboarding email with secure token
            await base44.functions.invoke('inviteStaff', {
                staff_member_id: staff.id,
                restaurant_name: restaurant?.name || '',
            });
            return staff;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['staff-members', restaurantId]);
            toast.success('Staff member invited — onboarding email sent');
            setShowDialog(false);
            setForm({ full_name: '', email: '', role: 'cashier', notes: '' });
        },
        onError: (err) => {
            toast.error(err.message || 'Failed to invite staff member');
        }
    });

    const resendInviteMutation = useMutation({
        mutationFn: async (member) => {
            await base44.functions.invoke('inviteStaff', {
                staff_member_id: member.id,
                restaurant_name: restaurant?.name || '',
            });
        },
        onSuccess: () => toast.success('Invite resent successfully'),
        onError: () => toast.error('Failed to resend invite'),
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }) => base44.entities.StaffMember.update(id, { is_active }),
        onSuccess: () => queryClient.invalidateQueries(['staff-members', restaurantId]),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.StaffMember.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['staff-members', restaurantId]);
            toast.success('Staff member removed');
        },
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.full_name || !form.email || !form.role) {
            toast.error('Please fill in all required fields');
            return;
        }
        createMutation.mutate(form);
    };

    return (
        <div className="space-y-6">
            {/* Role Permissions Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                        <Card key={key} className="border-dashed">
                            <CardContent className="p-4 flex gap-3 items-start">
                                <div className={`p-2 rounded-lg ${cfg.color}`}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm">{cfg.label}</p>
                                    <p className="text-xs text-gray-500 mt-1">{cfg.description}</p>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Staff List */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Staff Members ({staffMembers.length})
                    </CardTitle>
                    <Button onClick={() => setShowDialog(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Staff
                    </Button>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : staffMembers.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">No staff members yet</p>
                            <p className="text-sm text-gray-400 mt-1">Add your first staff member to get started</p>
                            <Button className="mt-4" onClick={() => setShowDialog(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Staff Member
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {staffMembers.map((member) => {
                                const cfg = ROLE_CONFIG[member.role];
                                const Icon = cfg?.icon || Users;
                                return (
                                    <div
                                        key={member.id}
                                        className={`flex items-center justify-between p-4 rounded-xl border ${!member.is_active ? 'opacity-50 bg-gray-50' : 'bg-white'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${cfg?.color || 'bg-gray-100'}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-sm">{member.full_name}</p>
                                                <p className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Mail className="h-3 w-3" />
                                                    {member.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            <Badge className={cfg?.color || 'bg-gray-100'}>
                                                {cfg?.label || member.role}
                                            </Badge>
                                            {member.onboarding_complete ? (
                                                <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Active
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-yellow-100 text-yellow-700 flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> Pending
                                                </Badge>
                                            )}
                                            {!member.onboarding_complete && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    title="Resend invite"
                                                    onClick={() => resendInviteMutation.mutate(member)}
                                                    disabled={resendInviteMutation.isPending}
                                                >
                                                    <RefreshCw className="h-4 w-4 text-blue-500" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => toggleActiveMutation.mutate({ id: member.id, is_active: !member.is_active })}
                                                title={member.is_active ? 'Deactivate' : 'Activate'}
                                            >
                                                {member.is_active
                                                    ? <ToggleRight className="h-5 w-5 text-green-500" />
                                                    : <ToggleLeft className="h-5 w-5 text-gray-400" />
                                                }
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => deleteMutation.mutate(member.id)}
                                                className="text-red-500 hover:text-red-700"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add Staff Dialog */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Staff Member</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                        <div className="space-y-2">
                            <Label>Full Name *</Label>
                            <Input
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                placeholder="e.g. John Smith"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Email Address *</Label>
                            <Input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="staff@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role *</Label>
                            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                                        <SelectItem key={key} value={key}>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{cfg.label}</span>
                                                <span className="text-xs text-gray-500">{cfg.description}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {form.role && (
                                <p className="text-xs text-gray-500 flex items-start gap-1 mt-1">
                                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                                    {ROLE_CONFIG[form.role]?.description}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Notes (optional)</Label>
                            <Input
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                placeholder="e.g. Part-time, weekends only"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending}>
                                {createMutation.isPending ? 'Sending Invite...' : 'Send Invite & Add'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}