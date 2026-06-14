import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#C0001A', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];
const fmt = (n: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);

const REPORT_TYPES = [
  { key: 'sales-report',    label: 'Sales Report',      icon: '📈', group: 'Sales' },
  { key: 'purchase-report', label: 'Purchase Report',   icon: '🛒', group: 'Purchases' },
  { key: 'stock-report',    label: 'Stock Report',      icon: '📦', group: 'Inventory' },
  { key: 'order-report',    label: 'Orders Report',     icon: '📋', group: 'Orders' },
  { key: 'expense-report',  label: 'Expense Report',    icon: '💸', group: 'Finance' },
  { key: 'profit-report',   label: 'Profit & Loss',     icon: '💰', group: 'Finance' },
  { key: 'top-performers',  label: 'Top Performers',    icon: '🏆', group: 'HR' },
  { key: 'attendance',      label: 'Attendance Issues', icon: '⏰', group: 'HR' },
  { key: 'discipline',      label: 'Discipline Report', icon: '📏', group: 'HR' },
  { key: 'salary-increment',label: 'Salary Increment',  icon: '💰', group: 'HR' },
  { key: 'training-needs',  label: 'Training Needs',    icon: '📚', group: 'HR' },
  { key: 'risk-employees',  label: 'At-Risk Employees', icon: '⚠️', group: 'HR' },
];

type DateRange = { from: string; to: string };

function todayStr() { return new Date().toISOString().split('T')[0]; }
function getRange(preset: string): DateRange {
  const now = new Date();
  const today = todayStr();
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    return { from: d.toISOString().split('T')[0], to: today };
  }
  if (preset === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
  if (preset === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  return { from: today, to: today };
}

export default function Reports() {
  const [activeReport, setActiveReport] = useState('sales-report');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [preset, setPreset] = useState<string>('month');
  const [customRange, setCustomRange] = useState<DateRange>({ from: getRange('month').from, to: todayStr() });

  const range: DateRange = preset === 'custom' ? customRange : getRange(preset);

  const isSales = activeReport === 'sales-report';

  const params: Record<string, string> = isSales
    ? { from: range.from, to: range.to }
    : { month };

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['report', activeReport, params],
    queryFn: () => api.getReport(activeReport, params),
  });

  const groups = Array.from(new Set(REPORT_TYPES.map(r => r.group)));

  return (
    <div>
      <div className="topbar">
        <h2>Reports</h2>
        <div className="topbar-right">
          {!isSales && (
            <input className="form-control" type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 180 }} />
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 57px)' }}>
        {/* Sidebar */}
        <div style={{ width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 0', flexShrink: 0 }}>
          {groups.map(group => (
            <div key={group}>
              <div style={{ padding: '6px 16px 4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group}</div>
              {REPORT_TYPES.filter(r => r.group === group).map(r => (
                <button key={r.key} onClick={() => setActiveReport(r.key)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 16px',
                    background: activeReport === r.key ? '#FFF0F2' : 'transparent',
                    border: 'none', borderLeft: `3px solid ${activeReport === r.key ? 'var(--red)' : 'transparent'}`,
                    color: activeReport === r.key ? 'var(--red)' : 'var(--text2)',
                    fontSize: '0.82rem', fontWeight: activeReport === r.key ? 600 : 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
                  }}>
                  <span>{r.icon}</span> {r.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {isLoading && <div className="loading">Loading report…</div>}
          {error && <div className="alert alert-danger">Failed to load report</div>}
          {!isLoading && !error && rawData !== undefined && (
            <ReportView
              type={activeReport}
              data={rawData}
              month={month}
              preset={preset}
              setPreset={setPreset}
              customRange={customRange}
              setCustomRange={setCustomRange}
              range={range}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Range Picker ──────────────────────────────────────────────────────────────
function RangePicker({ preset, setPreset, customRange, setCustomRange, range }: {
  preset: string; setPreset: (p: string) => void;
  customRange: DateRange; setCustomRange: (r: DateRange) => void;
  range: DateRange;
}) {
  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year',  label: 'This Year' },
    { key: 'custom',label: 'Custom' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            style={{
              padding: '6px 14px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: '0.78rem', fontWeight: preset === p.key ? 700 : 400,
              background: preset === p.key ? 'var(--red)' : 'transparent',
              color: preset === p.key ? '#fff' : 'var(--text2)',
              borderRight: '1px solid var(--border)',
            }}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input className="form-control" type="date" style={{ width: 150 }}
            value={customRange.from} onChange={e => setCustomRange({ ...customRange, from: e.target.value })} />
          <span style={{ color: 'var(--text3)', fontSize: '0.8rem' }}>to</span>
          <input className="form-control" type="date" style={{ width: 150 }}
            value={customRange.to} onChange={e => setCustomRange({ ...customRange, to: e.target.value })} />
        </div>
      )}
      {preset !== 'custom' && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>{range.from} → {range.to}</span>
      )}
    </div>
  );
}

// ── ReportView ────────────────────────────────────────────────────────────────
function ReportView({ type, data, month, preset, setPreset, customRange, setCustomRange, range }: {
  type: string; data: unknown; month: string;
  preset: string; setPreset: (p: string) => void;
  customRange: DateRange; setCustomRange: (r: DateRange) => void;
  range: DateRange;
}) {
  const title = REPORT_TYPES.find(r => r.key === type)?.label || type;
  const d = data as Record<string, unknown>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>{title}</h3>
        {type !== 'sales-report' && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>Period: {month}</div>
        )}
      </div>

      {type === 'sales-report' && (
        <>
          <RangePicker preset={preset} setPreset={setPreset} customRange={customRange} setCustomRange={setCustomRange} range={range} />
          <SalesReport rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : []} />
        </>
      )}

      {['top-performers','attendance','discipline','salary-increment','training-needs','risk-employees'].includes(type) && (
        <GenericTable rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} />
      )}
      {type === 'purchase-report' && <GenericTable rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} />}
      {type === 'stock-report'    && <StockReport rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} />}
      {type === 'order-report'    && <OrderReport rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} />}
      {type === 'expense-report'  && <ExpenseReport rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} summary={(d?.summary as unknown[] | undefined) || []} />}
      {type === 'profit-report'   && <ProfitReport rows={Array.isArray(d?.data) ? d.data as Record<string,unknown>[] : (Array.isArray(d) ? d as Record<string,unknown>[] : [])} />}
    </div>
  );
}

// ── Sales Report ──────────────────────────────────────────────────────────────
function SalesReport({ rows }: { rows: Record<string,unknown>[] }) {
  const [tab, setTab] = useState<'sales' | 'dues'>('sales');
  const [dueFilter, setDueFilter] = useState('all'); // all | 0-7 | 8-30 | 31-90 | 90+

  const total       = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalPaid   = rows.reduce((s, r) => s + Number(r.amount_paid  || 0), 0);
  const totalDue    = rows.reduce((s, r) => s + Number(r.due_amount   || 0), 0);

  const dueRows = useMemo(() =>
    rows.filter(r => ['Due', 'Partial'].includes(String(r.payment_status || ''))),
    [rows]
  );

  const filteredDues = useMemo(() => {
    if (dueFilter === 'all') return dueRows;
    return dueRows.filter(r => {
      const d = Number(r.days_since || 0);
      if (dueFilter === '0-7')  return d <= 7;
      if (dueFilter === '8-30') return d >= 8 && d <= 30;
      if (dueFilter === '31-90')return d >= 31 && d <= 90;
      if (dueFilter === '90+')  return d > 90;
      return true;
    });
  }, [dueRows, dueFilter]);

  const dueAmount  = dueRows.reduce((s, r) => s + Number(r.due_amount || 0), 0);
  const dueCount   = dueRows.length;

  const badgeColor = (status: string) => {
    if (status === 'Paid')    return { background: '#E8F5E9', color: '#2E7D32' };
    if (status === 'Partial') return { background: '#FFF8E1', color: '#F57F17' };
    if (status === 'Due')     return { background: '#FFEBEE', color: '#C0001A' };
    return {};
  };

  const daysLabel = (d: number) => {
    if (d === 0) return 'Today';
    if (d === 1) return '1 day ago';
    return `${d} days ago`;
  };

  const daysColor = (d: number) => {
    if (d <= 7)  return '#2E7D32';
    if (d <= 30) return '#F57F17';
    return '#C0001A';
  };

  return (
    <div>
      {/* KPI row */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
        <StatCard label="Total Revenue"  value={fmt(total)} />
        <StatCard label="Invoices"        value={String(rows.length)} />
        <StatCard label="Total Collected" value={fmt(totalPaid)} positive />
        <StatCard label="Total Due"       value={fmt(totalDue)} neg />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 16 }}>
        {[
          { key: 'sales', label: `Total Sales (${rows.length})` },
          { key: 'dues',  label: `Total Dues (${dueCount})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as 'sales' | 'dues')}
            style={{
              padding: '8px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--red)' : 'var(--text2)',
              borderBottom: tab === t.key ? '2px solid var(--red)' : '2px solid transparent',
              marginBottom: -2,
            }}>{t.label}</button>
        ))}
      </div>

      {/* Total Sales tab */}
      {tab === 'sales' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th><th>Customer</th><th>Date</th>
                  <th>Status</th><th>Total</th><th>Paid</th><th>Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No data for this period</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--red)' }}>{String(r.invoice_no || '—')}</td>
                    <td>{String(r.customer_name || '—')}</td>
                    <td style={{ fontSize: '0.78rem' }}>{String(r.sale_date || '—')}</td>
                    <td>
                      <span className="badge" style={{ ...badgeColor(String(r.payment_status || '')), borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}>
                        {String(r.payment_status || '—')}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{fmt(Number(r.total_amount || 0))}</td>
                    <td style={{ color: '#2E7D32' }}>{fmt(Number(r.amount_paid || 0))}</td>
                    <td style={{ color: Number(r.due_amount) > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: Number(r.due_amount) > 0 ? 600 : 400 }}>
                      {Number(r.due_amount) > 0 ? fmt(Number(r.due_amount)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Total Dues tab */}
      {tab === 'dues' && (
        <div>
          {/* Due summary KPIs */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 16 }}>
            <StatCard label="Overdue Invoices" value={String(dueCount)} neg />
            <StatCard label="Total Outstanding" value={fmt(dueAmount)} neg />
            <StatCard label="Avg Days Overdue"
              value={dueRows.length ? `${Math.round(dueRows.reduce((s,r) => s + Number(r.days_since||0), 0) / dueRows.length)} days` : '—'}
              neg />
          </div>

          {/* Due age filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text3)', fontWeight: 600 }}>Filter by age:</span>
            {[
              { key: 'all',   label: 'All' },
              { key: '0-7',   label: '0–7 days' },
              { key: '8-30',  label: '8–30 days' },
              { key: '31-90', label: '31–90 days' },
              { key: '90+',   label: '90+ days' },
            ].map(f => (
              <button key={f.key} onClick={() => setDueFilter(f.key)}
                style={{
                  padding: '4px 12px', borderRadius: 20, border: '1px solid var(--border)',
                  background: dueFilter === f.key ? 'var(--red)' : 'var(--surface)',
                  color: dueFilter === f.key ? '#fff' : 'var(--text2)',
                  fontSize: '0.75rem', fontWeight: dueFilter === f.key ? 700 : 400,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{f.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text3)' }}>
              {filteredDues.length} records · {fmt(filteredDues.reduce((s,r) => s + Number(r.due_amount||0), 0))}
            </span>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th><th>Customer</th><th>Date</th>
                    <th>Status</th><th>Total</th><th>Paid</th><th>Due</th><th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDues.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No dues in this range</td></tr>
                  )}
                  {filteredDues.map((r, i) => {
                    const days = Number(r.days_since || 0);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, color: 'var(--red)' }}>{String(r.invoice_no || '—')}</td>
                        <td style={{ fontWeight: 500 }}>{String(r.customer_name || '—')}</td>
                        <td style={{ fontSize: '0.78rem' }}>{String(r.sale_date || '—')}</td>
                        <td>
                          <span className="badge" style={{ ...badgeColor(String(r.payment_status||'')), borderRadius: 4, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 600 }}>
                            {String(r.payment_status || '—')}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{fmt(Number(r.total_amount || 0))}</td>
                        <td style={{ color: '#2E7D32' }}>{fmt(Number(r.amount_paid || 0))}</td>
                        <td style={{ color: 'var(--red)', fontWeight: 700 }}>{fmt(Number(r.due_amount || 0))}</td>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: daysColor(days) }}>
                            {daysLabel(days)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Other report components (unchanged) ───────────────────────────────────────

function StockReport({ rows }: { rows: Record<string,unknown>[] }) {
  const totalValue = rows.reduce((s, r) => s + Number(r.stock_qty || 0) * Number(r.cost_price || 0), 0);
  const lowItems = rows.filter(r => Number(r.stock_qty || 0) <= Number(r.reorder_level || 0));
  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <StatCard label="Total Items" value={String(rows.length)} />
        <StatCard label="Low Stock" value={String(lowItems.length)} />
        <StatCard label="Stock Value" value={fmt(totalValue)} positive />
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Stock</th><th>Reorder</th><th>Value</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{String(r.sku || '—')}</td>
                  <td style={{ fontWeight: 500 }}>{String(r.name || '—')}</td>
                  <td>{String(r.category || '—')}</td>
                  <td style={{ color: Number(r.stock_qty) <= Number(r.reorder_level) ? 'var(--red)' : 'inherit', fontWeight: 600 }}>{String(r.stock_qty || 0)}</td>
                  <td>{String(r.reorder_level || 0)}</td>
                  <td>{fmt(Number(r.stock_qty || 0) * Number(r.cost_price || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrderReport({ rows }: { rows: Record<string,unknown>[] }) {
  const byStatus: Record<string, number> = {};
  rows.forEach(r => { const s = String(r.status || 'Unknown'); byStatus[s] = (byStatus[s] || 0) + 1; });
  const pieData = Object.entries(byStatus).map(([status, count]) => ({ status, count }));
  return (
    <div>
      <div className="charts-grid">
        {pieData.length > 0 && (
          <div className="card">
            <div className="card-title">By Status</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={75}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} fontSize={10}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="card" style={{ marginTop: 0 }}>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Order #</th><th>Customer</th><th>Order Date</th><th>Delivery Date</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No data</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--red)' }}>{String(r.order_no || '—')}</td>
                  <td>{String(r.customer_name || '—')}</td>
                  <td style={{ fontSize: '0.78rem' }}>{String(r.order_date || '—')}</td>
                  <td style={{ fontSize: '0.78rem' }}>{String(r.delivery_date || '—')}</td>
                  <td><span className="badge badge-verygood">{String(r.status || '—')}</span></td>
                  <td style={{ fontWeight: 600 }}>{fmt(Number(r.total_amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpenseReport({ rows, summary }: { rows: Record<string,unknown>[]; summary: unknown[] }) {
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const summaryArr = (summary || []) as { category: string; total: number }[];
  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 20 }}>
        <StatCard label="Total Expenses" value={fmt(total)} />
        <StatCard label="Transactions" value={String(rows.length)} />
      </div>
      {summaryArr.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-title">By Category</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={summaryArr}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="total" fill="#C0001A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Category</th><th>Date</th><th>Method</th><th>Amount</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No data</td></tr>}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{String(r.title || '—')}</td>
                  <td><span className="badge badge-average">{String(r.category || '—')}</span></td>
                  <td style={{ fontSize: '0.78rem' }}>{String(r.expense_date || '—')}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{String(r.payment_method || '—')}</td>
                  <td style={{ fontWeight: 600 }}>{fmt(Number(r.amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProfitReport({ rows }: { rows: Record<string,unknown>[] }) {
  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Monthly P&L Trend</div>
        {rows.length === 0
          ? <div className="empty"><div className="empty-icon">📊</div><p>No data available</p></div>
          : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Bar dataKey="sales"    fill="#36A2EB" name="Revenue"  radius={[4,4,0,0]} />
                <Bar dataKey="expenses" fill="#C0001A" name="Expenses" radius={[4,4,0,0]} />
                <Bar dataKey="profit"   fill="#2E7D32" name="Profit"   radius={[4,4,0,0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          )}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Profit/Loss</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{String(r.month)}</td>
                  <td style={{ color: '#2E7D32' }}>{fmt(Number(r.sales || 0))}</td>
                  <td style={{ color: 'var(--red)' }}>{fmt(Number(r.expenses || 0))}</td>
                  <td style={{ fontWeight: 700, color: Number(r.profit) >= 0 ? '#2E7D32' : 'var(--red)' }}>{fmt(Number(r.profit || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GenericTable({ rows }: { rows: Record<string,unknown>[] }) {
  if (rows.length === 0) return <div className="empty"><div className="empty-icon">📊</div><p>No data available for this period</p></div>;
  const keys = Object.keys(rows[0]);
  return (
    <div className="card">
      <div className="table-wrap">
        <table>
          <thead><tr>{keys.map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{keys.map(k => <td key={k}>{String(row[k] ?? '—')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, positive, neg }: { label: string; value?: string; positive?: boolean; neg?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, color: positive ? '#2E7D32' : neg ? 'var(--red)' : 'inherit' }}>
        {value || '—'}
      </div>
    </div>
  );
}
