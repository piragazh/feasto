// Isolated finance primitives. No POS/order integration or HMRC submission.
export const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateVat(netAmount, ratePercent) {
  const net = roundMoney(netAmount);
  const rate = Number(ratePercent);
  if (!Number.isFinite(net) || net < 0 || !Number.isFinite(rate) || rate < 0) {
    throw new Error('Enter a valid non-negative net amount and VAT rate.');
  }
  const vat = roundMoney(net * rate / 100);
  return { net, vat, gross: roundMoney(net + vat), rate };
}

export function extractVatFromGross(grossAmount, ratePercent) {
  const gross = roundMoney(grossAmount);
  const rate = Number(ratePercent);
  if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(rate) || rate < 0) {
    throw new Error('Enter a valid non-negative gross amount and VAT rate.');
  }
  const net = rate === 0 ? gross : roundMoney(gross / (1 + rate / 100));
  return { net, vat: roundMoney(gross - net), gross, rate };
}

export const formatGBP = (value) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP'
}).format(Number(value) || 0);
