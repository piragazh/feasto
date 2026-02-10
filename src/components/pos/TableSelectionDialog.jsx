import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from 'react';

export default function TableSelectionDialog({ open, onClose, tables, onSelectTable, selectedTable }) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredTables = tables.filter(table =>
        table.table_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="text-white">Select a Table</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Input
                        placeholder="Search tables..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    />

                    <div className="grid grid-cols-4 gap-3 max-h-96 overflow-y-auto">
                        {filteredTables.length === 0 ? (
                            <div className="col-span-4 text-center text-gray-400 py-8">
                                No tables found
                            </div>
                        ) : (
                            filteredTables.map(table => (
                                <Button
                                    key={table.id}
                                    onClick={() => {
                                        onSelectTable(table);
                                        onClose();
                                    }}
                                    className={`h-20 text-base font-bold transition-all ${
                                        selectedTable?.id === table.id
                                            ? 'bg-orange-500 hover:bg-orange-600 text-white'
                                            : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
                                    }`}
                                >
                                    {table.table_number}
                                </Button>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}