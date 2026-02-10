import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Combine, StickyNote, Sparkles, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function TableActionsDialog({ open, onClose, table, tables, onRefresh }) {
    const [notes, setNotes] = useState(table?.notes || '');
    const [selectedTableToMerge, setSelectedTableToMerge] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSaveNotes = async () => {
        setLoading(true);
        try {
            await base44.entities.RestaurantTable.update(table.id, { notes });
            toast.success('Notes saved!');
            onRefresh();
            onClose();
        } catch (error) {
            toast.error('Failed to save notes');
        } finally {
            setLoading(false);
        }
    };

    const handleChangeStatus = async (newStatus) => {
        setLoading(true);
        try {
            await base44.entities.RestaurantTable.update(table.id, { status: newStatus });
            toast.success(`Table status updated to ${newStatus}!`);
            onRefresh();
        } catch (error) {
            toast.error('Failed to update status');
        } finally {
            setLoading(false);
        }
    };

    const handleMergeTables = async () => {
        if (!selectedTableToMerge) {
            toast.error('Please select a table to merge with');
            return;
        }

        setLoading(true);
        try {
            // Update current table to show it's merged
            await base44.entities.RestaurantTable.update(table.id, {
                merged_with: [selectedTableToMerge],
                status: 'occupied'
            });

            // Update the other table
            const otherTable = tables.find(t => t.id === selectedTableToMerge);
            const existingMerged = otherTable?.merged_with || [];
            await base44.entities.RestaurantTable.update(selectedTableToMerge, {
                merged_with: [...existingMerged, table.id],
                status: 'occupied'
            });

            toast.success('Tables merged successfully!');
            onRefresh();
            onClose();
        } catch (error) {
            toast.error('Failed to merge tables');
        } finally {
            setLoading(false);
        }
    };

    const handleUnmergeTables = async () => {
        setLoading(true);
        try {
            // Clear merged tables for current table
            const mergedWith = table.merged_with || [];
            await base44.entities.RestaurantTable.update(table.id, {
                merged_with: []
            });

            // Clear references in other tables
            for (const mergedTableId of mergedWith) {
                const mergedTable = tables.find(t => t.id === mergedTableId);
                if (mergedTable) {
                    const updatedMerged = (mergedTable.merged_with || []).filter(id => id !== table.id);
                    await base44.entities.RestaurantTable.update(mergedTableId, {
                        merged_with: updatedMerged
                    });
                }
            }

            toast.success('Tables unmerged!');
            onRefresh();
            onClose();
        } catch (error) {
            toast.error('Failed to unmerge tables');
        } finally {
            setLoading(false);
        }
    };

    const handleCleanTable = async () => {
        setLoading(true);
        try {
            await base44.entities.RestaurantTable.update(table.id, {
                status: 'available',
                notes: '',
                merged_with: []
            });
            toast.success('Table cleaned and reset!');
            onRefresh();
            onClose();
        } catch (error) {
            toast.error('Failed to clean table');
        } finally {
            setLoading(false);
        }
    };

    const availableTablesToMerge = tables.filter(t => 
        t.id !== table.id && 
        t.status !== 'needs_cleaning' &&
        !(t.merged_with || []).includes(table.id)
    );

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">
                        {table?.table_number} - Actions
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Status Change */}
                    <div>
                        <Label className="text-sm font-semibold mb-2 block">Change Status</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                onClick={() => handleChangeStatus('available')}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 text-white"
                            >
                                Available
                            </Button>
                            <Button
                                onClick={() => handleChangeStatus('occupied')}
                                disabled={loading}
                                className="bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                Occupied
                            </Button>
                            <Button
                                onClick={() => handleChangeStatus('reserved')}
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Reserved
                            </Button>
                            <Button
                                onClick={() => handleChangeStatus('needs_cleaning')}
                                disabled={loading}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white"
                            >
                                Needs Cleaning
                            </Button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <StickyNote className="h-4 w-4" />
                            Staff Notes / Special Requests
                        </Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add notes or special requests for this table..."
                            className="min-h-20"
                        />
                        <Button
                            onClick={handleSaveNotes}
                            disabled={loading}
                            className="w-full mt-2 bg-blue-600 hover:bg-blue-700"
                        >
                            Save Notes
                        </Button>
                    </div>

                    {/* Merge Tables */}
                    <div>
                        <Label className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <Combine className="h-4 w-4" />
                            Merge Tables
                        </Label>
                        {(table?.merged_with || []).length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-sm text-gray-600">
                                    Merged with: {(table.merged_with || []).map(id => {
                                        const t = tables.find(tbl => tbl.id === id);
                                        return t?.table_number;
                                    }).filter(Boolean).join(', ')}
                                </p>
                                <Button
                                    onClick={handleUnmergeTables}
                                    disabled={loading}
                                    className="w-full bg-red-600 hover:bg-red-700"
                                >
                                    <X className="h-4 w-4 mr-2" />
                                    Unmerge Tables
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Select value={selectedTableToMerge} onValueChange={setSelectedTableToMerge}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select table to merge with..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableTablesToMerge.map(t => (
                                            <SelectItem key={t.id} value={t.id}>
                                                {t.table_number} - {t.status}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={handleMergeTables}
                                    disabled={loading || !selectedTableToMerge}
                                    className="w-full bg-purple-600 hover:bg-purple-700"
                                >
                                    <Combine className="h-4 w-4 mr-2" />
                                    Merge Tables
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Clean Table */}
                    <Button
                        onClick={handleCleanTable}
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700"
                    >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Clean & Reset Table
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}