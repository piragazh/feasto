import jsPDF from 'jspdf';
import { format } from 'date-fns';

// Brand colours
const BRAND_ORANGE = [249, 115, 22];   // #f97316
const BRAND_DARK   = [17, 24, 39];     // #111827
const GRAY_700     = [55, 65, 81];
const GRAY_500     = [107, 114, 128];
const GRAY_200     = [229, 231, 235];
const WHITE        = [255, 255, 255];
const GREEN_600    = [22, 163, 74];
const RED_600      = [220, 38, 38];
const AMBER_600    = [217, 119, 6];

function setColor(doc, rgb, type = 'text') {
    if (type === 'fill') doc.setFillColor(...rgb);
    else if (type === 'draw') doc.setDrawColor(...rgb);
    else doc.setTextColor(...rgb);
}

function currency(val) {
    return `£${(val ?? 0).toFixed(2)}`;
}

function statusColor(status) {
    if (status === 'paid') return GREEN_600;
    if (status === 'voided') return RED_600;
    return AMBER_600;
}

/**
 * Shared professional payout PDF generator.
 */
export function generatePayoutPDF(payout) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();   // 210
    const PH = doc.internal.pageSize.getHeight();  // 297
    const MARGIN = 18;
    const CONTENT_W = PW - MARGIN * 2;

    /* ─── HEADER BAND ─── */
    setColor(doc, BRAND_DARK, 'fill');
    doc.rect(0, 0, PW, 38, 'F');

    // Brand name
    setColor(doc, BRAND_ORANGE);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('MealDrop', MARGIN, 17);

    // Tagline
    setColor(doc, [180, 190, 200]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Financial Services · Payout Statement', MARGIN, 24);

    // Document title right-aligned
    setColor(doc, WHITE);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYOUT STATEMENT', PW - MARGIN, 16, { align: 'right' });
    setColor(doc, [180, 190, 200]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, PW - MARGIN, 23, { align: 'right' });
    doc.text(`Ref: PAY-${(payout.id ?? 'N/A').toUpperCase().slice(-8)}`, PW - MARGIN, 29, { align: 'right' });

    /* ─── ORANGE ACCENT STRIPE ─── */
    setColor(doc, BRAND_ORANGE, 'fill');
    doc.rect(0, 38, PW, 2.5, 'F');

    let y = 52;

    /* ─── INFO CARDS ROW ─── */
    const cardW = (CONTENT_W - 6) / 3;
    const cards = [
        { label: 'Restaurant', value: payout.restaurant_name ?? 'N/A' },
        { label: 'Period', value: `${format(new Date(payout.period_start), 'dd MMM yyyy')}\n${format(new Date(payout.period_end), 'dd MMM yyyy')}` },
        { label: 'Frequency', value: (payout.payout_frequency ?? 'N/A').charAt(0).toUpperCase() + (payout.payout_frequency ?? 'N/A').slice(1) },
    ];

    cards.forEach((card, i) => {
        const cx = MARGIN + i * (cardW + 3);
        // Card background
        setColor(doc, [248, 250, 252], 'fill');
        setColor(doc, GRAY_200, 'draw');
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cardW, 20, 2, 2, 'FD');

        // Label
        setColor(doc, GRAY_500);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(card.label.toUpperCase(), cx + 4, y + 6);

        // Value
        setColor(doc, BRAND_DARK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        const lines = card.value.split('\n');
        lines.forEach((line, li) => doc.text(line, cx + 4, y + 12 + li * 5));
    });

    y += 27;

    /* ─── STATUS BADGE ─── */
    const status = (payout.status ?? 'pending').toUpperCase();
    const sBadgeW = 34;
    setColor(doc, statusColor(payout.status), 'fill');
    doc.roundedRect(PW - MARGIN - sBadgeW, y - 9, sBadgeW, 8, 2, 2, 'F');
    setColor(doc, WHITE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(status, PW - MARGIN - sBadgeW / 2, y - 3.5, { align: 'center' });

    /* ─── SECTION: FINANCIAL SUMMARY ─── */
    // Section heading
    setColor(doc, BRAND_DARK);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', MARGIN, y);
    setColor(doc, BRAND_ORANGE, 'fill');
    doc.rect(MARGIN, y + 1.5, 28, 0.8, 'F');

    y += 8;

    // Table header row
    setColor(doc, BRAND_DARK, 'fill');
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    setColor(doc, WHITE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Description', MARGIN + 4, y + 4.8);
    doc.text('Amount', PW - MARGIN - 4, y + 4.8, { align: 'right' });

    y += 7;

    // Row data
    // The money rows add up exactly: card takings − commission − refunds − brought
    // forward (+ any shortfall carried to next time) = NET PAYOUT. Cash the restaurant
    // already holds is shown for the commission base only, never in the sum.
    const n = (v) => Number(v || 0);
    const commissionLabel = payout.commission_type === 'fixed'
        ? `Commission (fixed monthly fee × ${payout.commission_months ?? 1})`
        : `Commission (${payout.commission_rate ?? 0}% of ${currency(payout.gross_earnings)} total sales)`;
    const rows = [
        { label: 'Orders paid in this statement', value: `${payout.total_orders ?? 0} orders${n(payout.late_orders) > 0 ? ` (incl. ${payout.late_orders} completed late)` : ''}`, indent: false },
        ...(n(payout.cancelled_orders) > 0 ? [{ label: '   - Cancelled in period (no charge)', value: `${payout.cancelled_orders} orders  (${currency(payout.cancelled_orders_value)})`, indent: true }] : []),
        ...(n(payout.held_orders) > 0 ? [{ label: '   - Not finished yet — will be paid next time', value: `${payout.held_orders} orders  (${currency(payout.held_orders_value)})`, indent: true }] : []),
        { label: '', value: '', divider: true },
        { label: 'Total sales (card + cash)', value: currency(payout.gross_earnings), indent: false },
        { label: '   - Cash you collected yourself (already with you)', value: currency(payout.cash_payment_amount), indent: true },
        { label: '', value: '', divider: true },
        { label: 'Card / online payments held by MealDrop', value: currency(payout.card_payment_amount), bold: true },
        { label: commissionLabel, value: `-${currency(payout.platform_commission)}`, negative: true },
    ];
    if (n(payout.refunds_paid_by_restaurant) > 0) {
        rows.push({ label: 'Refunds on orders paid to you earlier', value: `-${currency(payout.refunds_paid_by_restaurant)}`, negative: true });
    }
    const signed = (v) => (n(v) < 0 ? `-${currency(Math.abs(n(v)))}` : `+${currency(n(v))}`);
    if (n(payout.chargebacks_amount) !== 0) {
        rows.push({ label: 'Card disputes (chargebacks and Stripe dispute fees)', value: signed(payout.chargebacks_amount), negative: n(payout.chargebacks_amount) < 0, positive: n(payout.chargebacks_amount) > 0 });
    }
    if (n(payout.manual_adjustments_amount) !== 0) {
        rows.push({ label: 'Adjustments (see notes / CSV)', value: signed(payout.manual_adjustments_amount), negative: n(payout.manual_adjustments_amount) < 0, positive: n(payout.manual_adjustments_amount) > 0 });
    }
    if (n(payout.reserve_released_amount) > 0) {
        rows.push({ label: 'Reserve released from earlier statements', value: `+${currency(payout.reserve_released_amount)}`, positive: true });
    }
    if (n(payout.reserve_held) > 0) {
        rows.push({ label: `Reserve held (${payout.reserve_percent ?? ''}% of card, paid after ${payout.reserve_until ? format(new Date(payout.reserve_until), 'dd MMM yyyy') : 'the reserve period'})`, value: `-${currency(payout.reserve_held)}`, negative: true });
    }
    if (n(payout.brought_forward_amount) > 0) {
        rows.push({ label: 'Balance owed from your last statement', value: `-${currency(payout.brought_forward_amount)}`, negative: true });
    }
    if (n(payout.shortfall_amount) > 0) {
        rows.push({ label: 'Owed to MealDrop — carried to your next statement', value: `+${currency(payout.shortfall_amount)}`, positive: true });
    }
    rows.push({ label: '', value: '', divider: true });
    if (n(payout.refunds_paid_by_platform) > 0) {
        rows.push({ label: `For information: refunds covered by MealDrop (not charged to you) ${currency(payout.refunds_paid_by_platform)}`, value: '', note: true });
    }
    if (n(payout.cash_refunds_not_deducted) > 0) {
        rows.push({ label: `For information: cash-order refunds you handled (not deducted) ${currency(payout.cash_refunds_not_deducted)}`, value: '', note: true });
    }

    rows.forEach((row, idx) => {
        // Divider row
        if (row.divider) {
            setColor(doc, GRAY_200, 'draw');
            doc.setLineWidth(0.3);
            doc.line(MARGIN, y + 2, PW - MARGIN, y + 2);
            y += 5;
            return;
        }
        const bg = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
        setColor(doc, bg, 'fill');
        setColor(doc, GRAY_200, 'draw');
        doc.setLineWidth(0.2);
        doc.rect(MARGIN, y, CONTENT_W, 7, 'FD');

        const textColor = row.negative ? RED_600 : row.positive ? GREEN_600 : row.note ? [100, 100, 100] : row.indent ? GRAY_500 : GRAY_700;
        setColor(doc, textColor);
        doc.setFontSize(row.note ? 7.5 : 8.5);
        doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
        if (row.label) doc.text(row.label, MARGIN + 4, y + 4.8);
        if (row.value) doc.text(row.value, PW - MARGIN - 4, y + 4.8, { align: 'right' });
        y += 7;
    });

    /* ─── NET PAYOUT HIGHLIGHT ROW ─── */
    setColor(doc, BRAND_DARK, 'fill');
    doc.rect(MARGIN, y, CONTENT_W, 11, 'F');
    setColor(doc, WHITE);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAYOUT', MARGIN + 4, y + 7.5);
    setColor(doc, BRAND_ORANGE);
    doc.setFontSize(13);
    doc.text(currency(payout.net_payout), PW - MARGIN - 4, y + 7.5, { align: 'right' });

    y += 18;

    /* ─── ORDER TYPE BREAKDOWN ─── */
    setColor(doc, BRAND_DARK);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Order Type Breakdown', MARGIN, y);
    setColor(doc, BRAND_ORANGE, 'fill');
    doc.rect(MARGIN, y + 1.5, 38, 0.8, 'F');
    y += 8;

    // Table header
    setColor(doc, BRAND_DARK, 'fill');
    doc.rect(MARGIN, y, CONTENT_W, 7, 'F');
    setColor(doc, WHITE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Order Type', MARGIN + 4, y + 4.8);
    doc.text('Count', MARGIN + CONTENT_W * 0.38, y + 4.8, { align: 'right' });
    doc.text('Payment', MARGIN + CONTENT_W * 0.62, y + 4.8, { align: 'right' });
    doc.text('Earnings', PW - MARGIN - 4, y + 4.8, { align: 'right' });
    y += 7;

    const breakdownRows = [];
    if (payout.delivery_orders > 0) {
        breakdownRows.push(['Delivery', payout.delivery_orders, payout.delivery_earnings ?? 0]);
    }
    if (payout.collection_orders > 0) {
        breakdownRows.push(['Collection / Takeaway', payout.collection_orders, payout.collection_earnings ?? 0]);
    }
    if (payout.dine_in_orders > 0) {
        const dineInEarnings = (payout.gross_earnings ?? 0) - (payout.delivery_earnings ?? 0) - (payout.collection_earnings ?? 0);
        breakdownRows.push(['Dine-In', payout.dine_in_orders, Math.max(0, dineInEarnings)]);
    }
    if (breakdownRows.length === 0) {
        breakdownRows.push(['Online Orders', payout.total_orders ?? 0, payout.gross_earnings ?? 0]);
    }
    // Cancelled / Refunded (info rows)
    if ((payout.cancelled_orders ?? 0) > 0) {
        breakdownRows.push(['Cancelled (not charged)', payout.cancelled_orders, payout.cancelled_orders_value ?? 0, true]);
    }
    if ((payout.refunds_paid_by_restaurant ?? 0) > 0) {
        breakdownRows.push(['Refunds on earlier orders', '', -(payout.refunds_paid_by_restaurant ?? 0), false, true]);
    }

    breakdownRows.forEach(([label, count, earnings, isCancelled, isRefund], idx) => {
        const bg = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
        setColor(doc, bg, 'fill');
        setColor(doc, GRAY_200, 'draw');
        doc.setLineWidth(0.2);
        doc.rect(MARGIN, y, CONTENT_W, 7, 'FD');
        setColor(doc, isCancelled ? GRAY_500 : isRefund ? RED_600 : GRAY_700);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(label, MARGIN + 4, y + 4.8);
        doc.text(`${count}`, MARGIN + CONTENT_W * 0.38, y + 4.8, { align: 'right' });
        // Payment split column (card/cash) for normal rows
        if (!isCancelled && !isRefund) {
            setColor(doc, GRAY_500);
            doc.setFontSize(7.5);
            doc.text('Card + Cash', MARGIN + CONTENT_W * 0.62, y + 4.8, { align: 'right' });
        }
        setColor(doc, isCancelled ? GRAY_500 : isRefund ? RED_600 : BRAND_DARK);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', isCancelled ? 'normal' : 'bold');
        doc.text(isRefund && earnings < 0 ? `-${currency(Math.abs(earnings))}` : currency(earnings), PW - MARGIN - 4, y + 4.8, { align: 'right' });
        y += 7;
    });

    // Totals row
    setColor(doc, [240, 245, 255], 'fill');
    setColor(doc, [147, 197, 253], 'draw');
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, y, CONTENT_W, 8, 'FD');
    setColor(doc, BRAND_DARK);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL COMPLETED', MARGIN + 4, y + 5.3);
    doc.text(`${payout.total_orders ?? 0}`, MARGIN + CONTENT_W * 0.38, y + 5.3, { align: 'right' });
    doc.text(currency(payout.gross_earnings), PW - MARGIN - 4, y + 5.3, { align: 'right' });
    y += 15;

    /* ─── COMMISSION BREAKDOWN ─── */
    const commRate = payout.commission_type === 'fixed'
        ? `${currency(payout.fixed_commission_amount)} per month`
        : (payout.commission_rate != null ? `${payout.commission_rate}%` : 'N/A');
    setColor(doc, [239, 246, 255], 'fill');
    setColor(doc, [147, 197, 253], 'draw');
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, y, CONTENT_W, 13, 2, 2, 'FD');
    setColor(doc, [37, 99, 235]);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Commission Rate Applied:', MARGIN + 4, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(commRate, MARGIN + 50, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Commission Type:', MARGIN + 4, y + 10.5);
    doc.setFont('helvetica', 'normal');
    doc.text((payout.commission_type ?? 'percentage').charAt(0).toUpperCase() + (payout.commission_type ?? 'percentage').slice(1), MARGIN + 38, y + 10.5);

    y += 20;

    /* ─── PAYMENT DETAILS ─── */
    if (payout.status === 'paid' && payout.paid_date) {
        setColor(doc, BRAND_DARK);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Payment Details', MARGIN, y);
        setColor(doc, BRAND_ORANGE, 'fill');
        doc.rect(MARGIN, y + 1.5, 30, 0.8, 'F');
        y += 9;

        const payDetails = [
            ['Payment Date', format(new Date(payout.paid_date), 'dd MMM yyyy')],
            ['Payment Method', payout.payment_method ?? 'N/A'],
            ...(payout.transaction_reference ? [['Transaction Reference', payout.transaction_reference]] : []),
        ];

        payDetails.forEach(([label, value], idx) => {
            const bg = idx % 2 === 0 ? [255, 255, 255] : [248, 250, 252];
            setColor(doc, bg, 'fill');
            setColor(doc, GRAY_200, 'draw');
            doc.setLineWidth(0.2);
            doc.rect(MARGIN, y, CONTENT_W, 7, 'FD');
            setColor(doc, GRAY_500);
            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'normal');
            doc.text(label, MARGIN + 4, y + 4.8);
            setColor(doc, BRAND_DARK);
            doc.setFont('helvetica', 'bold');
            doc.text(value, PW - MARGIN - 4, y + 4.8, { align: 'right' });
            y += 7;
        });

        y += 6;
    }

    /* ─── NOTES / DISCREPANCY WARNINGS ─── */
    // Filter out cash commission debt notes — internal only, not for restaurant PDF
    const pdfNotes = payout.notes
        ? payout.notes.split(' | ').filter(n => !n.startsWith('ℹ️')).join(' | ').trim() || null
        : null;
    if (pdfNotes) {
        const isWarning = pdfNotes.startsWith('⚠️');
        const noteColor = isWarning ? [254, 243, 199] : [241, 245, 249];
        const noteBorderColor = isWarning ? AMBER_600 : [148, 163, 184];
        const noteTextColor = isWarning ? [146, 64, 14] : GRAY_700;

        setColor(doc, noteColor, 'fill');
        setColor(doc, noteBorderColor, 'draw');
        doc.setLineWidth(0.4);

        const splitNotes = doc.splitTextToSize(pdfNotes, CONTENT_W - 12);
        const noteH = splitNotes.length * 5 + 10;
        doc.roundedRect(MARGIN, y, CONTENT_W, noteH, 2, 2, 'FD');

        // Left accent bar
        setColor(doc, noteBorderColor, 'fill');
        doc.rect(MARGIN, y, 3, noteH, 'F');

        setColor(doc, noteTextColor);
        doc.setFontSize(8);
        doc.setFont('helvetica', isWarning ? 'bold' : 'normal');
        doc.text(splitNotes, MARGIN + 7, y + 7);

        y += noteH + 6;
    }

    /* ─── FOOTER ─── */
    // Horizontal rule
    setColor(doc, GRAY_200, 'draw');
    doc.setLineWidth(0.4);
    doc.line(MARGIN, PH - 20, PW - MARGIN, PH - 20);

    setColor(doc, GRAY_500);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text('MealDrop Financial Services  ·  This is a system-generated payout statement. Please retain for your records.', PW / 2, PH - 14, { align: 'center' });
    doc.text(`© ${new Date().getFullYear()} MealDrop. All rights reserved.`, PW / 2, PH - 9, { align: 'center' });

    // Page number
    setColor(doc, GRAY_500);
    doc.setFontSize(7);
    doc.text('Page 1 of 1', PW - MARGIN, PH - 9, { align: 'right' });

    /* ─── SAVE ─── */
    const safeRestaurant = (payout.restaurant_name ?? 'unknown').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    const filename = `MealDrop-Payout-${safeRestaurant}-${format(new Date(payout.period_start), 'yyyy-MM-dd')}.pdf`;
    doc.save(filename);
}