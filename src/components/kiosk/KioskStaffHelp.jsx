/**
 * KioskStaffHelp — Reusable "ask a member of staff" banner and full-screen fallback.
 *
 * Use <StaffHelpBanner /> for inline notices (e.g. printer warning).
 * Use <StaffHelpScreen /> for full-screen blocking states (closed, terminal down, etc.).
 */

import React from 'react';
import { UserRound, AlertTriangle, XCircle, Clock, WifiOff, Printer } from 'lucide-react';

export function StaffHelpBanner({ message, icon: Icon = UserRound, color = 'yellow' }) {
    const colorMap = {
        yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
        red:    'bg-red-500/10    border-red-500/30    text-red-300',
        blue:   'bg-blue-500/10   border-blue-500/30   text-blue-300',
    };
    return (
        <div className={`flex items-center gap-3 border rounded-2xl px-4 py-3 text-sm ${colorMap[color]}`}>
            <Icon className="h-5 w-5 flex-shrink-0" />
            <span className="flex-1">{message}</span>
            <span className="font-bold whitespace-nowrap">Ask staff ›</span>
        </div>
    );
}

/**
 * Full-screen operational gate — blocks ordering and shows a clear staff-help prompt.
 *
 * Props:
 *   icon        — lucide component (optional, defaults to AlertTriangle)
 *   iconColor   — tailwind text color class
 *   title       — large headline (keep short, customer-facing)
 *   subtitle    — one-line explanation
 *   detail      — optional secondary detail (e.g. opening hours)
 *   onBack      — optional back/cancel handler (shows Back button if provided)
 *   showStaff   — bool, show "Ask a member of staff" block (default true)
 */
export function StaffHelpScreen({
    icon: Icon = AlertTriangle,
    iconColor = 'text-yellow-400',
    iconBg = 'bg-yellow-500/10 border-yellow-500/30',
    title,
    subtitle,
    detail,
    onBack,
    showStaff = true,
}) {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-8 text-center">
            <div className={`w-28 h-28 rounded-3xl ${iconBg} border flex items-center justify-center mb-8`}>
                <Icon className={`h-14 w-14 ${iconColor}`} />
            </div>
            <h2 className="text-white text-3xl font-black mb-3">{title}</h2>
            {subtitle && <p className="text-gray-300 text-lg mb-3 max-w-md">{subtitle}</p>}
            {detail && <p className="text-gray-500 text-sm mb-8 max-w-sm">{detail}</p>}

            {showStaff && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-5 mb-8 max-w-sm w-full">
                    <UserRound className="h-8 w-8 text-orange-400 mx-auto mb-2" />
                    <p className="text-orange-300 font-bold text-lg">Need help?</p>
                    <p className="text-orange-300/70 text-sm mt-1">Ask a member of staff — we're happy to take your order.</p>
                </div>
            )}

            {onBack && (
                <button
                    onClick={onBack}
                    className="bg-gray-800 hover:bg-gray-700 text-white font-semibold px-8 py-4 rounded-2xl transition-colors"
                >
                    ← Go Back
                </button>
            )}
        </div>
    );
}

export { UserRound, AlertTriangle, XCircle, Clock, WifiOff, Printer };