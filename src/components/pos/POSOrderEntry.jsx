import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Minus, ShoppingCart, X, Settings, Scissors, Users, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import POSItemCustomization from './POSItemCustomization';
import POSPayment from './POSPayment';
import TableActionsDialog from './TableActionsDialog';
import SplitBillDialog from './SplitBillDialog';
import FloorPlanView from './FloorPlanView';
import TableSelectionDialog from './TableSelectionDialog';
import CustomItemDialog from './CustomItemDialog';

export default function POSOrderEntry({ restaurantId, cart, onAddItem, onRemoveItem, onUpdateQuantity, onClearCart, cartTotal, orderType, setOrderType }) {
     const [searchQuery, setSearchQuery] = useState('');
     const [selectedCategory, setSelectedCategory] = useState('');
     const [customizationOpen, setCustomizationOpen] = useState(false);
     const [selectedItem, setSelectedItem] = useState(null);
     const [selectedTable, setSelectedTable] = useState(null);
     const [showPayment, setShowPayment] = useState(false);
     const [optimisticCart, setOptimisticCart] = useState(cart);
     const [viewMode, setViewMode] = useState('entry'); // 'entry', 'tables', or 'floor-plan'
     const [viewingTable, setViewingTable] = useState(null);
     const [tableActionsOpen, setTableActionsOpen] = useState(false);
     const [selectedTableForActions, setSelectedTableForActions] = useState(null);
     const [splitBillOpen, setSplitBillOpen] = useState(false);
     const [isAddingToTable, setIsAddingToTable] = useState(false);
     const [tableSelectionOpen, setTableSelectionOpen] = useState(false);
     const [customItemOpen, setCustomItemOpen] = useState(false);

     React.useEffect(() => {
         setOptimisticCart(cart);
     }, [cart]);

     const handleQuantityChange = (itemId, newQuantity) => {
         // Optimistic update
         setOptimisticCart(prev => 
             prev.map(item => 
                 item.id === itemId 
                     ? { ...item, quantity: newQuantity }
                     : item
             )
         );
         // Actual update
         onUpdateQuantity(itemId, newQuantity);
     };

    const { data: restaurant } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
            return restaurants[0];
        },
        enabled: !!restaurantId,
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['pos-menu-items', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId,
    });

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: async () => {
            const result = await base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true });
            console.log('📊 Tables fetched:', result.length, result);
            return result;
        },
        enabled: !!restaurantId,
    });

    const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery({
        queryKey: ['pos-table-orders', restaurantId],
        queryFn: async () => {
            const orders = await base44.entities.Order.filter({ 
                restaurant_id: restaurantId, 
                order_type: 'dine_in',
                status: { $in: ['preparing', 'confirmed', 'pending'] }
            });
            return orders;
        },
        enabled: !!restaurantId,
        refetchInterval: 3000,
        staleTime: 0,
        cacheTime: 0,
    });

    // Get ordered categories based on restaurant settings
    const getOrderedCategories = () => {
        const currentOrder = restaurant?.category_order || [];
        const allCategories = restaurant?.menu_categories || [];
        
        // Start with ordered categories
        const ordered = currentOrder.filter(cat => allCategories.includes(cat));
        
        // Add any new categories not in the order yet
        const unordered = allCategories.filter(cat => !currentOrder.includes(cat));
        
        return [...ordered, ...unordered];
    };

    // Get ordered items for a specific category
    const getOrderedItems = (category) => {
        const itemOrder = restaurant?.item_order || {};
        const categoryOrder = itemOrder[category] || [];
        const categoryItems = menuItems.filter(item => item.category === category && item.is_available !== false);
        
        // Start with ordered items
        const ordered = categoryOrder
            .map(id => categoryItems.find(item => item.id === id))
            .filter(Boolean);
        
        // Add any new items not in the order yet
        const orderedIds = new Set(ordered.map(item => item.id));
        const unordered = categoryItems.filter(item => !orderedIds.has(item.id));
        
        return [...ordered, ...unordered];
    };

    const categories = getOrderedCategories();
    
    const filteredItems = (() => {
        if (!selectedCategory) {
            // Show all items when no category selected, but still filter by search
            return menuItems.filter(item => {
                const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
                return matchesSearch && item.is_available !== false;
            });
        }
        
        // Get ordered items for the selected category
        const orderedItems = getOrderedItems(selectedCategory);
        
        // Apply search filter if present
        if (searchQuery) {
            return orderedItems.filter(item => 
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        return orderedItems;
    })();

    const handleItemClick = (item) => {
         // Check if item has customization options
         if (item.customization_options && item.customization_options.length > 0) {
             setSelectedItem(item);
             setCustomizationOpen(true);
         } else {
             // Add directly to cart for items without customization
             onAddItem({ ...item, quantity: 1, customizations: {} });
         }
     };

     const handleCustomizationConfirm = (itemWithCustomizations) => {
         onAddItem(itemWithCustomizations);
         setCustomizationOpen(false);
         setSelectedItem(null);
     };

    const handleAddToTable = async (table) => {
        console.log('=== handleAddToTable CALLED ===');
        console.log('Table:', table);
        console.log('Cart:', optimisticCart);
        console.log('Cart length:', optimisticCart.length);
        console.log('Restaurant ID:', restaurantId);
        
        if (optimisticCart.length === 0) {
            toast.error('Cart is empty');
            return;
        }

        if (isAddingToTable) {
            console.log('Already adding to table, preventing duplicate');
            return;
        }

        setIsAddingToTable(true);

        try {
            const orderData = {
                restaurant_id: restaurantId,
                restaurant_name: 'POS Order',
                items: optimisticCart.map(item => ({
                    menu_item_id: item.menu_item_id || item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    customizations: item.customizations || {}
                })),
                subtotal: cartTotal,
                delivery_fee: 0,
                discount: 0,
                total: cartTotal,
                status: 'preparing',
                order_type: 'dine_in',
                payment_method: 'cash',
                table_id: table.id,
                table_number: table.table_number
            };

            console.log('Creating order with data:', orderData);
            const createdOrder = await base44.entities.Order.create(orderData);
            console.log('Order created successfully:', createdOrder);
            
            // Update table status to occupied
            await base44.entities.RestaurantTable.update(table.id, { 
                status: 'occupied',
                current_order_id: createdOrder.id 
            });
            console.log('Table updated successfully');
            
            toast.success(`Order added to ${table.table_number}!`);
            
            // Clear cart and selected table first
            onClearCart();
            setSelectedTable(null);
            
            // Wait a moment for state to settle
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Then refetch data with forced refresh
            console.log('Refetching orders and tables...');
            await Promise.all([
                refetchTableOrders(),
                refetchTables()
            ]);
            console.log('Refetch complete');
        } catch (error) {
            console.error('Error adding to table:', error);
            console.error('Error details:', error.message, error.stack);
            toast.error('Failed to add items to table: ' + (error.message || 'Unknown error'));
        } finally {
            setIsAddingToTable(false);
        }
    };

     const handlePaymentComplete = async () => {
         if (!viewingTable) {
             toast.error('No table selected');
             return;
         }

         const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
         const total = ordersForTable.reduce((sum, order) => sum + order.total, 0);

         try {
             // Update all orders for this table to 'delivered' status
             for (const order of ordersForTable) {
                 await base44.entities.Order.update(order.id, { status: 'delivered' });
             }

             toast.success('Payment completed!');
             setShowPayment(false);
             setViewingTable(null);
             setViewMode('tables');
             refetchTableOrders();
         } catch (error) {
             toast.error('Failed to complete payment');
         }
     };

     if (showPayment) {
        // Takeaway payment
        if (!viewingTable) {
            const handleTakeawayPaymentComplete = async () => {
                try {
                    toast.success('Payment completed!');
                    setShowPayment(false);
                    onClearCart();
                } catch (error) {
                    toast.error('Failed to complete payment');
                }
            };

            return (
                <div className="flex flex-col h-[calc(100vh-200px)]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-white font-bold text-2xl">Takeaway Payment</h2>
                        <Button 
                            onClick={() => setShowPayment(false)}
                            variant="outline"
                            className="text-white border-gray-600"
                        >
                            Back
                        </Button>
                    </div>

                    <POSPayment 
                        cart={optimisticCart} 
                        cartTotal={cartTotal} 
                        onPaymentComplete={handleTakeawayPaymentComplete}
                        onBackToCart={() => setShowPayment(false)}
                    />
                </div>
            );
        }

        // Dine-in payment
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
        const total = ordersForTable.reduce((sum, order) => sum + order.total, 0);
        const allItems = ordersForTable.flatMap(order => order.items);

        return (
            <div className="flex flex-col h-[calc(100vh-200px)]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold text-2xl">{viewingTable.table_number} - Payment</h2>
                    <div className="flex gap-2">
                        <Button 
                            onClick={() => setSplitBillOpen(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
                        >
                            <Scissors className="h-4 w-4 mr-2" />
                            Split Bill
                        </Button>
                        <Button 
                            onClick={() => {
                                setShowPayment(false);
                                setViewMode('tables');
                            }}
                            variant="outline"
                            className="text-white border-gray-600"
                        >
                            Back
                        </Button>
                    </div>
                </div>

                <POSPayment 
                    cart={allItems} 
                    cartTotal={total} 
                    onPaymentComplete={handlePaymentComplete}
                    onBackToCart={() => {
                        setShowPayment(false);
                        setViewMode('tables');
                    }}
                />

                {splitBillOpen && (
                    <SplitBillDialog
                        open={splitBillOpen}
                        onClose={() => setSplitBillOpen(false)}
                        orders={ordersForTable}
                        table={viewingTable}
                        onPaymentComplete={() => {
                            setSplitBillOpen(false);
                            handlePaymentComplete();
                        }}
                    />
                )}
            </div>
        );
     }

     // Floor Plan View Mode
     if (viewMode === 'floor-plan') {
        return (
            <div className="flex flex-col h-[calc(100vh-200px)]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold text-2xl">Floor Plan</h2>
                    <div className="flex gap-2">
                        <Button 
                            onClick={() => setViewMode('tables')}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                        >
                            Grid View
                        </Button>
                        <Button 
                            onClick={() => setViewMode('entry')}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
                        >
                            Back to Order Entry
                        </Button>
                    </div>
                </div>

                <FloorPlanView
                    tables={tables}
                    tableOrders={tableOrders}
                    onRefresh={() => {
                        refetchTables();
                        refetchTableOrders();
                    }}
                    onTableClick={(table) => {
                        setViewingTable(table);
                        setShowPayment(true);
                    }}
                />
            </div>
        );
     }

     // Tables View Mode
     if (viewMode === 'tables') {
        console.log('🏠 Tables View - Total tables:', tables.length);
        const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
        const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, order) => sum + order.total, 0);

        const getStatusColor = (status) => {
            switch (status) {
                case 'available': return 'bg-gray-700 border-gray-600';
                case 'occupied': return 'bg-orange-500/20 border-orange-500';
                case 'reserved': return 'bg-blue-500/20 border-blue-500';
                case 'needs_cleaning': return 'bg-yellow-500/20 border-yellow-500';
                default: return 'bg-gray-700 border-gray-600';
            }
        };

        const getStatusBadge = (status) => {
            const colors = {
                available: 'bg-green-500',
                occupied: 'bg-orange-500',
                reserved: 'bg-blue-500',
                needs_cleaning: 'bg-yellow-500'
            };
            return colors[status] || 'bg-gray-500';
        };

        return (
            <div className="flex flex-col h-full w-full">
                <h2 className="text-white font-bold text-2xl mb-4">Tables - Grid View</h2>

                <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-y-auto">
                    <div className="grid grid-cols-4 gap-4">
                        {tables.map(table => {
                            const orders = getTableOrders(table.id);
                            const total = getTableTotal(table.id);
                            const hasOrders = orders.length > 0;
                            const isMerged = (table.merged_with || []).length > 0;

                            return (
                                <div
                                    key={table.id}
                                    className={`aspect-square rounded-xl p-3 flex flex-col relative cursor-pointer transition-all border-2 ${getStatusColor(table.status)} hover:opacity-90`}
                                >
                                    {/* Status Indicator */}
                                    <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${getStatusBadge(table.status)}`} />

                                    {/* Actions Button */}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTableForActions(table);
                                            setTableActionsOpen(true);
                                        }}
                                        className="absolute top-2 left-2 h-6 w-6 p-0 text-gray-400 hover:text-white"
                                    >
                                        <Settings className="h-4 w-4" />
                                    </Button>

                                    <div 
                                        className="flex-1 flex flex-col items-center justify-center"
                                        onClick={() => {
                                            if (hasOrders) {
                                                setViewingTable(table);
                                                setShowPayment(true);
                                            }
                                        }}
                                    >
                                        <h3 className="text-white font-bold text-lg mb-1 text-center">{table.table_number}</h3>

                                        {table.assigned_server && (
                                            <div className="flex items-center gap-1 text-indigo-400 text-xs mb-1">
                                                <Users className="h-3 w-3" />
                                                <span>{table.assigned_server}</span>
                                            </div>
                                        )}

                                        {isMerged && (
                                            <p className="text-purple-400 text-xs mb-1">Merged</p>
                                        )}

                                        {table.notes && (
                                            <p className="text-gray-400 text-xs italic text-center line-clamp-2 mb-1">"{table.notes}"</p>
                                        )}

                                        {hasOrders ? (
                                            <>
                                                <p className="text-orange-400 text-xs">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                                <p className="text-white font-bold text-base mt-1">£{total.toFixed(2)}</p>
                                            </>
                                        ) : (
                                            <p className="text-gray-400 text-xs capitalize">{table.status.replace('_', ' ')}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {tableActionsOpen && selectedTableForActions && (
                    <TableActionsDialog
                        open={tableActionsOpen}
                        onClose={() => {
                            setTableActionsOpen(false);
                            setSelectedTableForActions(null);
                        }}
                        table={selectedTableForActions}
                        tables={tables}
                        onRefresh={() => {
                            refetchTables();
                            refetchTableOrders();
                        }}
                    />
                )}
            </div>
        );
     }

     return (
        <div className="flex flex-col h-[calc(100vh-200px)]">
            {/* Main 3-Column Layout */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden pb-4">
                {/* Left: Categories/Menu */}
                <div className="col-span-1 md:col-span-2 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700 flex-shrink-0">
                        <h2 className="text-white font-bold text-lg">Categories</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-hide">
                        <Button
                            variant={!selectedCategory ? "default" : "outline"}
                            onClick={() => setSelectedCategory('')}
                            className={`w-full justify-start text-sm h-10 px-3 font-bold ${!selectedCategory ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                        >
                            <span className="truncate">All Items</span>
                        </Button>
                        {categories.map(cat => (
                            <Button
                                key={cat}
                                variant={selectedCategory === cat ? "default" : "outline"}
                                onClick={() => setSelectedCategory(cat)}
                                className={`w-full justify-start text-sm h-10 px-3 font-bold ${selectedCategory === cat ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'}`}
                                title={cat}
                            >
                                <span className="truncate">{cat}</span>
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Middle: Items Grid */}
                <div className="col-span-1 md:col-span-7 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700">
                        <Input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-gray-700 border-gray-600 text-white placeholder-gray-400 text-lg h-12 px-4"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filteredItems.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="bg-gray-700 border border-gray-600 rounded-lg p-3 hover:border-orange-500 hover:shadow-lg transition-all cursor-pointer group flex flex-col"
                            >
                                <div className="w-full aspect-square bg-gray-600 rounded-lg overflow-hidden mb-2">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-gray-500 flex items-center justify-center">
                                            <ShoppingCart className="h-8 w-8 text-gray-400" />
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-bold text-white text-sm line-clamp-2 group-hover:text-orange-400 transition-colors mb-1">{item.name}</h3>
                                <p className="text-orange-400 font-bold text-lg mt-auto">£{item.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="col-span-1 md:col-span-3 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-gray-700">
                        <h2 className="text-white font-bold text-lg">Cart</h2>
                        {orderType === 'dine_in' && selectedTable && (
                            <div className="bg-gray-700 p-2 rounded mt-2 text-center">
                                <p className="text-gray-400 text-xs">Table: <span className="text-white font-bold">{selectedTable.table_number}</span></p>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                        {optimisticCart.length === 0 ? (
                            <p className="text-gray-400 text-center py-8 text-sm">No items in cart</p>
                        ) : (
                            optimisticCart.map(item => (
                                <div key={item.id} className="bg-gray-700 p-2 rounded border border-gray-600">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 pr-2">
                                            <p className="text-white font-semibold text-xs leading-tight">{item.name}</p>
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <div className="text-gray-300 text-[9px] mt-0.5 space-y-0.5 max-h-10 overflow-hidden">
                                                    {Object.entries(item.customizations).map(([key, value]) => (
                                                        <p key={key} className="line-clamp-1 truncate">
                                                            {key}: {Array.isArray(value) ? value.join(', ') : value}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-orange-400 text-sm mt-1 font-bold">£{item.price.toFixed(2)}</p>
                                        </div>
                                        <Button
                                            onClick={() => onRemoveItem(item.id)}
                                            className="text-red-400 hover:text-red-500 bg-red-500/10 hover:bg-red-500/20 h-8 w-8 rounded-full transition-all p-0 flex items-center justify-center"
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                            className="h-9 w-9 p-0 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded flex items-center justify-center"
                                        >
                                            <Minus className="h-4 w-4" />
                                        </Button>
                                        <span className="text-white font-bold text-base flex-1 text-center">{item.quantity}</span>
                                        <Button
                                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                            className="h-9 w-9 p-0 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded flex items-center justify-center"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-gray-700 p-3 space-y-2">
                        <div className="bg-gray-700 p-2 rounded">
                            <p className="text-gray-400 text-xs">Total</p>
                            <p className="text-white text-2xl font-bold">£{cartTotal.toFixed(2)}</p>
                        </div>

                        {orderType === 'dine_in' ? (
                             <>
                                 {!selectedTable ? (
                                     <Button
                                         onClick={() => setTableSelectionOpen(true)}
                                         disabled={tables.length === 0}
                                         className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-14 text-lg disabled:opacity-50"
                                     >
                                         <ShoppingCart className="h-5 w-5 mr-2" />
                                         Select Table ({tables.length} available)
                                     </Button>
                                 ) : (
                                     <>
                                         <div className="bg-orange-500/20 border border-orange-500 rounded p-2 text-center">
                                             <p className="text-orange-400 text-xs">Table Selected</p>
                                             <p className="text-white font-bold text-lg">{selectedTable.table_number}</p>
                                         </div>
                                         <Button
                                             onClick={() => {
                                                 console.log('🔴 BUTTON CLICKED!');
                                                 handleAddToTable(selectedTable);
                                             }}
                                             disabled={optimisticCart.length === 0 || isAddingToTable}
                                             className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-14 text-lg disabled:opacity-50"
                                         >
                                             <ShoppingCart className="h-5 w-5 mr-2" />
                                             {isAddingToTable ? 'Adding...' : 'Add to Table'}
                                         </Button>
                                         <Button
                                             onClick={() => setSelectedTable(null)}
                                             className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold h-10 text-sm"
                                         >
                                             Change Table
                                         </Button>
                                     </>
                                 )}
                                <Button
                                    onClick={onClearCart}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold h-12 text-base disabled:opacity-50"
                                >
                                    <Trash2 className="h-5 w-5 mr-2" />
                                    Clear Cart
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={() => setShowPayment(true)}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-14 text-lg disabled:opacity-50"
                                >
                                    <ShoppingCart className="h-5 w-5 mr-2" />
                                    Checkout
                                </Button>
                                <Button
                                    onClick={onClearCart}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold h-12 text-base disabled:opacity-50"
                                >
                                    <Trash2 className="h-5 w-5 mr-2" />
                                    Clear Cart
                                </Button>
                            </>
                        )}
                        </div>
                </div>
            </div>

            {/* Bottom: Quick Access Function Buttons */}
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
                <div className="grid grid-cols-8 gap-2">
                    {orderType === 'dine_in' && (
                        <Button 
                            onClick={() => setViewMode('tables')}
                            className="aspect-square bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[11px] border border-blue-500 rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-lg transition-all hover:scale-105"
                        >
                            <Users className="h-5 w-5" />
                            <span>Tables</span>
                        </Button>
                    )}
                    <Button 
                        onClick={() => setCustomItemOpen(true)}
                        className="aspect-square bg-green-600 hover:bg-green-700 text-white font-semibold text-[11px] border border-green-500 rounded-lg p-2 flex flex-col items-center justify-center gap-1 shadow-lg transition-all hover:scale-105"
                    >
                        <PlusCircle className="h-5 w-5" />
                        <span>Custom</span>
                    </Button>
                </div>
            </div>

            {selectedItem && (
                <POSItemCustomization
                    item={selectedItem}
                    open={customizationOpen}
                    onClose={() => {
                        setCustomizationOpen(false);
                        setSelectedItem(null);
                    }}
                    onConfirm={handleCustomizationConfirm}
                />
            )}

            <TableSelectionDialog
                open={tableSelectionOpen}
                onClose={() => setTableSelectionOpen(false)}
                tables={tables}
                selectedTable={selectedTable}
                onSelectTable={(table) => setSelectedTable(table)}
            />

            <CustomItemDialog
                open={customItemOpen}
                onClose={() => setCustomItemOpen(false)}
                onAdd={(customItem) => onAddItem(customItem)}
                restaurantId={restaurantId}
            />
        </div>
    );
}