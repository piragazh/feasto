import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Database, RotateCcw, Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function BackupRestore() {
    const queryClient = useQueryClient();
    const [selectedRestaurantId, setSelectedRestaurantId] = useState('all');
    const [label, setLabel] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [restoringId, setRestoringId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);

    const { data: restaurants = [] } = useQuery({
        queryKey: ['all-restaurants'],
        queryFn: () => base44.entities.Restaurant.list(),
    });

    const { data: backups = [], isLoading: backupsLoading } = useQuery({
        queryKey: ['restaurant-backups'],
        queryFn: () => base44.entities.RestaurantBackup.list('-created_date', 50),
    });

    const createBackup = async () => {
        setIsCreating(true);
        try {
            const res = await base44.functions.invoke('restaurantBackup', {
                action: 'create',
                restaurant_id: selectedRestaurantId === 'all' ? null : selectedRestaurantId,
                label: label.trim() || null,
            });
            const counts = res.data?.item_counts || {};
            toast.success(`Backup created: ${counts.restaurants || 0} restaurants, ${counts.menuItems || 0} items, ${counts.promotions || 0} promotions`);
            setLabel('');
            queryClient.invalidateQueries({ queryKey: ['restaurant-backups'] });
        } catch (e) {
            toast.error('Failed to create backup: ' + e.message);
        }
        setIsCreating(false);
    };

    const restoreBackup = async (backup) => {
        const confirmed = window.confirm(
            `Restore "${backup.label}"?\n\nThis will overwrite current data for all items in this snapshot. This cannot be undone.`
        );
        if (!confirmed) return;

        setRestoringId(backup.id);
        try {
            const res = await base44.functions.invoke('restaurantBackup', {
                action: 'restore',
                backup_id: backup.id,
            });
            const r = res.data?.restored || {};
            toast.success(`Restored: ${r.restaurants || 0} restaurants, ${r.menuItems || 0} items, ${r.promotions || 0} promotions`);
        } catch (e) {
            toast.error('Restore failed: ' + e.message);
        }
        setRestoringId(null);
    };

    const deleteBackup = async (backup) => {
        const confirmed = window.confirm(`Delete backup "${backup.label}"? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(backup.id);
        try {
            await base44.functions.invoke('restaurantBackup', {
                action: 'delete',
                backup_id: backup.id,
            });
            toast.success('Backup deleted');
            queryClient.invalidateQueries({ queryKey: ['restaurant-backups'] });
        } catch (e) {
            toast.error('Delete failed: ' + e.message);
        }
        setDeletingId(null);
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Backup & Restore</h2>
                <p className="text-gray-500 text-sm mt-1">Create manual snapshots of restaurant data. Restore in case of accidental changes.</p>
            </div>

            {/* Create Backup */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Database className="h-5 w-5 text-orange-500" />
                        Create Snapshot
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <Label>Restaurant</Label>
                            <Select value={selectedRestaurantId} onValueChange={setSelectedRestaurantId}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Restaurants</SelectItem>
                                    {restaurants.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-2">
                            <Label>Label (optional)</Label>
                            <Input
                                placeholder="e.g. Before price update March 2026"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <ShieldAlert className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        Backs up: Restaurant settings, Menu items, Promotions, Coupons, Meal Deals
                    </div>
                    <Button
                        onClick={createBackup}
                        disabled={isCreating}
                        className="bg-orange-500 hover:bg-orange-600"
                    >
                        {isCreating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseBackup className="h-4 w-4 mr-2" />}
                        {isCreating ? 'Creating Backup...' : 'Create Backup Now'}
                    </Button>
                </CardContent>
            </Card>

            {/* Backups List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Saved Backups ({backups.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {backupsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                    ) : backups.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No backups yet. Create your first snapshot above.</p>
                    ) : (
                        <div className="space-y-3">
                            {backups.map(backup => (
                                <div key={backup.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 gap-3 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-gray-900">{backup.label}</span>
                                            <Badge variant="outline" className="text-xs">
                                                {backup.restaurant_name || 'All Restaurants'}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                                            <span>
                                                {backup.created_date
                                                    ? format(new Date(backup.created_date), 'dd MMM yyyy, HH:mm')
                                                    : 'Unknown date'}
                                            </span>
                                            <span>by {backup.created_by}</span>
                                            {backup.item_counts && (
                                                <span>
                                                    {backup.item_counts.restaurants} restaurants ·{' '}
                                                    {backup.item_counts.menuItems} items ·{' '}
                                                    {backup.item_counts.promotions} promotions ·{' '}
                                                    {backup.item_counts.coupons} coupons
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => restoreBackup(backup)}
                                            disabled={restoringId === backup.id}
                                            className="text-blue-600 border-blue-300 hover:bg-blue-50"
                                        >
                                            {restoringId === backup.id
                                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                                : <RotateCcw className="h-3 w-3 mr-1" />}
                                            Restore
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => deleteBackup(backup)}
                                            disabled={deletingId === backup.id}
                                            className="text-red-500 border-red-200 hover:bg-red-50"
                                        >
                                            {deletingId === backup.id
                                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                                : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}