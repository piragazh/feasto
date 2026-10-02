import React from 'react';
import {
    ShoppingCart, ReceiptText, LayoutGrid, ChefHat, MoreHorizontal, WifiOff, RefreshCw,
    Sun, Moon, ExternalLink, TabletSmartphone, ArrowLeftRight, LogOut, Undo2, UtensilsCrossed,
} from 'lucide-react';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PRIMARY_NAV, MORE_NAV, navState, staffInitials, tillStatus } from '@/lib/posDesignV2';

const NAV_ICON = { 'order-entry': ShoppingCart, queue: ReceiptText, tables: LayoutGrid, kitchen: ChefHat };

/**
 * The new POS top bar (stage 1 of the redesign, behind the per-till switch).
 *
 * Every function of the classic header and tab bar has a home here:
 *   brand + till + online/syncing/offline (+ sales waiting to sync) + menu age
 *   order type switcher
 *   Sales / Orders (with waiting count) / Tables / Kitchen, and the other seven
 *   screens under More - which takes the current screen's name when you are in one
 *   cart count + total, shown when you are AWAY from Sales, taps you back
 *   printer / cash drawer status, clock, staff chip (switch staff)
 *   More: theme, switch till, customer display, kiosk, classic design, sign out
 */
export default function POSHeaderV2({
    restaurant, posName, activeTab, onTab, orderTypes, orderType, onOrderType,
    isOnline, isSyncing, pendingCount, menuAge, pendingOnlineCount = 0,
    cartCount = 0, cartTotal = 0, isDark, onToggleTheme, canSwitchTill, onSwitchTill,
    onCustomerDisplay, onKiosk, staff, onSwitchStaff, onSignOut, onClassicDesign,
    printerStatus, clock,
}) {
    const nav = navState(activeTab);
    const status = tillStatus({ isOnline, isSyncing, pendingCount });
    // Colours follow the POS theme (it uses data-pos-v2, not Tailwind's .dark class).
    const statusColour = status.tone === 'offline' ? (isDark ? 'text-red-400' : 'text-red-700')
        : status.tone === 'sync' ? (isDark ? 'text-blue-400' : 'text-blue-700') : 'text-pos-muted';

    return (
        <header className="h-16 flex-shrink-0 flex items-center gap-3 px-3 lg:px-4 bg-pos-surface border-b border-pos-line text-pos-text">
            {/* Brand + till status */}
            <div className="flex items-center gap-3 min-w-0">
                {restaurant?.logo_url ? (
                    <img src={restaurant.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
                ) : (
                    <div className="w-10 h-10 rounded-xl bg-accent-700 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <UtensilsCrossed className="h-5 w-5 text-white" />
                    </div>
                )}
                <div className="min-w-0 hidden md:block">
                    <div className="text-base font-extrabold leading-tight truncate max-w-[220px]">{posName}</div>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${statusColour}`} role="status">
                        {status.tone === 'sync'
                            ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                            : <span className={`w-2 h-2 rounded-full ${status.tone === 'offline' ? 'bg-red-500' : 'bg-green-600'}`} aria-hidden="true" />}
                        <span>{status.text}</span>
                        {menuAge && <span className="text-pos-muted font-medium" title="When the menu was last saved on this till">· menu {menuAge}</span>}
                    </div>
                </div>
            </div>

            {/* Offline: impossible to miss, whatever the screen width */}
            {!isOnline && (
                <div className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-red-600 text-white text-xs font-extrabold flex-shrink-0">
                    <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />OFFLINE
                </div>
            )}

            {/* Order type */}
            <div role="group" aria-label="Order type" className="flex gap-1 p-1 rounded-2xl bg-pos-ground flex-shrink-0">
                {orderTypes.map(ot => {
                    const on = orderType === ot.id;
                    return (
                        <button key={ot.id} type="button" aria-pressed={on} onClick={() => onOrderType(ot.id)}
                            className={`h-11 px-3 xl:px-4 rounded-xl text-sm font-bold whitespace-nowrap transition-colors active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                                on ? 'bg-accent-700 text-white shadow-sm' : 'text-pos-text hover:bg-pos-surface'}`}>
                            {ot.label}
                        </button>
                    );
                })}
            </div>

            <div className="flex-grow" />

            {/* Cart summary, only when away from Sales: one tap back to the order */}
            {activeTab !== 'order-entry' && cartCount > 0 && (
                <button type="button" onClick={() => onTab('order-entry')}
                    className={`h-11 px-3 rounded-xl border border-accent-500/40 bg-accent-500/10 ${isDark ? "text-accent-300" : "text-accent-800"} text-sm font-extrabold whitespace-nowrap flex items-center gap-2`}>
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />{cartCount} · £{Number(cartTotal).toFixed(2)}
                </button>
            )}

            {/* Primary navigation + More */}
            <nav aria-label="POS sections" className="flex items-center gap-0.5">
                {PRIMARY_NAV.map(n => {
                    const Icon = NAV_ICON[n.id];
                    const on = nav.activePrimary === n.id;
                    const badge = n.id === 'queue' && pendingOnlineCount > 0;
                    return (
                        <button key={n.id} type="button" onClick={() => onTab(n.id)} aria-current={on ? 'page' : undefined}
                            aria-label={badge ? `${n.label}, ${pendingOnlineCount} waiting` : n.label}
                            className={`relative h-12 min-w-[48px] px-2.5 lg:px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                                on ? 'bg-pos-ground text-pos-text' : 'text-pos-muted hover:text-pos-text hover:bg-pos-ground/60'}`}>
                            <Icon className="h-5 w-5" aria-hidden="true" />
                            <span className="hidden lg:block text-[11px] font-bold leading-none">{n.label}</span>
                            {on && <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full bg-accent-600" aria-hidden="true" />}
                            {badge && (
                                <span className="absolute top-0.5 right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-extrabold flex items-center justify-center">
                                    {pendingOnlineCount}
                                </span>
                            )}
                        </button>
                    );
                })}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label={nav.moreActive ? `More: ${nav.moreLabel}` : 'More'}
                            className={`relative h-12 min-w-[48px] px-2.5 lg:px-3 rounded-xl flex flex-col items-center justify-center gap-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                                nav.moreActive ? 'bg-pos-ground text-pos-text' : 'text-pos-muted hover:text-pos-text hover:bg-pos-ground/60'}`}>
                            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                            <span className="hidden lg:block text-[11px] font-bold leading-none">{nav.moreLabel}</span>
                            {nav.moreActive && <span className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full bg-accent-600" aria-hidden="true" />}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel>Screens</DropdownMenuLabel>
                        {MORE_NAV.map(n => (
                            <DropdownMenuItem key={n.id} onSelect={() => onTab(n.id)} className="h-11 text-base font-semibold">
                                {n.label}{activeTab === n.id && <span className="ml-auto text-xs text-accent-600 font-bold">Open</span>}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>This till</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={onToggleTheme} className="h-11">
                            {isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}{isDark ? 'Light mode' : 'Dark mode'}
                        </DropdownMenuItem>
                        {canSwitchTill && (
                            <DropdownMenuItem onSelect={onSwitchTill} className="h-11"><ArrowLeftRight className="h-4 w-4 mr-2" />Switch till</DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={onCustomerDisplay} className="h-11"><ExternalLink className="h-4 w-4 mr-2" />Customer display</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onKiosk} className="h-11"><TabletSmartphone className="h-4 w-4 mr-2" />Self-order kiosk</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onClassicDesign} className="h-11"><Undo2 className="h-4 w-4 mr-2" />Back to classic design</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onSignOut} className="h-11 text-red-700 focus:text-red-700"><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </nav>

            {/* Printer / drawer, clock, staff */}
            <div className="hidden md:flex items-center">{printerStatus}</div>
            <div className="hidden xl:block text-sm font-bold text-pos-muted tabular-nums">{clock}</div>
            {staff && (
                <button type="button" onClick={onSwitchStaff} aria-label={`Switch staff member. Currently: ${staff.full_name}`}
                    className="h-12 pl-1 pr-2 rounded-xl flex items-center gap-2 hover:bg-pos-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    <span className="w-10 h-10 rounded-full bg-accent-700 text-white text-sm font-extrabold flex items-center justify-center" aria-hidden="true">
                        {staffInitials(staff.full_name)}
                    </span>
                    <span className="hidden xl:block text-sm font-bold">{String(staff.full_name).split(' ')[0]}</span>
                </button>
            )}
        </header>
    );
}
