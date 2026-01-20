import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Users } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const TABLE_STATUSES = {
    available: { color: 'bg-green-600', label: 'Available' },
    occupied: { color: 'bg-orange-600', label: 'Occupied' },
    needs_cleaning: { color: 'bg-red-600', label: 'Cleaning' },
};

const SERVERS = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];

export default function POSTableManager({ tables, cart, cartTotal, onAddItem, onRemoveItem, onUpdateQuantity }) {
    const [selectedTable, setSelectedTable] = useState(null);
    const [tableOrders, setTableOrders] = useState({});
    const [tableStatus, setTableStatus] = useState({});
    const [tableServers, setTableServers] = useState({});

    const getTableStatus = (tableId) => {
        if (tableOrders[tableId]?.length > 0) {
            return tableStatus[tableId] || 'occupied';
        }
        return tableStatus[tableId] || 'available';
    };

    const assignTableOrder = () => {
        if (!selectedTable || cart.length === 0) return;

        const orderId = `order_${Date.now()}`;
        setTableOrders(prev => ({
            ...prev,
            [selectedTable]: [...(prev[selectedTable] || []), { id: orderId, items: [...cart], total: cartTotal }]
        }));
        
        setTableStatus(prev => ({
            ...prev,
            [selectedTable]: 'occupied'
        }));
    };

    const clearTable = (tableId) => {
        const { [tableId]: _, ...rest } = tableOrders;
        setTableOrders(rest);
        setTableStatus(prev => ({
            ...prev,
            [tableId]: 'needs_cleaning'
        }));
        setSelectedTable(null);
    };

    const markAsAvailable = (tableId) => {
        setTableStatus(prev => ({
            ...prev,
            [tableId]: 'available'
        }));
    };

    const assignServer = (tableId, server) => {
        setTableServers(prev => ({
            ...prev,
            [tableId]: server
        }));
    };

    return (
        <div className="grid grid-cols-4 gap-4">
            {/* Table Grid */}
            <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-4 max-h-[calc(100vh-220px)] overflow-y-auto">
                <h2 className="text-white font-bold mb-4">Tables</h2>
                <div className="grid grid-cols-5 gap-2 mb-4">
                    {Object.values(tables).map(table => {
                        const tableId = `table_${table.number}`;
                        const status = getTableStatus(tableId);
                        const statusConfig = TABLE_STATUSES[status];
                        
                        return (
                            <button
                                key={table.number}
                                onClick={() => setSelectedTable(tableId)}
                                className={`p-4 rounded text-center font-bold transition-all relative group ${
                                    selectedTable === tableId
                                        ? 'ring-2 ring-white'
                                        : ''
                                } ${statusConfig.color}`}
                            >
                                <p className="text-xs text-white/70">T</p>
                                <p className="text-lg text-white">{table.number}</p>
                                <div className="absolute bottom-1 left-1 right-1 h-1 bg-white/20 rounded-full"></div>
                                <div className="absolute bottom-1 left-1 h-1 rounded-full bg-white" style={{width: `${(getTableStatus(tableId) === 'occupied' ? 66 : getTableStatus(tableId) === 'needs_cleaning' ? 100 : 0)}%`}}></div>
                            </button>
                        );
                    })}
                </div>

                {/* Status Legend */}
                <div className="bg-gray-700 p-3 rounded mb-4 space-y-2">
                    {Object.entries(TABLE_STATUSES).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                            <div className={`w-3 h-3 rounded ${value.color}`}></div>
                            <span className="text-gray-300 text-xs">{value.label}</span>
                        </div>
                    ))}
                </div>

                {selectedTable && tableOrders[selectedTable] && (
                    <div className="bg-gray-700 p-3 rounded">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-white font-bold">Table {selectedTable.split('_')[1]} Orders</h3>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => clearTable(selectedTable)}
                            >
                                Clear
                            </Button>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            {tableOrders[selectedTable].map((order, idx) => (
                                <div key={idx} className="bg-gray-600 p-2 rounded">
                                    <p className="text-orange-400 font-bold">Order #{idx + 1}</p>
                                    {order.items.map((item, itemIdx) => (
                                        <p key={itemIdx} className="text-gray-300 text-sm">{item.quantity}x {item.name}</p>
                                    ))}
                                    <p className="text-white font-bold mt-1">£{order.total.toFixed(2)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel */}
            <div className="col-span-2 space-y-4 max-h-[calc(100vh-220px)] overflow-y-auto">
                {selectedTable && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-bold mb-4">Table {selectedTable.split('_')[1]}</h3>

                        {/* Table Status & Server Assignment */}
                        <div className="bg-gray-700 p-3 rounded mb-4 space-y-3">
                            <div>
                                <p className="text-gray-400 text-xs mb-2">Status</p>
                                <Badge className={`${TABLE_STATUSES[getTableStatus(selectedTable)].color} text-white`}>
                                    {TABLE_STATUSES[getTableStatus(selectedTable)].label}
                                </Badge>
                                {getTableStatus(selectedTable) === 'needs_cleaning' && (
                                    <Button
                                        onClick={() => markAsAvailable(selectedTable)}
                                        size="sm"
                                        className="w-full mt-2 bg-green-600 hover:bg-green-700"
                                    >
                                        Mark Clean
                                    </Button>
                                )}
                            </div>

                            <div>
                                <p className="text-gray-400 text-xs mb-2">Assigned Server</p>
                                <Select value={tableServers[selectedTable] || ''} onValueChange={(server) => assignServer(selectedTable, server)}>
                                    <SelectTrigger className="bg-gray-600 border-gray-500 text-white">
                                        <SelectValue placeholder="Assign server..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SERVERS.map(server => (
                                            <SelectItem key={server} value={server}>{server}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {tableServers[selectedTable] && (
                                    <p className="text-orange-400 text-sm mt-1 flex items-center gap-1">
                                        <Users className="h-3 w-3" /> {tableServers[selectedTable]}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Items */}
                        <div className="space-y-2 mb-4">
                            {cart.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded flex justify-between items-center">
                                    <div>
                                        <p className="text-white text-sm font-semibold">{item.name}</p>
                                        <p className="text-orange-400 text-xs">£{item.price.toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button variant="ghost" size="sm" className="h-6 w-6 text-white" onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}>-</Button>
                                        <span className="text-white w-6 text-center">{item.quantity}</span>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 text-white" onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}>+</Button>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => onRemoveItem(item.id)}><X className="h-3 w-3" /></Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-gray-600 pt-3">
                            <p className="text-gray-400 text-sm mb-1">Total</p>
                            <p className="text-orange-400 text-2xl font-bold mb-3">£{cartTotal.toFixed(2)}</p>
                            <Button onClick={assignTableOrder} disabled={cart.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold">
                                Assign to Table
                            </Button>
                        </div>
                    </div>
                )}

                {!selectedTable && (
                    <Card className="bg-gray-800 border-gray-700">
                        <CardContent className="p-4 text-center text-gray-400">
                            Select a table to manage
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}