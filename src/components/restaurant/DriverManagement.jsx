import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bike, Car, Truck, Phone, Mail, Star, Package, Clock, Plus, Edit, Trash2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { staffErrorMessage } from '@/lib/function-errors';

export default function DriverManagement({ restaurantId }) {
    const [editingDriver, setEditingDriver] = useState(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        vehicle_type: 'bike',
        is_available: true,
        hourly_rate: 12,
        per_mile_rate: 1.5,
        per_delivery_fee: 5,
    });
    const queryClient = useQueryClient();

    const { data: drivers = [], isLoading } = useQuery({
        queryKey: ['drivers', restaurantId],
        queryFn: async () => {
            // This restaurant's drivers only, via the server
            const response = await base44.functions.invoke('manageDrivers', { action: 'list', restaurantId });
            return (response?.data || response)?.drivers || [];
        },
    });

    const createDriverMutation = useMutation({
        mutationFn: async (driverData) => {
            // The server links an existing driver (same email) or creates a new one,
            // and only ever touches this restaurant's pay rates.
            const response = await base44.functions.invoke('manageDrivers', {
                action: 'addDriver',
                restaurantId,
                data: {
                    full_name: driverData.full_name,
                    phone: driverData.phone,
                    email: driverData.email,
                    vehicle_type: driverData.vehicle_type,
                    is_available: driverData.is_available,
                    hourly_rate: driverData.hourly_rate,
                    per_mile_rate: driverData.per_mile_rate,
                    per_delivery_fee: driverData.per_delivery_fee,
                },
            });
            const result = response?.data || response;

            // Brand-new driver: invite them so they can sign in to the driver app
            if (result?.created && driverData.email) {
                try {
                    await base44.users.inviteUser(driverData.email, "user");
                    toast.success('Invitation sent to driver email');
                } catch (error) {
                    console.log('Invitation error (user may already exist):', error.message);
                }
            }
            return result?.driver;
        },
        onError: (error) => {
            toast.error(staffErrorMessage(error, 'Failed to add driver'));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver added to your restaurant');
            setIsAddDialogOpen(false);
            resetForm();
        },
    });

    const updateDriverMutation = useMutation({
        mutationFn: async ({ id, data }) => {
            const response = await base44.functions.invoke('manageDrivers', {
                action: 'updateDriver',
                restaurantId,
                driverId: id,
                data: {
                    full_name: data.full_name,
                    phone: data.phone,
                    vehicle_type: data.vehicle_type,
                    is_available: data.is_available,
                    hourly_rate: data.hourly_rate || 0,
                    per_mile_rate: data.per_mile_rate || 0,
                    per_delivery_fee: data.per_delivery_fee || 0,
                },
            });
            return (response?.data || response)?.driver;
        },
        onError: (error) => {
            toast.error(staffErrorMessage(error, 'Failed to update driver'));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver updated successfully');
            setEditingDriver(null);
            resetForm();
        },
    });

    const deleteDriverMutation = useMutation({
        mutationFn: async (id) => {
            // The server unlinks the driver from this restaurant, and deletes the
            // profile only if this was their last restaurant.
            const response = await base44.functions.invoke('manageDrivers', {
                action: 'removeDriver',
                restaurantId,
                driverId: id,
            });
            return response?.data || response;
        },
        onError: (error) => {
            toast.error(staffErrorMessage(error, 'Failed to remove driver'));
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver removed from your restaurant');
        },
    });

    const resetForm = () => {
        setFormData({
            full_name: '',
            phone: '',
            email: '',
            vehicle_type: 'bike',
            is_available: true,
            hourly_rate: 12,
            per_mile_rate: 1.5,
            per_delivery_fee: 5,
        });
    };

    const handleSubmit = () => {
        if (!formData.full_name || !formData.phone || !formData.email) {
            toast.error('Please fill in all required fields (name, phone, email)');
            return;
        }

        if (editingDriver) {
            updateDriverMutation.mutate({ id: editingDriver.id, data: formData });
        } else {
            createDriverMutation.mutate(formData);
        }
    };

    const handleEdit = (driver) => {
        setEditingDriver(driver);
        const paymentConfig = driver.payment_config?.[restaurantId] || {};
        setFormData({
            full_name: driver.full_name,
            phone: driver.phone,
            email: driver.email || '',
            vehicle_type: driver.vehicle_type,
            is_available: driver.is_available,
            hourly_rate: paymentConfig.hourly_rate || 12,
            per_mile_rate: paymentConfig.per_mile_rate || 1.5,
            per_delivery_fee: paymentConfig.per_delivery_fee || 5,
            payment_config: driver.payment_config
        });
    };

    const handleDelete = (id) => {
        if (confirm('Remove this driver from your restaurant? They will no longer see your orders.')) {
            deleteDriverMutation.mutate(id);
        }
    };

    const getVehicleIcon = (type) => {
        switch (type) {
            case 'bike': return <Bike className="h-5 w-5" />;
            case 'scooter': return <Bike className="h-5 w-5" />;
            case 'car': return <Car className="h-5 w-5" />;
            default: return <Truck className="h-5 w-5" />;
        }
    };

    if (isLoading) {
        return <div className="text-center py-8">Loading drivers...</div>;
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold">Driver Management</h2>
                    <p className="text-sm text-gray-500 mt-1">Manage your delivery drivers</p>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Driver
                </Button>
            </div>

            {drivers.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-16">
                        <Bike className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-600 mb-2">No Drivers Yet</h3>
                        <p className="text-gray-500 mb-6">Add your first delivery driver to get started</p>
                        <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Driver
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {drivers.map((driver) => (
                        <Card key={driver.id}>
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-orange-100 rounded-full">
                                            {getVehicleIcon(driver.vehicle_type)}
                                        </div>
                                        <div>
                                            <CardTitle className="text-lg">{driver.full_name}</CardTitle>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant={driver.is_available ? 'default' : 'secondary'} className={driver.is_available ? 'bg-green-500' : 'bg-gray-400'}>
                                                    {driver.is_available ? 'Available' : 'Busy'}
                                                </Badge>
                                                <Badge variant="outline" className="capitalize">
                                                    {driver.vehicle_type}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Phone className="h-4 w-4" />
                                    <span>{driver.phone}</span>
                                </div>
                                {driver.email && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Mail className="h-4 w-4" />
                                        <span className="truncate">{driver.email}</span>
                                    </div>
                                )}
                                
                                <div className="pt-3 border-t space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600 flex items-center gap-1">
                                            <Star className="h-4 w-4 text-yellow-500" />
                                            Rating
                                        </span>
                                        <span className="font-semibold">{driver.rating?.toFixed(1) || '5.0'}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-600 flex items-center gap-1">
                                            <Package className="h-4 w-4" />
                                            Deliveries
                                        </span>
                                        <span className="font-semibold">{driver.total_deliveries || 0}</span>
                                    </div>
                                    {(() => {
                                        const config = driver.payment_config?.[restaurantId];
                                        if (!config) return null;
                                        return (
                                            <div className="bg-blue-50 p-2 rounded space-y-1">
                                                <div className="text-xs text-blue-700 font-medium mb-1">Pay Rates</div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-blue-600">Per Delivery:</span>
                                                    <span className="font-semibold text-blue-900">£{config.per_delivery_fee || 0}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-blue-600">Per Hour:</span>
                                                    <span className="font-semibold text-blue-900">£{config.hourly_rate || 0}</span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-blue-600">Per Mile:</span>
                                                    <span className="font-semibold text-blue-900">£{config.per_mile_rate || 0}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    {driver.current_order_id && (
                                        <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                                            <Clock className="h-3 w-3" />
                                            Currently on delivery
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-3">
                                    <Button
                                        onClick={() => handleEdit(driver)}
                                        variant="outline"
                                        className="flex-1"
                                        size="sm"
                                    >
                                        <Edit className="h-3 w-3 mr-1" />
                                        Edit
                                    </Button>
                                    <Button
                                        onClick={() => handleDelete(driver.id)}
                                        variant="destructive"
                                        size="sm"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit Driver Dialog */}
            <Dialog open={isAddDialogOpen || !!editingDriver} onOpenChange={(open) => {
                if (!open) {
                    setIsAddDialogOpen(false);
                    setEditingDriver(null);
                    resetForm();
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="full_name">Full Name *</Label>
                            <Input
                                id="full_name"
                                value={formData.full_name}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                placeholder="John Doe"
                            />
                        </div>
                        <div>
                            <Label htmlFor="phone">Phone Number *</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="+44 7123 456789"
                            />
                        </div>
                        <div>
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="driver@example.com"
                                disabled={!!editingDriver}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {editingDriver ? 'Cannot change email for existing drivers' : 'If driver exists, they will be added to your restaurant'}
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="vehicle_type">Vehicle Type</Label>
                            <Select
                                value={formData.vehicle_type}
                                onValueChange={(value) => setFormData({ ...formData, vehicle_type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="bike">🚲 Bike</SelectItem>
                                    <SelectItem value="scooter">🛵 Scooter</SelectItem>
                                    <SelectItem value="car">🚗 Car</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="is_available">Available for Deliveries</Label>
                            <Switch
                                id="is_available"
                                checked={formData.is_available}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_available: checked })}
                            />
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <h3 className="font-semibold text-sm">Payment Configuration</h3>
                            <p className="text-xs text-gray-500">Set all rates - driver will see earnings calculated for each method</p>
                            
                            <div>
                                <Label htmlFor="per_delivery_fee">Per Delivery Fee (£)</Label>
                                <Input
                                    id="per_delivery_fee"
                                    type="number"
                                    step="0.01"
                                    value={formData.per_delivery_fee}
                                    onChange={(e) => setFormData({ ...formData, per_delivery_fee: parseFloat(e.target.value) || 0 })}
                                    placeholder="5.00"
                                />
                            </div>

                            <div>
                                <Label htmlFor="hourly_rate">Hourly Rate (£)</Label>
                                <Input
                                    id="hourly_rate"
                                    type="number"
                                    step="0.01"
                                    value={formData.hourly_rate}
                                    onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                                    placeholder="12.00"
                                />
                            </div>

                            <div>
                                <Label htmlFor="per_mile_rate">Per Mile Rate (£)</Label>
                                <Input
                                    id="per_mile_rate"
                                    type="number"
                                    step="0.01"
                                    value={formData.per_mile_rate}
                                    onChange={(e) => setFormData({ ...formData, per_mile_rate: parseFloat(e.target.value) || 0 })}
                                    placeholder="1.50"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsAddDialogOpen(false);
                            setEditingDriver(null);
                            resetForm();
                        }}>
                            Cancel
                        </Button>
                        <Button onClick={handleSubmit} className="bg-orange-500 hover:bg-orange-600">
                            {editingDriver ? 'Update Driver' : 'Add Driver'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}