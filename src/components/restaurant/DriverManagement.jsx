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
import { Bike, Car, Truck, Phone, Mail, Star, Package, Clock, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function DriverManagement({ restaurantId }) {
    const [editingDriver, setEditingDriver] = useState(null);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [formData, setFormData] = useState({
        full_name: '',
        phone: '',
        email: '',
        vehicle_type: 'bike',
        is_available: true,
    });
    const queryClient = useQueryClient();

    const { data: drivers = [], isLoading } = useQuery({
        queryKey: ['drivers', restaurantId],
        queryFn: async () => {
            const allDrivers = await base44.entities.Driver.list();
            return allDrivers;
        },
    });

    const createDriverMutation = useMutation({
        mutationFn: (driverData) => base44.entities.Driver.create(driverData),
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver added successfully');
            setIsAddDialogOpen(false);
            resetForm();
        },
    });

    const updateDriverMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.Driver.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver updated successfully');
            setEditingDriver(null);
            resetForm();
        },
    });

    const deleteDriverMutation = useMutation({
        mutationFn: (id) => base44.entities.Driver.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries(['drivers']);
            toast.success('Driver removed');
        },
    });

    const resetForm = () => {
        setFormData({
            full_name: '',
            phone: '',
            email: '',
            vehicle_type: 'bike',
            is_available: true,
        });
    };

    const handleSubmit = () => {
        if (!formData.full_name || !formData.phone) {
            toast.error('Please fill in required fields');
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
        setFormData({
            full_name: driver.full_name,
            phone: driver.phone,
            email: driver.email || '',
            vehicle_type: driver.vehicle_type,
            is_available: driver.is_available,
        });
    };

    const handleDelete = (id) => {
        if (confirm('Are you sure you want to remove this driver?')) {
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
                            <Label htmlFor="email">Email (Optional)</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="driver@example.com"
                            />
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