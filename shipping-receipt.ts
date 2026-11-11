const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const amount = (value: unknown) => `${Number(value ?? 0).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;

// This is a store-generated packing slip, not a shipping carrier's tracking label.
export function printShippingReceipt(order: any, target?: Window | null) {
  const popup = target === undefined ? window.open('', '_blank', 'width=420,height=760') : target;
  if (!popup) return false;
  const rows = (order.items || []).map((item: any) => {
    const name = item.variant?.product?.name || item.productName || 'صنف';
    const size = item.variant?.name || '';
    const quantity = Number(item.quantity || 0);
    const returned = (item.returnItems || []).reduce((sum: number, row: any) => sum + Number(row.quantity || 0), 0);
    return `<tr><td><b>${escapeHtml(name)}</b>${size ? `<small>${escapeHtml(size)}</small>` : ''}${returned ? `<small>مرتجع ${returned}</small>` : ''}</td><td dir="ltr">${quantity} × ${amount(item.unitPrice)}</td></tr>`;
  }).join('');
  const replacements = (order.returns || []).flatMap((row: any) => row.replacementSale?.items || []).map((item: any) => `<tr><td><b>بديل: ${escapeHtml(item.variant?.product?.name || 'صنف')}</b><small>${escapeHtml(item.variant?.name || '')}</small></td><td dir="ltr">${Number(item.quantity)} × ${amount(item.unitPrice)}</td></tr>`).join('');
  const total = Number(order.netTotal ?? order.total ?? 0);
  const paid = Number(order.netPaid ?? order.paid ?? 0);
  const due = Number(order.due ?? Math.max(0, total - paid));
  const originalDiscount = Number(order.discount ?? 0);
  const gross = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const lineDiscount = Math.max(0, Math.round((gross - Number(order.subtotal ?? gross)) * 100) / 100);
  const returned = Number(order.returnedTotal ?? 0);
  const replacement = Number(order.replacementTotal ?? 0);
  const moneyRow = (label: string, value: number) => `<div class="pair"><span>${label}</span><b dir="ltr">${amount(value)}</b></div>`;
  const invoice = escapeHtml(order.invoiceNo || '—');
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString('ar-EG') : '—';
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>فاتورة شحن ${invoice}</title><style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{width:80mm;max-width:80mm;margin:0;background:white;color:#111}body{font:12px/1.55 Tahoma,Arial,sans-serif}.slip{width:68mm;margin:auto;padding:5mm 2mm;transform:translateX(1.5mm) scale(.95);transform-origin:top center}.brand{text-align:center;border-bottom:1px solid #111;padding-bottom:2mm}.brand strong{font:30px Georgia,serif;letter-spacing:3px}.brand small{display:block;letter-spacing:3px}.heading{text-align:center;font-size:18px;margin:3mm 0}.pair{display:flex;justify-content:space-between;gap:8px;padding:1mm 0}.pair b{text-align:left;overflow-wrap:anywhere}.recipient{border:1px solid #111;padding:2mm;margin:2mm 0}.address{margin-top:2mm;overflow-wrap:anywhere}.address b{display:block}table{width:100%;border-collapse:collapse}th,td{padding:2mm 0;border-bottom:1px dashed #aaa;vertical-align:top}th{text-align:right;border-bottom:1px solid #111}td:last-child,th:last-child{text-align:left}td small{display:block}.totals{margin-top:2mm}.due{border:3px double #111;font-size:16px;padding:2mm;margin:2mm 0}.note{text-align:center;font-size:10px;border-top:1px solid #111;padding-top:2mm} @media print{html,body{width:80mm!important;margin:0!important}.slip{width:68mm!important;margin:auto!important}}
  </style></head><body><main class="slip"><header class="brand"><strong>DRAFT</strong><small>FASHION</small><div dir="ltr">01050400751</div></header><h1 class="heading">فاتورة وبوليصة شحن</h1><div class="pair"><span>رقم الفاتورة / الأوردر</span><b dir="ltr">${invoice}</b></div><div class="pair"><span>التاريخ</span><b>${escapeHtml(date)}</b></div><section class="recipient"><div class="pair"><span>اسم المستلم</span><b>${escapeHtml(order.shippingName || '—')}</b></div><div class="pair"><span>الهاتف</span><b dir="ltr">${escapeHtml(order.shippingPhone || '—')}</b></div><div class="address"><b>عنوان التسليم</b>${escapeHtml(order.shippingAddress || '—')}</div></section><table><thead><tr><th>المنتج والمقاس</th><th>الكمية × السعر</th></tr></thead><tbody>${rows}${replacements}</tbody></table><section class="totals">${moneyRow('إجمالي المنتجات قبل الخصومات', gross)}${lineDiscount ? moneyRow('خصم الأصناف', lineDiscount) : ''}${moneyRow('خصم الفاتورة', originalDiscount)}${returned ? moneyRow('قيمة المرتجعات', returned) : ''}${replacement ? moneyRow('قيمة البدائل', replacement) : ''}${moneyRow('إجمالي الأوردر الحالي', total)}${moneyRow('المدفوع', paid)}<div class="pair due"><span>المتبقي للتحصيل</span><b dir="ltr">${amount(due)}</b></div>${Number(order.refundable) > 0 ? moneyRow('مستحق رده للعميل', Number(order.refundable)) : ''}</section><footer class="note">يرجى الاحتفاظ بالفاتورة · شكراً لاختيارك درافت<br>هذه بوليصة داخلية وليست رقم تتبع شركة الشحن</footer></main><script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},350));window.addEventListener('afterprint',()=>setTimeout(()=>window.close(),300));</script></body></html>`);
  popup.document.close();
  return true;
}
