import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  CartesianGrid
} from 'recharts';
import {
  AlertTriangle,
  CalendarClock, Trophy, Medal
} from 'lucide-react';

const fmt = (n: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n: number) => new Intl.NumberFormat().format(n || 0);
const COLORS = ['#C0001A', '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'];

const gradeColor: Record<string, string> = {
  Excellent: '#2E7D32',
  'Very Good': '#1565C0',
  Good: '#F57C00',
  Average: '#6A1FA0',
  'Needs Improvement': '#C0001A',
};

function gradeToColor(grade: string) {
  return gradeColor[grade] ?? '#888';
}

export default function Dashboard() {
  const { data: d, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.getDashboard() });

  if (isLoading) return <div className="loading">Loading dashboard…</div>;
  if (error) return <div className="content"><div className="alert alert-danger">Failed to load dashboard</div></div>;
  if (!d) return null;

  const orderStatusDist = (d.orderStatusDist || []).map((r: { status: string; c: number }) => ({ status: r.status, count: r.c }));
  const topCustomers = d.topCustomers || [];
  const recentOrders = d.recentOrders || [];
  const upcomingDeliveries = d.upcomingDeliveries || [];
  const topEmployees: Array<{ employeeName: string; department: string; percentage: number; grade: string }> = d.topEmployees || [];

  const thisMonthLabel = new Date().toLocaleDateString('en-LK', { month: 'long', year: 'numeric' });
  const dailyData = (d.dailyTrend || []).map((r: { day: number; revenue: number; expenses: number }) => ({
    day: r.day,
    revenue: r.revenue || 0,
    expenses: r.expenses || 0,
  }));

  return (
    <div>
      <div className="topbar">
        <h2>Executive Dashboard</h2>
        <div className="topbar-right">
          <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>
            {new Date().toLocaleDateString('en-LK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="content">

        {/* Alerts */}
        {(d.lowStock > 0 || d.delayedOrders > 0) && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {d.lowStock > 0 && (
              <div className="alert alert-danger" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> {d.lowStock} item(s) are low on stock
              </div>
            )}
            {d.delayedOrders > 0 && (
              <div className="alert alert-danger" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> {d.delayedOrders} order(s) are overdue
              </div>
            )}
          </div>
        )}

        {/* KPI Grid — 6 cards, 3+3 */}
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 10 }}>
          {/* 1 — Revenue This Month */}
          <KpiCard
            gif="/icon-revenue.gif"
            color="#C0001A"
            label="Revenue — This Month"
            value={fmt(d.monthlySales || 0)}
            sub={`Net profit: ${fmt(d.monthlyProfit || 0)}`}
          />
          {/* 2 — Total Orders This Month */}
          <KpiCard
            gif="/icon-order.gif"
            color="#1565C0"
            label="Orders — This Month"
            value={fmtNum(d.monthTotalOrders || 0)}
            sub={`${d.delayedOrders || 0} overdue · ${d.ordersDueWeek || 0} due this week`}
          />
          {/* 3 — Undelivered Orders & Pcs */}
          <KpiCard
            gif="/icon-undelivered.gif"
            color="#E65100"
            label="Undelivered Orders"
            value={`${fmtNum(d.undeliveredOrders || 0)} orders`}
            sub={`${fmtNum(d.undeliveredPcs || 0)} pcs pending dispatch`}
          />
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
          {/* 4 — Outstanding Amount */}
          <KpiCard
            gif="/icon-outstanding.gif"
            color="#B71C1C"
            label="Outstanding Amount"
            value={fmt(d.outstandingAmount || 0)}
            sub="unpaid / partially paid"
            highlight
          />
          {/* 5 — New Customers */}
          <KpiCard
            gif="/icon-new-customer.gif"
            color="#2E7D32"
            label="New Customers — This Month"
            value={fmtNum(d.newCustomers || 0)}
            sub={`${fmtNum(d.totalCustomers || 0)} total active`}
          />
          {/* 6 — HR Avg KPI Score */}
          <KpiCard
            gif="/icon-kpi.gif"
            color="#6A1FA0"
            label="HR Avg KPI Score — This Month"
            value={`${d.monthAvgKpi ?? 0}%`}
            sub={`${d.evaluatedCount || 0} evaluations · ${d.excellent || 0} excellent`}
          />
        </div>

        {/* Charts row 1 — Revenue vs Expenses bar */}
        <div className="card" style={{ marginBottom: 16, borderTop: "3px solid #4E6FFF" }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Revenue vs Expenses — {thisMonthLabel}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.75rem', color: 'var(--text3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: '#4E6FFF', display: 'inline-block', borderRadius: 3 }} /> Revenue</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, background: '#FF9F43', display: 'inline-block', borderRadius: 3 }} /> Expenses</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyData} margin={{ top: 16, right: 10, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} interval={0} dy={6} />
              <YAxis tick={{ fontSize: 11, fill: '#999' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={38} />
              <CartesianGrid stroke="#F3F3F3" strokeDasharray="" vertical={false} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={(v, name) => [fmt(Number(v)), String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
                labelFormatter={(l) => `Day ${l}`}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              />
              <Bar dataKey="revenue" name="revenue" fill="#4E6FFF" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="expenses" name="expenses" fill="#FF9F43" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Charts row 2 — pie + top customers + top performers + recent orders */}
        <div className="charts-grid">
          <div className="card" style={{ borderTop: "3px solid #C0001A" }}>
            <div className="card-title">Orders by Status</div>
            {orderStatusDist.length === 0
              ? <div className="empty"><div className="empty-icon">📋</div><p>No orders yet</p></div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={orderStatusDist} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={true} fontSize={9}>
                      {orderStatusDist.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </div>
          <div className="card" style={{ borderTop: "3px solid #FF9F43" }}>
            <div className="card-title">Top Customers by Revenue</div>
            {topCustomers.length === 0
              ? <div className="empty"><div className="empty-icon">👥</div><p>No customer data yet</p></div>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topCustomers} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12 }} />
                    <Bar dataKey="total" fill="#C0001A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </div>

          {/* Top Performers — moved here, before Recent Orders */}
          <div className="card" style={{ display: "flex", flexDirection: "column", borderTop: "3px solid #6A1FA0" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ background: '#6A1FA015', borderRadius: 8, padding: 6, color: '#6A1FA0', display: 'flex' }}>
                <Trophy size={16} />
              </div>
              <div className="card-title" style={{ marginBottom: 0 }}>Top Performers — {thisMonthLabel}</div>
            </div>
            {topEmployees.length === 0 ? (
              <div className="empty" style={{ flex: 1, padding: '24px 0' }}>
                <div className="empty-icon">🏆</div>
                <p>No evaluations this month</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topEmployees.map((emp, idx) => (
                  <LeaderboardRow key={idx} rank={idx + 1} emp={emp} />
                ))}
              </div>
            )}
            {topEmployees.length > 0 && (
              <div style={{
                marginTop: 16, padding: '10px 12px', borderRadius: 10,
                background: 'linear-gradient(135deg, #6A1FA010, #4E6FFF08)',
                border: '1px solid #6A1FA020',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>Team Avg Score</span>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#6A1FA0' }}>{d.monthAvgKpi ?? 0}%</span>
              </div>
            )}
          </div>

          <div className="card" style={{ borderTop: "3px solid #4BC0C0" }}>
            <div className="card-title">Recent Orders</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Order #</th><th>Customer</th><th>Due Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {recentOrders.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>No orders yet</td></tr>
                  )}
                  {recentOrders.map((o: { id: number; order_no: string; customer_name: string; delivery_date: string; status: string }) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: 'var(--red)' }}>{o.order_no}</td>
                      <td>{o.customer_name}</td>
                      <td style={{ fontSize: '0.78rem' }}>{o.delivery_date || '—'}</td>
                      <td><StatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Bottom row — upcoming deliveries full width */}
        <div style={{ marginTop: 16 }}>
          <div className="card" style={{ borderTop: "3px solid #2E7D32" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarClock size={16} style={{ color: 'var(--red)' }} />
                Upcoming Deliveries (Next 7 Days)
              </div>
              <span style={{ background: '#C0001A15', color: 'var(--red)', borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                {d.ordersDueWeek || 0} due
              </span>
            </div>
            {upcomingDeliveries.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0' }}>
                <div className="empty-icon">📅</div>
                <p>No deliveries due this week</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Order #</th><th>Customer</th><th>Due Date</th><th>Status</th><th>Days Left</th></tr>
                  </thead>
                  <tbody>
                    {upcomingDeliveries.map((o: { id: number; order_no: string; customer_name: string; delivery_date: string; status: string }) => {
                      const daysLeft = Math.ceil((new Date(o.delivery_date).getTime() - Date.now()) / 86400000);
                      return (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 600, color: 'var(--red)' }}>{o.order_no}</td>
                          <td>{o.customer_name}</td>
                          <td style={{ fontSize: '0.78rem' }}>{o.delivery_date}</td>
                          <td><StatusBadge status={o.status} /></td>
                          <td>
                            <span style={{ fontWeight: 700, color: daysLeft === 0 ? 'var(--red)' : daysLeft <= 2 ? '#E65100' : 'var(--success)', fontSize: '0.82rem' }}>
                              {daysLeft === 0 ? 'Today!' : daysLeft < 0 ? 'Overdue' : `${daysLeft}d`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

const RANK_ICONS = [
  <Medal size={15} style={{ color: '#FFD700' }} />,
  <Medal size={15} style={{ color: '#C0C0C0' }} />,
  <Medal size={15} style={{ color: '#CD7F32' }} />,
];

function LeaderboardRow({ rank, emp }: { rank: number; emp: { employeeName: string; department: string; percentage: number; grade: string } }) {
  const pct = emp.percentage || 0;
  const color = gradeToColor(emp.grade);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 10,
      background: rank === 1 ? '#FFD70008' : 'var(--bg)',
      border: rank === 1 ? '1px solid #FFD70030' : '1px solid var(--border)',
    }}>
      {/* Rank */}
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: rank <= 3 ? `${color}15` : '#F0F0F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: '0.72rem', color: rank <= 3 ? color : '#999',
      }}>
        {rank <= 3 ? RANK_ICONS[rank - 1] : rank}
      </div>

      {/* Name + dept */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {emp.employeeName}
        </div>
        <div style={{ fontSize: '0.71rem', color: 'var(--text3)' }}>{emp.department}</div>
      </div>

      {/* Score bar */}
      <div style={{ width: 70, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>{emp.grade}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color }}>{pct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 10, background: '#E8E8E8', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 10, background: color, transition: 'width 0.6s ease' }} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, gif, color, label, value, sub, highlight }: {
  icon?: React.ReactNode; gif?: string; color: string; label: string; value: string; sub: string; highlight?: boolean;
}) {
  return (
    <div className="kpi-card" style={highlight ? { borderTop: `3px solid ${color}`, borderLeft: `3px solid ${color}`, background: '#ffffff' } : { borderTop: `3px solid ${color}` }}>
      <div className="kpi-icon" style={{ background: `${color}15`, color, overflow: 'hidden', padding: gif ? 0 : undefined }}>
        {gif
          ? <img src={gif} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : icon}
      </div>
      <div className="kpi-info">
        <label>{label}</label>
        <h3 style={{ fontSize: '1.3rem', color: highlight ? color : undefined }}>{value}</h3>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: 'badge-good', Confirmed: 'badge-verygood', 'In Progress': 'badge-verygood',
    Ready: 'badge-excellent', Delivered: 'badge-excellent', Collected: 'badge-excellent',
    Cancelled: 'badge-needs', Pending: 'badge-average', Paid: 'badge-excellent',
  };
  return <span className={`badge ${map[status] || 'badge-average'}`}>{status}</span>;
}
