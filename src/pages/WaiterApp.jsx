import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Delete, ArrowLeft, Send, Plus, Minus, Trash2, Search, LogOut } from 'lucide-react';
import { saveStaffSession, getStaffSessionToken, clearStaffSession } from '@/lib/posStaffSession';
import { PERMISSIONS, roleHasPermission } from '@/lib/posPermissions';
import { applyPaletteToDocument, DEFAULT_PALETTE } from '@/lib/posThemes';

/**
 * Waiter App — table-side ordering on a phone or iPad.
 *
 * SCOPE, DELIBERATELY NARROW
 *   Take an order at the table and send it to the kitchen. Nothing else.
 *   No payment, no voids, no discounts, no reports, no settings. A device that
 *   lives in an apron pocket and gets left on tables should not be able to move
 *   money, and keeping the surface small is most of what makes that true.
 *
 * AUTHENTICATION
 *   Same staff number + PIN as the till, via posVerifyStaffPin, and the same
 *   signed session token. Orders are attributed server-side from that token, so
 *   a waiter's sales appear in their figures exactly as if rung in at the till.
 *
 * WHY NOT REUSE THE POS SCREEN
 *   The POS is built for a fixed landscape terminal with a persistent cart
 *   panel. A waiter is standing up, one-handed, on a narrow screen. The flow
 *   here is linear — table, then items, then send — rather than parallel.
 */

const STEP = { LOGIN: 'login', TABLES: 'tables', TABLE: 'table', MENU: 'menu' };

export default function WaiterApp() {
    const params = new URLSearchParams(window.location.search);
    const restaurantId = params.get('restaurantId');

    /**
     * Device provisioning.
     *
     * The backend requires an authenticated Base44 session - the DEVICE is
     * logged in once as the restaurant, and staff then identify themselves with
     * a number and PIN on top of that. Without it, everything from loading the
     * menu to sending an order fails with 401.
     *
     * Checked up front because the failure would otherwise surface only at Send:
     * a waiter would take a whole order at the table before discovering the
     * device was never set up, and the error ("check your connection") would
     * point them at entirely the wrong thing.
     */
    const [deviceReady, setDeviceReady] = useState(null);   // null = checking
    useEffect(() => {
        let cancelled = false;
        base44.auth.me()
            .then(u => { if (!cancelled) setDeviceReady(!!u); })
            .catch(() => { if (!cancelled) setDeviceReady(false); });
        return () => { cancelled = true; };
    }, []);

    const [step, setStep] = useState(STEP.LOGIN);
    const [staff, setStaff] = useState(null);
    const [table, setTable] = useState(null);
    const [cart, setCart] = useState([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [sending, setSending] = useState(false);

    // ── Login state ──────────────────────────────────────────────────────────
    const [loginStep, setLoginStep] = useState('number');
    const [staffNumber, setStaffNumber] = useState('');
    const [pin, setPin] = useState('');
    const [loginError, setLoginError] = useState('');
    const [verifying, setVerifying] = useState(false);

    const { data: restaurant } = useQuery({
        queryKey: ['waiter-restaurant', restaurantId],
        queryFn: async () => (await base44.entities.Restaurant.filter({ id: restaurantId }))?.[0] || null,
        enabled: !!restaurantId,
    });

    // Follow the restaurant's chosen accent colour. Without this the waiter app
    // stays default orange while the till shows the restaurant's brand colour -
    // the same product looking like two different ones on the floor.
    useEffect(() => {
        if (!restaurant) return undefined;
        return applyPaletteToDocument(restaurant.pos_palette || DEFAULT_PALETTE);
    }, [restaurant]);

    const { data: tables = [], refetch: refetchTables } = useQuery({
        queryKey: ['waiter-tables', restaurantId],
        queryFn: () => base44.entities.RestaurantTable.filter({ restaurant_id: restaurantId }),
        enabled: !!restaurantId && step !== STEP.LOGIN,
        refetchInterval: 15000,
    });

    // Live orders for every table, so a waiter can see what is already on a table
    // before adding to it - and avoid re-ringing a round that has already gone in.
    const { data: tableOrders = [], refetch: refetchTableOrders } = useQuery({
        queryKey: ['waiter-table-orders', restaurantId],
        queryFn: () => base44.entities.Order.filter({
            restaurant_id: restaurantId,
            order_type: 'dine_in',
            status: { $in: ['pending', 'confirmed', 'preparing', 'ready_for_collection'] },
        }, '-created_date', 100),
        enabled: !!restaurantId && step !== STEP.LOGIN,
        refetchInterval: 15000,
    });

    const ordersFor = (tableId) => tableOrders.filter(o => o.table_id === tableId);
    const totalFor = (tableId) => ordersFor(tableId).reduce((s2, o) => s2 + Number(o.total || 0), 0);

    const { data: menuItems = [] } = useQuery({
        queryKey: ['waiter-menu', restaurantId],
        queryFn: () => base44.entities.MenuItem.filter({ restaurant_id: restaurantId, is_available: true }),
        enabled: !!restaurantId && step !== STEP.LOGIN,
    });

    const login = useCallback(async (pinValue) => {
        setVerifying(true);
        setLoginError('');
        try {
            const res = await base44.functions.invoke('posVerifyStaffPin', {
                staff_number: staffNumber,
                restaurant_id: restaurantId,
                pin: pinValue,
                terminal: 'waiter-app',
            });
            const data = res?.data ?? res;
            if (data?.valid) {
                // A waiter app is for taking orders. Someone whose role cannot
                // create orders has no use for it, and letting them in would only
                // produce confusing failures at send time.
                const canOrder = roleHasPermission(
                    restaurant?.role_permissions, data.staff?.role, PERMISSIONS.ORDER_CREATE,
                );
                if (!canOrder) {
                    setLoginError('Your role cannot take orders. Speak to a manager.');
                    setPin('');
                    return;
                }
                saveStaffSession(restaurantId, data.session, data.session_expires, data.staff);
                setStaff(data.staff);
                setStep(STEP.TABLES);
            } else {
                setLoginError(data?.error || 'Incorrect staff number or PIN');
                setPin('');
                if (data?.locked) { setLoginStep('number'); setStaffNumber(''); }
            }
        } catch {
            setLoginError('Could not sign in — check your connection');
            setPin('');
        } finally {
            setVerifying(false);
        }
    }, [staffNumber, restaurantId, restaurant?.role_permissions]);

    const logout = () => {
        clearStaffSession(restaurantId);
        setStaff(null); setCart([]); setTable(null);
        setStaffNumber(''); setPin(''); setLoginStep('number');
        setStep(STEP.LOGIN);
    };

    /**
     * Change a table's status from the floor.
     *
     * A waiter is the person who actually knows a table has been cleared or needs
     * cleaning - making them walk to the till to say so is how floor plans drift
     * out of step with reality and end up with everything stuck 'occupied'.
     *
     * Refuses to free a table that still has live orders: that would orphan the
     * bill and lose the link between the food and the table it belongs to.
     */
    const setTableStatus = async (tbl, status) => {
        const live = ordersFor(tbl.id);
        if (status === 'available' && live.length > 0) {
            toast.error(`${tbl.table_number} still has an unpaid order — settle it at the till first`);
            return;
        }
        try {
            await base44.entities.RestaurantTable.update(tbl.id, {
                status,
                ...(status === 'available' ? { current_order_id: null } : {}),
            });
            toast.success(`${tbl.table_number} marked ${status.replace('_', ' ')}`);
            await refetchTables();
            if (status === 'available') { setTable(null); setStep(STEP.TABLES); }
        } catch (e) {
            toast.error('Could not update the table: ' + (e?.message || 'unknown error'));
        }
    };

    const addItem = (item) => {
        // Items with options are NOT sendable from here.
        //
        // This app has no customization dialog, so adding one would send it with
        // no size, no toppings and the base price - the kitchen would not know
        // what to make and the bill would be short. Better to say so plainly and
        // send the waiter to the till than to produce a wrong order silently.
        //
        // (A future version can embed the same customization dialogs the POS
        // uses; until then this is an honest limit rather than a hidden bug.)
        if (item.customization_options?.length > 0) {
            toast.error(`${item.name} has options — ring this one in at the till`, { duration: 5000 });
            return;
        }
        const price = item.pos_price != null ? item.pos_price : item.price;
        setCart(prev => {
            const existing = prev.find(c => c.menu_item_id === item.id);
            if (existing) {
                return prev.map(c => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, { menu_item_id: item.id, name: item.name, price, quantity: 1, customizations: {} }];
        });
    };

    const changeQty = (menuItemId, delta) => {
        setCart(prev => prev
            .map(c => c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c)
            .filter(c => c.quantity > 0));
    };

    const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);

    const sendToKitchen = async () => {
        if (!table || cart.length === 0) return;
        setSending(true);
        try {
            const res = await base44.functions.invoke('posCreateOrder', {
                restaurant_id: restaurantId,
                items: cart,
                order_type: 'dine_in',
                table_id: table.id,
                table_number: table.table_number,
                // Unpaid by design: a table bill is settled at the till later.
                payment_method: null,
                status: 'confirmed',
                staff_session: getStaffSessionToken(restaurantId),
            });
            const data = res?.data ?? res;
            if (data?.error) throw new Error(data.error);
            if (!data?.order && !data?.id) throw new Error('The order was not created');

            try {
                await base44.entities.RestaurantTable.update(table.id, { status: 'occupied' });
            } catch { /* non-blocking - the order is what matters */ }

            toast.success(`Sent to kitchen — ${table.table_number}`);
            setCart([]);
            await refetchTableOrders();
            // Back to the table, not the picker - a waiter usually wants to see
            // what is now on it, and often adds a second round straight after.
            setStep(STEP.TABLE);
        } catch (e) {
            toast.error(e?.message || 'Could not send the order');
        } finally {
            setSending(false);
        }
    };

    // ── Device not set up ────────────────────────────────────────────────────
    if (deviceReady === false) {
        return (
            <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-white text-lg font-bold mb-2">This device isn&rsquo;t set up yet</h1>
                <p className="text-gray-400 text-sm max-w-xs mb-4">
                    A manager needs to sign in to MealDrop on this device once. After that,
                    staff just use their number and PIN.
                </p>
                <a href="/" className="h-12 px-6 rounded-xl bg-orange-500 text-white font-bold text-sm flex items-center">
                    Sign in
                </a>
            </div>
        );
    }

    if (deviceReady === null) {
        return (
            <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
                <p className="text-gray-500 text-sm">Checking device&hellip;</p>
            </div>
        );
    }

    // ── Login ────────────────────────────────────────────────────────────────
    if (step === STEP.LOGIN) {
        const value = loginStep === 'number' ? staffNumber : pin;
        const press = (d) => {
            setLoginError('');
            if (loginStep === 'number') {
                if (staffNumber.length < 6) setStaffNumber(staffNumber + d);
            } else {
                const next = pin + d;
                if (next.length <= 6) {
                    setPin(next);
                    if (next.length === 4) setTimeout(() => login(next), 80);
                }
            }
        };
        return (
            <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6">
                <h1 className="text-white text-xl font-bold mb-1">{restaurant?.name || 'Waiter'}</h1>
                <p className="text-gray-500 text-xs mb-6">
                    {loginStep === 'number' ? 'Enter your staff number' : 'Enter your PIN'}
                </p>

                <div className="w-full max-w-xs">
                    <div className="mb-4 h-16 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-center">
                        <span className="text-white text-3xl font-bold tracking-widest">
                            {loginStep === 'number'
                                ? (staffNumber || <span className="text-gray-600 text-base font-normal tracking-normal">Staff number</span>)
                                : ('●'.repeat(pin.length) || <span className="text-gray-600 text-base font-normal tracking-normal">PIN</span>)}
                        </span>
                    </div>

                    {loginError && <p className="text-red-400 text-sm text-center mb-3" role="alert">{loginError}</p>}

                    <div className="grid grid-cols-3 gap-2">
                        {[1,2,3,4,5,6,7,8,9].map(d => (
                            <button key={d} disabled={verifying} onClick={() => press(String(d))}
                                className="h-16 rounded-2xl text-2xl font-bold bg-white/5 active:bg-white/20 border border-white/10 text-white disabled:opacity-40">
                                {d}
                            </button>
                        ))}
                        <button disabled={verifying}
                            onClick={() => {
                                setLoginError('');
                                if (loginStep === 'number') setStaffNumber(staffNumber.slice(0, -1));
                                else if (pin.length) setPin(pin.slice(0, -1));
                                else setLoginStep('number');
                            }}
                            className="h-16 rounded-2xl flex items-center justify-center bg-white/5 active:bg-white/20 border border-white/10 text-white disabled:opacity-40">
                            <Delete className="h-6 w-6" />
                        </button>
                        <button disabled={verifying} onClick={() => press('0')}
                            className="h-16 rounded-2xl text-2xl font-bold bg-white/5 active:bg-white/20 border border-white/10 text-white disabled:opacity-40">
                            0
                        </button>
                        <button
                            disabled={verifying || (loginStep === 'number' ? staffNumber.length < 3 : value.length === 0)}
                            onClick={() => loginStep === 'number' ? (setLoginStep('pin'), setLoginError('')) : login(pin)}
                            className="h-16 rounded-2xl text-base font-bold bg-orange-500 active:bg-orange-700 text-white disabled:opacity-40">
                            {verifying ? '…' : loginStep === 'number' ? 'Next' : 'Enter'}
                        </button>
                    </div>
                </div>

                {!restaurantId && (
                    <p className="text-amber-400 text-xs mt-6 text-center max-w-xs">
                        No restaurant in the link. Open this page with <code>?restaurantId=…</code>
                    </p>
                )}
            </div>
        );
    }

    // ── Table picker ─────────────────────────────────────────────────────────
    if (step === STEP.TABLES) {
        const active = tables.filter(t => t.is_active !== false);
        return (
            <div className="min-h-screen bg-[#0f1117] flex flex-col">
                <header className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
                    <div>
                        <h1 className="text-white font-bold">Choose a table</h1>
                        <p className="text-gray-500 text-xs">{staff?.full_name}</p>
                    </div>
                    <button onClick={logout} className="h-11 px-3 rounded-xl text-gray-400 flex items-center gap-1.5 text-xs">
                        <LogOut className="h-4 w-4" /> Sign out
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-3">
                    {active.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-12">No tables set up for this restaurant.</p>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                            {active.map(t => {
                                const busy = t.status === 'occupied';
                                return (
                                    <button key={t.id}
                                        onClick={() => { setTable(t); setStep(STEP.TABLE); }}
                                        className={`h-24 rounded-2xl border-2 font-bold text-white flex flex-col items-center justify-center gap-1 active:scale-[0.97] transition-transform ${
                                            busy ? 'bg-orange-500/20 border-orange-500/50' : 'bg-white/5 border-white/10'
                                        }`}>
                                        <span className="text-lg">{t.table_number}</span>
                                        <span className="text-[11px] font-normal text-gray-400 capitalize">
                                            {(() => {
                                                const n = ordersFor(t.id).length;
                                                if (n > 0) return `${n} order${n === 1 ? '' : 's'} · £${totalFor(t.id).toFixed(2)}`;
                                                return busy ? String(t.status || '').replace('_', ' ') : `${t.capacity || 0} seats`;
                                            })()}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Table detail ─────────────────────────────────────────────────────────
    if (step === STEP.TABLE && table) {
        const orders = ordersFor(table.id);
        const total = totalFor(table.id);
        return (
            <div className="min-h-screen bg-[#0f1117] flex flex-col">
                <header className="flex items-center gap-2 p-3 border-b border-white/10 flex-shrink-0">
                    <button onClick={() => { setTable(null); setStep(STEP.TABLES); }}
                        className="h-11 w-11 rounded-xl bg-white/5 text-white flex items-center justify-center flex-shrink-0">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-white font-bold truncate">{table.table_number}</h1>
                        <p className="text-gray-500 text-xs capitalize">
                            {String(table.status || 'available').replace('_', ' ')} · {table.capacity || 0} seats
                        </p>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {orders.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-10">
                            Nothing on this table yet.
                        </p>
                    ) : orders.map(o => (
                        <div key={o.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-white text-sm font-semibold">
                                    {o.order_number ? `#${o.order_number}` : `#${o.id.slice(-6)}`}
                                </span>
                                <span className="text-white font-bold tabular-nums">£{Number(o.total || 0).toFixed(2)}</span>
                            </div>
                            <div className="space-y-1">
                                {(o.items || []).map((it, i) => (
                                    <div key={i} className="flex justify-between text-gray-400 text-xs">
                                        <span className="truncate pr-2">{it.quantity}x {it.name}</span>
                                        <span className="tabular-nums flex-shrink-0">
                                            £{(Number(it.price || 0) * (it.quantity || 1)).toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="text-gray-600 text-[11px] mt-2 capitalize">
                                {String(o.status || '').replace(/_/g, ' ')}
                                {o.staff_name ? ` · ${o.staff_name}` : ''}
                            </p>
                        </div>
                    ))}
                </div>

                <div className="border-t border-white/10 bg-[#151720] p-3 flex-shrink-0 space-y-2">
                    {orders.length > 0 && (
                        <div className="flex items-baseline justify-between mb-1">
                            <span className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Table total</span>
                            <span className="text-white text-2xl font-bold tabular-nums leading-none">£{total.toFixed(2)}</span>
                        </div>
                    )}

                    <button onClick={() => setStep(STEP.MENU)}
                        className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-base flex items-center justify-center gap-2">
                        <Plus className="h-5 w-5" />
                        {orders.length > 0 ? 'Add more items' : 'Start the order'}
                    </button>

                    {/* Status is changed from the floor because the waiter is the
                        person who knows. Freeing a table with a live bill is
                        refused - that would orphan the order. */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setTableStatus(table, 'needs_cleaning')}
                            className="h-12 rounded-xl bg-white/5 active:bg-white/15 text-gray-300 text-sm font-semibold">
                            Needs cleaning
                        </button>
                        <button onClick={() => setTableStatus(table, 'available')}
                            className="h-12 rounded-xl bg-white/5 active:bg-white/15 text-gray-300 text-sm font-semibold">
                            Mark free
                        </button>
                    </div>
                    {orders.length > 0 && (
                        <p className="text-gray-600 text-[11px] text-center">
                            The bill is settled at the till.
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── Menu + cart ──────────────────────────────────────────────────────────
    const categories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
    const visible = menuItems.filter(i => {
        if (search) return i.name?.toLowerCase().includes(search.toLowerCase());
        if (category) return i.category === category;
        return true;
    });

    return (
        <div className="min-h-screen bg-[#0f1117] flex flex-col">
            <header className="flex items-center gap-2 p-3 border-b border-white/10 flex-shrink-0">
                {/* Back to the table, keeping it selected - the waiter is still
                    serving it. Clearing the cart here would silently discard a
                    half-built round if they tapped back to check something. */}
                <button onClick={() => setStep(STEP.TABLE)}
                    className="h-11 w-11 rounded-xl bg-white/5 text-white flex items-center justify-center flex-shrink-0">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-white font-bold truncate">{table?.table_number}</h1>
                    <p className="text-gray-500 text-xs truncate">{staff?.full_name}</p>
                </div>
            </header>

            <div className="p-3 flex-shrink-0">
                <div className="relative">
                    <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search the menu…"
                        className="w-full h-12 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 text-sm outline-none"
                    />
                </div>
                {!search && categories.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
                        <button onClick={() => setCategory('')}
                            className={`h-11 px-4 rounded-xl text-sm font-semibold whitespace-nowrap ${!category ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                            All
                        </button>
                        {categories.map(c => (
                            <button key={c} onClick={() => setCategory(c)}
                                className={`h-11 px-4 rounded-xl text-sm font-semibold whitespace-nowrap capitalize ${category === c ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                                {c}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {visible.map(item => {
                    const price = item.pos_price != null ? item.pos_price : item.price;
                    const inCart = cart.find(c => c.menu_item_id === item.id);
                    const needsOptions = item.customization_options?.length > 0;
                    return (
                        <button key={item.id} onClick={() => addItem(item)}
                            className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 ${
                                needsOptions
                                    ? 'bg-white/[0.02] border-white/5 opacity-50'
                                    : 'bg-white/5 border-white/10 active:bg-white/10'
                            }`}>
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-[15px] font-medium leading-snug">
                                    {item.name}
                                    {needsOptions && (
                                        <span className="ml-2 text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                                            till only
                                        </span>
                                    )}
                                </p>
                                <p className="text-orange-400 text-lg font-bold tabular-nums leading-none mt-1">£{Number(price).toFixed(2)}</p>
                            </div>
                            {inCart && (
                                <span className="h-7 min-w-[28px] px-2 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                    {inCart.quantity}
                                </span>
                            )}
                            <Plus className="h-5 w-5 text-gray-500 flex-shrink-0" />
                        </button>
                    );
                })}
                {visible.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-10">Nothing matches that.</p>
                )}
            </div>

            {cart.length > 0 && (
                <div className="border-t border-white/10 bg-[#151720] p-3 flex-shrink-0 max-h-[45vh] overflow-y-auto">
                    <div className="space-y-1.5 mb-3">
                        {cart.map(c => (
                            <div key={c.menu_item_id} className="flex items-center gap-2">
                                <span className="text-white text-sm flex-1 min-w-0 truncate">{c.name}</span>
                                {/* 44px minimum: these are the most-tapped controls in the
                                    app and are used standing up, one-handed. 36px was
                                    below the touch floor and invited mis-taps that change
                                    what the kitchen makes. */}
                                <button onClick={() => changeQty(c.menu_item_id, -1)}
                                    aria-label={c.quantity === 1 ? `Remove ${c.name}` : `One less ${c.name}`}
                                    className="h-11 w-11 rounded-xl bg-white/5 active:bg-white/15 text-white flex items-center justify-center flex-shrink-0">
                                    {c.quantity === 1 ? <Trash2 className="h-4 w-4 text-red-400" /> : <Minus className="h-5 w-5" />}
                                </button>
                                <span className="text-white w-7 text-center tabular-nums text-base font-semibold">{c.quantity}</span>
                                <button onClick={() => changeQty(c.menu_item_id, 1)}
                                    aria-label={`One more ${c.name}`}
                                    className="h-11 w-11 rounded-xl bg-white/5 active:bg-white/15 text-white flex items-center justify-center flex-shrink-0">
                                    <Plus className="h-5 w-5" />
                                </button>
                                <span className="text-orange-400 text-base font-bold tabular-nums w-[72px] text-right flex-shrink-0">
                                    £{(c.price * c.quantity).toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-gray-400 text-xs uppercase tracking-wide font-semibold">Total</span>
                        <span className="text-white text-3xl font-bold tabular-nums leading-none">£{cartTotal.toFixed(2)}</span>
                    </div>

                    <button onClick={sendToKitchen} disabled={sending}
                        className="w-full h-14 rounded-2xl bg-orange-500 active:bg-orange-700 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50">
                        <Send className="h-5 w-5" />
                        {sending ? 'Sending…' : `Send to kitchen — ${table?.table_number}`}
                    </button>
                    <p className="text-gray-600 text-[11px] text-center mt-2">
                        The bill is settled at the till. This only sends the order to the kitchen.
                    </p>
                </div>
            )}
        </div>
    );
}
