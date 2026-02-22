import React, { useState, useEffect } from 'react';
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
import OnScreenKeyboard from './OnScreenKeyboard';
import POSOfflineSyncBanner from './POSOfflineSyncBanner';
import { cacheMenuItems, getCachedMenuItems, cacheRestaurant, getCachedRestaurant, cacheTables, getCachedTables } from './POSOfflineDB';

export default function POSOrderEntry({ restaurantId, cart, onAddItem, onRemoveItem, onUpdateQuantity, onClearCart, cartTotal, orderType, setOrderType, posTheme = 'dark' }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel:      isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        panelHead:  isDark ? 'border-white/[0.06]' : 'border-gray-100',
        text:       isDark ? 'text-white'      : 'text-gray-900',
        textMuted:  isDark ? 'text-gray-400'  : 'text-gray-500',
        textSub:    isDark ? 'text-gray-500'  : 'text-gray-400',
        catBtn:     isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
        itemCard:   isDark ? 'bg-[#1a1d27] border-white/[0.06] hover:border-orange-500/50 hover:shadow-orange-500/10' : 'bg-white border-gray-200 hover:border-orange-400 hover:shadow-orange-100',
        itemImg:    isDark ? 'bg-[#0f1117]'   : 'bg-gray-50',
        itemName:   isDark ? 'text-white group-hover:text-orange-300' : 'text-gray-800 group-hover:text-orange-500',
        cartItem:   isDark ? 'bg-[#1a1d27] border-white/[0.05]' : 'bg-gray-50 border-gray-100',
        qtyMinus:   isDark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
        qtyPlus:    isDark ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400' : 'bg-orange-100 hover:bg-orange-200 text-orange-600',
        searchBg:   isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400',
        emptyIcon:  isDark ? 'text-gray-700'  : 'text-gray-300',
        emptyText:  isDark ? 'text-gray-500'  : 'text-gray-400',
        emptySub:   isDark ? 'text-gray-600'  : 'text-gray-300',
        bottomBar:  isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-white border-gray-200',
        tableCard:  isDark ? 'bg-[#1a1d27] border-white/[0.06] border-2' : 'bg-white border-2 border-gray-200',
        tableContainer: isDark ? 'bg-[#151720] border-white/[0.06]' : 'bg-gray-50 border-gray-200',
        payBack:    isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700',
        floorBack:  isDark ? 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-600',
    };
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
     const [showKeyboard, setShowKeyboard] = useState(false);

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
            try {
                const restaurants = await base44.entities.Restaurant.filter({ id: restaurantId });
                const r = restaurants[0];
                if (r) cacheRestaurant(r);
                return r;
            } catch {
                return getCachedRestaurant(restaurantId);
            }
        },
        enabled: !!restaurantId,
    });

    const { data: menuItems = [] } = useQuery({
        queryKey: ['pos-menu-items', restaurantId],
        queryFn: async () => {
            try {
                const items = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true });
                if (items?.length) cacheMenuItems(restaurantId, items);
                return items;
            } catch {
                return getCachedMenuItems(restaurantId);
            }
        },
        enabled: !!restaurantId,
    });

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: async () => {
            try {
                const result = await base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true });
                if (result?.length) cacheTables(restaurantId, result);
                return result;
            } catch {
                return getCachedTables(restaurantId);
            }
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
                restaurant_name: restaurant?.name || 'POS Order',
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
                toast.success('Payment completed!');
                setShowPayment(false);
                onClearCart();
            };

            return (
                <div className="flex flex-col h-[calc(100vh-200px)]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-white font-bold text-xl">Payment</h2>
                        <button onClick={() => setShowPayment(false)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl transition-colors">
                            ← Back
                        </button>
                    </div>

                    <POSPayment 
                        cart={optimisticCart} 
                        cartTotal={cartTotal} 
                        onPaymentComplete={handleTakeawayPaymentComplete}
                        onBackToCart={() => setShowPayment(false)}
                        restaurantId={restaurantId}
                        restaurantName={restaurant?.name}
                        orderType={orderType}
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
                    <div>
                        <h2 className="text-white font-bold text-xl">{viewingTable.table_number}</h2>
                        <p className="text-gray-500 text-xs">Payment · £{total.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSplitBillOpen(true)}
                            className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                            <Scissors className="h-3.5 w-3.5" />
                            Split Bill
                        </button>
                        <button onClick={() => { setShowPayment(false); setViewMode('tables'); }}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/[0.08] text-gray-300 text-sm font-semibold rounded-xl transition-colors">
                            ← Back
                        </button>
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
                    <h2 className="text-white font-bold text-xl">Floor Plan</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setViewMode('tables')}
                            className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-semibold rounded-xl transition-colors">
                            Grid View
                        </button>
                        <button onClick={() => setViewMode('entry')}
                            className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-semibold rounded-xl transition-colors">
                            Back to Orders
                        </button>
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
        const getTableOrders = (tableId) => tableOrders.filter(o => o.table_id === tableId);
        const getTableTotal = (tableId) => getTableOrders(tableId).reduce((sum, order) => sum + order.total, 0);

        const statusStyles = {
            available: { card: 'border-white/[0.06] hover:border-green-500/40', dot: 'bg-green-400', label: 'text-green-400' },
            occupied:  { card: 'border-orange-500/40 bg-orange-500/5', dot: 'bg-orange-400', label: 'text-orange-400' },
            reserved:  { card: 'border-blue-500/30 bg-blue-500/5', dot: 'bg-blue-400', label: 'text-blue-400' },
            needs_cleaning: { card: 'border-yellow-500/30 bg-yellow-500/5', dot: 'bg-yellow-400', label: 'text-yellow-400' },
        };

        return (
            <div className="flex flex-col h-full w-full">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold text-xl">Tables</h2>
                    <button onClick={() => setViewMode('entry')}
                        className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        ← Back to Order
                    </button>
                </div>

                <div className="flex-1 bg-[#151720] rounded-2xl border border-white/[0.06] p-4 overflow-y-auto">
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {tables.map(table => {
                            const orders = getTableOrders(table.id);
                            const total = getTableTotal(table.id);
                            const hasOrders = orders.length > 0;
                            const s = statusStyles[table.status] || statusStyles.available;

                            return (
                                <div key={table.id}
                                    className={`aspect-square rounded-2xl border-2 p-3 flex flex-col relative cursor-pointer transition-all bg-[#1a1d27] ${s.card}`}>
                                    <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${s.dot}`} />
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setSelectedTableForActions(table); setTableActionsOpen(true); }}
                                        className="absolute top-2 left-2 w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                                    >
                                        <Settings className="h-3 w-3" />
                                    </button>

                                    <div className="flex-1 flex flex-col items-center justify-center"
                                        onClick={() => { if (hasOrders) { setViewingTable(table); setShowPayment(true); } }}>
                                        <h3 className="text-white font-bold text-sm text-center leading-tight mb-1">{table.table_number}</h3>
                                        {table.assigned_server && (
                                            <div className="flex items-center gap-0.5 text-indigo-400 text-[9px] mb-1">
                                                <Users className="h-2.5 w-2.5" />
                                                <span className="truncate max-w-[60px]">{table.assigned_server}</span>
                                            </div>
                                        )}
                                        {hasOrders ? (
                                            <>
                                                <p className="text-orange-400 text-[9px]">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
                                                <p className="text-white font-bold text-sm">£{total.toFixed(2)}</p>
                                            </>
                                        ) : (
                                            <p className={`text-[9px] font-medium capitalize ${s.label}`}>{table.status.replace('_', ' ')}</p>
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
                        onClose={() => { setTableActionsOpen(false); setSelectedTableForActions(null); }}
                        table={selectedTableForActions} tables={tables}
                        onRefresh={() => { refetchTables(); refetchTableOrders(); }}
                    />
                )}
            </div>
        );
     }

     return (
        <div className="flex flex-col h-[calc(100vh-130px)]">
            <POSOfflineSyncBanner restaurantId={restaurantId} />
            {/* Main 3-Column Layout */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 overflow-hidden pb-3">

                {/* Left: Categories */}
                <div className="col-span-1 md:col-span-2 bg-[#151720] rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
                        <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Categories</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                        {[{ id: '', label: 'All Items' }, ...categories.map(c => ({ id: c, label: c }))].map(({ id, label }) => (
                            <button
                                key={id}
                                onClick={() => setSelectedCategory(id)}
                                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all truncate ${
                                    selectedCategory === id
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                                title={label}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Middle: Items Grid */}
                <div className="col-span-1 md:col-span-7 bg-[#151720] rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-white/[0.06] flex-shrink-0">
                        <div className="relative">
                            <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                            <Input
                                type="text"
                                placeholder="Search menu items..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setShowKeyboard(true)}
                                className="bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 h-11 pl-9 rounded-xl focus:border-orange-500/50 focus:ring-0"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {filteredItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item)}
                                className="bg-[#1a1d27] border border-white/[0.06] hover:border-orange-500/50 rounded-2xl overflow-hidden transition-all group text-left hover:shadow-lg hover:shadow-orange-500/10 active:scale-[0.97] flex flex-col"
                            >
                                <div className="w-full aspect-[4/3] bg-[#0f1117] overflow-hidden">
                                    {item.image_url ? (
                                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ShoppingCart className="h-7 w-7 text-gray-600" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-2.5 flex flex-col flex-1">
                                    <h3 className="font-semibold text-white text-xs line-clamp-2 leading-snug mb-1 group-hover:text-orange-300 transition-colors">{item.name}</h3>
                                    <p className="text-orange-400 font-bold text-sm mt-auto">£{item.price.toFixed(2)}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="col-span-1 md:col-span-3 bg-[#151720] rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col">
                    <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0 flex items-center justify-between">
                        <h2 className="text-white font-bold text-base">Order</h2>
                        {orderType === 'dine_in' && selectedTable && (
                            <span className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-0.5 rounded-lg font-medium">{selectedTable.table_number}</span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-hide">
                        {optimisticCart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                                <ShoppingCart className="h-10 w-10 text-gray-700 mb-3" />
                                <p className="text-gray-500 text-sm font-medium">Cart is empty</p>
                                <p className="text-gray-600 text-xs mt-1">Tap items to add them</p>
                            </div>
                        ) : (
                            optimisticCart.map(item => (
                                <div key={item.id} className="bg-[#1a1d27] rounded-xl border border-white/[0.05] p-2.5">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1 pr-2 min-w-0">
                                            <p className="text-white font-semibold text-xs leading-tight truncate">{item.name}</p>
                                            {item.customizations && Object.keys(item.customizations).length > 0 && (
                                                <div className="text-gray-500 text-[9px] mt-0.5 space-y-0.5">
                                                    {Object.entries(item.customizations).slice(0, 2).map(([key, value]) => (
                                                        <p key={key} className="truncate">{key}: {Array.isArray(value) ? value.join(', ') : value}</p>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-orange-400 text-xs mt-1 font-bold">£{(item.price * item.quantity).toFixed(2)}</p>
                                        </div>
                                        <button
                                            onClick={() => onRemoveItem(item.id)}
                                            className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors flex-shrink-0"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                                            className="h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="text-white font-bold text-sm flex-1 text-center">{item.quantity}</span>
                                        <button
                                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                                            className="h-7 w-7 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 flex items-center justify-center transition-colors"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="border-t border-white/[0.06] p-3 space-y-2">
                        {/* Total */}
                        <div className="flex items-center justify-between px-1">
                            <span className="text-gray-400 text-sm font-medium">Total</span>
                            <span className="text-white text-2xl font-bold">£{cartTotal.toFixed(2)}</span>
                        </div>

                        {orderType === 'dine_in' ? (
                            <>
                                {!selectedTable ? (
                                    <button
                                        onClick={() => setTableSelectionOpen(true)}
                                        disabled={tables.length === 0}
                                        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                                    >
                                        <Users className="h-4 w-4" />
                                        Select Table ({tables.length})
                                    </button>
                                ) : (
                                    <>
                                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-2.5 text-center">
                                            <p className="text-orange-400 text-[10px] font-medium uppercase tracking-wide">Selected</p>
                                            <p className="text-white font-bold text-base">{selectedTable.table_number}</p>
                                        </div>
                                        <button
                                            onClick={() => handleAddToTable(selectedTable)}
                                            disabled={optimisticCart.length === 0 || isAddingToTable}
                                            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                                        >
                                            <ShoppingCart className="h-4 w-4" />
                                            {isAddingToTable ? 'Adding...' : 'Send to Table'}
                                        </button>
                                        <button onClick={() => setSelectedTable(null)}
                                            className="w-full bg-white/5 hover:bg-white/10 text-gray-300 font-semibold h-9 rounded-xl text-xs transition-colors">
                                            Change Table
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={onClearCart}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 font-semibold h-9 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowPayment(true)}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-bold h-12 rounded-xl text-sm transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2"
                                >
                                    <ShoppingCart className="h-4 w-4" />
                                    Charge · £{cartTotal.toFixed(2)}
                                </button>
                                <button
                                    onClick={onClearCart}
                                    disabled={optimisticCart.length === 0}
                                    className="w-full bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 font-semibold h-9 rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Clear Cart
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Quick Actions */}
            <div className="bg-[#151720] rounded-2xl border border-white/[0.06] p-2.5 flex items-center gap-2">
                {orderType === 'dine_in' && (
                    <button
                        onClick={() => setViewMode('tables')}
                        className="h-12 px-4 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors"
                    >
                        <Users className="h-4 w-4" />
                        Tables
                    </button>
                )}
                <button
                    onClick={() => setCustomItemOpen(true)}
                    className="h-12 px-4 bg-white/5 hover:bg-white/10 border border-white/[0.08] text-gray-300 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors"
                >
                    <PlusCircle className="h-4 w-4" />
                    Custom Item
                </button>
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

            {showKeyboard && (
                <OnScreenKeyboard
                    onKeyPress={(key) => setSearchQuery(prev => prev + key)}
                    onBackspace={() => setSearchQuery(prev => prev.slice(0, -1))}
                    onSpace={() => setSearchQuery(prev => prev + ' ')}
                    onClose={() => setShowKeyboard(false)}
                />
            )}
        </div>
    );
}