import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';

export default function POSTableManager({ tables, cart, cartTotal, onAddItem, onRemoveItem, onUpdateQuantity }) {
    const [selectedTable, setSelectedTable] = useState(null);
    const [tableOrders, setTableOrders] = useState({});

    const assignTableOrder = () => {
        if (!selectedTable || cart.length === 0) return;

        const orderId = `order_${Date.now()}`;
        setTableOrders(prev => ({
            ...prev,
            [selectedTable]: [...(prev[selectedTable] || []), { id: orderId, items: [...cart], total: cartTotal }]
        }));
    };

    const clearTable = (tableId) => {
        const { [tableId]: _, ...rest } = tableOrders;
        setTableOrders(rest);
        setSelectedTable(null);
    };

    return (
        <div className="grid grid-cols-4 gap-4">
            {/* Table Grid */}
            <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-4">
                <h2 className="text-white font-bold mb-4">Tables</h2>
                <div className="grid grid-cols-5 gap-2 mb-4">
                    {Object.values(tables).map(table => (
                        <button
                            key={table.number}
                            onClick={() => setSelectedTable(`table_${table.number}`)}
                            className={`p-4 rounded text-center font-bold transition-all ${
                                selectedTable === `table_${table.number}`
                                    ? 'bg-orange-500 text-white'
                                    : tableOrders[`table_${table.number}`]
                                    ? 'bg-yellow-600 text-white'
                                    : 'bg-gray-700 text-white hover:bg-gray-600'
                            }`}
                        >
                            <p className="text-xs text-gray-300">T</p>
                            <p className="text-lg">{table.number}</p>
                        </button>
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
                                Clear Table
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
            <div className="col-span-2 space-y-4">
                {/* Selected Table Info */}
                {selectedTable && (
                    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                        <h3 className="text-white font-bold mb-3">Table {selectedTable.split('_')[1]}</h3>
                        <div className="space-y-2">
                            {cart.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded flex justify-between items-center">
                                    <div>
                                        <p className="text-white text-sm font-semibold">{item.name}</p>
                                        <p className="text-orange-400 text-xs">£{item.price.toFixed(2)}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 text-white"
                                            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                                        >
                                            -
                                        </Button>
                                        <span className="text-white w-6 text-center">{item.quantity}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 text-white"
                                            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                                        >
                                            +
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-red-400"
                                            onClick={() => onRemoveItem(item.id)}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="border-t border-gray-600 mt-3 pt-3">
                            <p className="text-gray-400 text-sm mb-1">Total</p>
                            <p className="text-orange-400 text-2xl font-bold mb-3">£{cartTotal.toFixed(2)}</p>
                            <Button
                                onClick={assignTableOrder}
                                disabled={cart.length === 0}
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold"
                            >
                                Assign to Table
                            </Button>
                        </div>
                    </div>
                )}

                {!selectedTable && (
                    <Card className="bg-gray-800 border-gray-700">
                        <CardContent className="p-4 text-center text-gray-400">
                            Select a table to add items
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}