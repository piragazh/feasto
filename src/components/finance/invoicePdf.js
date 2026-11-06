import jsPDF from 'jspdf';

const gbp = (n) => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

async function loadImage(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

// Builds a UK-compliant invoice / credit note PDF from the frozen company snapshot.
export async function buildInvoicePdf(inv, fallbackCompany = {}) {
  const c = inv.company_snapshot && inv.company_snapshot.legal_name ? inv.company_snapshot : fallbackCompany;
  const isCN = inv.document_type === 'credit_note';
  const isDraft = inv.status === 'draft';
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16;
  const orange = [234, 88, 12], slate = [71, 85, 105], dark = [15, 23, 42];
  let y = 18;

  if (c.logo_url) {
    const img = await loadImage(c.logo_url);
    if (img) { try { doc.addImage(img, 'PNG', M, 12, 28, 16, undefined, 'FAST'); y = 32; } catch { /* unsupported format */ } }
  }
  doc.setTextColor(...dark); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(c.trading_name || c.legal_name || 'MealDrop', M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...slate);
  const a = c.address || {};
  const addrLines = [a.line_1, a.line_2, [a.city, a.postcode].filter(Boolean).join(' ')].filter(Boolean);
  addrLines.forEach((l, i) => doc.text(l, M, y + 5 + i * 4));
  const contact = [c.email, c.phone, c.website].filter(Boolean);
  contact.forEach((l, i) => doc.text(l, M, y + 5 + (addrLines.length + i) * 4));

  doc.setTextColor(...orange); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(isDraft ? 'DRAFT INVOICE' : isCN ? 'CREDIT NOTE' : 'INVOICE', W - M, 20, { align: 'right' });
  doc.setFontSize(10); doc.setTextColor(...dark);
  const meta = [
    ['Number', inv.invoice_number || 'Not yet issued'],
    ['Date', fmt(inv.issue_date)],
    ...(inv.supply_date && inv.supply_date !== inv.issue_date ? [['Supply date', fmt(inv.supply_date)]] : []),
    ...(!isCN && inv.due_date ? [['Due', fmt(inv.due_date)]] : []),
    ...(inv.reference ? [['Reference', inv.reference]] : []),
    ...(isCN && inv.credit_of_invoice_number ? [['Credits invoice', inv.credit_of_invoice_number]] : []),
  ];
  meta.forEach(([k, v], i) => { doc.setFont('helvetica', 'normal'); doc.setTextColor(...slate); doc.text(k, W - M - 48, 28 + i * 5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark); doc.text(String(v), W - M, 28 + i * 5, { align: 'right' }); });

  y = Math.max(y + 8 + (addrLines.length + contact.length) * 4, 30 + meta.length * 5) + 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...slate); doc.text(isCN ? 'CREDIT TO' : 'BILL TO', M, y);
  doc.setFontSize(11); doc.setTextColor(...dark); doc.text(inv.customer_name || '', M, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...slate);
  const custLines = doc.splitTextToSize(inv.customer_address_text || '', 90);
  doc.text(custLines, M, y + 10);
  y += 14 + custLines.length * 4;

  // Lines table
  const showVat = !!c.vat_registered;
  const cols = showVat ? [M, 112, 130, 152, W - M] : [M, 122, 150, W - M];
  doc.setFillColor(241, 245, 249); doc.rect(M, y, W - 2 * M, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...dark);
  doc.text('Description', M + 2, y + 5.5);
  doc.text('Qty', cols[1], y + 5.5, { align: 'right' });
  doc.text('Unit price', cols[2], y + 5.5, { align: 'right' });
  if (showVat) doc.text('VAT', cols[3], y + 5.5, { align: 'right' });
  doc.text('Amount', W - M - 2, y + 5.5, { align: 'right' });
  y += 12;
  doc.setFont('helvetica', 'normal');
  for (const l of inv.lines || []) {
    const desc = doc.splitTextToSize(l.description + (l.discount_percent ? ` (${l.discount_percent}% discount)` : ''), showVat ? 80 : 92);
    if (y + desc.length * 4.5 > 250) { doc.addPage(); y = 20; }
    doc.setTextColor(...dark); doc.text(desc, M + 2, y);
    doc.text(`${l.quantity} ${l.unit && l.unit !== 'each' ? l.unit : ''}`.trim(), cols[1], y, { align: 'right' });
    doc.text(gbp(l.unit_price), cols[2], y, { align: 'right' });
    if (showVat) doc.text(`${l.vat_rate || 0}%`, cols[3], y, { align: 'right' });
    doc.text(gbp(l.net_amount), W - M - 2, y, { align: 'right' });
    y += Math.max(desc.length * 4.5, 5) + 2.5;
    doc.setDrawColor(226, 232, 240); doc.line(M, y - 3, W - M, y - 3);
  }

  // Totals
  y += 3;
  const tot = (label, value, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5); doc.setTextColor(...dark); doc.text(label, W - M - 55, y); doc.text(value, W - M - 2, y, { align: 'right' }); y += bold ? 7 : 5.5; };
  if (showVat) { tot('Subtotal', gbp(inv.net_total)); tot('VAT', gbp(inv.vat_total)); }
  tot(isCN ? 'Total credit' : 'Total', gbp(inv.gross_total), true);
  if (!isCN && Number(inv.amount_paid) > 0) tot('Paid', '-' + gbp(inv.amount_paid));
  if (!isCN && Number(inv.credited_amount) > 0) tot('Credited', '-' + gbp(inv.credited_amount));
  if (!isCN && (Number(inv.amount_paid) > 0 || Number(inv.credited_amount) > 0)) tot('Balance due', gbp(inv.balance_due), true);
  if (!showVat) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...slate); doc.text(`No VAT charged — ${c.legal_name || 'the supplier'} is not VAT registered.`, W - M - 2, y, { align: 'right' }); y += 6; }

  y += 4;
  if (inv.notes) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...dark); const n = doc.splitTextToSize(inv.notes, W - 2 * M); doc.text(n, M, y); y += n.length * 4.2 + 4; }
  if (!isCN && c.bank_account_number) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFillColor(255, 247, 237); doc.rect(M, y, W - 2 * M, 22, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...orange); doc.text('How to pay', M + 4, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...dark); doc.setFontSize(9);
    doc.text(`Bank transfer to ${c.bank_account_name || c.legal_name}`, M + 4, y + 11);
    doc.text(`Sort code ${c.bank_sort_code || ''}   ·   Account ${c.bank_account_number}`, M + 4, y + 15.5);
    doc.text(`Please use reference ${inv.invoice_number || ''}${inv.due_date ? `  ·  Due by ${fmt(inv.due_date)}` : ''}`, M + 4, y + 20);
  }

  // Statutory footer (Companies Act: name, number, place of registration, registered office)
  const addr = addrLines.join(', ');
  const legal = [c.legal_name, c.company_number ? `Registered in ${c.registered_in || 'England and Wales'}, company no. ${c.company_number}` : '', addr ? `Registered office: ${addr}` : '', showVat && c.vat_number ? `VAT no. ${c.vat_number}` : ''].filter(Boolean).join('  ·  ');
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240); doc.line(M, 279, W - M, 279);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...slate);
    doc.text(doc.splitTextToSize(legal, W - 2 * M), W / 2, 283, { align: 'center' });
    if (c.invoice_footer) doc.text(doc.splitTextToSize(c.invoice_footer, W - 2 * M), W / 2, 290, { align: 'center' });
    if (isDraft) { doc.setTextColor(226, 232, 240); doc.setFontSize(70); doc.setFont('helvetica', 'bold'); doc.text('DRAFT', W / 2, 160, { align: 'center', angle: 30 }); }
  }
  return doc;
}

export async function downloadInvoicePdf(inv, company) {
  const doc = await buildInvoicePdf(inv, company);
  doc.save(`${inv.invoice_number || 'draft-invoice'}.pdf`);
}
