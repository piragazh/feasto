import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Scissors, Users, PlusCircle, PauseCircle, Phone, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import POSItemCustomization from './POSItemCustomization';
import POSPayment from './POSPayment';
import SplitBillDialog from './SplitBillDialog';
import FloorPlanView from './FloorPlanView';
import TableSelectionDialog from './TableSelectionDialog';
import CustomItemDialog from './CustomItemDialog';
import OnScreenKeyboard from './OnScreenKeyboard';
import POSOfflineSyncBanner from './POSOfflineSyncBanner';
import POSCategoryPanel from './POSCategoryPanel';
import POSMenuGrid from './POSMenuGrid';
import POSCart from './POSCart';
import POSTablesGrid from './POSTablesGrid';
import HeldOrdersDrawer from './HeldOrdersDrawer';
import PhoneOrderDialog from './PhoneOrderDialog';
import { cacheMenuItems, getCachedMenuItems, cacheRestaurant, getCachedRestaurant, cacheTables, getCachedTables } from './POSOfflineDB';

export default function POSOrderEntry({ restaurantId, cart, onAddItem, onRemoveItem, onUpdateQuantity, onClearCart, cartTotal, orderType, setOrderType, posTheme = 'dark', restaurant: restaurantProp, discount, onApplyDiscount, onRemoveDiscount }) {
    const isDark = posTheme === 'dark';
    const t = {
        panel:          isDark ? 'bg-[#151720] border-white/[0.06]'                                          : 'bg-white border-gray-200',
        panelHead:      isDark ? 'border-white/[0.06]'                                                        : 'border-gray-100',
        text:           isDark ? 'text-white'                                                                 : 'text-gray-900',
        textMuted:      isDark ? 'text-gray-400'                                                              : 'text-gray-500',
        textSub:        isDark ? 'text-gray-500'                                                              : 'text-gray-400',
        catBtn:         isDark ? 'text-gray-400 hover:text-white hover:bg-white/5'                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
        itemCard:       isDark ? 'bg-[#1a1d27] border-white/[0.06] hover:border-orange-500/50 hover:shadow-orange-500/10' : 'bg-white border-gray-200 hover:border-orange-400 hover:shadow-orange-100',
        itemImg:        isDark ? 'bg-[#0f1117]'                                                               : 'bg-gray-50',
        itemName:       isDark ? 'text-white group-hover:text-orange-300'                                     : 'text-gray-800 group-hover:text-orange-500',
        cartItem:       isDark ? 'bg-[#1a1d27] border-white/[0.05]'                                          : 'bg-gray-50 border-gray-100',
        qtyMinus:       isDark ? 'bg-white/5 hover:bg-white/10 text-white'                                   : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
        qtyPlus:        isDark ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400'                   : 'bg-orange-100 hover:bg-orange-200 text-orange-600',
        searchBg:       isDark ? 'bg-[#0f1117] border-white/[0.08] text-white placeholder-gray-500 focus:border-orange-500/50' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400',
        emptyIcon:      isDark ? 'text-gray-700'                                                              : 'text-gray-300',
        emptyText:      isDark ? 'text-gray-500'                                                              : 'text-gray-400',
        emptySub:       isDark ? 'text-gray-600'                                                              : 'text-gray-300',
        bottomBar:      isDark ? 'bg-[#151720] border-white/[0.06]'                                          : 'bg-white border-gray-200',
        tableContainer: isDark ? 'bg-[#151720] border-white/[0.06]'                                          : 'bg-gray-50 border-gray-200',
        payBack:        isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300'            : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700',
        floorBack:      isDark ? 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-400'      : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-600',
        bg:             isDark ? 'bg-[#0c0e16]'                                                               : 'bg-gray-50',
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [customizationOpen, setCustomizationOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);
    const [showPayment, setShowPayment] = useState(false);
    const [optimisticCart, setOptimisticCart] = useState(cart);
    const [viewMode, setViewMode] = useState('entry'); // 'entry' | 'tables' | 'floor-plan'
    const [viewingTable, setViewingTable] = useState(null);
    const [tableActionsOpen, setTableActionsOpen] = useState(false);
    const [selectedTableForActions, setSelectedTableForActions] = useState(null);
    const [splitBillOpen, setSplitBillOpen] = useState(false);
    const [isAddingToTable, setIsAddingToTable] = useState(false);
    const [tableSelectionOpen, setTableSelectionOpen] = useState(false);
    const [customItemOpen, setCustomItemOpen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [heldOrders, setHeldOrders] = useState(() => {
        try { return JSON.parse(localStorage.getItem('pos_held_orders') || '[]'); } catch { return []; }
    });
    const [heldDrawerOpen, setHeldDrawerOpen] = useState(false);
    const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
    const [phoneDetails, setPhoneDetails] = useState({});

    React.useEffect(() => { setOptimisticCart(cart); }, [cart]);

    const handleQuantityChange = (itemId, newQuantity) => {
        setOptimisticCart(prev => prev.map(item => item.id === itemId ? { ...item, quantity: newQuantity } : item));
        onUpdateQuantity(itemId, newQuantity);
    };

    // ── Data fetching ──────────────────────────────────────────────────────────
    const { data: restaurantFetched } = useQuery({
        queryKey: ['restaurant', restaurantId],
        queryFn: async () => {
            try { const r = (await base44.entities.Restaurant.filter({ id: restaurantId }))[0]; if (r) cacheRestaurant(r); return r; }
            catch { return getCachedRestaurant(restaurantId); }
        },
        enabled: !!restaurantId && !restaurantProp,
    });
    const restaurant = restaurantProp || restaurantFetched;

    const { data: menuItems = [] } = useQuery({
    queryKey: ['pos-menu-items', restaurantId],
    queryFn: async () => {
        try {
            const items = await base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true });
            // Filter out online-only items for POS
            const posItems = items.filter(i => !i.availability_channel || i.availability_channel !== 'online_only');
            if (posItems?.length) cacheMenuItems(restaurantId, posItems);
            return posItems;
        }
        catch { return getCachedMenuItems(restaurantId); }
    },
    enabled: !!restaurantId,
    });

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['pos-tables', restaurantId],
        queryFn: async () => {
            try { const result = await base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId, is_active: true }); if (result?.length) cacheTables(restaurantId, result); return result; }
            catch { return getCachedTables(restaurantId); }
        },
        enabled: !!restaurantId,
    });

    const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery({
        queryKey: ['pos-table-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({ restaurant_id: restaurantId, order_type: 'dine_in', status: { $in: ['preparing', 'confirmed', 'pending'] } }),
        enabled: !!restaurantId,
        refetchInterval: 3000,
        staleTime: 0,
        gcTime: 0,
    });

    // ── Menu helpers ───────────────────────────────────────────────────────────
    const getOrderedCategories = () => {
        const order = restaurant?.category_order || [];
        const all = restaurant?.menu_categories || [];
        return [...order.filter(c => all.includes(c)), ...all.filter(c => !order.includes(c))];
    };

    const getOrderedItems = (category) => {
        const categoryOrder = (restaurant?.item_order || {})[category] || [];
        const items = menuItems.filter(i => i.category === category && i.is_available !== false);
        const ordered = categoryOrder.map(id => items.find(i => i.id === id)).filter(Boolean);
        const orderedIds = new Set(ordered.map(i => i.id));
        return [...ordered, ...items.filter(i => !orderedIds.has(i.id))];
    };

    const categories = getOrderedCategories();

    const filteredItems = (() => {
        const base = selectedCategory ? getOrderedItems(selectedCategory) : menuItems.filter(i => i.is_available !== false);
        return searchQuery ? base.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())) : base;
    })();

    // ── Handlers ───────────────────────────────────────────────────────────────
    const handleItemClick = (item) => {
        // Use POS-specific price if set
        const posItem = item.pos_price != null ? { ...item, price: item.pos_price } : item;
        if (posItem.customization_options?.length > 0) { setSelectedItem(posItem); setCustomizationOpen(true); }
        else onAddItem({ ...posItem, quantity: 1, customizations: {} });
    };

    const handleCustomizationConfirm = (item) => { onAddItem(item); setCustomizationOpen(false); setSelectedItem(null); };

    const handleAddToTable = async (table) => {
        if (optimisticCart.length === 0) { toast.error('Cart is empty'); return; }
        if (isAddingToTable) return;
        setIsAddingToTable(true);
        try {
            const created = await base44.entities.Order.create({
                restaurant_id: restaurantId,
                restaurant_name: restaurant?.name || 'POS Order',
                items: optimisticCart.map(item => ({ menu_item_id: item.menu_item_id || item.id, name: item.name, price: item.price, quantity: item.quantity, customizations: item.customizations || {} })),
                subtotal: cartTotal, delivery_fee: 0, discount: 0, total: cartTotal,
                status: 'preparing', order_type: 'dine_in', payment_method: 'cash',
                table_id: table.id, table_number: table.table_number,
            });
            await base44.entities.RestaurantTable.update(table.id, { status: 'occupied', current_order_id: created.id });
            toast.success(`Order added to ${table.table_number}!`);
            onClearCart();
            setSelectedTable(null);
            await new Promise(r => setTimeout(r, 200));
            await Promise.all([refetchTableOrders(), refetchTables()]);
        } catch (error) {
            toast.error('Failed to add items to table: ' + (error.message || 'Unknown error'));
        } finally {
            setIsAddingToTable(false);
        }
    };

    const handlePaymentComplete = async () => {
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable?.id);
        try {
            for (const order of ordersForTable) await base44.entities.Order.update(order.id, { status: 'delivered' });
            toast.success('Payment completed!');
            setShowPayment(false); setViewingTable(null); setViewMode('tables');
            refetchTableOrders();
        } catch { toast.error('Failed to complete payment'); }
    };

    // ── Hold / Recall ──────────────────────────────────────────────────────────
    const holdOrder = () => {
        if (optimisticCart.length === 0) { toast.error('Cart is empty'); return; }
        const held = {
            id: Date.now().toString(),
            heldAt: new Date().toISOString(),
            items: optimisticCart,
            total: cartTotal,
            label: orderType === 'dine_in' && selectedTable ? selectedTable.table_number : `${orderType.charAt(0).toUpperCase() + orderType.slice(1)} Order`,
            orderType,
            tableId: selectedTable?.id || null,
        };
        const updated = [...heldOrders, held];
        setHeldOrders(updated);
        localStorage.setItem('pos_held_orders', JSON.stringify(updated));
        onClearCart();
        toast.success('Order held — tap "Held Orders" to recall');
    };

    const recallOrder = (held) => {
        if (optimisticCart.length > 0) {
            holdOrder(); // auto-hold current cart before recalling
        }
        held.items.forEach(item => onAddItem({ ...item }));
        deleteHeldOrder(held.id);
        toast.success('Order recalled');
    };

    const deleteHeldOrder = (id) => {
        const updated = heldOrders.filter(h => h.id !== id);
        setHeldOrders(updated);
        localStorage.setItem('pos_held_orders', JSON.stringify(updated));
    };

    // ── Views ──────────────────────────────────────────────────────────────────
    if (showPayment) {
        // Takeaway
        if (!viewingTable) {
            return (
                <div className={`flex flex-col h-[calc(100vh-200px)] ${t.bg}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className={`${t.text} font-bold text-xl`}>Payment</h2>
                        <button onClick={() => setShowPayment(false)} className={`px-4 py-2 ${t.payBack} border text-sm font-semibold rounded-xl transition-colors`}>← Back</button>
                    </div>
                    <POSPayment cart={optimisticCart} cartTotal={cartTotal} onPaymentComplete={() => { toast.success('Payment completed!'); setShowPayment(false); onClearCart(); }} onBackToCart={() => setShowPayment(false)} restaurantId={restaurantId} restaurantName={restaurant?.name} orderType={orderType} discount={discount} onApplyDiscount={onApplyDiscount} onRemoveDiscount={onRemoveDiscount} restaurant={restaurant} />
                </div>
            );
        }

        // Dine-in
        const ordersForTable = tableOrders.filter(o => o.table_id === viewingTable.id);
        const total = ordersForTable.reduce((s, o) => s + o.total, 0);
        return (
            <div className={`flex flex-col h-[calc(100vh-200px)] ${t.bg}`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className={`${t.text} font-bold text-xl`}>{viewingTable.table_number}</h2>
                        <p className={`${t.textSub} text-xs`}>Payment · £{total.toFixed(2)}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSplitBillOpen(true)} className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                            <Scissors className="h-3.5 w-3.5" /> Split Bill
                        </button>
                        <button onClick={() => { setShowPayment(false); setViewMode('tables'); }} className={`px-4 py-2 ${t.payBack} border text-sm font-semibold rounded-xl transition-colors`}>← Back</button>
                    </div>
                </div>
                <POSPayment cart={ordersForTable.flatMap(o => o.items)} cartTotal={total} onPaymentComplete={handlePaymentComplete} onBackToCart={() => { setShowPayment(false); setViewMode('tables'); }} />
                {splitBillOpen && <SplitBillDialog open={splitBillOpen} onClose={() => setSplitBillOpen(false)} orders={ordersForTable} table={viewingTable} onPaymentComplete={() => { setSplitBillOpen(false); handlePaymentComplete(); }} />}
            </div>
        );
    }

    if (viewMode === 'floor-plan') {
        return (
            <div className={`flex flex-col h-[calc(100vh-200px)] ${t.bg}`}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className={`${t.text} font-bold text-xl`}>Floor Plan</h2>
                    <div className="flex gap-2">
                        <button onClick={() => setViewMode('tables')} className={`px-4 py-2 ${t.floorBack} border text-sm font-semibold rounded-xl transition-colors`}>Grid View</button>
                        <button onClick={() => setViewMode('entry')} className="px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm font-semibold rounded-xl transition-colors">Back to Orders</button>
                    </div>
                </div>
                <FloorPlanView tables={tables} tableOrders={tableOrders} onRefresh={() => { refetchTables(); refetchTableOrders(); }} onTableClick={(table) => { setViewingTable(table); setShowPayment(true); }} />
            </div>
        );
    }

    if (viewMode === 'tables') {
        return (
            <POSTablesGrid
                t={t} isDark={isDark} tables={tables} tableOrders={tableOrders}
                onBack={() => setViewMode('entry')}
                onTablePay={(table) => { setViewingTable(table); setShowPayment(true); }}
                refetchTables={refetchTables} refetchTableOrders={refetchTableOrders}
                tableActionsOpen={tableActionsOpen} setTableActionsOpen={setTableActionsOpen}
                selectedTableForActions={selectedTableForActions} setSelectedTableForActions={setSelectedTableForActions}
            />
        );
    }

    // ── Layout configs ─────────────────────────────────────────────────────────
    const posLayout = restaurant?.pos_layout || 'standard';
    const layoutCols = {
        standard:   { cat: 'md:col-span-2', menu: 'md:col-span-7', cart: 'md:col-span-3', showCat: true },
        compact:    { cat: 'md:col-span-1', menu: 'md:col-span-8', cart: 'md:col-span-3', showCat: true },
        menu_focus: { cat: '',              menu: 'md:col-span-9', cart: 'md:col-span-3', showCat: false },
        cart_focus: { cat: 'md:col-span-2', menu: 'md:col-span-5', cart: 'md:col-span-5', showCat: true },
    }[posLayout] || { cat: 'md:col-span-2', menu: 'md:col-span-7', cart: 'md:col-span-3', showCat: true };

    // Main entry view
    return (
        <div className={`flex flex-col h-[calc(100vh-130px)] ${t.bg}`}>
            <POSOfflineSyncBanner restaurantId={restaurantId} />

            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 overflow-hidden pb-3">
                {layoutCols.showCat && (
                    <div className={`${layoutCols.cat} overflow-hidden`}>
                        <POSCategoryPanel categories={categories} selectedCategory={selectedCategory} onSelect={setSelectedCategory} t={t} />
                    </div>
                )}
                <div className={`${layoutCols.menu} overflow-hidden`}>
                    <POSMenuGrid filteredItems={filteredItems} searchQuery={searchQuery} onSearchChange={setSearchQuery} onSearchFocus={() => setShowKeyboard(true)} onItemClick={handleItemClick} t={t} />
                </div>
                <div className={`${layoutCols.cart} overflow-hidden flex flex-col gap-2`}>
                    {(orderType === 'phone_collection' || orderType === 'phone_delivery') && (
                        <button
                            onClick={() => setPhoneDialogOpen(true)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border font-semibold text-sm transition-colors ${
                                window.__phoneOrderDetails?.name
                                    ? isDark ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700'
                                    : isDark ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                {window.__phoneOrderDetails?.name
                                    ? <span>{window.__phoneOrderDetails.name}</span>
                                    : <span>Enter Customer Details</span>
                                }
                            </div>
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    )}
                    <POSCart
                        t={t} isDark={isDark}
                        optimisticCart={optimisticCart} cartTotal={cartTotal} orderType={orderType}
                        selectedTable={selectedTable} tables={tables}
                        onRemoveItem={onRemoveItem}
                        onUpdateQuantity={handleQuantityChange}
                        onClearCart={onClearCart}
                        onSelectTable={(table) => table === null ? setSelectedTable(null) : setTableSelectionOpen(true)}
                        onAddToTable={() => handleAddToTable(selectedTable)}
                        onCharge={() => setShowPayment(true)}
                        isAddingToTable={isAddingToTable}
                        discount={discount}
                    />
                </div>
            </div>

            {/* Bottom Quick Actions */}
            <div className={`${t.bottomBar} rounded-2xl border p-2.5 flex items-center gap-2`}>
                {orderType === 'dine_in' && (
                    <button onClick={() => setViewMode('tables')} className={`h-12 px-4 ${t.floorBack} border font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors`}>
                        <Users className="h-4 w-4" /> Tables
                    </button>
                )}
                <button onClick={() => setCustomItemOpen(true)} className={`h-12 px-4 ${isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600'} border font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors`}>
                    <PlusCircle className="h-4 w-4" /> Custom Item
                </button>
                <button
                    onClick={holdOrder}
                    disabled={optimisticCart.length === 0}
                    className={`h-12 px-4 ${isDark ? 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30 text-yellow-400 disabled:opacity-40' : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200 text-yellow-600 disabled:opacity-40'} border font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors`}
                >
                    <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                    onClick={() => setHeldDrawerOpen(true)}
                    className={`h-12 px-4 relative ${isDark ? 'bg-white/5 hover:bg-white/10 border-white/[0.08] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-600'} border font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors`}
                >
                    <PauseCircle className="h-4 w-4" /> Held Orders
                    {heldOrders.length > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {heldOrders.length}
                        </span>
                    )}
                </button>
            </div>

            {selectedItem && (
                <POSItemCustomization item={selectedItem} open={customizationOpen} onClose={() => { setCustomizationOpen(false); setSelectedItem(null); }} onConfirm={handleCustomizationConfirm} posTheme={posTheme} />
            )}

            <TableSelectionDialog open={tableSelectionOpen} onClose={() => setTableSelectionOpen(false)} tables={tables} selectedTable={selectedTable} onSelectTable={(table) => setSelectedTable(table)} />
            <CustomItemDialog open={customItemOpen} onClose={() => setCustomItemOpen(false)} onAdd={(item) => onAddItem(item)} restaurantId={restaurantId} posTheme={posTheme} />
            <PhoneOrderDialog
                open={phoneDialogOpen}
                onClose={() => { setPhoneDialogOpen(false); setPhoneDetails(window.__phoneOrderDetails || {}); }}
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                isDark={isDark}
                restaurantId={restaurantId}
            />
            <HeldOrdersDrawer
                open={heldDrawerOpen}
                onClose={() => setHeldDrawerOpen(false)}
                heldOrders={heldOrders}
                onRecall={recallOrder}
                onDelete={deleteHeldOrder}
                isDark={isDark}
                t={t}
            />

            {showKeyboard && (
                <OnScreenKeyboard onKeyPress={(key) => setSearchQuery(p => p + key)} onBackspace={() => setSearchQuery(p => p.slice(0, -1))} onSpace={() => setSearchQuery(p => p + ' ')} onClose={() => setShowKeyboard(false)} />
            )}
        </div>
    );
}