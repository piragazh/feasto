import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Plus, Edit, Trash2, Home, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import LocationPicker from '@/components/location/LocationPicker';

export default function AddressManager({ user, onUpdate }) {
    const [showDialog, setShowDialog] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [formData, setFormData] = useState({
        label: '',
        address: '',
        coordinates: null,
        instructions: ''
    });

    const savedAddresses = user.saved_addresses || [];

    const saveAddressMutation = useMutation({
        mutationFn: async (addressData) => {
            let updatedAddresses;
            if (editingAddress !== null) {
                updatedAddresses = [...savedAddresses];
                updatedAddresses[editingAddress] = addressData;
            } else {
                updatedAddresses = [...savedAddresses, addressData];
            }
            await base44.auth.updateMe({ saved_addresses: updatedAddresses });
        },
        onSuccess: () => {
            toast.success('Address saved');
            onUpdate();
            resetForm();
        },
    });

    const deleteAddressMutation = useMutation({
        mutationFn: async (index) => {
            const updatedAddresses = savedAddresses.filter((_, i) => i !== index);
            await base44.auth.updateMe({ saved_addresses: updatedAddresses });
        },
        onSuccess: () => {
            toast.success('Address deleted');
            onUpdate();
        },
    });

    const resetForm = () => {
        setFormData({
            label: '',
            address: '',
            coordinates: null,
            instructions: ''
        });
        setEditingAddress(null);
        setShowDialog(false);
    };

    const handleEdit = (address, index) => {
        setFormData(address);
        setEditingAddress(index);
        setShowDialog(true);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.label || !formData.address) {
            toast.error('Please fill in all required fields');
            return;
        }
        saveAddressMutation.mutate(formData);
    };

    const labelIcons = {
        Home: Home,
        Work: Briefcase,
        Other: MapPin
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Saved Addresses</h2>
                <Button onClick={() => setShowDialog(true)} className="bg-orange-500 hover:bg-orange-600">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                </Button>
            </div>

            {savedAddresses.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <MapPin className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-700 mb-2">No Saved Addresses</h3>
                        <p className="text-gray-500 mb-6">Add your frequently used addresses for faster checkout</p>
                        <Button onClick={() => setShowDialog(true)} className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Your First Address
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {savedAddresses.map((address, index) => {
                        const IconComponent = labelIcons[address.label] || MapPin;
                        return (
                            <Card key={index} className="hover:shadow-lg transition-shadow">
                                <CardContent className="p-6">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                                <IconComponent className="h-5 w-5 text-orange-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg">{address.label}</h3>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleEdit(address, index)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    if (confirm('Delete this address?')) {
                                                        deleteAddressMutation.mutate(index);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </div>
                                    <p className="text-gray-700 mb-2">{address.address}</p>
                                    {address.instructions && (
                                        <p className="text-sm text-gray-500">
                                            <strong>Instructions:</strong> {address.instructions}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={showDialog} onOpenChange={(open) => !open && resetForm()}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingAddress !== null ? 'Edit' : 'Add'} Address</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <Label>Address Label *</Label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                {['Home', 'Work', 'Other'].map((label) => (
                                    <Button
                                        key={label}
                                        type="button"
                                        variant={formData.label === label ? 'default' : 'outline'}
                                        onClick={() => setFormData({ ...formData, label })}
                                        className="w-full"
                                    >
                                        {label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Label>Address *</Label>
                            <LocationPicker
                                onLocationSelect={(locationData) => {
                                    setFormData({
                                        ...formData,
                                        address: locationData.address,
                                        coordinates: locationData.coordinates
                                    });
                                }}
                            />
                        </div>
                        <div>
                            <Label>Delivery Instructions</Label>
                            <Textarea
                                placeholder="E.g., Ring doorbell, leave at reception..."
                                value={formData.instructions}
                                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetForm}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-orange-500 hover:bg-orange-600">
                                {editingAddress !== null ? 'Update' : 'Save'} Address
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}