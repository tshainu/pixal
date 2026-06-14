import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Plus, Search, Eye, X, Trash2, ArrowRight, ShoppingBag, FileText, FileCheck, ScanLine, ChevronDown, Pencil, Printer, DollarSign } from 'lucide-react';
import AddCustomerModal from '../components/AddCustomerModal';

type LineItem = { item_id: number; item_name: string; qty: number; unit_price: number; discount: number };
type Sale = {
  id: number; invoice_no: string; customer_id: number; customer_name: string;
  sale_date: string; payment_status: string; total_amount: number;
  paid_amount: number; notes: string; items?: LineItem[];
};
type Quotation = {
  id: number; quotation_no: string; customer_id: number; customer_name: string;
  quotation_date: string; expiry_date: string; status: string; total_amount: number; notes: string;
};

const fmt = (n: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);
const today = () => new Date().toISOString().split('T')[0];

export default function Sales() {
  const loc = useLocation();
  const navigate = useNavigate();

  // Determine active sub-section from hash or default to pos
  const hash = loc.hash.replace('#', '') || 'pos';

  const subNav = [
    { id: 'pos', icon: ShoppingBag, label: 'POS' },
    { id: 'list', icon: FileCheck, label: 'List of Sales' },
    { id: 'quotations', icon: FileText, label: 'Quotations' },
  ];

  if (hash === 'pos') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div className="topbar"><h2>Sales</h2></div>
        <div style={{ padding: '0 28px', flexShrink: 0 }}>
          <div className="sub-nav" style={{ marginBottom: 0 }}>
            {subNav.map(({ id, icon: Icon, label }) => (
              <button key={id} className={`sub-nav-item ${hash === id ? 'active' : ''}`} onClick={() => navigate(`/sales#${id}`)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}><POSTab /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar"><h2>Sales</h2></div>
      <div className="content" style={{ paddingTop: 0 }}>
        <div className="sub-nav" style={{ marginBottom: 14 }}>
          {subNav.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`sub-nav-item ${hash === id || (id === 'quotations' && (hash === 'quotations' || hash === 'new-quotation')) ? 'active' : ''}`}
              onClick={() => navigate(`/sales#${id}`)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {hash === 'list' && <SalesListTab />}
        {(hash === 'quotations' || hash === 'new-quotation') && (
          <QuotationsTab defaultNew={hash === 'new-quotation'} />
        )}
      </div>
    </div>
  );
}

/* ─── POS ─────────────────────────────────────────────────────────── */
type AddonLine = { name: string; qty: number; unit_price: number };
type PosCustomer = { customer: any; total_business: number; total_due: number; last_sales: any[] } | null;
type PriceType = 'selling_price' | 'wholesale_price' | 'cost_price';

const WALK_IN_ID = 4; // Walk-In Customer DB id

/* ─── GLOBAL 80mm PRINT HELPER ───────────────────────────────────── */
function printReceipt(sale: any, items: any[], settings?: Record<string, string>, payments?: any[]) {
  const regularItems = items.filter((l: any) => !l.description?.startsWith('[Add-on]'));
  const addonItems   = items.filter((l: any) =>  l.description?.startsWith('[Add-on]'));
  const fmt = (n: number) => Number(n).toLocaleString('en-LK', { minimumFractionDigits: 2 });
  const fmtSimple = (n: number) => Number(n).toLocaleString('en-LK', { minimumFractionDigits: 0 });
  const total   = Number(sale.total_amount || 0);
  const paid    = Number(sale.paid_amount  || 0);
  const discount = Number(sale.discount   || 0);
  const status  = sale.payment_status || '';
  const date    = sale.sale_date || new Date().toISOString().slice(0, 10);
  const time    = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // Header image overrides shop name + address
  const headerImgUrl = settings?.receipt_header_url || '';
  const shopName     = settings?.name    || 'PANDORA GARMENTS';
  const shopAddress  = settings?.address || '';

  const headerBlock = headerImgUrl
    ? `<div class="r80-header-img"><img src="${headerImgUrl}" style="width:100%;display:block;" /></div>`
    : `<div class="r80-shop-name">${shopName}</div>${shopAddress ? `<div class="r80-shop-sub">${shopAddress.replace(/\n/g, ' · ')}</div>` : ''}`;

  const rows = [...regularItems, ...addonItems].map((l: any) => {
    const name  = l.item_name || l.description || '';
    const qty   = Number(l.qty || 1);
    const price = Number(l.unit_price || 0);
    const disc  = Number(l.discount || 0);
    const line  = qty * price - disc;
    return `<div class="r80-item-row">
      <span class="r80-col-item">${name}</span>
      <span class="r80-col-qty">${qty}</span>
      <span class="r80-col-price">${fmtSimple(price)}</span>
      <span class="r80-col-total">${fmtSimple(line)}</span>
    </div>`;
  }).join('');

  const dueRow = status === 'Unpaid'
    ? `<div class="r80-total-row r80-due"><span>DUE</span><span>Rs. ${fmt(total)}</span></div>`
    : status === 'Partial'
    ? `<div class="r80-total-row r80-due"><span>BALANCE DUE</span><span>Rs. ${fmt(total - paid)}</span></div>`
    : '';

  // Payment history rows
  const paymentRows = (() => {
    if (status === 'Unpaid') return '';
    if (payments && payments.length > 0) {
      return payments.map((p: any) => {
        const amt = Number(p.amount || 0);
        const method = p.method || 'Cash';
        const dt = p.paid_at || '';
        return `<div class="r80-total-row"><span>Paid ${dt} (${method})</span><span>Rs. ${fmt(amt)}</span></div>`;
      }).join('');
    }
    // Fallback: single payment from sale fields
    if (paid > 0) {
      return `<div class="r80-total-row"><span>Paid ${date} (${sale.payment_type || 'Cash'})</span><span>Rs. ${fmt(paid)}</span></div>`;
    }
    return '';
  })();

  const customerName  = sale.customer_name || 'Walk-In Customer';
  const customerPhone = sale.customer_phone || '';
  const orderNo       = sale.order_no || '';

  const html = `
    <div class="receipt-80" id="__receipt_print__">
      <div class="r80-header">
        ${headerBlock}
        <hr class="r80-divider" />
        <div class="r80-invoice">Invoice: ${sale.invoice_no || ''}</div>
        ${orderNo ? `<div class="r80-invoice">Order: ${orderNo}</div>` : ''}
        <div class="r80-date">${date} | ${time}</div>
        <hr class="r80-divider" />
        <div class="r80-customer"><strong>${customerName}</strong></div>
        ${customerPhone ? `<div class="r80-customer">${customerPhone}</div>` : ''}
        <hr class="r80-divider" />
      </div>
      <div class="r80-items">
        <div class="r80-items-header">
          <span class="r80-col-item">ITEM</span>
          <span class="r80-col-qty">QTY</span>
          <span class="r80-col-price">PRICE</span>
          <span class="r80-col-total">TOTAL</span>
        </div>
        <hr class="r80-divider" />
        ${rows}
      </div>
      <hr class="r80-divider" />
      ${discount > 0 ? `<div class="r80-total-row"><span>Discount</span><span>- ${fmtSimple(discount)}</span></div>` : ''}
      <div class="r80-grand-total"><span>TOTAL</span><span>Rs. ${fmt(total)}</span></div>
      ${paymentRows}
      ${dueRow}
      <hr class="r80-divider" />
      <div class="r80-footer">
        <div>Thank you for your business!</div>
        ${!headerImgUrl ? `<div style="margin-top:4px">${shopName}</div>` : ''}
      </div>
      <div class="r80-cut">✂ - - - - - - - - - - - - - - - -</div>
    </div>`;

  const el = document.createElement('div');
  el.innerHTML = html;
  const node = el.firstElementChild as HTMLElement;
  document.body.appendChild(node);

  const style = document.createElement('style');
  style.id = 'receipt-80-page';
  style.textContent = '@media print { @page { size: 80mm auto; margin: 0; } }';
  document.head.appendChild(style);

  document.body.classList.add('printing-sale');
  window.onafterprint = () => {
    document.body.classList.remove('printing-sale');
    document.getElementById('receipt-80-page')?.remove();
    document.getElementById('__receipt_print__')?.remove();
    window.onafterprint = null;
  };
  if (headerImgUrl) {
    const img = node.querySelector('img') as HTMLImageElement | null;
    if (img && !img.complete) {
      img.onload = () => window.print();
      img.onerror = () => window.print();
    } else {
      window.print();
    }
  } else {
    window.print();
  }
}

function POSTab() {
  const qc = useQueryClient();
  const { data: allItems = [] } = useQuery({ queryKey: ['items'], queryFn: () => api.getItems() });
  const { data: settings = {} } = useQuery<Record<string, string>>({ queryKey: ['settings'], queryFn: () => api.getSettings() });

  // Left panel state
  const [itemSearch, setItemSearch] = useState('');
  const [priceType, setPriceType] = useState<PriceType>('selling_price');
  const [cart, setCart] = useState<LineItem[]>([]);
  const [addons, setAddons] = useState<AddonLine[]>([]);
  const [showAddonDropdown, setShowAddonDropdown] = useState(false);
  const [newAddonName, setNewAddonName] = useState('');
  const addonRef = useRef<HTMLDivElement>(null);

  // Modals
  const [showPayModal, setShowPayModal] = useState(false);
  const [payModalMode, setPayModalMode] = useState<'pay' | 'credit'>('pay');
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showQuotationModal, setShowQuotationModal] = useState(false);
  const [lastQuotation, setLastQuotation] = useState<any>(null);
  const [cashGiven, setCashGiven] = useState<string>('');

  // Right panel state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer>(null);
  const [loadingCust, setLoadingCust] = useState(false);
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const custRef = useRef<HTMLDivElement>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [billDiscount, setBillDiscount] = useState(0);
  const [showDiscountEdit, setShowDiscountEdit] = useState(false);
  const [discountInput, setDiscountInput] = useState('');


  // Auto-load Walk-In Customer on mount
  useEffect(() => {
    api.getCustomerPosData(WALK_IN_ID)
      .then(d => {
        setSelectedCustomer(d as PosCustomer);
        setCustomerSearch('Walk-In Customer');
      })
      .catch(() => {});
  }, []);

  const isWalkIn = selectedCustomer?.customer?.id === WALK_IN_ID;

  // Clock
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addonRef.current && !addonRef.current.contains(e.target as Node)) setShowAddonDropdown(false);
      if (custRef.current && !custRef.current.contains(e.target as Node)) setShowCustDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Customer search
  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) { setCustomerResults([]); return; }
    const res = await api.getCustomers({ search: q });
    setCustomerResults((res as any[]).slice(0, 8));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch, searchCustomers]);

  const selectCustomer = async (c: any) => {
    setCustomerSearch(c.name);
    setShowCustDropdown(false);
    setLoadingCust(true);
    try {
      const data = await api.getCustomerPosData(c.id);
      setSelectedCustomer(data as PosCustomer);
    } catch { setSelectedCustomer(null); }
    setLoadingCust(false);
  };

  const clearCustomer = () => { setSelectedCustomer(null); setCustomerSearch(''); setCustomerResults([]); };

  // Item search filter
  const filteredItems = (allItems as any[]).filter(i =>
    i.status === 'Active' && (!itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()) || (i.item_code && i.item_code.toLowerCase().includes(itemSearch.toLowerCase())))
  );

  const addToCart = (item: any) => {
    const price = item[priceType] || item.selling_price || 0;
    setCart(prev => {
      const idx = prev.findIndex(l => l.item_id === item.id && l.unit_price === price);
      if (idx >= 0) return prev.map((l, i) => i === idx ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { item_id: item.id, item_name: item.name, qty: 1, unit_price: price, discount: 0 }];
    });
    setItemSearch('');
  };

  const updateCart = (i: number, field: keyof LineItem, val: number) =>
    setCart(p => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const removeCart = (i: number) => setCart(p => p.filter((_, idx) => idx !== i));

  const addAddon = (name: string, price = 0) => {
    setAddons(p => [...p, { name, qty: 1, unit_price: price }]);
    setShowAddonDropdown(false);
    setNewAddonName('');
  };
  const updateAddon = (i: number, field: keyof AddonLine, val: any) =>
    setAddons(p => p.map((a, idx) => idx === i ? { ...a, [field]: val } : a));
  const removeAddon = (i: number) => setAddons(p => p.filter((_, idx) => idx !== i));

  const totalPcs = cart.reduce((s, l) => s + l.qty, 0);
  const totalDiscount = cart.reduce((s, l) => s + (l.discount || 0), 0) + billDiscount;
  const addonTotal = addons.reduce((s, a) => s + a.qty * a.unit_price, 0);
  const itemsTotal = cart.reduce((s, l) => s + l.qty * l.unit_price - (l.discount || 0), 0);
  const grandTotal = itemsTotal + addonTotal - billDiscount;

  // Derive payment status from cash given vs total
  const cashNum = parseFloat(cashGiven) || 0;
  void cashNum; // used via cashGiven in modal
  const resolvePaymentStatus = (mode: 'pay' | 'credit', cash: number): { status: 'Paid' | 'Partial' | 'Unpaid' | 'Draft'; paid: number } => {
    if (mode === 'credit') return { status: 'Unpaid', paid: 0 };
    if (cash <= 0) return { status: 'Paid', paid: grandTotal }; // no cash entered → assume exact
    if (cash >= grandTotal) return { status: 'Paid', paid: grandTotal };
    return { status: 'Partial', paid: cash };
  };

  const saveSale = useMutation({
    mutationFn: ({ mode, cash }: { mode: 'pay' | 'credit' | 'Draft'; cash?: number }) => {
      if (mode === 'Draft') {
        return api.createInvoice({
          customer_id: selectedCustomer?.customer?.id || null,
          sale_date: today(), payment_type: 'Cash',
          paid_amount: 0, payment_status: 'Draft',
          total_amount: grandTotal, discount: totalDiscount,
          notes: '', items: cart, addons,
        });
      }
      const { status, paid } = resolvePaymentStatus(mode, cash ?? 0);
      return api.createInvoice({
        customer_id: selectedCustomer?.customer?.id || null,
        sale_date: today(), payment_type: 'Cash',
        paid_amount: paid, payment_status: status,
        total_amount: grandTotal, discount: totalDiscount,
        notes: '', items: cart, addons,
      });
    },
    onSuccess: (res: any, vars) => {
      // Immediate UI reset — don't block on any follow-up fetches
      const label = vars.mode === 'Draft' ? 'Draft' : vars.mode === 'credit' ? 'Unpaid' : resolvePaymentStatus('pay', vars.cash ?? 0).status;
      setSuccess(`${res.sale?.invoice_no || 'Invoice'} saved as ${label}`);
      setCart([]); setAddons([]); setBillDiscount(0); setShowDiscountEdit(false);
      setShowPayModal(false);
      setCashGiven('');
      setTimeout(() => setSuccess(null), 4000);
      // Background: refresh invoices list + customer panel (non-blocking)
      qc.invalidateQueries({ queryKey: ['invoices'] });
      const custId = selectedCustomer?.customer?.id;
      if (custId) api.getCustomerPosData(custId).then(d => setSelectedCustomer(d as PosCustomer)).catch(() => {});
    },
  });

  const saveQuotation = useMutation({
    mutationFn: () => api.createQuotation({
      customer_id: selectedCustomer?.customer?.id || null,
      quotation_date: today(), expiry_date: '', status: 'Draft',
      total_amount: grandTotal, notes: '',
      items: cart.map(it => ({ item_id: it.item_id, description: it.item_name, qty: it.qty, unit_price: it.unit_price, total: it.qty * it.unit_price - (it.discount || 0) })),
    }),
    onSuccess: (res: any) => {
      setLastQuotation(res);
      setShowQuotationModal(true);
      setCart([]); setAddons([]); setBillDiscount(0); setShowDiscountEdit(false);
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });

  const handleSaveAndPrint = (mode: 'pay' | 'credit', cash: number) => {
    saveSale.mutate({ mode, cash }, {
      onSuccess: (res: any) => {
        setTimeout(() => printReceipt(res.sale, res.items || [], settings as Record<string, string>, res.payments), 200);
      }
    });
  };

  const handleSaveAndShare = (mode: 'pay' | 'credit', cash: number) => {
    saveSale.mutate({ mode, cash }, {
      onSuccess: (res: any) => {
        const text = `Invoice ${res.sale?.invoice_no || ''} – Total: ${fmt(grandTotal)}`;
        if (navigator.share) { navigator.share({ title: 'Invoice', text }); }
        else { navigator.clipboard?.writeText(text); }
      }
    });
  };

  const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const { data: addonItemsList = [] } = useQuery({ queryKey: ['addon-items'], queryFn: api.getAddonItems });

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, height: '100%', minHeight: 600 }}>

      {/* ── LEFT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', paddingRight: 0 }}>

        {/* Search bar row */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px 8px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="form-control"
              style={{ paddingLeft: 34, paddingRight: 36, fontSize: '0.88rem', height: 38, borderRadius: 6 }}
              placeholder="Enter item name/SKU"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && filteredItems.length > 0) { addToCart(filteredItems[0]); setItemSearch(''); } }}
            />
            <ScanLine size={16} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', cursor: 'pointer' }} />
            {/* Search dropdown */}
            {itemSearch && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
                maxHeight: 260, overflowY: 'auto', marginTop: 4,
              }}>
                {filteredItems.length === 0 ? (
                  <div style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: '0.82rem' }}>No items found</div>
                ) : filteredItems.slice(0, 20).map(item => (
                  <div
                    key={item.id}
                    onClick={() => { addToCart(item); setItemSearch(''); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{item.name}</span>
                      {item.sku && <span style={{ marginLeft: 8, color: 'var(--text3)', fontSize: '0.75rem' }}>{item.sku}</span>}
                    </div>
                    <span style={{ color: 'var(--red)', fontWeight: 700, flexShrink: 0 }}>{fmt(item[priceType] || item.selling_price || 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Price type dropdown */}
          <select
            className="form-control"
            style={{ width: 150, fontSize: '0.82rem', height: 38 }}
            value={priceType}
            onChange={e => setPriceType(e.target.value as PriceType)}
          >
            <option value="selling_price">Retail Price</option>
            <option value="wholesale_price">Wholesale Price</option>
            <option value="cost_price">Cost Price</option>
          </select>
          {/* Add-on dropdown */}
          <div ref={addonRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary"
              style={{ height: 38, display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
              onClick={() => setShowAddonDropdown(v => !v)}
            >
              Add-on items <ChevronDown size={13} />
            </button>
            {showAddonDropdown && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 240, padding: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 600, padding: '4px 8px 6px', borderBottom: '1px solid var(--border)', marginBottom: 6 }}>Add-on Items</div>
                {(addonItemsList as any[]).length === 0 && (
                  <div style={{ padding: '8px 10px', fontSize: '0.78rem', color: 'var(--text3)' }}>No add-ons configured yet</div>
                )}
                {(addonItemsList as any[]).map((a: any) => (
                  <button key={a.id} onClick={() => addAddon(a.name, a.default_price || 0)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: '0.82rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 4, color: 'var(--text)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span>+ {a.name}</span>
                    {a.default_price > 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{a.default_price.toLocaleString('en-LK')}</span>}
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', gap: 6 }}>
                  <input
                    className="form-control"
                    style={{ flex: 1, fontSize: '0.8rem', height: 30 }}
                    placeholder="Custom add-on name…"
                    value={newAddonName}
                    onChange={e => setNewAddonName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newAddonName.trim()) addAddon(newAddonName.trim()); }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => { if (newAddonName.trim()) addAddon(newAddonName.trim()); }}>Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Items table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: '#B2EBF2', borderBottom: '1px solid #80DEEA' }}>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em', color: '#00695C' }}>PRODUCT</th>
                <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em', color: '#00695C', width: 70 }}>QTY</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em', color: '#00695C', width: 110 }}>DISCOUNT</th>
                <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em', color: '#00695C', width: 100 }}>PRICE</th>
                <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em', color: '#00695C', width: 110 }}>SUBTOTAL</th>
                <th style={{ width: 28 }}></th>
              </tr>
            </thead>
            <tbody>
              {cart.length === 0 && addons.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: '48px 0', fontSize: '0.85rem' }}>
                  Search for items above or click from the grid below
                </td></tr>
              )}
              {cart.map((line, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.84rem' }}>{line.item_name}</div>
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <input type="number" min={1} value={line.qty}
                      onChange={e => updateCart(i, 'qty', Number(e.target.value))}
                      onFocus={e => e.target.select()}
                      style={{ width: 54, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: '0.82rem', background: 'var(--bg)' }} />
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    <input type="number" min={0} value={line.discount}
                      onChange={e => updateCart(i, 'discount', Number(e.target.value))}
                      onFocus={e => e.target.select()}
                      style={{ width: 90, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', fontSize: '0.82rem', background: 'var(--bg)' }} />
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 500 }}>{line.unit_price.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{(line.qty * line.unit_price - (line.discount || 0)).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '4px 4px' }}>
                    <button onClick={() => removeCart(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, borderRadius: 3 }}>
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}

              {/* Add-ons section */}
              {addons.length > 0 && (
                <>
                  <tr><td colSpan={6} style={{ padding: '8px 16px 4px', fontSize: '0.75rem', color: 'var(--text3)', fontWeight: 600, background: 'var(--bg)' }}>Add-on:</td></tr>
                  {addons.map((a, i) => (
                    <tr key={`addon-${i}`} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.01)' }}>
                      <td style={{ padding: '6px 16px', fontSize: '0.82rem', color: 'var(--text2)' }}>{a.name}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <input type="number" min={1} value={a.qty}
                          onChange={e => updateAddon(i, 'qty', Number(e.target.value))}
                          onFocus={e => e.target.select()}
                          style={{ width: 54, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: '0.82rem', background: 'var(--bg)' }} />
                      </td>
                      {/* empty discount cell */}
                      <td></td>
                      {/* PRICE input in PRICE column */}
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <input type="number" min={0} value={a.unit_price}
                          onChange={e => updateAddon(i, 'unit_price', Number(e.target.value))}
                          onFocus={e => e.target.select()}
                          style={{ width: 90, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', fontSize: '0.82rem', background: 'var(--bg)' }} />
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'right', fontWeight: 600, fontSize: '0.82rem' }}>{(a.qty * a.unit_price).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '4px' }}>
                        <button onClick={() => removeAddon(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2 }}><X size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer totals */}
        <div style={{ borderTop: '2px solid var(--border)', background: 'var(--surface)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text2)' }}>Total Pcs: <strong style={{ color: 'var(--text)' }}>{totalPcs}</strong></span>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Discount: <strong style={{ color: '#C0001A' }}>{totalDiscount.toLocaleString('en-LK', { minimumFractionDigits: 0 })}</strong>
            {showDiscountEdit ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  autoFocus
                  type="number" min={0}
                  value={discountInput}
                  onChange={e => setDiscountInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { setBillDiscount(parseFloat(discountInput) || 0); setShowDiscountEdit(false); }
                    if (e.key === 'Escape') setShowDiscountEdit(false);
                  }}
                  style={{ width: 80, padding: '2px 6px', fontSize: '0.82rem', border: '1px solid #C0001A', borderRadius: 4, color: 'var(--text)', background: 'var(--bg)' }}
                  placeholder="0"
                />
                <button onClick={() => { setBillDiscount(parseFloat(discountInput) || 0); setShowDiscountEdit(false); }}
                  style={{ padding: '2px 8px', fontSize: '0.75rem', background: '#C0001A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>✓</button>
                <button onClick={() => setShowDiscountEdit(false)}
                  style={{ padding: '2px 6px', fontSize: '0.75rem', background: 'none', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>✕</button>
              </span>
            ) : (
              <button onClick={() => { setDiscountInput(String(billDiscount || '')); setShowDiscountEdit(true); }}
                style={{ padding: '1px 7px', fontSize: '0.72rem', background: 'none', color: '#C0001A', border: '1px solid #C0001A', borderRadius: 4, cursor: 'pointer', fontWeight: 700, lineHeight: '1.4' }}>
                Edit
              </button>
            )}
          </span>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text2)' }}>Add-on: <strong style={{ color: 'var(--text)' }}>{addons.length}</strong></span>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text3)', marginBottom: 2 }}>Total:</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)' }}>{grandTotal.toLocaleString('en-LK', { minimumFractionDigits: 0 })}</div>
          </div>
        </div>



        {/* Success toast — top center */}
        {success && (
          <div style={{
            position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
            zIndex: 9999, background: '#1B8A5A', color: '#fff',
            padding: '12px 28px', borderRadius: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            fontSize: '0.9rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'fadeInDown 0.25s ease',
          }}>
            ✓ {success}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr 1fr', borderTop: '2px solid var(--border)' }}>
          {/* Recent Sales + Draft quick links */}
          <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <button
              onClick={() => setShowRecentModal(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px 4px', fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 600, textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text3)')}
            >Recent Sales</button>
            <button
              onClick={() => setShowDraftModal(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 14px 8px', fontSize: '0.82rem', color: 'var(--text)', fontWeight: 700, textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#C0001A')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text)')}
            >Draft</button>
          </div>
          {/* Draft save button — border red */}
          <button
            style={{
              background: 'none',
              border: '2px solid #C0001A',
              borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
              borderRight: '1px solid var(--border)',
              padding: '16px 10px', fontSize: '0.95rem', fontWeight: 700,
              color: '#C0001A', cursor: cart.length === 0 ? 'default' : 'pointer',
              letterSpacing: '0.01em', opacity: cart.length === 0 ? 0.45 : 1,
            }}
            disabled={cart.length === 0 || saveSale.isPending}
            onClick={() => saveSale.mutate({ mode: 'Draft' })}
          >Draft</button>
          {/* Quotation button — border purple */}
          <button
            style={{
              background: 'none',
              border: '2px solid #7B1FA2',
              borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
              borderRight: '1px solid var(--border)',
              padding: '16px 10px', fontSize: '0.95rem', fontWeight: 700,
              color: '#7B1FA2', cursor: cart.length === 0 ? 'default' : 'pointer',
              letterSpacing: '0.01em', opacity: cart.length === 0 ? 0.45 : 1,
            }}
            disabled={cart.length === 0 || saveQuotation.isPending}
            onClick={() => saveQuotation.mutate()}
          >{saveQuotation.isPending ? 'Saving…' : 'Quotation'}</button>
          {/* Credit Sale — border blue, disabled for Walk-In */}
          <button
            style={{
              background: 'none',
              border: 'none',
              borderRight: '1px solid var(--border)',
              padding: '16px 10px', fontSize: '0.95rem', fontWeight: 700,
              color: isWalkIn ? 'var(--text3)' : '#1565C0',
              cursor: (cart.length === 0 || isWalkIn) ? 'default' : 'pointer',
              letterSpacing: '0.01em', opacity: (cart.length === 0 || isWalkIn) ? 0.4 : 1,
              outline: isWalkIn ? 'none' : undefined,
              boxShadow: isWalkIn ? 'none' : undefined,
            }}
            disabled={cart.length === 0 || isWalkIn || saveSale.isPending}
            onClick={() => { setPayModalMode('credit'); setCashGiven(''); setShowPayModal(true); }}
            title={isWalkIn ? 'Walk-In customers cannot use credit' : ''}
          >Credit Sale</button>
          {/* Pay Now — filled green */}
          <button
            style={{
              background: cart.length === 0 ? '#ccc' : '#1B8A5A',
              border: 'none', padding: '16px 10px', fontSize: '0.95rem', fontWeight: 700,
              color: '#fff', cursor: cart.length === 0 ? 'default' : 'pointer',
              letterSpacing: '0.01em', opacity: cart.length === 0 ? 0.6 : 1,
            }}
            disabled={cart.length === 0 || saveSale.isPending}
            onClick={() => { setPayModalMode('pay'); setCashGiven(''); setShowPayModal(true); }}
          >{saveSale.isPending ? 'Processing…' : 'Pay Now'}</button>
        </div>

        {/* Pay Now / Credit Sale modal */}
        {showPayModal && (() => {
          const cash = parseFloat(cashGiven) || 0;
          const bal = cash > 0 ? cash - grandTotal : null;
          const isShort = bal !== null && bal < 0;
          const isChange = bal !== null && bal >= 0;
          const { status: resolvedStatus } = resolvePaymentStatus(payModalMode, cash);
          const isWalkInPartial = isWalkIn && payModalMode === 'pay' && isShort;
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={e => { if (e.target === e.currentTarget) setShowPayModal(false); }}>
              <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '28px 32px', minWidth: 360, maxWidth: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>

                {/* Header */}
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16, color: 'var(--text)' }}>
                  {payModalMode === 'pay' ? 'Confirm Payment' : 'Credit Sale'}
                </div>

                {/* Total row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text2)', fontWeight: 600 }}>Total Amount</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>{fmt(grandTotal)}</span>
                </div>

                {/* Cash given input — only for Pay mode */}
                {payModalMode === 'pay' && (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Cash Given</label>
                      <input
                        className="form-control"
                        type="number"
                        min={0}
                        placeholder={`${grandTotal}`}
                        value={cashGiven}
                        onChange={e => setCashGiven(e.target.value)}
                        onFocus={e => e.target.select()}
                        autoFocus
                        style={{ fontSize: '1.1rem', fontWeight: 700, textAlign: 'right', height: 46, borderRadius: 8, borderColor: isShort ? '#C0001A' : isChange ? '#1B8A5A' : 'var(--border)' }}
                      />
                    </div>

                    {/* Balance / Change row */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: 8, marginBottom: 18,
                      background: isShort ? '#FFF3F3' : isChange ? '#F0FAF5' : 'var(--bg)',
                      border: `1px solid ${isShort ? '#FFCDD2' : isChange ? '#C8E6C9' : 'var(--border)'}`,
                    }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isShort ? '#C0001A' : isChange ? '#1B8A5A' : 'var(--text3)' }}>
                        {isShort ? 'Balance Due' : isChange ? 'Change' : 'Balance'}
                      </span>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: isShort ? '#C0001A' : isChange ? '#1B8A5A' : 'var(--text3)' }}>
                        {bal !== null ? fmt(Math.abs(bal)) : '—'}
                      </span>
                    </div>

                    {/* Walk-in partial warning */}
                    {isWalkInPartial && (
                      <div style={{ marginBottom: 14, padding: '8px 12px', background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, fontSize: '0.78rem', color: '#E65100', fontWeight: 600, textAlign: 'center' }}>
                        ⚠️ Walk-in customers must pay in full. Partial payment not allowed.
                      </div>
                    )}

                    {/* Status tag preview */}
                    {cash > 0 && !isWalkInPartial && (
                      <div style={{ marginBottom: 14, fontSize: '0.78rem', color: 'var(--text3)', textAlign: 'center' }}>
                        Will save as{' '}
                        <span style={{ fontWeight: 700, color: resolvedStatus === 'Paid' ? '#1B8A5A' : resolvedStatus === 'Partial' ? '#E65100' : '#C0001A' }}>
                          {resolvedStatus}
                        </span>
                        {isShort && ` · Paid ${fmt(cash)}`}
                      </div>
                    )}
                  </>
                )}

                {payModalMode === 'credit' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: 18 }}>
                    Record as credit (unpaid) for <strong>{selectedCustomer?.customer?.name || 'customer'}</strong>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', background: '#1B8A5A', borderColor: '#1B8A5A' }}
                    disabled={saveSale.isPending || isWalkInPartial}
                    onClick={() => saveSale.mutate({ mode: payModalMode, cash })}
                  >{saveSale.isPending ? 'Saving…' : 'Save'}</button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={saveSale.isPending || isWalkInPartial}
                    onClick={() => handleSaveAndPrint(payModalMode, cash)}
                  >Print (Save + Print)</button>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={saveSale.isPending || isWalkInPartial}
                    onClick={() => handleSaveAndShare(payModalMode, cash)}
                  >Share (Save + Share)</button>
                  <button
                    onClick={() => setShowPayModal(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', marginTop: 4, fontSize: '0.82rem' }}
                  >Cancel</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Draft list modal */}
        {showDraftModal && (
          <POSDraftModal onClose={() => setShowDraftModal(false)} onLoad={(sale: any) => {
            // Load draft into cart
            if (sale.items) {
              setCart(sale.items.map((it: any) => ({
                item_id: it.item_id, item_name: it.item_name,
                qty: it.qty, unit_price: it.unit_price, discount: it.discount || 0,
              })));
            }
            setShowDraftModal(false);
          }} />
        )}

        {/* Recent Sales modal */}
        {showRecentModal && (
          <POSRecentModal onClose={() => setShowRecentModal(false)} onLoad={(sale: any) => {
            if (sale.items) {
              setCart(sale.items.map((it: any) => ({
                item_id: it.item_id, item_name: it.item_name,
                qty: it.qty, unit_price: it.unit_price, discount: it.discount || 0,
              })));
            }
            setShowRecentModal(false);
          }} />
        )}
        {/* Quotation result modal */}
        {showQuotationModal && lastQuotation && (
          <POSQuotationResultModal quotation={lastQuotation} onClose={() => setShowQuotationModal(false)} />
        )}
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderLeft: '1px solid var(--border)', height: '100%', overflow: 'hidden' }}>

        {/* Top bar: date/time + user */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>
            {now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')} &nbsp;
            {fmtTime(now)}
          </span>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>Admin</span>
        </div>

        {/* Customer search */}
        <div ref={custRef} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem' }}>👤</span>
              <input
                className="form-control"
                style={{ paddingLeft: 34, fontSize: '0.85rem', height: 38, borderRadius: 6, borderColor: selectedCustomer ? 'var(--red)' : undefined }}
                placeholder="Customer Name / Phone number"
                value={customerSearch}
                onChange={e => { setCustomerSearch(e.target.value); setShowCustDropdown(true); if (!e.target.value) clearCustomer(); }}
                onFocus={e => { e.target.select(); setShowCustDropdown(true); }}
              />
              {selectedCustomer && (
                <button onClick={clearCustomer} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={14} /></button>
              )}
            </div>
            <button onClick={() => setShowAddCustModal(true)} title="Add new customer" style={{ width: 38, height: 38, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <Plus size={16} />
            </button>
          </div>
          {showCustDropdown && customerResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 14, right: 14, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
              {customerResults.map(c => (
                <button key={c.id} onClick={() => selectCustomer(c)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.82rem', borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <strong>{c.name}</strong> {c.phone && <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{c.phone}</span>}
                  {c.city && <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: '0.78rem' }}>{c.city}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loadingCust && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>Loading customer…</div>}

          {!selectedCustomer && !loadingCust && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>👤</div>
              Search for a customer above to see their details and history
            </div>
          )}

          {selectedCustomer && (
            <>
              {/* Customer detail card */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer Detail</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                    Since: {selectedCustomer.customer.created_at ? new Date(selectedCustomer.customer.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {selectedCustomer.customer.contact_person ? `${selectedCustomer.customer.contact_person}` : selectedCustomer.customer.name}
                    </div>
                    {selectedCustomer.customer.address && <div style={{ fontSize: '0.78rem', color: 'var(--text3)', marginBottom: 2 }}>{selectedCustomer.customer.address}{selectedCustomer.customer.city ? `, ${selectedCustomer.customer.city}` : ''}</div>}
                    {selectedCustomer.customer.phone && <div style={{ fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>{selectedCustomer.customer.phone}</div>}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.78rem' }}>
                    <div style={{ color: '#1B8A5A', fontWeight: 700, marginBottom: 3 }}>Total Business: {selectedCustomer.total_business.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</div>
                    <div style={{ color: '#C0001A', fontWeight: 700, marginBottom: 6 }}>Total Due &nbsp;&nbsp;: {selectedCustomer.total_due.toLocaleString('en-LK', { minimumFractionDigits: 2 })}</div>
                    {selectedCustomer.customer.credit_limit > 0 && (
                      <div style={{ color: 'var(--text2)', fontWeight: 600 }}>
                        Customer Rating: {Math.min(10, Math.max(1, Math.round(10 - (selectedCustomer.total_due / Math.max(selectedCustomer.total_business, 1)) * 10)))}/10
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Last Activities */}
              <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', flex: 1 }}>
                <div style={{ padding: '0 16px 8px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>Last Activities</div>
                {selectedCustomer.last_sales.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.8rem' }}>No previous sales</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                          <th style={{ padding: '5px 8px 5px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Date</th>
                          <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Invoice No</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>No.of Pcs</th>
                          <th style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>Amount</th>
                          <th style={{ padding: '5px 16px 5px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCustomer.last_sales.map((s: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '5px 8px 5px 16px', color: 'var(--text3)' }}>
                              {s.sale_date ? s.sale_date.replace(/-/g, '.').slice(2) : '—'}
                            </td>
                            <td style={{ padding: '5px 8px', fontWeight: 500 }}>{s.invoice_no}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{s.no_of_pcs}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 500 }}>{Number(s.total_amount).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</td>
                            <td style={{ padding: '5px 16px 5px 8px' }}>
                              <span style={{ fontWeight: 600, color: s.payment_status === 'Paid' ? '#1B8A5A' : s.payment_status === 'Partial' ? '#E65100' : s.payment_status === 'Unpaid' ? '#C0001A' : '#1565C0', fontSize: '0.75rem' }}>
                                {s.payment_status === 'Unpaid' ? 'Due' : s.payment_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Remarks */}
              {selectedCustomer.customer.notes && (
                <div style={{ padding: '10px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: 6, color: 'var(--text2)' }}>Remarks</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text3)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{selectedCustomer.customer.notes}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {showAddCustModal && (
      <AddCustomerModal
        onClose={() => setShowAddCustModal(false)}
        onCreated={async (c) => {
          setShowAddCustModal(false);
          await selectCustomer(c);
        }}
      />
    )}

    </>
  );
}

/* ─── POS DRAFT MODAL ─────────────────────────────────────────────── */
function POSDraftModal({ onClose, onLoad }: { onClose: () => void; onLoad: (sale: any) => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['invoices', '', 'Draft'],
    queryFn: () => api.getInvoices({ status: 'Draft' }),
  });
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadDraft = async (id: number) => {
    const res = await api.getInvoice(id);
    onLoad({ ...res.sale, items: res.items });
  };

  const deleteDraft = async (id: number) => {
    if (!confirm('Delete this draft?')) return;
    setDeleting(id);
    try {
      await api.deleteInvoice(id);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      refetch();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '20px', minWidth: 400, maxWidth: 480, maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>Drafts</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={15} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>Loading…</div>
          ) : (data as any[]).length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>No drafts saved</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Invoice</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Customer</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>Total</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {(data as any[]).map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 500, fontSize: '0.78rem' }}>{s.invoice_no}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--text2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customer_name || '—'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(s.total_amount)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => loadDraft(s.id)}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', background: '#1B8A5A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                        >Edit</button>
                        <button
                          onClick={() => deleteDraft(s.id)}
                          disabled={deleting === s.id}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', background: '#C0001A', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, opacity: deleting === s.id ? 0.6 : 1 }}
                        >Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── POS RECENT MODAL ────────────────────────────────────────────── */
function POSRecentModal({ onClose, onLoad }: { onClose: () => void; onLoad: (sale: any) => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['invoices-recent'],
    queryFn: () => api.getInvoices({}),
  });
  const { data: settings = {} } = useQuery<Record<string, string>>({ queryKey: ['settings'], queryFn: () => api.getSettings() });
  const [loading, setLoading] = useState<number | null>(null);
  const recent = (data as any[]).filter((s: any) => s.payment_status !== 'Draft').slice(0, 30);

  const loadSale = async (id: number) => {
    setLoading(id);
    try {
      const res = await api.getInvoice(id);
      onLoad({ ...res.sale, items: res.items });
    } finally { setLoading(null); }
  };

  const reprinted = async (id: number) => {
    setLoading(id);
    try {
      const res = await api.getInvoice(id);
      printReceipt(res.sale, res.items, settings as Record<string, string>, res.payments);
    } finally { setLoading(null); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '24px', minWidth: 700, maxWidth: 860, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Recent Sales</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: '0.82rem' }}>No sales yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Invoice</th>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Customer</th>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Date</th>
                  <th style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text2)' }}>Total</th>
                  <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)' }}>Status</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s: any) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{s.invoice_no}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text2)' }}>{s.customer_name || '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text3)' }}>{s.sale_date ? s.sale_date.replace(/-/g, '.').slice(2) : '—'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(s.total_amount)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        fontWeight: 600, fontSize: '0.75rem',
                        color: s.payment_status === 'Paid' ? '#1B8A5A' : s.payment_status === 'Unpaid' ? '#C0001A' : s.payment_status === 'Partial' ? '#E65100' : 'var(--text3)'
                      }}>
                        {s.payment_status === 'Unpaid' ? 'Due' : s.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => loadSale(s.id)}
                          disabled={loading === s.id}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', background: '#1565C0', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, opacity: loading === s.id ? 0.6 : 1 }}
                        >Edit</button>
                        <button
                          onClick={() => reprinted(s.id)}
                          disabled={loading === s.id}
                          style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'var(--bg)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                        >Reprint</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── POS QUOTATION RESULT MODAL ─────────────────────────────────── */
function POSQuotationResultModal({ quotation, onClose }: { quotation: any; onClose: () => void }) {
  const handleShare = async () => {
    const text = `Quotation ${quotation.quotation_no}\nTotal: Rs. ${Number(quotation.total_amount).toLocaleString('en-LK')}\nPandora Garments`;
    if (navigator.share) {
      await navigator.share({ title: `Quotation ${quotation.quotation_no}`, text }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(text).catch(() => {});
      alert('Copied to clipboard!');
    }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '32px 36px', minWidth: 320, maxWidth: 380, boxShadow: '0 10px 48px rgba(0,0,0,0.3)', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Quotation Saved</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7B1FA2', marginBottom: 4 }}>{quotation.quotation_no}</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text3)', marginBottom: 20 }}>
          Total: <strong style={{ color: 'var(--text)' }}>Rs. {Number(quotation.total_amount).toLocaleString('en-LK')}</strong>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 14 }}>
          <button
            onClick={handleShare}
            style={{ padding: '9px 20px', background: '#7B1FA2', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
          >Share</button>
          <button
            onClick={() => window.print()}
            style={{ padding: '9px 20px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
          >Print / PDF</button>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '0.82rem', cursor: 'pointer', textDecoration: 'underline' }}>
          Close
        </button>
      </div>
    </div>
  );
}

/* ─── SALES LIST ──────────────────────────────────────────────────── */
function SalesListTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<null | 'create' | 'view' | 'edit' | 'collect'>(null);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [collectForm, setCollectForm] = useState({ amount: 0, method: 'Cash', paid_at: today() });
  const blankForm = { customer_id: '', sale_date: today(), notes: '', payment_type: 'Cash', paid_amount: 0, items: [] as LineItem[] };
  const [form, setForm] = useState(blankForm);

  const { data = [], isLoading } = useQuery({
    queryKey: ['invoices', search, status],
    queryFn: () => api.getInvoices({ search: search || undefined, status: status || undefined }),
  });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.getCustomers() });
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: () => api.getItems() });
  const { data: settings = {} } = useQuery<Record<string, string>>({ queryKey: ['settings'], queryFn: () => api.getSettings() });

  const save = useMutation({
    mutationFn: (d: object) => api.createInvoice(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); setModal(null); },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => api.updateInvoice(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); setModal(null); setSelected(null); },
  });

  const addLine = () => setForm(p => ({ ...p, items: [...p.items, { item_id: 0, item_name: '', qty: 1, unit_price: 0, discount: 0 }] }));
  const removeLine = (i: number) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setForm(p => ({ ...p, items: p.items.map((l, idx) => idx === i ? { ...l, [field]: val } : l) }));
  const formTotal = form.items.reduce((s, l) => s + l.qty * l.unit_price - (l.discount || 0), 0);

  const openView = async (id: number) => {
    setLoadingId(id);
    const res = await api.getInvoice(id);
    setSelected({ ...res.sale, items: res.items });
    setModal('view');
    setLoadingId(null);
  };

  const openEdit = async (id: number) => {
    setLoadingId(id);
    const res = await api.getInvoice(id);
    const sale = res.sale;
    const saleItems: LineItem[] = (res.items as any[])
      .filter((l: any) => !l.description?.startsWith('[Add-on]'))
      .map((l: any) => ({ item_id: l.item_id || 0, item_name: l.description || l.item_name || '', qty: l.qty, unit_price: l.unit_price, discount: l.discount || 0 }));
    setSelected({ ...sale, items: res.items });
    setForm({
      customer_id: sale.customer_id ? String(sale.customer_id) : '',
      sale_date: sale.sale_date || today(),
      notes: sale.notes || '',
      payment_type: sale.payment_type || 'Cash',
      paid_amount: sale.paid_amount || 0,
      items: saleItems,
    });
    setModal('edit');
    setLoadingId(null);
  };

  const reprints = async (id: number) => {
    setLoadingId(id);
    const res = await api.getInvoice(id);
    setLoadingId(null);
    printReceipt(res.sale, res.items, settings as Record<string, string>, res.payments);
  };

  const collectMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { amount: number; method: string; paid_at: string } }) =>
      api.collectPayment(id, data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setSelected((prev: any) => prev ? { ...prev, ...res.sale } : prev);
      setModal('view');
    },
  });

  // Shared line-items form block
  const LineItemsForm = () => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontWeight: 600, fontSize: '0.82rem' }}>Line Items</label>
        <button className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={12} /> Add Line</button>
      </div>
      {form.items.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px 0', fontSize: '0.82rem' }}>No items added</div>}
      {form.items.map((line, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 110px 80px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <div>
            {i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Item</label>}
            <select className="form-control" value={line.item_id} onChange={e => {
              const item = (items as any[]).find(it => it.id === Number(e.target.value));
              updateLine(i, 'item_id', Number(e.target.value));
              if (item) { updateLine(i, 'item_name', item.name); updateLine(i, 'unit_price', item.selling_price || 0); }
            }}>
              <option value={0}>Select…</option>
              {(items as any[]).map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          </div>
          <div>{i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Qty</label>}<input className="form-control" type="number" min={1} value={line.qty} onChange={e => updateLine(i, 'qty', Number(e.target.value))} /></div>
          <div>{i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Unit Price</label>}<input className="form-control" type="number" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} /></div>
          <div>{i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Discount</label>}<input className="form-control" type="number" min={0} value={line.discount} onChange={e => updateLine(i, 'discount', Number(e.target.value))} /></div>
          <button className="btn-icon" style={{ alignSelf: 'flex-end', paddingBottom: 6 }} onClick={() => removeLine(i)}><Trash2 size={13} /></button>
        </div>
      ))}
      {form.items.length > 0 && <div style={{ textAlign: 'right', fontWeight: 700, marginTop: 10 }}>Total: {fmt(formTotal)}</div>}
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-control" style={{ paddingLeft: 32, width: 240 }} placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 140 }} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Status</option>
            <option>Paid</option><option>Partial</option><option>Unpaid</option><option>Draft</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(blankForm); setModal('create'); }}>
          <Plus size={14} /> New Invoice
        </button>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th><th>Paid</th><th style={{ width: 120 }}></th></tr></thead>
              <tbody>
                {(data as Sale[]).length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No invoices found</td></tr>}
                {(data as Sale[]).map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600, color: 'var(--red)' }}>{s.invoice_no}</td>
                    <td>{s.customer_name || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.sale_date}</td>
                    <td><StatusBadge status={s.payment_status} /></td>
                    <td style={{ fontWeight: 600 }}>{fmt(s.total_amount)}</td>
                    <td style={{ color: 'var(--success)' }}>{fmt(s.paid_amount)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                        <button className="btn-icon" title="View" onClick={() => openView(s.id)} disabled={loadingId === s.id}><Eye size={14} /></button>
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(s.id)} disabled={loadingId === s.id}><Pencil size={14} /></button>
                        <button className="btn-icon" title="Reprint" onClick={() => reprints(s.id)} disabled={loadingId === s.id}><Printer size={14} /></button>
                        {(s.payment_status === 'Partial' || s.payment_status === 'Unpaid') && (
                          <button className="btn-icon" title="Collect Payment" style={{ color: 'var(--success)' }} onClick={() => { setSelected(s as any); setCollectForm({ amount: (s as any).total_amount - (s as any).paid_amount, method: 'Cash', paid_at: today() }); setModal('collect'); }} disabled={loadingId === s.id}>
                            <DollarSign size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── CREATE modal ── */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>New Invoice</h3><button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button></div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Customer</label>
                  <select className="form-control" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                    <option value="">Walk-in / select…</option>
                    {(customers as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input className="form-control" type="date" value={form.sale_date} onChange={e => setForm(p => ({ ...p, sale_date: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Type</label>
                  <select className="form-control" value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))}>
                    <option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option>
                  </select>
                </div>
                <div className="form-group"><label>Paid Amount</label><input className="form-control" type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: Number(e.target.value) }))} /></div>
              </div>
              <LineItemsForm />
              <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate({ ...form, total_amount: formTotal })}>
                {save.isPending ? 'Creating…' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT modal ── */}
      {modal === 'edit' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit — {selected.invoice_no}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Customer</label>
                  <select className="form-control" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                    <option value="">Walk-in</option>
                    {(customers as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Date</label><input className="form-control" type="date" value={form.sale_date} onChange={e => setForm(p => ({ ...p, sale_date: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Type</label>
                  <select className="form-control" value={form.payment_type} onChange={e => setForm(p => ({ ...p, payment_type: e.target.value }))}>
                    <option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option>
                  </select>
                </div>
                <div className="form-group"><label>Paid Amount</label><input className="form-control" type="number" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: Number(e.target.value) }))} /></div>
              </div>
              <LineItemsForm />
              <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={update.isPending}
                onClick={() => update.mutate({ id: selected.id, data: { ...form, customer_id: form.customer_id ? Number(form.customer_id) : null } })}>
                {update.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW modal ── */}
      {modal === 'view' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selected.invoice_no}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => { openEdit(selected.id); }}>
                  <Pencil size={13} /> Edit
                </button>
                {(selected.payment_status === 'Partial' || selected.payment_status === 'Unpaid') && (
                  <button className="btn btn-primary btn-sm" style={{ background: 'var(--success)' }} onClick={() => { setCollectForm({ amount: (selected as any).total_amount - (selected as any).paid_amount, method: 'Cash', paid_at: today() }); setModal('collect'); }}>
                    <DollarSign size={13} /> Collect
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={async () => { if (!selected) return; const res = await api.getInvoice(selected.id); printReceipt(res.sale, res.items, settings as Record<string, string>, res.payments); }}>
                  <Printer size={13} /> Reprint
                </button>
                <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <Field label="Customer" value={selected.customer_name || 'Walk-in'} />
                <Field label="Date" value={selected.sale_date} />
                <Field label="Status" value={selected.payment_status} />
                <Field label="Total" value={fmt(selected.total_amount)} />
                <Field label="Paid" value={fmt(selected.paid_amount)} />
                <Field label="Balance" value={fmt((selected.total_amount || 0) - (selected.paid_amount || 0))} />
              </div>
              {selected.items && selected.items.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Line Total</th></tr></thead>
                    <tbody>
                      {(selected.items as any[]).map((l, i) => (
                        <tr key={i}><td>{l.description || l.item_name}</td><td>{l.qty}</td><td>{fmt(l.unit_price)}</td><td>{fmt(l.discount || 0)}</td><td style={{ fontWeight: 600 }}>{fmt(l.qty * l.unit_price - (l.discount || 0))}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {selected.notes && <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'var(--text3)' }}>{selected.notes}</div>}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setModal(null)}>Close</button></div>
          </div>
        </div>
      )}

      {/* ── COLLECT PAYMENT modal ── */}
      {modal === 'collect' && selected && (
        <div className="modal-overlay" onClick={() => setModal('view')}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Collect Payment — {(selected as any).invoice_no}</h3>
              <button className="btn-icon" onClick={() => setModal('view')}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total</span><strong>Rs. {fmt((selected as any).total_amount)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Already Paid</span><span style={{ color: 'var(--success)' }}>Rs. {fmt((selected as any).paid_amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, fontWeight: 700 }}>
                  <span>Balance Due</span><span style={{ color: 'var(--red)' }}>Rs. {fmt((selected as any).total_amount - (selected as any).paid_amount)}</span>
                </div>
              </div>
              <div className="form-group">
                <label>Amount Collecting</label>
                <input className="form-control" type="number" min={0.01} step={0.01}
                  value={collectForm.amount}
                  onChange={e => setCollectForm(p => ({ ...p, amount: Number(e.target.value) }))} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Method</label>
                  <select className="form-control" value={collectForm.method} onChange={e => setCollectForm(p => ({ ...p, method: e.target.value }))}>
                    <option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input className="form-control" type="date" value={collectForm.paid_at} onChange={e => setCollectForm(p => ({ ...p, paid_at: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal('view')}>Cancel</button>
              <button className="btn btn-primary" style={{ background: 'var(--success)' }}
                disabled={collectMutation.isPending || collectForm.amount <= 0}
                onClick={() => collectMutation.mutate({ id: (selected as any).id, data: collectForm })}>
                {collectMutation.isPending ? 'Saving…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── QUOTATIONS ──────────────────────────────────────────────────── */
function QuotationsTab({ defaultNew }: { defaultNew?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<'list' | 'new'>(defaultNew ? 'new' : 'list');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ customer_id: '', quotation_date: today(), expiry_date: '', notes: '', items: [] as LineItem[] });

  const { data = [], isLoading } = useQuery({
    queryKey: ['quotations', search],
    queryFn: () => api.getQuotations({ search: search || undefined }),
  });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.getCustomers() });
  const { data: items = [] } = useQuery({ queryKey: ['items'], queryFn: () => api.getItems() });

  const save = useMutation({
    mutationFn: (d: object) => api.createQuotation(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      setSubTab('list');
      navigate('/sales#quotations');
      setForm({ customer_id: '', quotation_date: today(), expiry_date: '', notes: '', items: [] });
    },
  });

  const convert = useMutation({
    mutationFn: (id: number) => api.convertQuotation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });

  const addLine = () => setForm(p => ({ ...p, items: [...p.items, { item_id: 0, item_name: '', qty: 1, unit_price: 0, discount: 0 }] }));
  const removeLine = (i: number) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setForm(p => ({ ...p, items: p.items.map((l, idx) => idx === i ? { ...l, [field]: val } : l) }));
  const total = form.items.reduce((s, l) => s + l.qty * l.unit_price, 0);

  return (
    <div>
      {/* Quotation sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`tab ${subTab === 'list' ? 'active' : ''}`} onClick={() => { setSubTab('list'); navigate('/sales#quotations'); }}>
            Sent Quotations
          </button>
          <button className={`tab ${subTab === 'new' ? 'active' : ''}`} onClick={() => { setSubTab('new'); navigate('/sales#new-quotation'); }}>
            <Plus size={13} /> New Quotation
          </button>
        </div>
        {subTab === 'list' && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-control" style={{ paddingLeft: 32, width: 240 }} placeholder="Search quotations…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {subTab === 'list' && (
        <div className="card">
          {isLoading ? <div className="loading">Loading…</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Quotation #</th><th>Customer</th><th>Date</th><th>Expiry</th><th>Status</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {(data as Quotation[]).length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No quotations yet</td></tr>}
                  {(data as Quotation[]).map(q => (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 600, color: 'var(--red)' }}>{q.quotation_no}</td>
                      <td>{q.customer_name}</td>
                      <td style={{ fontSize: '0.78rem' }}>{q.quotation_date}</td>
                      <td style={{ fontSize: '0.78rem' }}>{q.expiry_date || '—'}</td>
                      <td><StatusBadge status={q.status} /></td>
                      <td style={{ fontWeight: 600 }}>{fmt(q.total_amount)}</td>
                      <td>
                        {(q.status === 'Sent' || q.status === 'Draft') && (
                          <button className="btn btn-sm btn-primary" onClick={() => { if (confirm('Convert to invoice?')) convert.mutate(q.id); }}>
                            <ArrowRight size={12} /> Convert
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'new' && (
        <div className="card" style={{ maxWidth: 760 }}>
          <div className="card-title">New Quotation</div>
          <div className="form-row">
            <div className="form-group">
              <label>Customer *</label>
              <select className="form-control" value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
                <option value="">Select customer…</option>
                {(customers as any[]).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Date</label><input className="form-control" type="date" value={form.quotation_date} onChange={e => setForm(p => ({ ...p, quotation_date: e.target.value }))} /></div>
            <div className="form-group"><label>Expiry Date</label><input className="form-control" type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} /></div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontWeight: 600, fontSize: '0.82rem' }}>Items</label>
              <button className="btn btn-secondary btn-sm" onClick={addLine}><Plus size={12} /> Add Line</button>
            </div>
            {form.items.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px 0', fontSize: '0.82rem' }}>No items added yet — click Add Line</div>}
            {form.items.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 120px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div>
                  {i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Item</label>}
                  <select className="form-control" value={line.item_id} onChange={e => {
                    const item = (items as any[]).find(it => it.id === Number(e.target.value));
                    updateLine(i, 'item_id', Number(e.target.value));
                    if (item) { updateLine(i, 'item_name', item.name); updateLine(i, 'unit_price', item.selling_price || 0); }
                  }}>
                    <option value={0}>Select item…</option>
                    {(items as any[]).map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
                <div>{i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Qty</label>}<input className="form-control" type="number" min={1} value={line.qty} onChange={e => updateLine(i, 'qty', Number(e.target.value))} /></div>
                <div>{i === 0 && <label style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Unit Price</label>}<input className="form-control" type="number" value={line.unit_price} onChange={e => updateLine(i, 'unit_price', Number(e.target.value))} /></div>
                <button className="btn-icon" style={{ alignSelf: 'flex-end', paddingBottom: 6 }} onClick={() => removeLine(i)}><Trash2 size={13} /></button>
              </div>
            ))}
            {form.items.length > 0 && <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', marginTop: 10, color: 'var(--red)' }}>Total: {fmt(total)}</div>}
          </div>
          <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setSubTab('list'); navigate('/sales#quotations'); }}>Cancel</button>
            <button className="btn btn-primary" disabled={save.isPending || !form.customer_id} onClick={() => save.mutate({ ...form, total_amount: total })}>
              {save.isPending ? 'Saving…' : 'Save Quotation'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return <div><div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 500, marginBottom: 2 }}>{label}</div><div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value || '—'}</div></div>;
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { Draft: 'badge-average', Sent: 'badge-verygood', Paid: 'badge-excellent', Partial: 'badge-good', Unpaid: 'badge-needs', Cancelled: 'badge-needs', Converted: 'badge-excellent' };
  return <span className={`badge ${map[status] || 'badge-average'}`}>{status}</span>;
}
