import React, { useMemo, useState } from 'react';
import { api } from './api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CircleDollarSign, FileText, Pause, Plus, Search, Truck, WalletCards } from 'lucide-react';
import './supplier-management.css';

const get = <T,>(url: string) => api.get<T>(url).then(response => response.data);
const egp = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 2 });
const paymentMethods = [['CASH', 'نقدي'], ['CARD', 'بطاقة'], ['VODAFONE_CASH', 'Vodafone Cash'], ['INSTAPAY', 'InstaPay']];
const frequencyLabel: Record<string, string> = { WEEKLY: 'كل أسبوع', BIWEEKLY: 'كل 15 يوم', MONTHLY: 'كل شهر' };
const dateTime = (value: string) => new Date(value).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const dayDate = (value: string) => new Date(value).toLocaleDateString('ar-EG');

export function SupplierManagementPage() {
  const client = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => get<any[]>('/purchases/suppliers') });
  const { data: ledger = [] } = useQuery({ queryKey: ['supplier-ledger'], queryFn: () => get<any[]>('/purchases/ledger') });
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [schedule, setSchedule] = useState({ amount: '', frequency: 'BIWEEKLY', startDate: new Date().toISOString().slice(0, 10), endDate: '', note: '' });
  const [payment, setPayment] = useState<any>();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const { data: statement, isFetching } = useQuery({ queryKey: ['supplier-statement', selectedId], queryFn: () => get<any>(`/purchases/suppliers/${selectedId}/statement`), enabled: Boolean(selectedId) });
  const { data: consignment } = useQuery({ queryKey: ['supplier-consignment', selectedId], queryFn: () => get<any>(`/purchases/suppliers/${selectedId}/consignment`), enabled: Boolean(selectedId) });
  const [consignmentPayment, setConsignmentPayment] = useState(false);
  const refresh = () => { client.invalidateQueries({ queryKey: ['supplier-ledger'] }); client.invalidateQueries({ queryKey: ['purchases'] }); client.invalidateQueries({ queryKey: ['supplier-statement', selectedId] }); client.invalidateQueries({ queryKey: ['supplier-consignment', selectedId] }); };
  const totals = useMemo(() => ledger.reduce((acc: any, row: any) => ({ invoices: acc.invoices + Number(row.invoiced || 0), paid: acc.paid + Number(row.paid || 0), outstanding: acc.outstanding + Number(row.outstanding || 0) }), { invoices: 0, paid: 0, outstanding: 0 }), [ledger]);
  const shown = suppliers.filter((row: any) => `${row.name} ${row.phone || ''}`.toLocaleLowerCase('ar').includes(search.toLocaleLowerCase('ar')));
  const selectedDue = payment ? Number(payment.outstanding ?? (Number(payment.total) - Number(payment.paid))) : 0;

  const createSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingSupplier) return;
    setSavingSupplier(true);
    try {
      const { data } = await api.post('/purchases/suppliers', {
        name: supplierForm.name.trim(),
        ...(supplierForm.phone.trim() && { phone: supplierForm.phone.trim() }),
        ...(supplierForm.email.trim() && { email: supplierForm.email.trim() }),
        ...(supplierForm.notes.trim() && { notes: supplierForm.notes.trim() }),
      });
      await client.invalidateQueries({ queryKey: ['suppliers'] });
      setSupplierForm({ name: '', phone: '', email: '', notes: '' });
      setAddingSupplier(false); setSelectedId(data.id); setNotice('تمت إضافة المورد. يمكنك تسجيل فواتيره من صفحة المشتريات.');
    } catch (error: any) { setNotice(typeof error.response?.data?.message === 'string' ? error.response.data.message : 'تعذر إضافة المورد؛ راجع البيانات وحاول مجددًا.'); }
    finally { setSavingSupplier(false); }
  };

  const createSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post(`/purchases/suppliers/${selectedId}/schedules`, { ...schedule, amount: Number(schedule.amount), endDate: schedule.endDate || undefined });
      setNotice('تم حفظ جدول الاستحقاق. سيظهر موعده القادم في كشف المورد كتذكير، ويظل تنفيذ الدفع يدويًا بموافقتك.');
      setSchedule(current => ({ ...current, amount: '', note: '' })); refresh();
    } catch (error: any) { setNotice(error.response?.data?.message || 'تعذر حفظ جدول الدفعات.'); }
  };
  const toggleSchedule = async (row: any) => {
    try { await api.patch(`/purchases/suppliers/${selectedId}/schedules/${row.id}`, { active: false }); setNotice('تم إيقاف تذكير الدفعات المتكرر.'); refresh(); }
    catch (error: any) { setNotice(error.response?.data?.message || 'تعذر إيقاف الجدولة.'); }
  };
  const pay = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/purchases/payments', { purchaseId: payment.id, amount: Number(amount), method, reference: reference || `دفعة للمورد ${statement.supplier.name}` });
      setPayment(undefined); setNotice('تم تسجيل الدفعة وتحديث رصيد الفاتورة والمورد.'); refresh();
    } catch (error: any) { setNotice(error.response?.data?.message || 'تعذر تسجيل الدفعة؛ تحقق من رصيد الخزنة والمبلغ المستحق.'); }
  };
  const payConsignment = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.post(`/purchases/suppliers/${selectedId}/consignment/payments`, { amount: Number(amount), method, reference: reference || `تسوية بضاعة أمانة ${statement.supplier.name}` });
      setConsignmentPayment(false); setAmount(''); setReference(''); setNotice('تم تسجيل التسوية وخصمها من رصيد الخزنة، مع تحديث مستحق صاحب البضاعة.'); refresh();
    } catch (error: any) { setNotice(error.response?.data?.message || 'تعذر تسجيل التسوية؛ تحقق من الرصيد والمستحقات.'); }
  };

  if (selectedId) return <main className="content supplier-page">
    <header className="topbar supplier-topbar"><div><p className="eyebrow">الموردون والحسابات</p><h1>{statement?.supplier?.name || 'ملف المورد'}</h1><p className="muted">الفواتير والدفعات والمرتجعات وجدولة مواعيد الاستحقاق.</p></div><button className="secondary" onClick={() => { setSelectedId(''); setNotice(''); }}><ArrowRight size={17}/>كل الموردين</button></header>
    {notice && <p className="toast">{notice}</p>}
    {isFetching && !statement ? <section className="panel">جارٍ تحميل كشف المورد…</section> : statement && <>
      <section className="supplier-kpis">
        <article className="supplier-kpi"><span><FileText/></span><div><small>إجمالي الفواتير</small><strong>{egp.format(statement.summary.invoiced)}</strong><small>{statement.summary.invoiceCount} فاتورة</small></div></article>
        <article className="supplier-kpi"><span><WalletCards/></span><div><small>إجمالي المدفوع</small><strong>{egp.format(statement.summary.paid)}</strong><small>{statement.summary.paymentCount} دفعة</small></div></article>
        <article className="supplier-kpi"><span><CircleDollarSign/></span><div><small>المرتجعات</small><strong>{egp.format(statement.summary.returned)}</strong><small>تُخصم من رصيد المورد</small></div></article>
        <article className="supplier-kpi due"><span><Truck/></span><div><small>{statement.summary.outstanding < 0 ? 'رصيد دائن لنا' : 'المتبقي للمورد'}</small><strong>{egp.format(Math.abs(statement.summary.outstanding))}</strong><small>بعد الفواتير والمرتجعات والدفعات</small></div></article>
      </section>
      <section className="supplier-columns">
        <article className="panel supplier-schedule-panel"><div className="panel-title"><div><h2>جدولة مواعيد الدفعات</h2><p>تذكير بالدفعة كل أسبوع أو 15 يومًا أو شهر؛ لا يتم سحب أي مبلغ تلقائيًا.</p></div><CalendarClock/></div>
          <form className="supplier-schedule-form" onSubmit={createSchedule}>
            <label>قيمة الدفعة<input type="number" min="0.01" step="0.01" value={schedule.amount} onChange={event => setSchedule({ ...schedule, amount: event.target.value })} required/></label>
            <label>التكرار<select value={schedule.frequency} onChange={event => setSchedule({ ...schedule, frequency: event.target.value })}>{Object.entries(frequencyLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>أول موعد<input type="date" value={schedule.startDate} onChange={event => setSchedule({ ...schedule, startDate: event.target.value })} required/></label>
            <label>حتى تاريخ (اختياري)<input type="date" min={schedule.startDate} value={schedule.endDate} onChange={event => setSchedule({ ...schedule, endDate: event.target.value })}/></label>
            <label className="supplier-schedule-note">ملاحظة<input value={schedule.note} onChange={event => setSchedule({ ...schedule, note: event.target.value })} placeholder="مثال: قسط فاتورة الشتاء" maxLength={180}/></label>
            <button className="primary"><Plus size={16}/>إضافة جدول</button>
          </form>
          <div className="supplier-schedule-list">{statement.schedules.length ? statement.schedules.map((row: any) => <div className="supplier-schedule-row" key={row.id}><span className="supplier-schedule-icon"><CalendarClock size={18}/></span><div><b>{egp.format(Number(row.amount))} · {frequencyLabel[row.frequency]}</b><small>الموعد القادم: {row.nextDueDate ? dayDate(row.nextDueDate) : 'انتهى الجدول'}{row.note ? ` · ${row.note}` : ''}</small></div><button className="secondary small" onClick={() => toggleSchedule(row)} title="إيقاف الجدولة"><Pause size={14}/>إيقاف</button></div>) : <div className="supplier-empty">لا توجد جداول دفعات نشطة.</div>}</div>
        </article>
        <article className="panel supplier-contact-panel"><div className="panel-title"><div><h2>بيانات المورد</h2><p>بيانات التواصل المسجلة في النظام.</p></div></div><dl><div><dt>الهاتف</dt><dd>{statement.supplier.phone || 'غير مسجل'}</dd></div><div><dt>البريد الإلكتروني</dt><dd>{statement.supplier.email || 'غير مسجل'}</dd></div><div><dt>ملاحظات</dt><dd>{statement.supplier.notes || 'لا توجد ملاحظات'}</dd></div></dl></article>
      </section>
      <section className="panel table-wrap supplier-invoices"><div className="panel-title"><div><h2>فواتير المورد</h2><p>يمكن تسجيل دفعة على الفاتورة المفتوحة؛ تُخصم مباشرة من الخزنة حسب وسيلة الدفع.</p></div><FileText/></div><table><thead><tr><th>الفاتورة</th><th>نوعها</th><th>التاريخ</th><th>المخزن</th><th>الإجمالي</th><th>المتبقي</th><th>إجراء</th></tr></thead><tbody>{statement.purchases.map((row: any) => { const due = Math.max(0, Number(row.outstanding ?? (Number(row.total) - Number(row.paid)))); return <tr key={row.id}><td><b>{row.invoiceNo}</b></td><td><span className="tag">{row.paymentTerms === 'CASH' ? 'كاش' : 'آجل'}</span></td><td>{dateTime(row.createdAt)}</td><td>{row.warehouse.name}</td><td>{egp.format(Number(row.total))}</td><td><b>{egp.format(due)}</b></td><td>{due > .009 && <button className="primary small" onClick={() => { setPayment(row); setAmount(String(due)); setReference(''); }}>سداد دفعة</button>}</td></tr>; })}{!statement.purchases.length && <tr><td colSpan={7}>لا توجد فواتير مسجلة لهذا المورد.</td></tr>}</tbody></table></section>
      <section className="panel table-wrap supplier-transactions"><div className="panel-title"><div><h2>سجل جميع العمليات</h2><p>مرتب حسب التاريخ ويشمل الفواتير والدفعات والمرتجعات.</p></div><CircleDollarSign/></div><table><thead><tr><th>التاريخ</th><th>العملية</th><th>الرقم / المرجع</th><th>وسيلة الدفع</th><th>القيمة</th></tr></thead><tbody>{statement.transactions.map((row: any) => <tr key={`${row.type}-${row.id}`}><td>{dateTime(row.date)}</td><td><span className={`supplier-event ${row.type.toLowerCase()}`}>{row.type === 'INVOICE' ? 'فاتورة شراء' : row.type === 'PAYMENT' ? 'دفعة' : 'مرتجع'}</span><small>{row.description}</small></td><td>{row.number}</td><td>{paymentMethods.find(([value]) => value === row.method)?.[1] || '—'}</td><td className={row.type === 'INVOICE' ? 'supplier-debit' : 'supplier-credit'}>{row.type === 'INVOICE' ? '+' : '−'}{egp.format(Number(row.amount))}</td></tr>)}{!statement.transactions.length && <tr><td colSpan={5}>لا توجد عمليات مسجلة.</td></tr>}</tbody></table></section>
    </>}
    {consignment && <section className="panel table-wrap supplier-transactions"><div className="panel-title"><div><h2>حساب بضاعة الأمانة والعمولة</h2><p>حساب مستقل عن فواتير الشراء؛ يسجل مستحق صاحب البضاعة بعد البيع والمرتجعات.</p></div><CircleDollarSign/></div><div className="supplier-kpis"><article className="supplier-kpi"><span><FileText/></span><div><small>مستحق من المبيعات</small><strong>{egp.format(consignment.summary.earned)}</strong></div></article><article className="supplier-kpi"><span><WalletCards/></span><div><small>التسويات المدفوعة</small><strong>{egp.format(consignment.summary.paid)}</strong></div></article><article className="supplier-kpi due"><span><Truck/></span><div><small>المتبقي لصاحب البضاعة</small><strong>{egp.format(Math.max(0, consignment.summary.outstanding))}</strong></div></article></div><div className="supplier-list-toolbar"><p>عمولة/هامش المحل مثبت في فاتورة البيع، ولا يدخل كمخزون مشتريات مملوك للمحل.</p>{consignment.summary.outstanding > 0 && <button className="primary" onClick={() => { setAmount(String(consignment.summary.outstanding)); setMethod('CASH'); setReference(''); setConsignmentPayment(true); }}>تسجيل دفعة تسوية</button>}</div><table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>المنتج</th><th>الكمية المباعة</th><th>مستحق المالك</th><th>عمولة المحل</th></tr></thead><tbody>{consignment.summary.soldItems.map((row: any) => <tr key={row.id}><td>{dateTime(row.date)}</td><td>{row.invoiceNo}</td><td>{row.product} · {row.variant}</td><td>{row.quantity - row.returnedQuantity}</td><td>{egp.format(row.outstanding)}</td><td>{egp.format(row.storeCommission)}</td></tr>)}{!consignment.summary.soldItems.length && <tr><td colSpan={6}>لا توجد مبيعات بضاعة أمانة مسجلة لهذا المورد.</td></tr>}</tbody></table><h3>دفعات التسوية والمرتجعات</h3><table><thead><tr><th>التاريخ</th><th>النوع</th><th>رقم العملية</th><th>التفاصيل</th><th>القيمة</th></tr></thead><tbody>{consignment.transactions.map((row: any) => <tr key={`${row.type}-${row.id}`}><td>{dateTime(row.date)}</td><td>{row.type === 'SALE' ? 'مستحق بيع' : row.type === 'RETURN' ? 'خصم مرتجع' : 'دفعة تسوية'}</td><td>{row.number}</td><td>{row.description}</td><td>{egp.format(row.amount)}</td></tr>)}{!consignment.transactions.length && <tr><td colSpan={5}>لا توجد حركات حتى الآن.</td></tr>}</tbody></table></section>}
    {consignmentPayment && <div className="modal-back"><section className="modal"><div className="modal-head"><div><h2>تسوية مستحق بضاعة الأمانة</h2><p>{statement.supplier.name} · المستحق {egp.format(consignment.summary.outstanding)}</p></div><button className="icon" onClick={() => setConsignmentPayment(false)}>×</button></div><form className="form-grid" onSubmit={payConsignment}><label>مبلغ التسوية<input type="number" min="0.01" max={consignment.summary.outstanding} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required/></label><label>طريقة الدفع<select value={method} onChange={event => setMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full">مرجع أو ملاحظة<input value={reference} onChange={event => setReference(event.target.value)} placeholder="اختياري" maxLength={180}/></label><div className="form-actions"><button className="primary">تأكيد التسوية من الخزنة</button></div></form></section></div>}
    {payment && <div className="modal-back"><section className="modal"><div className="modal-head"><div><h2>سداد دفعة للمورد</h2><p>{statement.supplier.name} · فاتورة {payment.invoiceNo} · المتبقي {egp.format(selectedDue)}</p></div><button className="icon" onClick={() => setPayment(undefined)}>×</button></div><form className="form-grid" onSubmit={pay}><label>مبلغ الدفعة<input type="number" min="0.01" max={selectedDue} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required/></label><label>طريقة الدفع<select value={method} onChange={event => setMethod(event.target.value)}>{paymentMethods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full">المرجع / ملاحظة<input value={reference} onChange={event => setReference(event.target.value)} placeholder="اختياري" maxLength={180}/></label><div className="form-actions"><button className="primary">تأكيد الدفعة وتحديث الرصيد</button></div></form></section></div>}
  </main>;

  return <main className="content supplier-page">
    <header className="topbar supplier-topbar"><div><p className="eyebrow">المشتريات والحسابات</p><h1>الموردون</h1><p className="muted">تابع إجمالي الفواتير والمدفوع والمتبقي، وافتح سجل المورد لمراجعة كل العمليات.</p></div><button className="primary" onClick={() => { setNotice(''); setAddingSupplier(true); }}><Plus size={17}/>إضافة مورد</button></header>
    {notice && <p className="toast">{notice}</p>}
    <section className="supplier-kpis"><article className="supplier-kpi"><span><FileText/></span><div><small>إجمالي فواتير الموردين</small><strong>{egp.format(totals.invoices)}</strong></div></article><article className="supplier-kpi"><span><WalletCards/></span><div><small>إجمالي ما تم دفعه</small><strong>{egp.format(totals.paid)}</strong></div></article><article className="supplier-kpi due"><span><CircleDollarSign/></span><div><small>صافي المستحق</small><strong>{egp.format(totals.outstanding)}</strong></div></article></section>
    <section className="panel supplier-list-panel"><div className="supplier-list-toolbar"><div><h2>قائمة الموردين</h2><p>اختر موردًا لعرض الفواتير والدفعات والاستحقاقات.</p></div><label className="supplier-search"><Search size={17}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم المورد أو الهاتف"/></label></div>
      {isLoading ? <div className="supplier-empty">جارٍ تحميل الموردين…</div> : <div className="supplier-list">{shown.map((supplier: any) => { const row = ledger.find((entry: any) => entry.id === supplier.id) || {}; const outstanding = Number(row.outstanding || 0); return <button className="supplier-list-row" key={supplier.id} onClick={() => { setSelectedId(supplier.id); setNotice(''); }}><span className="supplier-avatar">{supplier.name.trim().slice(0, 1)}</span><span className="supplier-list-name"><b>{supplier.name}</b><small>{supplier.phone || 'لا يوجد هاتف مسجل'}</small></span><span className="supplier-list-metric"><small>الفواتير</small><b>{egp.format(Number(row.invoiced || 0))}</b></span><span className="supplier-list-metric"><small>المدفوع</small><b>{egp.format(Number(row.paid || 0))}</b></span><span className="supplier-list-metric"><small>{outstanding < 0 ? 'دائن لنا' : 'المتبقي'}</small><b className={outstanding > 0 ? 'supplier-debit' : ''}>{egp.format(Math.abs(outstanding))}</b></span><ArrowRight size={17}/></button>; })}{!shown.length && <div className="supplier-empty">{search ? 'لا توجد نتائج مطابقة.' : 'لا يوجد موردون حتى الآن. أضف المورد من صفحة المشتريات.'}</div>}</div>}
    </section>
    {addingSupplier && <div className="modal-back"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-supplier-title"><div className="modal-head"><div><h2 id="new-supplier-title">إضافة مورد جديد</h2><p>بعد الحفظ يمكنك فتح ملفه وإضافة فواتيره من المشتريات.</p></div><button type="button" className="icon" aria-label="إغلاق" onClick={() => setAddingSupplier(false)} disabled={savingSupplier}>×</button></div><form className="form-grid" onSubmit={createSupplier}><label>اسم المورد<input value={supplierForm.name} onChange={event => setSupplierForm({ ...supplierForm, name: event.target.value })} minLength={2} maxLength={120} required/></label><label>الهاتف<input type="tel" value={supplierForm.phone} onChange={event => setSupplierForm({ ...supplierForm, phone: event.target.value })} minLength={7} maxLength={20}/></label><label>البريد الإلكتروني<input type="email" value={supplierForm.email} onChange={event => setSupplierForm({ ...supplierForm, email: event.target.value })}/></label><label className="full">ملاحظات<input value={supplierForm.notes} onChange={event => setSupplierForm({ ...supplierForm, notes: event.target.value })} maxLength={500}/></label><div className="form-actions"><button className="primary" disabled={savingSupplier}>{savingSupplier ? 'جارٍ الحفظ…' : 'حفظ المورد'}</button></div></form></section></div>}
  </main>;
}
