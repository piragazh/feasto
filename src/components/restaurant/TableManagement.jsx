import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';

export default function TableManagement({ restaurantId }) {
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [editingTable, setEditingTable] = useState(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: tables = [], isLoading } = useQuery({
        queryKey: ['restaurant-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId }),
    });

    const createMutation = useMutation({
        mutationFn: (data) => base44.entities.RestaurantTable.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] });
            setIsAddDialogOpen(false);
            toast.success('Table added successfully');
        },
        onError: () => toast.error('Failed to add table'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }) => base44.entities.RestaurantTable.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] });
            setIsEditDialogOpen(false);
            setEditingTable(null);
            toast.success('Table updated successfully');
        },
        onError: () => toast.error('Failed to update table'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => base44.entities.RestaurantTable.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['restaurant-tables', restaurantId] });
            toast.success('Table deleted');
        },
        onError: () => toast.error('Failed to delete table'),
    });

    const statusColors = {
        available: 'bg-green-500',
        occupied: 'bg-orange-500',
        reserved: 'bg-yellow-500',
        maintenance: 'bg-red-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Restaurant Tables</h2>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-orange-500 hover:bg-orange-600">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Table
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Table</DialogTitle>
                        </DialogHeader>
                        <TableForm
                            restaurantId={restaurantId}
                            onSubmit={(data) => createMutation.mutate(data)}
                            isLoading={createMutation.isPending}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading tables...</div>
            ) : tables.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <UtensilsCrossed className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No tables added yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tables.map(table => (
                        <Card key={table.id} className={!table.is_active ? 'opacity-50' : ''}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg">{table.table_number}</CardTitle>
                                        {table.location && (
                                            <p className="text-sm text-gray-600 mt-1">{table.location}</p>
                                        )}
                                    </div>
                                    <Badge className={`${statusColors[table.status]} text-white`}>
                                        {table.status.replace('_', ' ')}
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-600">Capacity: <span className="font-bold text-gray-900">{table.capacity} seats</span></p>
                                    {table.current_order_id && (
                                        <p className="text-xs text-blue-600">Order: {table.current_order_id.slice(0, 8)}</p>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <Dialog open={isEditDialogOpen && editingTable?.id === table.id} onOpenChange={(open) => {
                                        if (!open) {
                                            setEditingTable(null);
                                            setIsEditDialogOpen(false);
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setEditingTable(table);
                                                    setIsEditDialogOpen(true);
                                                }}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Edit Table</DialogTitle>
                                            </DialogHeader>
                                            {editingTable && (
                                                <TableForm
                                                    restaurantId={restaurantId}
                                                    initialData={editingTable}
                                                    onSubmit={(data) => updateMutation.mutate({ id: editingTable.id, data })}
                                                    isLoading={updateMutation.isPending}
                                                />
                                            )}
                                        </DialogContent>
                                    </Dialog>

                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => deleteMutation.mutate(table.id)}
                                        disabled={deleteMutation.isPending}
                                        className="text-red-600 hover:text-red-700"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}

function TableForm({ restaurantId, initialData, onSubmit, isLoading }) {
    const [formData, setFormData] = useState({
        restaurant_id: restaurantId,
        table_number: initialData?.table_number || '',
        capacity: initialData?.capacity || '',
        location: initialData?.location || '',
        status: initialData?.status || 'available',
        is_active: initialData?.is_active !== false,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.table_number || !formData.capacity) {
            toast.error('Please fill in all required fields');
            return;
        }
        onSubmit({
            ...formData,
            capacity: parseInt(formData.capacity),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <Input
                placeholder="Table Number (e.g., Table 5) *"
                value={formData.table_number}
                onChange={(e) => setFormData({ ...formData, table_number: e.target.value })}
                required
            />

            <Input
                type="number"
                placeholder="Capacity (number of seats) *"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                min="1"
                required
            />

            <Input
                placeholder="Location (e.g., Window, Corner, Bar)"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />

            <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                >
                    <option value="available">Available</option>
                    <option value="occupied">Occupied</option>
                    <option value="reserved">Reserved</option>
                    <option value="maintenance">Maintenance</option>
                </select>
            </div>

            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                />
                <span className="text-sm">Active</span>
            </label>

            <Button type="submit" disabled={isLoading} className="w-full bg-orange-500 hover:bg-orange-600">
                {isLoading ? 'Saving...' : 'Save Table'}
            </Button>
        </form>
    );
}