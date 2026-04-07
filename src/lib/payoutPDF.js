import jsPDF from 'jspdf';
import { format } from 'date-fns';

/**
 * Shared payout PDF generator used by PayoutManagement, PayoutHistory and RestaurantPayoutHistory.
 */
export function generatePayoutPDF(payout) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(22);
    doc.text('PAYOUT STATEMENT', pageWidth / 2, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy HH:mm')}`, pageWidth / 2, 28, { align: 'center' });

    // Restaurant Details
    doc.setFontSize(14);
    doc.text('Restaurant Details', 20, 45);
    doc.setFontSize(10);
    doc.text(`Name: ${payout.restaurant_name}`, 20, 55);

    // Period
    doc.setFontSize(14);
    doc.text('Payout Period', 20, 70);
    doc.setFontSize(10);
    doc.text(`From: ${format(new Date(payout.period_start), 'MMM dd, yyyy')}`, 20, 80);
    doc.text(`To: ${format(new Date(payout.period_end), 'MMM dd, yyyy')}`, 20, 87);
    doc.text(`Frequency: ${payout.payout_frequency || 'N/A'}`, 20, 94);

    // Financial Summary
    doc.setFontSize(14);
    doc.text('Financial Summary', 20, 110);

    let y = 120;
    doc.setFontSize(10);
    doc.text(`Total Orders: ${payout.total_orders ?? 0}`, 20, y);
    y += 7;
    doc.text(`Gross Earnings: £${(payout.gross_earnings ?? 0).toFixed(2)}`, 20, y);
    y += 7;
    doc.text(`Cash Payments: £${(payout.cash_payment_amount ?? 0).toFixed(2)}`, 20, y);
    y += 7;
    doc.text(`Card Payments: £${(payout.card_payment_amount ?? 0).toFixed(2)}`, 20, y);
    y += 7;
    doc.text(`Platform Commission: -£${(payout.platform_commission ?? 0).toFixed(2)}`, 20, y);

    if (payout.refunds_paid_by_restaurant > 0) {
        y += 7;
        doc.text(`Refunds Deducted: -£${payout.refunds_paid_by_restaurant.toFixed(2)}`, 20, y);
    }
    if (payout.refunds_paid_by_platform > 0) {
        y += 7;
        doc.text(`Platform-Covered Refunds: £${payout.refunds_paid_by_platform.toFixed(2)}`, 20, y);
    }

    // Net Payout
    y += 15;
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text(`NET PAYOUT: £${(payout.net_payout ?? 0).toFixed(2)}`, 20, y);
    doc.setFont(undefined, 'normal');

    // Payment Status
    y += 15;
    doc.setFontSize(14);
    doc.text('Payment Status', 20, y);
    y += 10;
    doc.setFontSize(10);
    doc.text(`Status: ${(payout.status ?? '').toUpperCase()}`, 20, y);

    if (payout.status === 'paid' && payout.paid_date) {
        y += 7;
        doc.text(`Paid On: ${format(new Date(payout.paid_date), 'MMM dd, yyyy')}`, 20, y);
        if (payout.payment_method) {
            y += 7;
            doc.text(`Payment Method: ${payout.payment_method}`, 20, y);
        }
    }

    if (payout.notes) {
        y += 10;
        doc.setFontSize(14);
        doc.text('Notes', 20, y);
        y += 10;
        doc.setFontSize(10);
        const splitNotes = doc.splitTextToSize(payout.notes, 170);
        doc.text(splitNotes, 20, y);
    }

    // Footer
    doc.setFontSize(8);
    doc.text('This is an automatically generated payout statement.', pageWidth / 2, 280, { align: 'center' });

    const filename = `payout-${(payout.restaurant_name ?? 'unknown').replace(/\s+/g, '-')}-${format(new Date(payout.period_start), 'yyyy-MM-dd')}.pdf`;
    doc.save(filename);
}