import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  Plus, Search, Eye, Trash2, X, Calendar as CalIcon,
  LayoutGrid, List, FilePlus, FileCheck,
  AlertTriangle, TrendingUp, Clock, CheckCircle, XCircle,
  ChevronLeft, ChevronRight, ChevronDown, Edit2, Printer, UserPlus, Minus,
  Shirt, Users, StickyNote,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────
type Size = { size: string; qty: number; half?: number; full?: number; other?: number; other_desc?: string };
type Worker = { name: string; size: string; number: string; sleeve: 'Full' | 'Half' | '' };
type NameDetail = { name: string; number: string; size: string; sleeve: string };
type NotesData = {
  _v?: number;
  collar_type?: string;
  collar_colour?: string;
  open?: boolean;
  button_type?: string;
  tag_name?: string;
  sleeve_type?: string;
  workers?: Worker[];
  plain_notes?: string;
};
type Order = {
  id: number; order_no: string; customer_id: number; customer_name: string;
  order_date: string; delivery_date: string; status: string; production_status: string;
  progress: number; product: string; design_reference: string; fabric_details: string;
  printing_details: string; embroidery_details: string; accessories: string;
  production_notes: string; total_qty: number; total_amount: number; notes: string;
  sizes?: Size[];
};
type Stats = {
  total: number; new_orders: number; ongoing: number; active: number;
  completed: number; uncollected: number; cancelled: number; overdue: number;
  total_value: number;
};
type TrendPoint = { m: string; total: number; cancelled: number; completed: number };

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUSES = ['New', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Collected', 'Cancelled'];
const STATUS_COLOR: Record<string, string> = {
  New: '#6366f1', Confirmed: '#0ea5e9', 'In Progress': '#f59e0b',
  Ready: '#10b981', Delivered: '#10b981', Collected: '#22c55e', Cancelled: '#ef4444',
};
const STATUS_MAP: Record<string, string> = {
  New: 'badge-average', Confirmed: 'badge-verygood', 'In Progress': 'badge-verygood',
  Ready: 'badge-excellent', Delivered: 'badge-excellent', Collected: 'badge-excellent',
  Cancelled: 'badge-needs',
};
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size', 'KIDS S', 'KIDS M', 'KIDS L', 'KIDS XL'];
// const SLEEVE_OPTS = ['Full', 'Half', '3/4', 'Sleeveless']; // managed via DB
// const COLLAR_OPTS = ['Round Neck', 'V-Neck', 'Polo', 'Collar', 'Henley', 'Hood']; // managed via DB

function today() { return new Date().toISOString().split('T')[0]; }
function fmt(n: number) {
  return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);
}
function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Notes helpers ────────────────────────────────────────────────────────────
function parseNotes(raw: string): NotesData {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed._v === 2) return parsed;
  } catch (_) { /* ignore */ }
  return { plain_notes: raw };
}

function serializeNotes(data: NotesData): string {
  return JSON.stringify({ _v: 2, ...data });
}

// ─── Image compress helper ────────────────────────────────────────────────────
function compressImage(file: File, maxW = 1200, maxH = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Sub-nav items ────────────────────────────────────────────────────────────
const SUB_NAV = [
  { hash: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { hash: 'list', icon: List, label: 'List of Orders' },
  { hash: 'create-sheet', icon: FilePlus, label: 'Create Order Sheet' },
  { hash: 'sheets', icon: FileCheck, label: 'Order Sheets' },
  { hash: 'calendar', icon: CalIcon, label: 'Calendar' },
] as const;

type Section = typeof SUB_NAV[number]['hash'];

// ─── Blank form ───────────────────────────────────────────────────────────────
const blankWorker = (): Worker => ({ name: '', size: '', number: '', sleeve: '' });
function blankForm() {
  return {
    customer_id: '', order_date: today(), delivery_date: '', product: '',
    design_reference: '', fabric_details: '', printing_details: '',
    embroidery_details: '', accessories: '', production_notes: '',
    total_qty: 0, total_amount: 0, notes: '',
    sizes: [] as Size[],
    // Garment spec fields (stored in notes as JSON)
    collar_type: '',
    collar_colour: '',
    open: false,
    button_type: '',
    tag_name: '',
    sleeve_type: '',
    workers: [] as Worker[],
    plain_notes: '',
    with_bottom: '' as '' | 'shorts' | 'bottom',
    bottom_sizes: [] as Size[],
    tshirt_names: [] as NameDetail[],
    bottom_names: [] as NameDetail[],
    elements: [] as { id: number; name: string; dataUrl: string }[],
    design_image: '' as string, // single uploaded design image (dataUrl)
  };
}

type FormShape = ReturnType<typeof blankForm>;

function formToApi(f: FormShape) {
  const nd: NotesData = {
    collar_type: f.collar_type,
    collar_colour: f.collar_colour,
    open: f.open,
    button_type: f.button_type,
    tag_name: f.tag_name,
    sleeve_type: f.sleeve_type,
    workers: f.workers,
    plain_notes: f.plain_notes,
    ...(f.with_bottom && { with_bottom: f.with_bottom }),
    ...(f.bottom_sizes.length > 0 && { bottom_sizes: f.bottom_sizes }),
    ...(f.tshirt_names.length > 0 && { tshirt_names: f.tshirt_names }),
    ...(f.bottom_names.length > 0 && { bottom_names: f.bottom_names }),
    ...(f.elements.length > 0 && { elements: f.elements }),
    ...(f.design_image && { design_image: f.design_image }),
  } as NotesData & { with_bottom?: string; bottom_sizes?: Size[]; tshirt_names?: NameDetail[]; bottom_names?: NameDetail[]; elements?: { id: number; name: string; dataUrl: string }[]; design_image?: string };
  return {
    customer_id: f.customer_id,
    order_date: f.order_date,
    delivery_date: f.delivery_date,
    product: f.product,
    design_reference: f.design_reference,
    fabric_details: f.fabric_details,
    printing_details: f.printing_details,
    embroidery_details: f.embroidery_details,
    accessories: f.accessories,
    production_notes: f.production_notes,
    total_qty: [...f.sizes, ...f.bottom_sizes].reduce((s, x) => s + ((x.half||0) + (x.full||0) + (x.other||0) || x.qty || 0), 0) || f.total_qty,
    total_amount: f.total_amount,
    notes: serializeNotes(nd),
    sizes: f.sizes,
  };
}

function orderToForm(o: Order): FormShape {
  const nd = parseNotes(o.notes || '');
  return {
    customer_id: String(o.customer_id || ''),
    order_date: o.order_date || today(),
    delivery_date: o.delivery_date || '',
    product: o.product || '',
    design_reference: o.design_reference || '',
    fabric_details: o.fabric_details || '',
    printing_details: o.printing_details || '',
    embroidery_details: o.embroidery_details || '',
    accessories: o.accessories || '',
    production_notes: o.production_notes || '',
    total_qty: o.total_qty || 0,
    total_amount: o.total_amount || 0,
    notes: o.notes || '',
    sizes: o.sizes || [],
    collar_type: nd.collar_type || '',
    collar_colour: nd.collar_colour || '',
    open: nd.open || false,
    button_type: nd.button_type || '',
    tag_name: nd.tag_name || '',
    sleeve_type: nd.sleeve_type || '',
    workers: nd.workers || [],
    plain_notes: nd.plain_notes || '',
    with_bottom: (nd as any).with_bottom || '',
    bottom_sizes: (nd as any).bottom_sizes || [],
    tshirt_names: (nd as any).tshirt_names || [],
    bottom_names: (nd as any).bottom_names || [],
    elements: (nd as any).elements || [],
    design_image: (nd as any).design_image || '',
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrderManagement() {
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();

  const section: Section = (loc.hash.replace('#', '') as Section) || 'dashboard';
  const go = (h: Section) => nav(`/orders#${h}`, { replace: true });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [viewModal, setViewModal] = useState(false);
  const [editModal, setEditModal] = useState(false);

  const [form, setForm] = useState<FormShape>(blankForm());
  const [editForm, setEditForm] = useState<FormShape>(blankForm());

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['orders', search, statusFilter],
    queryFn: () => api.getOrders({ search: search || undefined, status: statusFilter || undefined }),
  });
  const orders: Order[] = ordersData?.orders || [];
  const stats: Stats = ordersData?.stats || {};
  const trend: TrendPoint[] = ordersData?.trend || [];

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api.getCustomers() });

  const save = useMutation({
    mutationFn: (d: object) => api.createOrder(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); go('list'); },
  });

  const updateOrder = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => api.updateOrder(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setViewModal(false); setEditModal(false); },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateOrder(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); setViewModal(false); },
  });

  const viewOrder = async (id: number) => {
    const res = await api.getOrder(id);
    setSelected({ ...res.order, sizes: res.sizes });
    setViewModal(true);
  };

  const openEdit = (o: Order) => {
    setEditForm(orderToForm(o));
    setEditModal(true);
    setViewModal(false);
  };

  const toggleSize = (sz: string, f: FormShape, setF: (v: FormShape) => void) => {
    const exists = f.sizes.find(s => s.size === sz);
    if (exists) setF({ ...f, sizes: f.sizes.filter(s => s.size !== sz) });
    else setF({ ...f, sizes: [...f.sizes, { size: sz, qty: 0, half: 0, full: 0, other: 0 }] });
  };

  const toggleBottomSize = (sz: string, f: FormShape, setF: (v: FormShape) => void) => {
    const exists = f.bottom_sizes.find(s => s.size === sz);
    if (exists) setF({ ...f, bottom_sizes: f.bottom_sizes.filter(s => s.size !== sz) });
    else setF({ ...f, bottom_sizes: [...f.bottom_sizes, { size: sz, qty: 0, half: 0, full: 0, other: 0 }] });
  };

  const updateSizeQty = (sz: string, qty: number, f: FormShape, setF: (v: FormShape) => void) => {
    const sizes = f.sizes.map(s => s.size === sz ? { ...s, qty } : s);
    setF({ ...f, sizes, total_qty: sizes.reduce((s, x) => s + (x.qty || 0), 0) });
  };

  const updateSizeSleeveQty = (sz: string, key: 'half' | 'full' | 'other', val: number, f: FormShape, setF: (v: FormShape) => void) => {
    const sizes = f.sizes.map(s => {
      if (s.size !== sz) return s;
      const updated = { ...s, [key]: val };
      updated.qty = (updated.half || 0) + (updated.full || 0) + (updated.other || 0);
      return updated;
    });
    setF({ ...f, sizes, total_qty: sizes.reduce((s, x) => s + (x.qty || 0), 0) });
  };

  const updateBottomSizeSleeveQty = (sz: string, key: 'half' | 'full' | 'other', val: number, f: FormShape, setF: (v: FormShape) => void) => {
    const bottom_sizes = f.bottom_sizes.map(s => {
      if (s.size !== sz) return s;
      const updated = { ...s, [key]: val };
      updated.qty = (updated.half || 0) + (updated.full || 0) + (updated.other || 0);
      return updated;
    });
    setF({ ...f, bottom_sizes });
  };

  const updateSizeOtherDesc = (sz: string, desc: string, f: FormShape, setF: (v: FormShape) => void) => {
    setF({ ...f, sizes: f.sizes.map(s => s.size === sz ? { ...s, other_desc: desc } : s) });
  };

  const updateBottomSizeOtherDesc = (sz: string, desc: string, f: FormShape, setF: (v: FormShape) => void) => {
    setF({ ...f, bottom_sizes: f.bottom_sizes.map(s => s.size === sz ? { ...s, other_desc: desc } : s) });
  };

  const today_d = new Date();
  const [calMonth, setCalMonth] = useState(today_d.getMonth());
  const [calYear, setCalYear] = useState(today_d.getFullYear());
  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDay = (y: number, m: number) => new Date(y, m, 1).getDay();
  const ordersByDate: Record<string, Order[]> = {};
  orders.forEach(o => {
    if (o.delivery_date) {
      ordersByDate[o.delivery_date] = ordersByDate[o.delivery_date] || [];
      ordersByDate[o.delivery_date].push(o);
    }
  });

  return (
    <div>
      <div className="topbar">
        <h2>Order Management</h2>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => { setForm(blankForm()); go('create-sheet'); }}>
            <Plus size={14} /> New Order Sheet
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', paddingLeft: 20 }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {SUB_NAV.map(({ hash, icon: Icon, label }) => (
            <button key={hash} onClick={() => go(hash)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', fontSize: '0.8rem', fontWeight: 500,
              color: section === hash ? 'var(--red)' : 'var(--text2)',
              borderBottom: `2px solid ${section === hash ? 'var(--red)' : 'transparent'}`,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="content">
        {section === 'dashboard' && <DashboardSection stats={stats} trend={trend} orders={orders} onViewOrder={viewOrder} />}
        {section === 'list' && (
          <ListSection
            orders={orders} isLoading={isLoading}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            onView={viewOrder}
            onStatusChange={(id, s) => updateStatus.mutate({ id, status: s })}
            onDelete={(id) => { if (confirm('Delete this order?')) del.mutate(id); }}
          />
        )}
        {section === 'create-sheet' && (
          <OrderForm
            form={form} setForm={setForm}
            customers={customers as { id: number; name: string }[]}
            onSave={(saleId?: number) => save.mutate({ ...formToApi(form), ...(saleId ? { sale_id: saleId } : {}) })}
            onCancel={() => setForm(blankForm())}
            isSaving={save.isPending}
            toggleSize={(sz) => toggleSize(sz, form, setForm)}
            updateSizeQty={(sz, qty) => updateSizeQty(sz, qty, form, setForm)}
            updateSizeSleeveQty={(sz, key, val) => updateSizeSleeveQty(sz, key, val, form, setForm)}
            updateSizeOtherDesc={(sz, desc) => updateSizeOtherDesc(sz, desc, form, setForm)}
            toggleBottomSize={(sz) => toggleBottomSize(sz, form, setForm)}
            updateBottomSizeSleeveQty={(sz, key, val) => updateBottomSizeSleeveQty(sz, key, val, form, setForm)}
            updateBottomSizeOtherDesc={(sz, desc) => updateBottomSizeOtherDesc(sz, desc, form, setForm)}
            mode="create"
          />
        )}
        {section === 'sheets' && (
          <SheetsSection
            orders={orders} isLoading={isLoading}
            search={search} setSearch={setSearch}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            onView={viewOrder}
            onStatusChange={(id, s) => updateStatus.mutate({ id, status: s })}
          />
        )}
        {section === 'calendar' && (
          <CalendarSection
            ordersByDate={ordersByDate}
            calMonth={calMonth} calYear={calYear}
            setCalMonth={setCalMonth} setCalYear={setCalYear}
            getDaysInMonth={getDaysInMonth} getFirstDay={getFirstDay}
            onView={viewOrder}
          />
        )}
      </div>

      {viewModal && selected && (
        <ViewModal
          order={selected}
          onClose={() => setViewModal(false)}
          onEdit={() => openEdit(selected)}
          onStatusChange={(s) => {
            updateStatus.mutate({ id: selected.id, status: s });
            setSelected(p => p ? { ...p, status: s } : p);
          }}
          onDelete={() => { if (confirm('Delete this order?')) del.mutate(selected.id); }}
        />
      )}

      {editModal && selected && (
        <div className="modal-overlay" onClick={() => setEditModal(false)}>
          <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Edit Order — <span style={{ color: 'var(--red)' }}>{selected.order_no}</span></h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>{selected.customer_name}</div>
              </div>
              <button className="btn-icon" onClick={() => setEditModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              <OrderForm
                form={editForm} setForm={setEditForm}
                customers={customers as { id: number; name: string }[]}
                onSave={() => updateOrder.mutate({ id: selected.id, data: formToApi(editForm) })}
                onCancel={() => setEditModal(false)}
                isSaving={updateOrder.isPending}
                toggleSize={(sz) => toggleSize(sz, editForm, setEditForm)}
                updateSizeQty={(sz, qty) => updateSizeQty(sz, qty, editForm, setEditForm)}
                updateSizeSleeveQty={(sz, key, val) => updateSizeSleeveQty(sz, key, val, editForm, setEditForm)}
                updateSizeOtherDesc={(sz, desc) => updateSizeOtherDesc(sz, desc, editForm, setEditForm)}
                toggleBottomSize={(sz) => toggleBottomSize(sz, editForm, setEditForm)}
                updateBottomSizeSleeveQty={(sz, key, val) => updateBottomSizeSleeveQty(sz, key, val, editForm, setEditForm)}
                updateBottomSizeOtherDesc={(sz, desc) => updateBottomSizeOtherDesc(sz, desc, editForm, setEditForm)}
                mode="edit"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Name Details Modal ──────────────────────────────────────────────────────
function NameDetailsModal({ type, sizes, existing, withBottom, onSave, onClose }: {
  type: 'tshirt' | 'bottom';
  sizes: Size[];
  existing: NameDetail[];
  withBottom: string;
  onSave: (rows: NameDetail[]) => void;
  onClose: () => void;
}) {
  const isTshirt = type === 'tshirt';
  const label = isTshirt ? 'T-Shirt' : (withBottom === 'shorts' ? 'Shorts' : 'Bottom');

  const buildRows = (): NameDetail[] => {
    const rows: NameDetail[] = [];
    sizes.forEach(sz => {
      for (let i = 0; i < (sz.full || 0); i++) rows.push({ name: '', number: '', size: sz.size, sleeve: 'Full' });
      for (let i = 0; i < (sz.half || 0); i++) rows.push({ name: '', number: '', size: sz.size, sleeve: 'Half' });
      for (let i = 0; i < (sz.other || 0); i++) rows.push({ name: '', number: '', size: sz.size, sleeve: sz.other_desc || 'Other' });
    });
    return rows;
  };

  const initRows = buildRows().map((row, i) => ({
    ...row,
    name: existing[i]?.name ?? '',
    number: existing[i]?.number ?? '',
  }));

  const [rows, setRows] = useState<NameDetail[]>(initRows);
  const updateRow = (i: number, field: 'name' | 'number', val: string) =>
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 999 }}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}
        style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="#6366f1" /> Name Details — {label}
            </h3>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 2 }}>
              {rows.length} total · {rows.filter(r => r.name.trim()).length} filled
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body" style={{ padding: 0, flex: 1, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: '#F3F4F6', position: 'sticky', top: 0 }}>
                {['#', 'Name', 'Number', 'Size', 'Sleeve'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === '#' || h === 'Size' || h === 'Sleeve' ? 'center' : 'left', fontWeight: 700, fontSize: '0.72rem', color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F0F0F0', background: i % 2 === 1 ? '#FAFAFA' : '#fff' }}>
                  <td style={{ padding: '6px 12px', color: 'var(--text3)', fontSize: '0.75rem', textAlign: 'center', width: 36 }}>{i + 1}</td>
                  <td style={{ padding: '4px 8px' }}>
                    <input className="form-control" value={row.name} placeholder="Enter name…"
                      style={{ padding: '5px 10px', fontSize: '0.83rem', width: '100%' }}
                      onChange={e => updateRow(i, 'name', e.target.value)} />
                  </td>
                  <td style={{ padding: '4px 8px', width: 110 }}>
                    <input className="form-control" value={row.number} placeholder="Number…"
                      style={{ padding: '5px 10px', fontSize: '0.83rem', width: '100%' }}
                      onChange={e => updateRow(i, 'number', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'center', width: 70 }}>
                    <span style={{ background: isTshirt ? '#FFF0F2' : '#EEF2FF', color: isTshirt ? 'var(--red)' : '#6366f1', fontWeight: 700, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8 }}>{row.size}</span>
                  </td>
                  <td style={{ padding: '6px 12px', textAlign: 'center', width: 80 }}>
                    <span style={{ background: '#F3F4F6', color: 'var(--text2)', fontWeight: 600, fontSize: '0.75rem', padding: '2px 8px', borderRadius: 8 }}>{row.sleeve}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, background: '#fff', borderRadius: '0 0 12px 12px' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(rows)}
            style={{ background: '#6366f1', borderColor: '#6366f1' }}>Save Names</button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice type ────────────────────────────────────────────────────────────
type InvoiceResult = { id: number; invoice_no: string; customer_name: string; customer_id: number };
type CustomerDetail = { id: number; name: string; phone?: string; mobile?: string; email?: string; company_name?: string };

// ─── Shared Order Form ────────────────────────────────────────────────────────
function OrderForm({ form, setForm, customers, onSave, onCancel, isSaving, toggleSize, updateSizeQty: _updateSizeQty, updateSizeSleeveQty, updateSizeOtherDesc, toggleBottomSize, updateBottomSizeSleeveQty, updateBottomSizeOtherDesc, mode }: {
  form: FormShape; setForm: (v: FormShape | ((prev: FormShape) => FormShape)) => void;
  customers: { id: number; name: string }[];
  onSave: (saleId?: number) => void; onCancel: () => void; isSaving: boolean;
  toggleSize: (sz: string) => void;
  updateSizeQty: (sz: string, qty: number) => void;
  updateSizeSleeveQty: (sz: string, key: 'half' | 'full' | 'other', val: number) => void;
  updateSizeOtherDesc: (sz: string, desc: string) => void;
  toggleBottomSize: (sz: string) => void;
  updateBottomSizeSleeveQty: (sz: string, key: 'half' | 'full' | 'other', val: number) => void;
  updateBottomSizeOtherDesc: (sz: string, desc: string) => void;
  mode: 'create' | 'edit';
}) {
  const set = (k: keyof FormShape, v: any) => setForm({ ...form, [k]: v });

  const addWorker = () => setForm({ ...form, workers: [...form.workers, blankWorker()] });
  const removeWorker = (i: number) => setForm({ ...form, workers: form.workers.filter((_, idx) => idx !== i) });
  const setWorker = (i: number, w: Worker) => {
    const workers = form.workers.map((x, idx) => idx === i ? w : x);
    setForm({ ...form, workers });
  };

  const totalQty = form.sizes.reduce((s, x) => s + ((x.half || 0) + (x.full || 0) + (x.other || 0) || x.qty || 0), 0);
  const totalBottomQty = form.bottom_sizes.reduce((s, x) => s + ((x.half || 0) + (x.full || 0) + (x.other || 0) || x.qty || 0), 0);

  // ── Name Details modal state ──────────────────────────────────────────────
  const [nameDetailOpen, setNameDetailOpen] = useState<'tshirt' | 'bottom' | null>(null);

  // ── Product types state ────────────────────────────────────────────────────
  const [productTypes, setProductTypes] = useState<{ id: number; name: string }[]>([]);
  const [ptLoaded, setPtLoaded] = useState(false);
  const [ptDropOpen, setPtDropOpen] = useState(false);
  const [ptManageOpen, setPtManageOpen] = useState(false);
  const [ptEditItem, setPtEditItem] = useState<{ id: number; name: string } | null>(null);
  const [ptEditName, setPtEditName] = useState('');
  const [ptNewName, setPtNewName] = useState('');
  const [ptSaving, setPtSaving] = useState(false);
  const ptRef = useRef<HTMLDivElement>(null);

  const loadProductTypes = async () => {
    if (ptLoaded) return;
    const types = await api.getOrderProductTypes();
    setProductTypes(types);
    setPtLoaded(true);
  };

  const ptAdd = async () => {
    if (!ptNewName.trim()) return;
    setPtSaving(true);
    const types = await api.createOrderProductType(ptNewName.trim());
    setProductTypes(types);
    setPtNewName('');
    setPtSaving(false);
  };

  const ptUpdate = async () => {
    if (!ptEditItem || !ptEditName.trim()) return;
    setPtSaving(true);
    const types = await api.updateOrderProductType(ptEditItem.id, ptEditName.trim());
    setProductTypes(types);
    if (form.product === ptEditItem.name) set('product', ptEditName.trim());
    setPtEditItem(null);
    setPtEditName('');
    setPtSaving(false);
  };

  const ptDelete = async (item: { id: number; name: string }) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const types = await api.deleteOrderProductType(item.id);
    setProductTypes(types);
    if (form.product === item.name) set('product', '');
  };

  // close product dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ptRef.current && !ptRef.current.contains(e.target as Node)) setPtDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fabric types state ─────────────────────────────────────────────────────
  const [fabricTypes, setFabricTypes] = useState<{ id: number; name: string }[]>([]);
  const [ftLoaded, setFtLoaded] = useState(false);
  const [ftDropOpen, setFtDropOpen] = useState(false);
  const [ftManageOpen, setFtManageOpen] = useState(false);
  const [ftEditItem, setFtEditItem] = useState<{ id: number; name: string } | null>(null);
  const [ftEditName, setFtEditName] = useState('');
  const [ftNewName, setFtNewName] = useState('');
  const [ftSaving, setFtSaving] = useState(false);
  const ftRef = useRef<HTMLDivElement>(null);

  const loadFabricTypes = async () => {
    if (ftLoaded) return;
    const types = await api.getOrderFabricTypes();
    setFabricTypes(types);
    setFtLoaded(true);
  };

  const ftAdd = async () => {
    if (!ftNewName.trim()) return;
    setFtSaving(true);
    const types = await api.createOrderFabricType(ftNewName.trim());
    setFabricTypes(types);
    setFtNewName('');
    setFtSaving(false);
  };

  const ftUpdate = async () => {
    if (!ftEditItem || !ftEditName.trim()) return;
    setFtSaving(true);
    const types = await api.updateOrderFabricType(ftEditItem.id, ftEditName.trim());
    setFabricTypes(types);
    if (form.fabric_details === ftEditItem.name) set('fabric_details', ftEditName.trim());
    setFtEditItem(null);
    setFtEditName('');
    setFtSaving(false);
  };

  const ftDelete = async (item: { id: number; name: string }) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const types = await api.deleteOrderFabricType(item.id);
    setFabricTypes(types);
    if (form.fabric_details === item.name) set('fabric_details', '');
  };

  // close fabric dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ftRef.current && !ftRef.current.contains(e.target as Node)) setFtDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Garment spec dropdowns (collar / sleeve / button / tag) ───────────────
  type SpecItem = { id: number; name: string };
  type SpecDrop = {
    items: SpecItem[]; dropOpen: boolean; setDropOpen: React.Dispatch<React.SetStateAction<boolean>>;
    manageOpen: boolean; setManageOpen: React.Dispatch<React.SetStateAction<boolean>>;
    editItem: SpecItem | null; setEditItem: React.Dispatch<React.SetStateAction<SpecItem | null>>;
    editName: string; setEditName: React.Dispatch<React.SetStateAction<string>>;
    newName: string; setNewName: React.Dispatch<React.SetStateAction<string>>;
    saving: boolean; ref: React.RefObject<HTMLDivElement | null>;
    load: () => Promise<void>; add: () => Promise<void>; update: () => Promise<void>;
    del: (item: SpecItem) => Promise<void>;
  };
  function useSpecDropdown(
    apiGet: () => Promise<{ id: number; name: string }[]>,
    apiCreate: (n: string) => Promise<{ id: number; name: string }[]>,
    apiUpdate: (id: number, n: string) => Promise<{ id: number; name: string }[]>,
    apiDelete: (id: number) => Promise<{ id: number; name: string }[]>,
    formKey: keyof FormShape,
  ) {
    const [items, setItems] = useState<{ id: number; name: string }[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [dropOpen, setDropOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [editItem, setEditItem] = useState<{ id: number; name: string } | null>(null);
    const [editName, setEditName] = useState('');
    const [newName, setNewName] = useState('');
    const [saving, setSaving] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const load = async () => { if (loaded) return; const t = await apiGet(); setItems(t); setLoaded(true); };
    const add = async () => { if (!newName.trim()) return; setSaving(true); setItems(await apiCreate(newName.trim())); setNewName(''); setSaving(false); };
    const update = async () => {
      if (!editItem || !editName.trim()) return;
      setSaving(true);
      const t = await apiUpdate(editItem.id, editName.trim());
      setItems(t);
      if ((form as any)[formKey] === editItem.name) set(formKey, editName.trim());
      setEditItem(null); setEditName(''); setSaving(false);
    };
    const del = async (item: { id: number; name: string }) => {
      if (!confirm(`Delete "${item.name}"?`)) return;
      setItems(await apiDelete(item.id));
      if ((form as any)[formKey] === item.name) set(formKey, '');
    };

    useEffect(() => {
      const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setDropOpen(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    return { items, dropOpen, setDropOpen, manageOpen, setManageOpen, editItem, setEditItem, editName, setEditName, newName, setNewName, saving, ref, load, add, update, del };
  }

  const collarSpec = useSpecDropdown(api.getOrderCollarTypes, api.createOrderCollarType, api.updateOrderCollarType, api.deleteOrderCollarType, 'collar_type');
  const sleeveSpec = useSpecDropdown(api.getOrderSleeveTypes, api.createOrderSleeveType, api.updateOrderSleeveType, api.deleteOrderSleeveType, 'sleeve_type');
  const buttonSpec = useSpecDropdown(api.getOrderButtonTypes, api.createOrderButtonType, api.updateOrderButtonType, api.deleteOrderButtonType, 'button_type');
  const tagSpec = useSpecDropdown(api.getOrderTagNames, api.createOrderTagName, api.updateOrderTagName, api.deleteOrderTagName, 'tag_name');

  // ── Invoice search state ───────────────────────────────────────────────────
  const [invSearch, setInvSearch] = useState('');
  const [invResults, setInvResults] = useState<InvoiceResult[]>([]);
  const [invLoading, setInvLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceResult | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [invDropOpen, setInvDropOpen] = useState(false);
  const invRef = useRef<HTMLDivElement>(null);

  const searchInvoices = async (q: string) => {
    setInvSearch(q);
    if (!q.trim()) { setInvResults([]); setInvDropOpen(false); return; }
    setInvLoading(true);
    try {
      const res = await api.getInvoices({ search: q, exclude_ordered: true });
      setInvResults((res || []).slice(0, 8));
      setInvDropOpen(true);
    } catch (_) { setInvResults([]); }
    setInvLoading(false);
  };

  const pickInvoice = async (inv: InvoiceResult) => {
    setSelectedInvoice(inv);
    setInvSearch('');
    setInvDropOpen(false);
    setInvResults([]);
    // fill customer
    setForm({ ...form, customer_id: String(inv.customer_id) });
    try {
      const c = await api.getCustomer(inv.customer_id);
      setSelectedCustomer(c);
    } catch (_) { setSelectedCustomer(null); }
  };

  const clearInvoice = () => {
    setSelectedInvoice(null);
    setSelectedCustomer(null);
    setForm({ ...form, customer_id: '' });
  };

  const sectionCard = (icon: React.ReactNode, title: string, children: React.ReactNode, accentColor = 'var(--red)') => (
    <div style={{
      background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)',
      marginBottom: 16, overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px', borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, #fff 0%, #fafafa 100%)',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: accentColor + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accentColor,
        }}>{icon}</div>
        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: mode === 'create' ? 900 : '100%' }}>
      {/* 1. Basic Info */}
      {sectionCard(<CalIcon size={15} />, 'Basic Information', (
        <>
          {/* ── Invoice search row ── */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {/* Invoice search box */}
              <div ref={invRef} style={{ position: 'relative', flex: '0 0 156px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: 5, color: 'var(--text2)' }}>
                  Search Invoice *
                </label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                  <input
                    className="form-control"
                    style={{ paddingLeft: 32 }}
                    placeholder="Invoice no, customer name…"
                    value={invSearch}
                    onChange={e => searchInvoices(e.target.value)}
                    onFocus={() => invSearch && setInvDropOpen(true)}
                    onBlur={() => setTimeout(() => setInvDropOpen(false), 180)}
                  />
                  {invLoading && (
                    <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', color: 'var(--text3)' }}>…</div>
                  )}
                </div>
                {invDropOpen && invResults.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
                  }}>
                    {invResults.map(inv => (
                      <div
                        key={inv.id}
                        onMouseDown={() => pickInvoice(inv)}
                        style={{
                          padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                          transition: 'background 0.1s',
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#FFF0F2')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--red)' }}>{inv.invoice_no}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{inv.customer_name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {invDropOpen && invResults.length === 0 && invSearch && !invLoading && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
                    padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text3)',
                  }}>
                    No invoices found
                  </div>
                )}
              </div>

              {/* Customer select — always visible, next to invoice search */}
              <div style={{ flex: '0 0 240px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: 5, color: 'var(--text2)' }}>
                  Customer *
                </label>
                <select
                  className="form-control"
                  value={form.customer_id}
                  disabled={!!selectedInvoice}
                  onChange={e => set('customer_id', e.target.value)}
                  style={{ opacity: selectedInvoice ? 0.5 : 1, pointerEvents: selectedInvoice ? 'none' : 'auto' }}
                >
                  <option value="">Select customer…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Selected invoice chip */}
              {selectedInvoice && (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: 'linear-gradient(135deg, #FFF0F2 0%, #fff5f7 100%)',
                  border: '1.5px solid #fecdd3', borderRadius: 10,
                  padding: '8px 14px', marginTop: 20, flexWrap: 'wrap', gap: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Invoice</div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--red)', letterSpacing: '0.02em' }}>{selectedInvoice.invoice_no}</div>
                    </div>
                    <div style={{ width: 1, height: 28, background: '#fecdd3' }} />
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{selectedInvoice.customer_name}</div>
                    </div>
                    {selectedCustomer && (selectedCustomer.phone || selectedCustomer.mobile) && (
                      <>
                        <div style={{ width: 1, height: 28, background: '#fecdd3' }} />
                        <div>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text2)' }}>{selectedCustomer.phone || selectedCustomer.mobile}</div>
                        </div>
                      </>
                    )}
                    {selectedCustomer?.company_name && (
                      <>
                        <div style={{ width: 1, height: 28, background: '#fecdd3' }} />
                        <div>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text2)' }}>{selectedCustomer.company_name}</div>
                        </div>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={clearInvoice}
                      style={{
                        marginLeft: 10, width: 24, height: 24, borderRadius: '50%',
                        border: '1px solid #fecdd3', background: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#be123c',
                      }}
                    ><X size={12} /></button>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* ── Date + product row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Order Date</label>
              <input className="form-control" type="date" value={form.order_date} onChange={e => set('order_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Delivery Date *</label>
              <input className="form-control" type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Product / Style</label>
              <div ref={ptRef} style={{ position: 'relative' }}>
                <div
                  className="form-control"
                  onClick={() => { loadProductTypes(); setPtDropOpen(o => !o); }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                >
                  <span style={{ color: form.product ? 'var(--text)' : 'var(--text3)' }}>
                    {form.product || 'Select product type…'}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                </div>
                {ptDropOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
                  }}
                    onBlur={() => setPtDropOpen(false)}
                  >
                    {productTypes.length === 0 && (
                      <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text3)' }}>No types yet — add below</div>
                    )}
                    {productTypes.map(pt => (
                      <div
                        key={pt.id}
                        onClick={() => { set('product', pt.name); setPtDropOpen(false); }}
                        style={{
                          padding: '9px 14px', cursor: 'pointer', fontSize: '0.83rem',
                          background: form.product === pt.name ? '#FFF0F2' : '',
                          color: form.product === pt.name ? 'var(--red)' : 'var(--text)',
                          fontWeight: form.product === pt.name ? 600 : 400,
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (form.product !== pt.name) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={e => { if (form.product !== pt.name) e.currentTarget.style.background = ''; }}
                      >
                        {pt.name}
                      </div>
                    ))}
                    {/* Manage button at bottom */}
                    <div
                      onClick={() => { setPtDropOpen(false); setPtManageOpen(true); }}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', fontSize: '0.78rem',
                        color: 'var(--red)', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6,
                        borderTop: '1px solid var(--border)', background: '#FAFAFA',
                      }}
                    >
                      <Plus size={13} /> Add / Manage Types
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Fabric Type</label>
              <div ref={ftRef} style={{ position: 'relative' }}>
                <div
                  className="form-control"
                  onClick={() => { loadFabricTypes(); setFtDropOpen(o => !o); }}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                >
                  <span style={{ color: form.fabric_details ? 'var(--text)' : 'var(--text3)' }}>
                    {form.fabric_details || 'Select fabric type…'}
                  </span>
                  <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                </div>
                {ftDropOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                    background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
                  }}>
                    {fabricTypes.length === 0 && (
                      <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text3)' }}>No types yet — add below</div>
                    )}
                    {fabricTypes.map(ft => (
                      <div
                        key={ft.id}
                        onClick={() => { set('fabric_details', ft.name); setFtDropOpen(false); }}
                        style={{
                          padding: '9px 14px', cursor: 'pointer', fontSize: '0.83rem',
                          background: form.fabric_details === ft.name ? '#FFF0F2' : '',
                          color: form.fabric_details === ft.name ? 'var(--red)' : 'var(--text)',
                          fontWeight: form.fabric_details === ft.name ? 600 : 400,
                          borderBottom: '1px solid #f3f4f6',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { if (form.fabric_details !== ft.name) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={e => { if (form.fabric_details !== ft.name) e.currentTarget.style.background = ''; }}
                      >
                        {ft.name}
                      </div>
                    ))}
                    <div
                      onClick={() => { setFtDropOpen(false); setFtManageOpen(true); }}
                      style={{
                        padding: '9px 14px', cursor: 'pointer', fontSize: '0.78rem',
                        color: 'var(--red)', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6,
                        borderTop: '1px solid var(--border)', background: '#FAFAFA',
                      }}
                    >
                      <Plus size={13} /> Add / Manage Types
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ), '#6366f1')}

      {/* 2. Sizes & Quantities — T-Shirt */}
      {sectionCard(<List size={15} />, 'Sizes & Quantities : T-Shirt', (
        <>
          {/* Size chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {SIZES.map(s => {
              const active = !!form.sizes.find(x => x.size === s);
              return (
                <button key={s} type="button" onClick={() => toggleSize(s)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 600,
                  cursor: 'pointer', border: `2px solid ${active ? 'var(--red)' : 'var(--border)'}`,
                  background: active ? '#FFF0F2' : 'var(--surface)', color: active ? 'var(--red)' : 'var(--text2)',
                  transition: 'all 0.15s',
                }}>{s}</button>
              );
            })}
          </div>

          {/* Size rows with H / F / O */}
          {form.sizes.length > 0 && (
            <div style={{ background: '#FAFAFA', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, background: '#F3F4F6', borderBottom: '1px solid var(--border)', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <span>Size</span>
                <span style={{ textAlign: 'center' }}>Half (H)</span>
                <span style={{ textAlign: 'center' }}>Full (F)</span>
                <span style={{ textAlign: 'center' }}>Others (O)</span>
                <span style={{ paddingLeft: 8 }}>Others Type</span>
                <span style={{ textAlign: 'right' }}>Total</span>
              </div>
              {form.sizes.map((sz: Size) => {
                const rowTotal = (sz.half || 0) + (sz.full || 0) + (sz.other || 0);
                return (
                  <div key={sz.size} style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid #F0F0F0' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--red)' }}>{sz.size}</span>
                    {(['half', 'full', 'other'] as const).map(key => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'center', padding: '0 4px' }}>
                        <input className="form-control" type="number" min={0} value={sz[key] || 0}
                          style={{ width: 64, padding: '4px 8px', fontSize: '0.82rem', textAlign: 'center' }}
                          onChange={e => updateSizeSleeveQty(sz.size, key, Number(e.target.value))} />
                      </div>
                    ))}
                    <div style={{ paddingLeft: 8, paddingRight: 4 }}>
                      <input className="form-control" placeholder="e.g. 3/4 sleeve…" value={sz.other_desc || ''}
                        style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                        onChange={e => updateSizeOtherDesc(sz.size, e.target.value)} />
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: rowTotal > 0 ? 'var(--text)' : 'var(--text3)' }}>
                      {rowTotal} pcs
                    </div>
                  </div>
                );
              })}
              {/* Total + Name Details button */}
              <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, padding: '8px 14px', background: 'var(--red)', color: '#fff', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>TOTAL</span>
                <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.sizes.reduce((s, x) => s + (x.half || 0), 0)} H</span>
                <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.sizes.reduce((s, x) => s + (x.full || 0), 0)} F</span>
                <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.sizes.reduce((s, x) => s + (x.other || 0), 0)} O</span>
                <span />
                <span style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 800 }}>{totalQty} pcs</span>
              </div>
            </div>
          )}
          {form.sizes.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', padding: '12px 0', marginBottom: 12 }}>
              Click the size buttons above to add sizes
            </div>
          )}

          {/* Name Details button */}
          {totalQty > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" onClick={() => setNameDetailOpen('tshirt')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                <Users size={14} /> Name Details
                <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', marginLeft: 2 }}>
                  {form.tshirt_names.filter(n => n.name.trim()).length}/{totalQty}
                </span>
              </button>
            </div>
          )}
        </>
      ), '#10b981')}

      {/* 2b. Sizes & Quantities — Bottom / Shorts */}
      {sectionCard(<List size={15} />, `Sizes & Quantities : ${form.with_bottom === 'shorts' ? 'Shorts' : 'Bottom'}`, (
        <>
          {/* With Shorts / With Bottom radio — moved here as the type selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, padding: '8px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', marginRight: 4 }}>Type:</span>
            {([['shorts', 'With Shorts'], ['bottom', 'With Bottom']] as [string, string][]).map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, color: form.with_bottom === val ? 'var(--red)' : 'var(--text)' }}>
                <input type="radio" name="with_bottom" value={val} checked={form.with_bottom === val}
                  onChange={() => setForm({ ...form, with_bottom: val as 'shorts' | 'bottom' })}
                  style={{ accentColor: 'var(--red)', width: 15, height: 15 }} />
                {label}
              </label>
            ))}
            {form.with_bottom && (
              <button type="button" onClick={() => setForm({ ...form, with_bottom: '', bottom_sizes: [], bottom_names: [] })}
                style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                Clear
              </button>
            )}
          </div>

          {!form.with_bottom ? (
            <div style={{ color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', padding: '12px 0' }}>
              Select a bottom type above to add sizes
            </div>
          ) : (
            <>
              {/* Bottom size chips */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {SIZES.map(s => {
                  const active = !!form.bottom_sizes.find(x => x.size === s);
                  return (
                    <button key={s} type="button" onClick={() => toggleBottomSize(s)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: '0.76rem', fontWeight: 600,
                      cursor: 'pointer', border: `2px solid ${active ? '#6366f1' : 'var(--border)'}`,
                      background: active ? '#EEF2FF' : 'var(--surface)', color: active ? '#6366f1' : 'var(--text2)',
                      transition: 'all 0.15s',
                    }}>{s}</button>
                  );
                })}
              </div>

              {/* Bottom size rows */}
              {form.bottom_sizes.length > 0 && (
                <div style={{ background: '#FAFAFA', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, background: '#EDEFFE', borderBottom: '1px solid var(--border)', padding: '6px 14px', fontSize: '0.7rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>Size</span>
                    <span style={{ textAlign: 'center' }}>Half (H)</span>
                    <span style={{ textAlign: 'center' }}>Full (F)</span>
                    <span style={{ textAlign: 'center' }}>Others (O)</span>
                    <span style={{ paddingLeft: 8 }}>Others Type</span>
                    <span style={{ textAlign: 'right' }}>Total</span>
                  </div>
                  {form.bottom_sizes.map((sz: Size) => {
                    const rowTotal = (sz.half || 0) + (sz.full || 0) + (sz.other || 0);
                    return (
                      <div key={sz.size} style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid #F0F0F0' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1' }}>{sz.size}</span>
                        {(['half', 'full', 'other'] as const).map(key => (
                          <div key={key} style={{ display: 'flex', justifyContent: 'center', padding: '0 4px' }}>
                            <input className="form-control" type="number" min={0} value={sz[key] || 0}
                              style={{ width: 64, padding: '4px 8px', fontSize: '0.82rem', textAlign: 'center' }}
                              onChange={e => updateBottomSizeSleeveQty(sz.size, key, Number(e.target.value))} />
                          </div>
                        ))}
                        <div style={{ paddingLeft: 8, paddingRight: 4 }}>
                          <input className="form-control" placeholder="e.g. 3/4…" value={sz.other_desc || ''}
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                            onChange={e => updateBottomSizeOtherDesc(sz.size, e.target.value)} />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: rowTotal > 0 ? 'var(--text)' : 'var(--text3)' }}>
                          {rowTotal} pcs
                        </div>
                      </div>
                    );
                  })}
                  {/* Total row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 90px 90px 90px 1fr 70px', gap: 0, padding: '8px 14px', background: '#6366f1', color: '#fff', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>TOTAL</span>
                    <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.bottom_sizes.reduce((s, x) => s + (x.half || 0), 0)} H</span>
                    <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.bottom_sizes.reduce((s, x) => s + (x.full || 0), 0)} F</span>
                    <span style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 700 }}>{form.bottom_sizes.reduce((s, x) => s + (x.other || 0), 0)} O</span>
                    <span />
                    <span style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 800 }}>{totalBottomQty} pcs</span>
                  </div>
                </div>
              )}
              {form.bottom_sizes.length === 0 && (
                <div style={{ color: 'var(--text3)', fontSize: '0.8rem', textAlign: 'center', padding: '12px 0', marginBottom: 12 }}>
                  Click the size buttons above to add sizes
                </div>
              )}

              {/* Name Details button */}
              {totalBottomQty > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button type="button" onClick={() => setNameDetailOpen('bottom')}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    <Users size={14} /> Name Details
                    <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 10, padding: '1px 7px', fontSize: '0.75rem', marginLeft: 2 }}>
                      {form.bottom_names.filter(n => n.name.trim()).length}/{totalBottomQty}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Upload Design (single big image) ── */}
          <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '9px 14px', background: '#F3F4F6', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upload Design</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                <Plus size={12} /> {form.design_image ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';
                    const dataUrl = await compressImage(file, 1200, 1200, 0.82);
                    setForm(f => ({ ...f, design_image: dataUrl }));
                  }}
                />
              </label>
            </div>
            {form.design_image ? (
              <div style={{ position: 'relative', padding: 10, background: '#fff', textAlign: 'center' }}>
                <img src={form.design_image} alt="Design" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 6, display: 'block', margin: '0 auto' }} />
                <button type="button" onClick={() => setForm({ ...form, design_image: '' })}
                  style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                No design uploaded — click Upload to add the jersey/product design image
              </div>
            )}
          </div>

          {/* Upload Elements — kept here (end of sizes section) */}
          <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', marginTop: 16 }}>
            <div style={{ padding: '9px 14px', background: '#F3F4F6', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upload Elements</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                <Plus size={12} /> Add
                <input type="file" accept="image/*,.pdf,.ai,.eps,.svg,.png,.jpg,.jpeg" multiple style={{ display: 'none' }}
                  onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    const newEls = await Promise.all(files.map(async file => {
                      const isImg = file.type.startsWith('image/');
                      const dataUrl = isImg
                        ? await compressImage(file, 800, 800, 0.80)
                        : await new Promise<string>(res => { const r = new FileReader(); r.onload = ev => res(ev.target?.result as string); r.readAsDataURL(file); });
                      return { id: Date.now() + Math.random(), name: file.name, dataUrl };
                    }));
                    setForm(f => ({ ...f, elements: [...f.elements, ...newEls] }));
                  }}
                />
              </label>
            </div>
            {form.elements.length === 0 ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: '0.78rem' }}>
                No elements uploaded — click + Add to upload images or design files
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12 }}>
                {form.elements.map((el, idx) => (
                  <div key={el.id} style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', width: 90, flexShrink: 0 }}>
                    {el.dataUrl.startsWith('data:image') ? (
                      <img src={el.dataUrl} alt={el.name} style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: 90, height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', fontSize: '0.65rem', color: 'var(--text3)', gap: 4 }}>
                        <span style={{ fontSize: '1.4rem' }}>📄</span>
                        <span style={{ textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{el.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    <div style={{ padding: '4px 6px', fontSize: '0.6rem', color: 'var(--text2)', background: '#fff', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.name}</div>
                    <button type="button" onClick={() => setForm({ ...form, elements: form.elements.filter((_el, i) => i !== idx) })}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ), '#6366f1')}

      {/* ── Name Details Modal ── */}
      {nameDetailOpen && (
        <NameDetailsModal
          type={nameDetailOpen}
          sizes={nameDetailOpen === 'tshirt' ? form.sizes : form.bottom_sizes}
          existing={nameDetailOpen === 'tshirt' ? form.tshirt_names : form.bottom_names}
          withBottom={form.with_bottom}
          onSave={rows => {
            if (nameDetailOpen === 'tshirt') setForm({ ...form, tshirt_names: rows });
            else setForm({ ...form, bottom_names: rows });
            setNameDetailOpen(null);
          }}
          onClose={() => setNameDetailOpen(null)}
        />
      )}

      {/* 3. Garment Specs */}
      {sectionCard(<Shirt size={15} />, 'Garment Specifications', (
        <>
          {/* Managed spec dropdown renderer */}
          {(() => {
            const specDrop = (
              label: string,
              spec: SpecDrop,
              formVal: string,
              formKey: keyof FormShape,
            ) => (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>{label}</label>
                <div ref={spec.ref} style={{ position: 'relative' }}>
                  <div
                    onClick={() => { spec.load(); spec.setDropOpen((o: boolean) => !o); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7,
                      background: 'var(--surface)', cursor: 'pointer', minHeight: 36,
                      fontSize: '0.85rem', color: formVal ? 'var(--text)' : 'var(--text3)',
                    }}>
                    <span>{formVal || `Select…`}</span>
                    <ChevronDown size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />
                  </div>
                  {spec.dropOpen && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden',
                    }}>
                      {formVal && (
                        <div onMouseDown={() => { set(formKey, ''); spec.setDropOpen(false); }}
                          style={{ padding: '8px 14px', fontSize: '0.8rem', color: 'var(--text3)', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                          — Clear —
                        </div>
                      )}
                      {spec.items.length === 0 && <div style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text3)' }}>No items yet</div>}
                      {spec.items.map(item => (
                        <div key={item.id} onMouseDown={() => { set(formKey, item.name); spec.setDropOpen(false); }}
                          style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '0.83rem', background: formVal === item.name ? '#FFF0F2' : '', color: formVal === item.name ? 'var(--red)' : 'var(--text)', borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={e => { if (formVal !== item.name) (e.currentTarget as HTMLElement).style.background = '#f9fafb'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = formVal === item.name ? '#FFF0F2' : ''; }}>
                          {item.name}
                        </div>
                      ))}
                      <div onMouseDown={() => { spec.setDropOpen(false); spec.setManageOpen(true); }}
                        style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--red)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <Plus size={13} /> Add / Manage
                      </div>
                    </div>
                  )}
                </div>
                {/* Manage modal */}
                {spec.manageOpen && (
                  <div className="modal-overlay" onClick={() => spec.setManageOpen(false)} style={{ zIndex: 500 }}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                      <div className="modal-header">
                        <h3>Manage {label}</h3>
                        <button className="btn-icon" onClick={() => spec.setManageOpen(false)}><X size={16} /></button>
                      </div>
                      <div className="modal-body" style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                          <input className="form-control" placeholder={`New ${label}…`} value={spec.newName} onChange={e => spec.setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && spec.add()} style={{ flex: 1 }} />
                          <button className="btn btn-primary" onClick={spec.add} disabled={spec.saving || !spec.newName.trim()} style={{ whiteSpace: 'nowrap' }}>Add</button>
                        </div>
                        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                          {spec.items.map(item => (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                              {spec.editItem?.id === item.id ? (
                                <>
                                  <input className="form-control" value={spec.editName} onChange={e => spec.setEditName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && spec.update()} style={{ flex: 1, padding: '5px 8px' }} autoFocus />
                                  <button className="btn btn-primary" onClick={spec.update} disabled={spec.saving} style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                  <button className="btn-icon" onClick={() => { spec.setEditItem(null); spec.setEditName(''); }}><X size={14} /></button>
                                </>
                              ) : (
                                <>
                                  <span style={{ flex: 1, fontSize: '0.85rem' }}>{item.name}</span>
                                  <button className="btn-icon" onClick={() => { spec.setEditItem(item); spec.setEditName(item.name); }}><Edit2 size={13} /></button>
                                  <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => spec.del(item)}><Trash2 size={13} /></button>
                                </>
                              )}
                            </div>
                          ))}
                          {spec.items.length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '0.8rem', padding: '12px 0' }}>No items yet</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );

            return (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  {specDrop('Collar Type', collarSpec, form.collar_type, 'collar_type')}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Collar Colour</label>
                    <input className="form-control" value={form.collar_colour} onChange={e => set('collar_colour', e.target.value)} placeholder="e.g. White, Black…" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                  {specDrop('Sleeve Type', sleeveSpec, form.sleeve_type, 'sleeve_type')}
                  {specDrop('Button Type', buttonSpec, form.button_type, 'button_type')}
                  {specDrop('Tag Name', tagSpec, form.tag_name, 'tag_name')}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Open Front</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 36, marginTop: 2 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 400, color: 'var(--text)' }}>
                        <input type="checkbox" checked={form.open} onChange={e => set('open', e.target.checked)} style={{ accentColor: 'var(--red)', width: 16, height: 16 }} />
                        Yes, open
                      </label>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Printing Details</label>
                    <input className="form-control" value={form.printing_details} onChange={e => set('printing_details', e.target.value)} placeholder="Screen print, DTF, sublimation…" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Embroidery Details</label>
                    <input className="form-control" value={form.embroidery_details} onChange={e => set('embroidery_details', e.target.value)} placeholder="Placement, thread colour…" />
                  </div>
                </div>
              </>
            );
          })()}
        </>
      ), '#f59e0b')}

      {/* 4. Workers */}
      {sectionCard(<Users size={15} />, 'Worker Assignments', (
        <>
          {form.workers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '0.8rem', padding: '8px 0 12px' }}>
              No workers assigned yet
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 100px 80px 110px 36px',
                gap: 8, marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)',
              }}>
                {['Worker Name', 'Size', 'Number', 'Sleeve', ''].map(h => (
                  <div key={h} style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
                ))}
              </div>
              {form.workers.map((w, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 80px 110px 36px',
                  gap: 8, marginBottom: 6, alignItems: 'center',
                }}>
                  <input className="form-control" value={w.name} placeholder="Worker name…"
                    style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                    onChange={e => setWorker(i, { ...w, name: e.target.value })} />
                  <select className="form-control" value={w.size}
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                    onChange={e => setWorker(i, { ...w, size: e.target.value })}>
                    <option value="">Size</option>
                    {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input className="form-control" value={w.number} placeholder="#"
                    style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                    onChange={e => setWorker(i, { ...w, number: e.target.value })} />
                  <select className="form-control" value={w.sleeve}
                    style={{ padding: '6px 8px', fontSize: '0.82rem' }}
                    onChange={e => setWorker(i, { ...w, sleeve: e.target.value as Worker['sleeve'] })}>
                    <option value="">Sleeve</option>
                    <option value="Full">Full</option>
                    <option value="Half">Half</option>
                    <option value="3/4">3/4</option>
                  </select>
                  <button type="button" onClick={() => removeWorker(i)} style={{
                    width: 32, height: 32, borderRadius: 6, border: '1px solid #FECACA',
                    background: '#FFF5F5', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Minus size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addWorker} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: '1.5px dashed var(--red)', borderRadius: 8, background: '#FFF0F2',
            color: 'var(--red)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          }}>
            <UserPlus size={14} /> Add Worker
          </button>
        </>
      ), '#8b5cf6')}

      {/* 5. Financial & Notes */}
      {sectionCard(<StickyNote size={15} />, 'Financial & Notes', (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Accessories</label>
              <input className="form-control" value={form.accessories} onChange={e => set('accessories', e.target.value)} placeholder="Buttons, zippers, labels…" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Total Amount (LKR)</label>
              <input className="form-control" type="number" value={form.total_amount} onChange={e => set('total_amount', Number(e.target.value))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Production Notes</label>
              <textarea className="form-control" rows={3} value={form.production_notes} onChange={e => set('production_notes', e.target.value)} placeholder="Internal production instructions…" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Notes / Special Instructions</label>
              <textarea className="form-control" rows={3} value={form.plain_notes} onChange={e => set('plain_notes', e.target.value)} placeholder="Any special instructions for this order…" />
            </div>
          </div>
        </>
      ), '#0ea5e9')}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, paddingBottom: 24 }}>
        <button className="btn btn-secondary" onClick={onCancel}>
          {mode === 'create' ? 'Clear' : 'Cancel'}
        </button>
        <button className="btn btn-primary" disabled={isSaving || !form.customer_id} onClick={() => onSave(selectedInvoice?.id)} style={{ minWidth: 150 }}>
          {isSaving ? (mode === 'create' ? 'Creating…' : 'Saving…') : (mode === 'create' ? 'Create Order Sheet' : 'Save Changes')}
        </button>
      </div>

      {/* ── Fabric Types Manage Modal ── */}
      {ftManageOpen && (
        <div className="modal-overlay" onClick={() => { setFtManageOpen(false); setFtEditItem(null); setFtEditName(''); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Fabric Types</h3>
              <button className="btn-icon" onClick={() => { setFtManageOpen(false); setFtEditItem(null); setFtEditName(''); }}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                {fabricTypes.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>No fabric types yet</div>
                )}
                {fabricTypes.map(ft => (
                  <div key={ft.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 7, marginBottom: 4,
                    border: '1px solid var(--border)', background: ftEditItem?.id === ft.id ? '#FFF0F2' : 'var(--surface)',
                  }}>
                    {ftEditItem?.id === ft.id ? (
                      <>
                        <input
                          className="form-control"
                          value={ftEditName}
                          onChange={e => setFtEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && ftUpdate()}
                          autoFocus
                          style={{ flex: 1, padding: '5px 10px', fontSize: '0.82rem' }}
                        />
                        <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={ftUpdate} disabled={ftSaving}>
                          {ftSaving ? '…' : 'Save'}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.78rem' }} onClick={() => { setFtEditItem(null); setFtEditName(''); }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{ft.name}</span>
                        <button
                          className="btn-icon"
                          onClick={() => { setFtEditItem(ft); setFtEditName(ft.name); }}
                          style={{ color: '#6366f1' }}
                          title="Edit"
                        ><Edit2 size={14} /></button>
                        <button
                          className="btn-icon"
                          onClick={() => ftDelete(ft)}
                          style={{ color: '#ef4444' }}
                          title="Delete"
                        ><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Add New Type</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-control"
                    placeholder="e.g. Cotton, Polyester, Dri-Fit…"
                    value={ftNewName}
                    onChange={e => setFtNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && ftAdd()}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={ftAdd} disabled={ftSaving || !ftNewName.trim()} style={{ whiteSpace: 'nowrap' }}>
                    {ftSaving ? '…' : <><Plus size={13} /> Add</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Types Manage Modal ── */}
      {ptManageOpen && (
        <div className="modal-overlay" onClick={() => { setPtManageOpen(false); setPtEditItem(null); setPtEditName(''); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Manage Product Types</h3>
              <button className="btn-icon" onClick={() => { setPtManageOpen(false); setPtEditItem(null); setPtEditName(''); }}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ padding: '16px 20px' }}>
              {/* List */}
              <div style={{ marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                {productTypes.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text3)', textAlign: 'center', padding: '16px 0' }}>No product types yet</div>
                )}
                {productTypes.map(pt => (
                  <div key={pt.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 7, marginBottom: 4,
                    border: '1px solid var(--border)', background: ptEditItem?.id === pt.id ? '#FFF0F2' : 'var(--surface)',
                  }}>
                    {ptEditItem?.id === pt.id ? (
                      <>
                        <input
                          className="form-control"
                          value={ptEditName}
                          onChange={e => setPtEditName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && ptUpdate()}
                          autoFocus
                          style={{ flex: 1, padding: '5px 10px', fontSize: '0.82rem' }}
                        />
                        <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem' }} onClick={ptUpdate} disabled={ptSaving}>
                          {ptSaving ? '…' : 'Save'}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.78rem' }} onClick={() => { setPtEditItem(null); setPtEditName(''); }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500 }}>{pt.name}</span>
                        <button
                          className="btn-icon"
                          onClick={() => { setPtEditItem(pt); setPtEditName(pt.name); }}
                          style={{ color: '#6366f1' }}
                          title="Edit"
                        ><Edit2 size={14} /></button>
                        <button
                          className="btn-icon"
                          onClick={() => ptDelete(pt)}
                          style={{ color: '#ef4444' }}
                          title="Delete"
                        ><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Add new */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Add New Type</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-control"
                    placeholder="e.g. T-Shirt, Polo, Jersey…"
                    value={ptNewName}
                    onChange={e => setPtNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && ptAdd()}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={ptAdd} disabled={ptSaving || !ptNewName.trim()} style={{ whiteSpace: 'nowrap' }}>
                    {ptSaving ? '…' : <><Plus size={13} /> Add</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────────────────
function DashboardSection({ stats, trend, orders, onViewOrder }: {
  stats: Stats; trend: TrendPoint[]; orders: Order[]; onViewOrder: (id: number) => void;
}) {
  const kpis = [
    { label: 'New Orders', value: stats.new_orders || 0, icon: Plus, color: '#6366f1', bg: '#eef2ff' },
    { label: 'Ongoing', value: stats.ongoing || 0, icon: Clock, color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Ready / Uncollected', value: stats.uncollected || 0, icon: CheckCircle, color: '#10b981', bg: '#ecfdf5' },
    { label: 'Cancelled', value: stats.cancelled || 0, icon: XCircle, color: '#ef4444', bg: '#fef2f2' },
  ];

  const trendData = trend.map(t => ({
    month: t.m ? new Date(t.m + '-01').toLocaleDateString('en-LK', { month: 'short', year: '2-digit' }) : t.m,
    Orders: t.total, Completed: t.completed, Cancelled: t.cancelled,
  }));

  const overdue = orders.filter(o => o.delivery_date && o.delivery_date < today() && !['Delivered', 'Collected', 'Cancelled'].includes(o.status));
  const upcoming = orders.filter(o => {
    if (!o.delivery_date || ['Delivered', 'Collected', 'Cancelled'].includes(o.status)) return false;
    const diff = (new Date(o.delivery_date).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 7;
  });

  return (
    <div>
      {overdue.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#dc2626', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} />
          <strong>{overdue.length} overdue order{overdue.length > 1 ? 's' : ''}</strong> — past delivery date and not yet delivered.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <k.icon size={18} color={k.color} />
            </div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TrendingUp size={15} color="var(--red)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Monthly Order Trend</span>
          </div>
          {trendData.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px 0', fontSize: '0.8rem' }}>No trend data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData} margin={{ top: 4, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: '0.78rem', borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                <Line type="monotone" dataKey="Orders" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Completed" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Cancelled" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 14 }}>Order Summary</div>
          {[
            { label: 'Total Orders', value: stats.total || 0, color: 'var(--text)' },
            { label: 'Active', value: stats.active || 0, color: '#6366f1' },
            { label: 'Completed', value: stats.completed || 0, color: '#10b981' },
            { label: 'Overdue', value: stats.overdue || 0, color: '#ef4444' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{r.label}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: r.color }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      {upcoming.length > 0 && (
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalIcon size={14} color="var(--red)" /> Due This Week
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {upcoming.map(o => {
              const diff = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000);
              return (
                <div key={o.id} onClick={() => onViewOrder(o.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FFF0F2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}>
                  <span style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem', minWidth: 90 }}>{o.order_no}</span>
                  <span style={{ fontSize: '0.8rem', flex: 1 }}>{o.customer_name} — {o.product || 'No product'}</span>
                  <span className={`badge ${STATUS_MAP[o.status] || 'badge-average'}`}>{o.status}</span>
                  <span style={{ fontSize: '0.75rem', color: diff === 0 ? '#ef4444' : '#f59e0b', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                    {diff === 0 ? 'Today' : `${diff}d left`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── List Section ─────────────────────────────────────────────────────────────
function ListSection({ orders, isLoading, search, setSearch, statusFilter, setStatusFilter, onView, onStatusChange, onDelete }: {
  orders: Order[]; isLoading: boolean;
  search: string; setSearch: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  onView: (id: number) => void;
  onStatusChange: (id: number, s: string) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="form-control" style={{ paddingLeft: 32, width: 260 }} placeholder="Search orders…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="card">
        {isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Order #</th><th>Customer</th><th>Product</th><th>Order Date</th><th>Delivery</th><th>Qty</th><th>Status</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                {orders.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No orders found</td></tr>}
                {orders.map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{o.order_no}</td>
                    <td>{o.customer_name}</td>
                    <td style={{ fontSize: '0.82rem' }}>{o.product || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{fmtDate(o.order_date)}</td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <span style={{ color: o.delivery_date && o.delivery_date < today() && !['Delivered', 'Collected', 'Cancelled'].includes(o.status) ? '#ef4444' : 'inherit' }}>
                        {fmtDate(o.delivery_date)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{o.total_qty || 0}</td>
                    <td>
                      <select value={o.status} onChange={e => onStatusChange(o.id, e.target.value)}
                        style={{ border: 'none', background: 'transparent', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', color: STATUS_COLOR[o.status] || 'inherit', fontWeight: 600 }}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(o.total_amount)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => onView(o.id)}><Eye size={14} /></button>
                        <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => onDelete(o.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sheets Section ────────────────────────────────────────────────────────────
function SheetsSection({ orders, isLoading, search, setSearch, statusFilter, setStatusFilter, onView, onStatusChange }: {
  orders: Order[]; isLoading: boolean;
  search: string; setSearch: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  onView: (id: number) => void;
  onStatusChange: (id: number, s: string) => void;
}) {
  return (
    <>
      <div className="filter-bar">
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="form-control" style={{ paddingLeft: 32, width: 260 }} placeholder="Search order sheets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-control" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {isLoading ? <div className="loading">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {orders.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No order sheets found</div>
          )}
          {orders.map(o => {
            const isOverdue = o.delivery_date && o.delivery_date < today() && !['Delivered', 'Collected', 'Cancelled'].includes(o.status);
            return (
              <div key={o.id} className="card" style={{ padding: '16px 18px', borderLeft: `4px solid ${STATUS_COLOR[o.status] || 'var(--border)'}`, cursor: 'pointer' }}
                onClick={() => onView(o.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.9rem' }}>{o.order_no}</span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text2)', marginTop: 2 }}>{o.customer_name}</div>
                  </div>
                  <span className={`badge ${STATUS_MAP[o.status] || 'badge-average'}`}>{o.status}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, marginBottom: 8 }}>{o.product || '—'}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Order: <strong style={{ color: 'var(--text)' }}>{fmtDate(o.order_date)}</strong></div>
                  <div style={{ fontSize: '0.72rem', color: isOverdue ? '#ef4444' : 'var(--text3)' }}>
                    Delivery: <strong style={{ color: isOverdue ? '#ef4444' : 'var(--text)' }}>{fmtDate(o.delivery_date)}</strong>
                    {isOverdue && ' ⚠'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Qty: <strong style={{ color: 'var(--text)' }}>{o.total_qty || 0} pcs</strong></div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Amount: <strong style={{ color: 'var(--text)' }}>{fmt(o.total_amount)}</strong></div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  {STATUSES.filter(s => s !== o.status).slice(0, 3).map(s => (
                    <button key={s} className="btn btn-sm btn-secondary"
                      style={{ fontSize: '0.68rem', padding: '2px 8px', color: STATUS_COLOR[s] }}
                      onClick={() => onStatusChange(o.id, s)}>
                      → {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Calendar Section ──────────────────────────────────────────────────────────
function CalendarSection({ ordersByDate, calMonth, calYear, setCalMonth, setCalYear, getDaysInMonth, getFirstDay, onView }: {
  ordersByDate: Record<string, Order[]>;
  calMonth: number; calYear: number;
  setCalMonth: (v: number) => void; setCalYear: (v: number) => void;
  getDaysInMonth: (y: number, m: number) => number;
  getFirstDay: (y: number, m: number) => number;
  onView: (id: number) => void;
}) {
  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1); };
  const todayStr = today();

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={prevMonth}><ChevronLeft size={14} /></button>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
          {new Date(calYear, calMonth).toLocaleDateString('en-LK', { month: 'long', year: 'numeric' })}
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={nextMonth}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text3)', padding: '4px 0' }}>{d}</div>
        ))}
        {Array.from({ length: getFirstDay(calYear, calMonth) }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dayOrders = ordersByDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          return (
            <div key={d} style={{ minHeight: 72, border: `1px solid ${isToday ? 'var(--red)' : 'var(--border)'}`, borderRadius: 6, padding: 4, background: isToday ? '#FFF0F2' : 'var(--surface)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--red)' : 'var(--text)', marginBottom: 3 }}>{d}</div>
              {dayOrders.slice(0, 2).map(o => (
                <div key={o.id} onClick={() => onView(o.id)}
                  style={{ fontSize: '0.62rem', padding: '2px 5px', borderRadius: 3, marginBottom: 2, cursor: 'pointer', background: STATUS_COLOR[o.status] || 'var(--red)', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.order_no}
                </div>
              ))}
              {dayOrders.length > 2 && <div style={{ fontSize: '0.58rem', color: 'var(--text3)' }}>+{dayOrders.length - 2} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Printable Order Sheet ─────────────────────────────────────────────────────
function PrintableOrderSheet({ order, nd }: { order: Order; nd: NotesData }) {
  // Total qty = sum of half+full+other per size, fallback to qty/total_qty
  const totalQty = order.sizes && order.sizes.length > 0
    ? order.sizes.reduce((s, x) => s + ((x.half || 0) + (x.full || 0) + (x.other || 0) || x.qty || 0), 0)
    : (order.total_qty || 0);

  const elements = ((nd as any).elements || []) as { id: number; name: string; dataUrl: string }[];
  const designImage = (nd as any).design_image as string | undefined;
  const withBottom = (nd as any).with_bottom as string | undefined;
  const tshirtNames = ((nd as any).tshirt_names || []) as NameDetail[];
  const bottomNames = ((nd as any).bottom_names || []) as NameDetail[];
  const bottomSizes = ((nd as any).bottom_sizes || []) as Size[];
  const imgEls = elements.filter(el => el.dataUrl?.startsWith('data:image'));

  return (
    <div className="print-page">

      {/* ── HEADER ── */}
      <div className="ps-header">
        <div className="ps-logo">
          <div className="ps-logo-pandora">PANDORA</div>
          <div className="ps-logo-garments">GARMENTS</div>
        </div>
        <div className="ps-header-center">
          <div className="ps-order-sheet-title">ORDER SHEET</div>
          {order.product && <div className="ps-product-name">{order.product}</div>}
        </div>
        <div className="ps-header-meta">
          <div className="ps-meta-row"><span className="ps-meta-lbl">INVOICE NO.</span><span className="ps-meta-val">{order.order_no}</span></div>
          <div className="ps-meta-row"><span className="ps-meta-lbl">DATE</span><span className="ps-meta-val">{fmtDate(order.order_date)}</span></div>
          <div className="ps-meta-row"><span className="ps-meta-lbl">DELIVERY DATE</span><span className="ps-meta-val">{fmtDate(order.delivery_date)}</span></div>
        </div>
      </div>

      {/* ── INFO BAR: Name / Fabric / Dates ── */}
      <div className="ps-infobar">
        <div className="ps-info-item ps-info-name">
          <span className="ps-info-lbl">NAME</span>
          <span className="ps-info-dash">–</span>
          <span className="ps-info-val">{order.customer_name}</span>
        </div>
        {order.fabric_details && (
          <div className="ps-info-item">
            <span className="ps-info-lbl">FABRIC</span>
            <span className="ps-info-dash">–</span>
            <span className="ps-info-val">{order.fabric_details}</span>
          </div>
        )}
        <div className="ps-info-item">
          <span className="ps-info-lbl">DATE</span>
          <span className="ps-info-dash">–</span>
          <span className="ps-info-val">{fmtDate(order.order_date)}</span>
        </div>
        <div className="ps-info-item">
          <span className="ps-info-lbl">DELIVERED DATE</span>
          <span className="ps-info-dash">–</span>
          <span className="ps-info-val">{fmtDate(order.delivery_date)}</span>
        </div>
      </div>

      {/* ── SPECS BAR: Collar / Open / Button / Tag ── */}
      <div className="ps-specsbar">
        {nd.collar_type && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">COLLAR TYPE</span>
            <span className="ps-spec-val">{nd.collar_type}{nd.collar_colour ? ` – ${nd.collar_colour}` : ''}</span>
          </div>
        )}
        <div className="ps-spec-pill">
          <span className="ps-spec-lbl">OPEN</span>
          <span className="ps-spec-val">{nd.open ? 'YES' : 'NO'}</span>
        </div>
        {nd.button_type && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">BUTTON</span>
            <span className="ps-spec-val">{nd.button_type}</span>
          </div>
        )}
        {nd.tag_name && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">TAG</span>
            <span className="ps-spec-val">{nd.tag_name}</span>
          </div>
        )}
        {nd.sleeve_type && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">SLEEVE</span>
            <span className="ps-spec-val">{nd.sleeve_type}</span>
          </div>
        )}
        {order.printing_details && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">PRINTING</span>
            <span className="ps-spec-val">{order.printing_details}</span>
          </div>
        )}
        {order.embroidery_details && (
          <div className="ps-spec-pill">
            <span className="ps-spec-lbl">EMBROIDERY</span>
            <span className="ps-spec-val">{order.embroidery_details}</span>
          </div>
        )}
        {withBottom && (
          <div className="ps-spec-pill ps-spec-pill-highlight">
            <span className="ps-spec-val">{withBottom === 'shorts' ? 'WITH SHORTS' : 'WITH BOTTOM'}</span>
          </div>
        )}
      </div>

      {/* ── BODY: LEFT (sizes + names + bottom) | RIGHT (design + elements) ── */}
      <div className="ps-body">

        {/* ───────── LEFT COLUMN ───────── */}
        <div className="ps-left-col">

          {/* Sizes table — one row per sleeve type, matching sample */}
          {order.sizes && order.sizes.length > 0 && (
            <table className="ps-table ps-sizes-table">
              <thead>
                <tr>
                  <th>SIZE</th>
                  <th>SLEEVE</th>
                  <th>QTY</th>
                </tr>
              </thead>
              <tbody>
                {order.sizes.map(sz => {
                  const rows: { sleeve: string; qty: number }[] = [];
                  if (sz.full) rows.push({ sleeve: 'Full', qty: sz.full });
                  if (sz.half) rows.push({ sleeve: 'Half', qty: sz.half });
                  if (sz.other) rows.push({ sleeve: sz.other_desc || 'Other', qty: sz.other });
                  if (rows.length === 0) rows.push({ sleeve: '—', qty: sz.qty || 0 });
                  return rows.map((r, ri) => (
                    <tr key={`${sz.size}-${ri}`}>
                      {ri === 0 && <td className="ps-td-size" rowSpan={rows.length}>{sz.size}</td>}
                      <td className="ps-td-sleeve-l">{r.sleeve}</td>
                      <td className="ps-td-qty">{String(r.qty).padStart(2, '0')}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          )}

          {/* TOTAL box */}
          <div className="ps-total-box">TOTAL : {totalQty}</div>

          {/* t-shirt Names & Numbers */}
          {tshirtNames.length > 0 && (
            <div className="ps-names-block">
              <div className="ps-names-title">t-shirt Names &amp; Numbers</div>
              <table className="ps-table ps-names-table">
                <thead>
                  <tr>
                    <th style={{ width: '10%' }}>#</th>
                    <th style={{ textAlign: 'left' }}>NAME</th>
                    <th style={{ width: '16%' }}>SIZE</th>
                    <th style={{ width: '20%' }}>NUMBER</th>
                    <th style={{ width: '18%' }}>SLEEVE</th>
                  </tr>
                </thead>
                <tbody>
                  {tshirtNames.map((n, i) => (
                    <tr key={i}>
                      <td className="ps-name-idx">{i + 1}</td>
                      <td className="ps-name-name">{n.name || '—'}</td>
                      <td className="ps-name-size">{n.size}</td>
                      <td className="ps-name-num">{n.number || '—'}</td>
                      <td className="ps-name-sleeve">{n.sleeve ? n.sleeve.toUpperCase() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bottom Sizes & Numbers */}
          {(bottomSizes.length > 0 || bottomNames.length > 0) && (
            <div className="ps-bottom-block">
              <div className="ps-names-title">Bottom Sizes &amp; Numbers</div>
              <table className="ps-table ps-bottom-table">
                <thead>
                  <tr><th>SIZE</th><th>NUMBERS</th></tr>
                </thead>
                <tbody>
                  {bottomSizes.length > 0
                    ? bottomSizes.map((sz, i) => {
                        const qty = (sz.half || 0) + (sz.full || 0) + (sz.other || 0) || sz.qty || 0;
                        const nums = bottomNames.filter(n => n.size === sz.size).map(n => n.number).filter(Boolean).join(',');
                        return (
                          <tr key={i}>
                            <td className="ps-bottom-size">{sz.size} ({String(qty).padStart(2, '0')})</td>
                            <td className="ps-bottom-nums">{nums || '—'}</td>
                          </tr>
                        );
                      })
                    : Array.from(new Set(bottomNames.map(n => n.size))).map((size, i) => {
                        const grp = bottomNames.filter(n => n.size === size);
                        return (
                          <tr key={i}>
                            <td className="ps-bottom-size">{size} ({String(grp.length).padStart(2, '0')})</td>
                            <td className="ps-bottom-nums">{grp.map(n => n.number).filter(Boolean).join(',') || '—'}</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}

          {/* Accessories */}
          {order.accessories && (
            <div className="ps-accessories"><strong>ACCESSORIES:</strong> {order.accessories}</div>
          )}
        </div>

        {/* ───────── RIGHT COLUMN ───────── */}
        <div className="ps-right-col">

          {/* DESIGN IMAGE — big top slot */}
          {designImage ? (
            <div className="ps-design-image-wrap">
              <img src={designImage} alt="Design" className="ps-design-image" />
            </div>
          ) : (
            <div className="ps-design-placeholder">No design image uploaded</div>
          )}

          {/* Banner */}
          <div className="ps-banner">
            <span className="ps-banner-white">PLEASE CHECK THE </span>
            <span className="ps-banner-red">DESIGN</span>
            <span className="ps-banner-white"> · </span>
            <span className="ps-banner-green">SPELLING</span>
            <span className="ps-banner-white"> · </span>
            <span className="ps-banner-yellow">COLOURS</span>
            <span className="ps-banner-white"> · </span>
            <span className="ps-banner-red">LOGO</span>
            <span className="ps-banner-white"> · </span>
            <span className="ps-banner-green">TEXT SIZE</span>
          </div>

          {/* ELEMENTS — tiles below */}
          {imgEls.length > 0 && (
            <div className="ps-elements-grid">
              {imgEls.map((el, idx) => (
                <div key={el.id || idx} className="ps-element-img-wrap-sm">
                  <img src={el.dataUrl} alt={el.name} className="ps-element-img-sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── NOTES ── */}
      {(order.production_notes || nd.plain_notes) && (
        <div className="ps-notes-block">
          {order.production_notes && (
            <div className="ps-note-box"><strong>PRODUCTION NOTES:</strong> {order.production_notes}</div>
          )}
          {nd.plain_notes && (
            <div className="ps-note-box" style={{ marginTop: 4 }}><strong>SPECIAL INSTRUCTIONS:</strong> {nd.plain_notes}</div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── View Modal ────────────────────────────────────────────────────────────────
function ViewModal({ order, onClose, onEdit, onStatusChange, onDelete }: {
  order: Order; onClose: () => void; onEdit: () => void;
  onStatusChange: (s: string) => void; onDelete: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const nd = parseNotes(order.notes || '');

  const handlePrint = () => {
    // Set a body class then call print, remove after
    document.body.classList.add('printing-order');
    window.print();
    document.body.classList.remove('printing-order');
  };

  const statusColor = STATUS_COLOR[order.status] || '#6366f1';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg om-modal" onClick={e => e.stopPropagation()}>
        {/* Modern hero header */}
        <div className="om-hero screen-only" style={{ background: `linear-gradient(135deg, ${statusColor}14 0%, #ffffff 70%)`, borderTop: `3px solid ${statusColor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div className="om-hero-icon" style={{ background: statusColor }}>
                <CheckCircle size={22} color="#fff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.01em' }}>{order.order_no}</span>
                  <span className="om-status-pill" style={{ background: `${statusColor}1a`, color: statusColor }}>{order.status}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text2)', marginTop: 3, fontWeight: 500 }}>
                  {order.customer_name} · {order.product || 'No product'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secondary btn-sm" onClick={handlePrint} style={{ gap: 5 }}>
                <Printer size={13} /> Print
              </button>
              <button className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Edit</button>
              <button className="btn-icon" onClick={onClose}><X size={16} /></button>
            </div>
          </div>
        </div>
        {/* Print-only header (kept minimal for print path) */}
        <div className="modal-header print-only" style={{ display: 'none' }}>
          <h3>{order.order_no}</h3>
        </div>
        <div className="modal-body">
          {/* Screen view */}
          <div className="screen-only">
            <div className="om-stat-grid">
              <StatTile icon={<Clock size={16} />} label="Order Date" value={fmtDate(order.order_date)} tint="#6366f1" />
              <StatTile icon={<Clock size={16} />} label="Delivery Date" value={fmtDate(order.delivery_date)} tint="#f59e0b" />
              <StatTile icon={<Shirt size={16} />} label="Total Qty" value={`${order.total_qty || 0} pcs`} tint="#0ea5e9" />
              <StatTile icon={<TrendingUp size={16} />} label="Total Amount" value={fmt(order.total_amount)} tint="#16a34a" />
            </div>
            <div className="om-stat-grid" style={{ marginBottom: 18 }}>
              <StatTile icon={<CheckCircle size={16} />} label="Production Status" value={order.production_status || '—'} tint="#8b5cf6" />
              <div className="om-progress-tile">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span>Progress</span><span style={{ color: 'var(--text)' }}>{order.progress || 0}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: '#eef0f3', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, order.progress || 0)}%`, borderRadius: 99, background: statusColor, transition: 'width .3s' }} />
                </div>
              </div>
            </div>

            {order.sizes && order.sizes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>Sizes</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {order.sizes.map(sz => (
                    <div key={sz.size} style={{ background: '#FFF0F2', border: '1px solid #FFCDD2', borderRadius: 6, padding: '4px 12px', fontSize: '0.82rem' }}>
                      <strong>{sz.size}</strong>: {sz.qty}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Garment specs parsed from notes */}
            {(nd.collar_type || nd.sleeve_type || nd.button_type || nd.tag_name) && (
              <div style={{ marginBottom: 16, padding: '14px 16px', background: 'linear-gradient(135deg, #fff8f0 0%, #fff0f5 100%)', borderRadius: 12, border: '1.5px solid #ffd6e0', boxShadow: '0 2px 8px rgba(220,38,100,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                  <span style={{ fontSize: '1rem' }}>🧵</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c2185b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Garment Specs</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {nd.collar_type && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#fff', border: '1.5px solid #f8bbd0', borderRadius: 10, padding: '6px 14px', minWidth: 80 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#e91e8c', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Collar</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e' }}>{nd.collar_type}{nd.collar_colour ? <span style={{ color: '#e91e8c', fontWeight: 500 }}> — {nd.collar_colour}</span> : ''}</span>
                    </div>
                  )}
                  {nd.sleeve_type && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#fff', border: '1.5px solid #bbdefb', borderRadius: 10, padding: '6px 14px', minWidth: 80 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1565c0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Sleeve</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e' }}>{nd.sleeve_type}</span>
                    </div>
                  )}
                  {nd.button_type && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#fff', border: '1.5px solid #c8e6c9', borderRadius: 10, padding: '6px 14px', minWidth: 80 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#2e7d32', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Button</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e' }}>{nd.button_type}</span>
                    </div>
                  )}
                  {nd.tag_name && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: '#fff', border: '1.5px solid #ffe0b2', borderRadius: 10, padding: '6px 14px', minWidth: 80 }}>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#e65100', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Tag</span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a2e' }}>{nd.tag_name}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: nd.open ? '#e8f5e9' : '#fff', border: `1.5px solid ${nd.open ? '#a5d6a7' : '#e0e0e0'}`, borderRadius: 10, padding: '6px 14px', minWidth: 80 }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: nd.open ? '#2e7d32' : '#757575', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Open Front</span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: nd.open ? '#1b5e20' : '#9e9e9e' }}>{nd.open ? '✓ Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Workers */}
            {nd.workers && nd.workers.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>Workers ({nd.workers.length})</div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>#</th><th>Name</th><th>Size</th><th>Number</th><th>Sleeve</th></tr>
                    </thead>
                    <tbody>
                      {nd.workers.map((w, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text3)', width: 30 }}>{i + 1}</td>
                          <td style={{ fontWeight: 500 }}>{w.name || '—'}</td>
                          <td>{w.size || '—'}</td>
                          <td>{w.number || '—'}</td>
                          <td>{w.sleeve || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {[
              { label: 'Design Reference', value: order.design_reference },
              { label: 'Fabric Details', value: order.fabric_details },
              { label: 'Printing Details', value: order.printing_details },
              { label: 'Embroidery', value: order.embroidery_details },
              { label: 'Accessories', value: order.accessories },
              { label: 'Production Notes', value: order.production_notes },
              { label: 'Notes', value: nd.plain_notes },
            ].filter(f => f.value).map(f => (
              <div key={f.label} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 500, marginBottom: 2 }}>{f.label}</div>
                <div style={{ fontSize: '0.85rem' }}>{f.value}</div>
              </div>
            ))}

            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, marginBottom: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Update Status</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUSES.map(s => {
                  const on = order.status === s;
                  return (
                    <button key={s} className="om-status-btn"
                      style={on
                        ? { background: STATUS_COLOR[s], color: '#fff', borderColor: STATUS_COLOR[s] }
                        : { background: '#fff', color: STATUS_COLOR[s], borderColor: `${STATUS_COLOR[s]}55` }}
                      onClick={() => onStatusChange(s)}>
                      {on && <CheckCircle size={13} />} {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Print view — hidden on screen, visible when printing */}
          <div className="print-only" ref={printRef}>
            <PrintableOrderSheet order={order} nd={nd} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={onDelete}><Trash2 size={13} /> Delete</button>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── StatTile helper (modern view modal) ─────────────────────────────────────
function StatTile({ icon, label, value, tint }: { icon: ReactNode; label: string; value?: string | number; tint: string }) {
  return (
    <div className="om-stat-tile">
      <div className="om-stat-icon" style={{ background: `${tint}1a`, color: tint }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.66rem', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || '—'}</div>
      </div>
    </div>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────
function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text3)', fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{value || '—'}</div>
    </div>
  );
}
