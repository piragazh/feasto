/**
 * KioskPaymentSettings — Payment method config + hardware readiness
 *
 * Extracted from KioskSettings to keep each card focused and testable.
 *
 * Responsibilities:
 *   - Enable/disable card payment toggle
 *   - Enable/disable pay-at-counter toggle
 *   - Mark card reader as temporarily unavailable (runtime toggle)
 *   - Hardware readiness status row (card reader + printer)
 *   - Validation: blocks save when both methods disabled
 *   - All four warning/info banners (A–D)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    CreditCard, Save, CheckCircle, AlertCircle, Info,
    ShieldCheck, Circle, Banknote
} from 'lucide-react';
import { toast } from 'sonner';

// ── Small helpers ─────────────────────────────────────────────────────────────

function StatusRow({ icon: Icon, color, title, subtitle }) {
    const colorMap = {
        green: 'border-green-200 bg-green-50',
        yellow: 'border-yellow-200 bg-yellow-50',
        gray: 'border-gray-200 bg-gray-50',
    };
    const iconColorMap = {
        green: 'text-green-600',
        yellow: 'text-yellow-600',
        gray: 'text-gray-400',
    };
    const titleColorMap = {
        green: 'text-green-800',
        yellow: 'text-yellow-800',
        gray: 'text-gray-600',
    };
    const subtitleColorMap = {
        green: 'text-green-600',
        yellow: 'text-yellow-600',
        gray: 'text-gray-400',
    };
    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${colorMap[color]}`}>
            <Icon className={`h-4 w-4 flex-shrink-0 ${iconColorMap[color]}`} />
            <div>
                <p className={`text-sm font-medium ${titleColorMap[color]}`}>{title}</p>
                {subtitle && <p className={`text-xs ${subtitleColorMap[color]}`}>{subtitle}</p>}
            </div>
        </div>
    );
}

function Banner({ type, children }) {
    const styles = {
        warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        error: 'bg-red-50 border-red-200 text-red-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800',
    };
    const icons = {
        warning: <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />,
        error: <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />,
        info: <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />,
    };
    return (
        <div className={`flex items-start gap-2 p-3 border rounded-lg ${styles[type]}`}>
            {icons[type]}
            <p className="text-sm">{children}</p>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KioskPaymentSettings({
    kioskConfig,
    setKioskConfig,
    cardTerminal,
    savedRestaurant, // the last-saved restaurant record (for hardware readiness)
    onSave,
    isSaving,
}) {
    const cardEnabled = kioskConfig.payment_card_enabled === true;
    const counterEnabled = kioskConfig.payment_counter_enabled !== false;
    const readerConfigured = !!(cardTerminal?.reader_id?.trim());
    const terminalUnavailable = kioskConfig.terminal_unavailable === true;

    // Saved state (what's actually live on the kiosk right now)
    const savedReaderId = savedRestaurant?.kiosk_config?.card_terminal?.reader_id;
    const savedUnavailable = savedRestaurant?.kiosk_config?.terminal_unavailable;
    const savedReaderLabel = savedRestaurant?.kiosk_config?.card_terminal?.reader_label;
    const savedProvider = savedRestaurant?.kiosk_config?.card_terminal?.provider;
    const savedTestMode = savedRestaurant?.kiosk_config?.card_terminal?.test_mode;
    const savedPrinterName = savedRestaurant?.kiosk_config?.kiosk_printer?.name;

    const handleSave = () => {
        if (!cardEnabled && !counterEnabled) {
            toast.error('At least one payment method must be enabled before saving.');
            return;
        }
        onSave();
    };

    return (
        <>
            {/* ── Payment Methods Card ───────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Kiosk Payment Methods
                    </CardTitle>
                    <CardDescription>
                        Choose how customers pay at the kiosk. At least one method must be active.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">

                    {/* Toggle: Pay by Card */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                            <p className="font-medium flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-gray-400" />
                                Pay by Card
                            </p>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Customers pay using a card reader at the kiosk
                            </p>
                        </div>
                        <Switch
                            checked={cardEnabled}
                            onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, payment_card_enabled: v })}
                        />
                    </div>

                    {/* Warning A — card on, no reader configured */}
                    {cardEnabled && !readerConfigured && (
                        <Banner type="warning">
                            <strong>Card payment is enabled, but no card reader is configured.</strong>{' '}
                            Customers will not be able to pay by card until a Reader ID is saved in the Card Terminal section below.
                        </Banner>
                    )}

                    {/* Warning C — card on, reader configured, but flagged unavailable */}
                    {cardEnabled && readerConfigured && terminalUnavailable && (
                        <Banner type="warning">
                            <strong>Card reader is currently marked as unavailable.</strong>{' '}
                            The kiosk will fall back to Pay at Counter if it is enabled. Re-enable the reader once it is working again.
                        </Banner>
                    )}

                    {/* Toggle: Pay at Counter */}
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                            <p className="font-medium flex items-center gap-2">
                                <Banknote className="h-4 w-4 text-gray-400" />
                                Pay at Counter
                            </p>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Customers place their order on the kiosk and pay staff at the counter
                            </p>
                        </div>
                        <Switch
                            checked={counterEnabled}
                            onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, payment_counter_enabled: v })}
                        />
                    </div>

                    {/* Info D — counter only */}
                    {!cardEnabled && counterEnabled && (
                        <Banner type="info">
                            Customers will place orders at the kiosk and pay at the counter.
                            Orders will be marked as <strong>pending</strong> until staff confirm payment.
                        </Banner>
                    )}

                    {/* Warning B — both disabled */}
                    {!cardEnabled && !counterEnabled && (
                        <Banner type="error">
                            <strong>No payment methods are enabled.</strong>{' '}
                            Customers will be blocked at checkout. Enable at least one method before opening the kiosk.
                        </Banner>
                    )}

                    {/* Runtime toggle: mark reader unavailable */}
                    {cardEnabled && readerConfigured && (
                        <div className="flex items-center justify-between p-3 border border-dashed rounded-lg bg-gray-50 mt-1">
                            <div>
                                <p className="font-medium text-sm text-gray-700">Card Reader Temporarily Unavailable</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Use this if the reader is offline or broken — hides card payment from customers without removing your configuration
                                </p>
                            </div>
                            <Switch
                                checked={terminalUnavailable}
                                onCheckedChange={(v) => setKioskConfig({ ...kioskConfig, terminal_unavailable: v })}
                            />
                        </div>
                    )}

                    <Button
                        onClick={handleSave}
                        disabled={isSaving || (!cardEnabled && !counterEnabled)}
                        className="w-full mt-1"
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Payment Settings'}
                    </Button>
                </CardContent>
            </Card>

            {/* ── Hardware Readiness Card ────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        Hardware Readiness
                    </CardTitle>
                    <CardDescription>
                        Current status of connected hardware — check this before opening the kiosk
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {/* Card Reader status */}
                    {!savedReaderId ? (
                        <StatusRow
                            icon={Circle}
                            color="gray"
                            title="Card Reader — Not Configured"
                            subtitle="Add a Reader ID in the Card Terminal section below to enable card payments"
                        />
                    ) : savedUnavailable ? (
                        <StatusRow
                            icon={AlertCircle}
                            color="yellow"
                            title="Card Reader — Unavailable"
                            subtitle={`${savedReaderLabel || savedReaderId} · Marked offline — card payment hidden from customers`}
                        />
                    ) : (
                        <StatusRow
                            icon={CheckCircle}
                            color="green"
                            title="Card Reader — Configured"
                            subtitle={[
                                savedReaderLabel || savedReaderId,
                                savedProvider,
                                savedTestMode ? 'Test Mode' : 'Live',
                            ].filter(Boolean).join(' · ')}
                        />
                    )}

                    {/* Printer status */}
                    {savedPrinterName ? (
                        <StatusRow
                            icon={CheckCircle}
                            color="green"
                            title="Receipt Printer — Configured"
                            subtitle={savedPrinterName}
                        />
                    ) : (
                        <StatusRow
                            icon={Circle}
                            color="gray"
                            title="Receipt Printer — Not Configured"
                            subtitle="Orders will be confirmed on screen only — configure a printer below if needed"
                        />
                    )}
                </CardContent>
            </Card>
        </>
    );
}