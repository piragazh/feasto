import jsPDF from 'jspdf';

/**
 * Generates a formatted PDF report.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {Array<{label:string, value:string}>} [opts.metrics]
 * @param {Array<{title:string, headers:string[], rows:string[][]}>} [opts.tables]
 * @param {string} [opts.filename]
 */
export function generateReportPDF({ title, subtitle, metrics = [], tables = [], filename = 'report.pdf' }) {
    const doc = new jsPDF();
    let y = 20;

    // Header bar
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, 210, 14, 'F');
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(title, 14, 9.5);

    y = 24;

    if (subtitle) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);
        doc.text(subtitle, 14, y);
        y += 6;
    }

    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, y);
    y += 10;

    // Metrics grid (2 columns)
    if (metrics.length > 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30);
        doc.text('Summary', 14, y);
        y += 6;

        const cols = 2;
        const colW = 91;
        metrics.forEach((m, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = 14 + col * colW;
            const yPos = y + row * 16;

            doc.setFillColor(248, 248, 248);
            doc.roundedRect(x, yPos - 4, colW - 4, 14, 2, 2, 'F');

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120);
            doc.text(m.label, x + 3, yPos + 1);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30);
            doc.text(String(m.value), x + 3, yPos + 8);
        });

        y += Math.ceil(metrics.length / cols) * 16 + 6;
    }

    // Tables
    tables.forEach(table => {
        if (y > 240) { doc.addPage(); y = 20; }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30);
        doc.text(table.title, 14, y);
        y += 5;

        // Header row
        const colW = 182 / table.headers.length;
        doc.setFillColor(249, 115, 22);
        doc.rect(14, y, 182, 8, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255);
        table.headers.forEach((h, i) => {
            doc.text(h, 16 + i * colW, y + 5.5);
        });
        y += 8;

        // Data rows
        doc.setFont('helvetica', 'normal');
        table.rows.forEach((row, rowIdx) => {
            if (y > 270) { doc.addPage(); y = 20; }
            if (rowIdx % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(14, y, 182, 7, 'F');
            }
            doc.setTextColor(40);
            doc.setFontSize(8);
            row.forEach((cell, i) => {
                doc.text(String(cell ?? ''), 16 + i * colW, y + 5);
            });
            y += 7;
        });

        y += 10;
    });

    doc.save(filename);
}