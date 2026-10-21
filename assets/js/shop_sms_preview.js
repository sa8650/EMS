/* Preview the shop's saved ConnectX SMS template in Compose. The server still
 * verifies shop ownership and queues the exact message the user reviews. */
export const SMS_TEMPLATE_EVENT = Object.freeze({
  'Sales Invoice Confirmation': 'SALE',
  'Due Invoice Reminder': 'DUE_REMINDER',
  'Exchange Invoice Confirmation': 'EXCHANGE',
  'Return Invoice Confirmation': 'RETURN'
});

const money = value => Number(value || 0).toLocaleString('en-BD', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

export function previewShopSms(template, invoice, recipient, shopName, event) {
  const inv = invoice || {};
  const name = recipient?.full_name || recipient?.name || inv.customer_name ||
    inv.party_name || inv.custom_party_name || 'Customer';
  const total = inv.document_type === 'sale' || inv.document_type === 'purchase'
    ? Number(inv.subtotal || 0) + Number(inv.tax_amount || 0) + Number(inv.line_tax_amount || 0) -
      Number(inv.discount || 0) - Number(inv.line_discount_amount || 0)
    : Number(inv.subtotal || 0);
  const paid = Number(inv.paid_amount || 0);
  const due = Number(inv.total_due || 0);
  const amount = event === 'RETURN' ? Number(inv.subtotal || 0) :
    event === 'EXCHANGE' ? Math.abs(Number(inv.difference_amount || 0)) :
    event === 'DUE_REMINDER' ? due : paid;
  const vars = {
    name, shop: shopName || 'Shop', invoice: inv.invoice_number || '',
    total: money(total), paid: money(paid), due: money(due), amount: money(amount)
  };
  return String(template || '').replace(/\{(name|shop|invoice|total|paid|due|amount)\}/g, (_, key) => vars[key]);
}
