import React from 'react';
import { Info } from 'lucide-react';
import CentralizedPrinterSettings from '@/components/restaurant/CentralizedPrinterSettings';

/**
 * POS Printer Settings — thin wrapper around the SAME printer configuration
 * screen used by the Restaurant Dashboard's "Printers" tab.
 *
 * There used to be two separate printer settings UIs writing two different,
 * overlapping shapes into restaurant.printer_config (this file had its own
 * bespoke Printer A/B + QZ Tray card, while the Restaurant Dashboard had a
 * richer multi-printer "centralized_printers" system). Whichever screen a
 * restaurant configured LAST would silently make the other screen's settings
 * dead for real order printing — see printWithCentralizedConfig() in
 * src/lib/printUtils.js. Embedding the single shared component here removes
 * that split entirely: there is now exactly one printer list, editable from
 * either place, and it supports everything POS needs directly — QZ Tray for
 * instant local receipts, Bluetooth/USB/Network, a dedicated Kitchen-role
 * printer alongside the customer Receipt printer (both print automatically
 * when assigned to the same order type), and the Local/Android Print Agent
 * tabs for LAN printers reached via a polling agent.
 */
export default function POSPrinterSettings({ restaurantId }) {
    return (
        <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 text-xs text-blue-800">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                    This is the same printer configuration used across the whole restaurant (including online and kiosk orders) —
                    changes here apply everywhere. Assign a printer to <strong>POS Orders</strong> below so it prints from this screen.
                </span>
            </div>
            <CentralizedPrinterSettings restaurantId={restaurantId} />
        </div>
    );
}
