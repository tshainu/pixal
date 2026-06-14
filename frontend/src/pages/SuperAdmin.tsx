import { useState, useEffect, useCallback } from 'react';
import { superAdmin } from '../api';
import {
  Building2, Users, User, ShoppingCart, TrendingUp, PlusCircle, Eye, Ban,
  CheckCircle, Trash2, ArrowLeft, LogOut, X, Edit2, BarChart2,
  UserCheck, Package, DollarSign, RefreshCw, Shield, AlertCircle,
  ChevronRight, Search, Phone, Mail, Calendar, Hash,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(Math.round(n));
const fmtCur = (n: number) => `Rs. ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ago = (d: string | null) => {
  if (!d) return 'Never';
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
};
const STATUS_COLOR: Record<string, string> = { Active: '#16a34a', Suspended: '#DC2626', Inactive: '#6B7280' };
const inp: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:'0.85rem', outline:'none', background:'#F9FAFB', color:'#111827' };
const label: React.CSSProperties = { display:'block', fontSize:'0.75rem', fontWeight:600, color:'#374151', marginBottom:5 };

// ─── Super Admin Login ────────────────────────────────────────────────────────
function SALogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const res = await superAdmin.login(pw);
      sessionStorage.setItem('sa_token', res.token);
      onLogin(res.token);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter,system-ui,sans-serif' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 36px', width:'100%', maxWidth:380, boxShadow:'0 24px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
          <div style={{ background:'linear-gradient(135deg,#0f172a,#334155)', borderRadius:10, padding:10, display:'flex' }}>
            <Shield size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize:'1.1rem', fontWeight:800, color:'#0f172a' }}>Super Admin</div>
            <div style={{ fontSize:'0.75rem', color:'#64748b' }}>Pandora Platform</div>
          </div>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom:14 }}>
            <label style={label}>Admin Password</label>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }}
              placeholder="Enter admin password" style={inp} autoFocus />
          </div>
          {err && <div style={{ padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, color:'#DC2626', fontSize:'0.8rem', marginBottom:12 }}>{err}</div>}
          <button type="submit" disabled={loading || !pw} style={{ width:'100%', padding:'11px', background:'linear-gradient(135deg,#0f172a,#334155)', color:'#fff', border:'none', borderRadius:10, fontSize:'0.9rem', fontWeight:700, cursor: loading||!pw?'not-allowed':'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, padding:'18px 20px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', alignItems:'center', gap:14 }}>
      <div style={{ background: color + '15', borderRadius:10, padding:10, display:'flex', flexShrink:0 }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'0.75rem', color:'#6B7280', fontWeight:600, marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:'1.5rem', fontWeight:800, color:'#111827', lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:'0.72rem', color:'#9CA3AF', marginTop:3 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Create/Edit Business Modal ───────────────────────────────────────────────
function BizModal({ biz, onClose, onSave }: { biz?: any; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    user_id: biz?.user_id || '',
    username: biz?.username || '',
    password: '',
    business_name: biz?.business_name || '',
    contact_name: biz?.contact_name || '',
    contact_email: biz?.contact_email || '',
    contact_phone: biz?.contact_phone || '',
    plan: biz?.plan || 'Standard',
    notes: biz?.notes || '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      if (biz) {
        const payload: any = { ...form };
        if (!payload.password) delete payload.password;
        await superAdmin.updateBusiness(biz.id, payload);
      } else {
        await superAdmin.createBusiness(form);
      }
      onSave();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:14, padding:'28px 28px', width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', position:'relative' }}>
        <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'none', border:'none', cursor:'pointer', color:'#6B7280' }}><X size={18} /></button>
        <div style={{ fontSize:'1rem', fontWeight:800, color:'#111827', marginBottom:20 }}>
          {biz ? 'Edit Business' : 'Create New Business'}
        </div>
        <form onSubmit={submit}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={label}>User ID *</label>
              <input value={form.user_id} onChange={e => set('user_id', e.target.value)} placeholder="e.g. AX70" style={inp} disabled={!!biz} required />
            </div>
            <div>
              <label style={label}>Username *</label>
              <input value={form.username} onChange={e => set('username', e.target.value)} placeholder="login username" style={inp} disabled={!!biz} required />
            </div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={label}>{biz ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder={biz ? 'Leave blank to keep current' : 'Set password'} style={inp} required={!biz} />
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={label}>Business Name *</label>
            <input value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="Company name" style={inp} required />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={label}>Contact Person</label>
              <input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Full name" style={inp} />
            </div>
            <div>
              <label style={label}>Phone</label>
              <input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="+94 71..." style={inp} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <label style={label}>Email</label>
              <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="email@example.com" style={inp} />
            </div>
            <div>
              <label style={label}>Plan</label>
              <select value={form.plan} onChange={e => set('plan', e.target.value)} style={{ ...inp, cursor:'pointer' }}>
                <option>Standard</option>
                <option>Pro</option>
                <option>Enterprise</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={label}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes…" rows={2} style={{ ...inp, resize:'vertical' }} />
          </div>
          {err && <div style={{ padding:'8px 12px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, color:'#DC2626', fontSize:'0.8rem', marginBottom:12 }}>{err}</div>}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding:'9px 18px', background:'#F3F4F6', border:'none', borderRadius:8, fontSize:'0.85rem', cursor:'pointer', fontWeight:600 }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ padding:'9px 18px', background:'linear-gradient(135deg,#0f172a,#334155)', color:'#fff', border:'none', borderRadius:8, fontSize:'0.85rem', fontWeight:700, cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Saving…' : biz ? 'Save Changes' : 'Create Business'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Business Detail View ─────────────────────────────────────────────────────
function BizDetail({ biz, onBack, onRefresh }: { biz: any; onBack: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<'overview' | 'customers' | 'staff' | 'sales' | 'orders'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadData = useCallback(async (t: typeof tab) => {
    setLoading(true);
    try {
      if (t === 'overview') { const d = await superAdmin.getOverview(biz.id); setOverview(d); }
      else if (t === 'customers') { setRows(await superAdmin.getCustomers(biz.id)); }
      else if (t === 'staff') { setRows(await superAdmin.getStaff(biz.id)); }
      else if (t === 'sales') { setRows(await superAdmin.getSales(biz.id)); }
      else if (t === 'orders') { setRows(await superAdmin.getOrders(biz.id)); }
    } finally { setLoading(false); }
  }, [biz.id]);

  useEffect(() => { loadData(tab); }, [tab, loadData]);

  async function toggleStatus() {
    if (biz.status === 'Active') await superAdmin.suspendBusiness(biz.id);
    else await superAdmin.activateBusiness(biz.id);
    onRefresh();
  }

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <BarChart2 size={14} /> },
    { id: 'customers', label: 'Customers', icon: <Users size={14} /> },
    { id: 'staff', label: 'Staff', icon: <UserCheck size={14} /> },
    { id: 'sales', label: 'Sales', icon: <DollarSign size={14} /> },
    { id: 'orders', label: 'Orders', icon: <Package size={14} /> },
  ] as const;

  return (
    <div>
      {editing && <BizModal biz={biz} onClose={() => setEditing(false)} onSave={() => { setEditing(false); onRefresh(); }} />}

      {/* Header */}
      <div style={{ background:'#fff', borderRadius:12, padding:'16px 20px', marginBottom:16, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={onBack} style={{ background:'#F3F4F6', border:'none', borderRadius:8, padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', fontWeight:600, color:'#374151' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'1.05rem', fontWeight:800, color:'#111827' }}>{biz.business_name}</div>
          <div style={{ fontSize:'0.78rem', color:'#6B7280' }}>
            <span style={{ marginRight:12 }}>ID: <b>{biz.user_id}</b></span>
            <span style={{ marginRight:12 }}>@{biz.username}</span>
            <span style={{ background: STATUS_COLOR[biz.status]+'20', color: STATUS_COLOR[biz.status], padding:'2px 8px', borderRadius:20, fontWeight:700, fontSize:'0.72rem' }}>{biz.status}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setEditing(true)} style={{ background:'#F3F4F6', border:'none', borderRadius:8, padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', fontWeight:600 }}>
            <Edit2 size={13} /> Edit
          </button>
          <button onClick={toggleStatus} style={{ background: biz.status==='Active'?'#FEF2F2':'#F0FDF4', border:'none', borderRadius:8, padding:'7px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:'0.82rem', fontWeight:600, color: biz.status==='Active'?'#DC2626':'#16a34a' }}>
            {biz.status === 'Active' ? <><Ban size={13} /> Suspend</> : <><CheckCircle size={13} /> Activate</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.82rem', fontWeight:700, background: tab===t.id ? '#0f172a' : '#fff', color: tab===t.id ? '#fff' : '#6B7280', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', transition:'all 0.15s' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6B7280' }}><RefreshCw size={20} style={{ animation:'spin 1s linear infinite' }} /></div>
      ) : (
        <>
          {/* OVERVIEW */}
          {tab === 'overview' && overview && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
                <StatCard icon={<Users size={18}/>} label="Customers" value={fmt(overview.customers)} color="#2563EB" />
                <StatCard icon={<UserCheck size={18}/>} label="Staff" value={fmt(overview.staff)} color="#7C3AED" />
                <StatCard icon={<DollarSign size={18}/>} label="Total Revenue" value={`Rs.${fmt(overview.total_revenue)}`} color="#16a34a" />
                <StatCard icon={<ShoppingCart size={18}/>} label="Total Sales" value={fmt(overview.total_sales)} color="#EA580C" />
                <StatCard icon={<Package size={18}/>} label="Active Orders" value={fmt(overview.active_orders)} color="#0891B2" />
                <StatCard icon={<TrendingUp size={18}/>} label="Expenses" value={`Rs.${fmt(overview.total_expenses)}`} color="#DC2626" />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Top Customers */}
                <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#374151', marginBottom:12 }}>Top Customers</div>
                  {(overview.top_customers || []).length === 0 ? <div style={{ color:'#9CA3AF', fontSize:'0.8rem' }}>No data</div> : (
                    (overview.top_customers as any[]).map((c: any, i: number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:i<overview.top_customers.length-1?'1px solid #F3F4F6':'none' }}>
                        <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#111827' }}>{c.name}</div>
                        <div style={{ fontSize:'0.8rem', color:'#16a34a', fontWeight:700 }}>Rs.{fmt(c.rev)}</div>
                      </div>
                    ))
                  )}
                </div>
                {/* Monthly Sales */}
                <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#374151', marginBottom:12 }}>Monthly Sales</div>
                  {(overview.monthly_sales || []).length === 0 ? <div style={{ color:'#9CA3AF', fontSize:'0.8rem' }}>No data</div> : (
                    (overview.monthly_sales as any[]).slice(0,6).map((m: any, i: number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0' }}>
                        <div style={{ fontSize:'0.8rem', color:'#6B7280' }}>{m.m}</div>
                        <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#111827' }}>Rs.{fmt(m.total)}</div>
                      </div>
                    ))
                  )}
                </div>
                {/* Recent Orders */}
                <div style={{ gridColumn:'1/-1', background:'#fff', borderRadius:12, padding:'16px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#374151', marginBottom:12 }}>Recent Orders</div>
                  {(overview.recent_orders || []).length === 0 ? <div style={{ color:'#9CA3AF', fontSize:'0.8rem' }}>No orders</div> : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
                      <thead><tr style={{ background:'#F9FAFB' }}>
                        {['Order No','Customer','Amount','Status','Date'].map(h => <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>{(overview.recent_orders as any[]).map((o: any, i: number) => (
                        <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                          <td style={{ padding:'7px 10px', fontWeight:600 }}>{o.order_no}</td>
                          <td style={{ padding:'7px 10px', color:'#374151' }}>{o.customer}</td>
                          <td style={{ padding:'7px 10px', color:'#16a34a', fontWeight:600 }}>Rs.{fmt(o.total_amount)}</td>
                          <td style={{ padding:'7px 10px' }}>
                            <span style={{ background: o.status==='Delivered'?'#F0FDF4':o.status==='Cancelled'?'#FEF2F2':'#EFF6FF', color: o.status==='Delivered'?'#16a34a':o.status==='Cancelled'?'#DC2626':'#2563EB', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{o.status}</span>
                          </td>
                          <td style={{ padding:'7px 10px', color:'#9CA3AF' }}>{o.created_at?.slice(0,10)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CUSTOMERS */}
          {tab === 'customers' && (
            <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead><tr style={{ background:'#F9FAFB' }}>
                  {['Code','Name','Company','Phone','City','Status','Joined'].map(h => <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#2563EB' }}>{r.customer_code}</td>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{r.name}</td>
                    <td style={{ padding:'9px 14px', color:'#6B7280' }}>{r.company_name || '—'}</td>
                    <td style={{ padding:'9px 14px', color:'#374151' }}>{r.mobile || '—'}</td>
                    <td style={{ padding:'9px 14px', color:'#374151' }}>{r.city || '—'}</td>
                    <td style={{ padding:'9px 14px' }}><span style={{ background: r.status==='Active'?'#F0FDF4':'#FEF2F2', color: r.status==='Active'?'#16a34a':'#DC2626', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{r.status}</span></td>
                    <td style={{ padding:'9px 14px', color:'#9CA3AF' }}>{r.created_at?.slice(0,10)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {rows.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>No customers</div>}
            </div>
          )}

          {/* STAFF */}
          {tab === 'staff' && (
            <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead><tr style={{ background:'#F9FAFB' }}>
                  {['ID','Name','Department','Position','Phone','Status'].map(h => <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#7C3AED' }}>{r.staff_id}</td>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{r.name}</td>
                    <td style={{ padding:'9px 14px', color:'#6B7280' }}>{r.dept || '—'}</td>
                    <td style={{ padding:'9px 14px', color:'#374151' }}>{r.position || '—'}</td>
                    <td style={{ padding:'9px 14px', color:'#374151' }}>{r.mobile || '—'}</td>
                    <td style={{ padding:'9px 14px' }}><span style={{ background: r.status==='Active'?'#F0FDF4':'#FEF2F2', color: r.status==='Active'?'#16a34a':'#DC2626', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{r.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {rows.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>No staff</div>}
            </div>
          )}

          {/* SALES */}
          {tab === 'sales' && (
            <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead><tr style={{ background:'#F9FAFB' }}>
                  {['Invoice No','Customer','Date','Amount','Payment'].map(h => <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#2563EB' }}>{r.invoice_no}</td>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{r.customer}</td>
                    <td style={{ padding:'9px 14px', color:'#6B7280' }}>{r.sale_date}</td>
                    <td style={{ padding:'9px 14px', color:'#16a34a', fontWeight:700 }}>{fmtCur(r.total_amount)}</td>
                    <td style={{ padding:'9px 14px' }}><span style={{ background: r.payment_status==='Paid'?'#F0FDF4':r.payment_status==='Due'?'#FEF2F2':'#FFFBEB', color: r.payment_status==='Paid'?'#16a34a':r.payment_status==='Due'?'#DC2626':'#D97706', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{r.payment_status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {rows.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>No sales</div>}
            </div>
          )}

          {/* ORDERS */}
          {tab === 'orders' && (
            <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead><tr style={{ background:'#F9FAFB' }}>
                  {['Order No','Customer','Order Date','Delivery','Amount','Status'].map(h => <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem' }}>{h}</th>)}
                </tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#0891B2' }}>{r.order_no}</td>
                    <td style={{ padding:'9px 14px', fontWeight:600 }}>{r.customer}</td>
                    <td style={{ padding:'9px 14px', color:'#6B7280' }}>{r.order_date}</td>
                    <td style={{ padding:'9px 14px', color:'#6B7280' }}>{r.delivery_date || '—'}</td>
                    <td style={{ padding:'9px 14px', color:'#16a34a', fontWeight:700 }}>{fmtCur(r.total_amount)}</td>
                    <td style={{ padding:'9px 14px' }}><span style={{ background:'#EFF6FF', color:'#2563EB', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{r.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {rows.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>No orders</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Super Admin Panel ───────────────────────────────────────────────────
export default function SuperAdmin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('sa_token') || '');
  const [stats, setStats] = useState<any>(null);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([superAdmin.getStats(), superAdmin.getBusinesses()]);
      setStats(s);
      setBusinesses(b);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (token) loadAll(); }, [token, loadAll]);

  // Refresh selected biz from businesses list
  useEffect(() => {
    if (selected) {
      const fresh = businesses.find(b => b.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }, [businesses]);

  if (!token) return <SALogin onLogin={(t) => { setToken(t); }} />;

  function logout() { sessionStorage.removeItem('sa_token'); setToken(''); }

  const filtered = businesses.filter(b =>
    b.business_name.toLowerCase().includes(search.toLowerCase()) ||
    b.user_id.toLowerCase().includes(search.toLowerCase()) ||
    b.username.toLowerCase().includes(search.toLowerCase())
  );

  async function deleteBiz(id: number) {
    await superAdmin.deleteBusiness(id);
    setConfirmDelete(null);
    loadAll();
  }

  if (selected) {
    return (
      <div style={{ minHeight:'100vh', background:'#F1F5F9', fontFamily:'Inter,system-ui,sans-serif' }}>
        <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Shield size={18} color="#94a3b8" />
            <span style={{ color:'#fff', fontWeight:700, fontSize:'0.9rem' }}>Pandora Super Admin</span>
            <ChevronRight size={14} color="#64748b" />
            <span style={{ color:'#94a3b8', fontSize:'0.85rem' }}>{selected.business_name}</span>
          </div>
          <button onClick={logout} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 16px' }}>
          <BizDetail biz={selected} onBack={() => setSelected(null)} onRefresh={() => { loadAll(); }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F1F5F9', fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Nav */}
      <div style={{ background:'linear-gradient(135deg,#0f172a,#1e3a5f)', padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Shield size={18} color="#94a3b8" />
          <span style={{ color:'#fff', fontWeight:700, fontSize:'0.9rem' }}>Pandora Super Admin</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={loadAll} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'#94a3b8', display:'flex' }}>
            <RefreshCw size={14} style={{ animation: loading?'spin 1s linear infinite':undefined }} />
          </button>
          <button onClick={logout} style={{ background:'rgba(255,255,255,0.1)', border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem' }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'20px 16px' }}>
        {/* Stats */}
        {stats && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
            <StatCard icon={<Building2 size={18}/>} label="Total Businesses" value={stats.total_businesses} color="#0f172a" />
            <StatCard icon={<CheckCircle size={18}/>} label="Active" value={stats.active_businesses} color="#16a34a" />
            <StatCard icon={<AlertCircle size={18}/>} label="Suspended" value={stats.suspended_businesses} color="#DC2626" />
            <StatCard icon={<Users size={18}/>} label="Total Customers" value={fmt(stats.total_customers)} color="#2563EB" />
            <StatCard icon={<Package size={18}/>} label="Total Orders" value={fmt(stats.total_orders)} color="#EA580C" />
            <StatCard icon={<DollarSign size={18}/>} label="Platform Revenue" value={`Rs.${fmt(stats.platform_revenue)}`} color="#16a34a" />
          </div>
        )}

        {/* Recent Signups */}
        {stats?.recent_businesses?.length > 0 && (
          <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize:'0.85rem', fontWeight:700, color:'#374151', marginBottom:12 }}>Recent Sign-ups</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              {stats.recent_businesses.map((b: any) => (
                <div key={b.id} onClick={() => setSelected(businesses.find(biz => biz.id === b.id))} style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:10, padding:'10px 14px', cursor:'pointer', minWidth:160 }}>
                  <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#111827' }}>{b.business_name}</div>
                  <div style={{ fontSize:'0.72rem', color:'#6B7280', marginTop:2 }}>{b.user_id} · {ago(b.created_at)}</div>
                  <div style={{ marginTop:6 }}><span style={{ background: STATUS_COLOR[b.status]+'20', color: STATUS_COLOR[b.status], padding:'2px 7px', borderRadius:20, fontSize:'0.7rem', fontWeight:700 }}>{b.status}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Businesses Table */}
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid #F3F4F6', flexWrap:'wrap' }}>
            <div style={{ flex:1, fontSize:'0.9rem', fontWeight:800, color:'#111827' }}>Businesses</div>
            <div style={{ position:'relative' }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, width:180, paddingLeft:30 }} />
            </div>
            <button onClick={() => setCreating(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'linear-gradient(135deg,#0f172a,#334155)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:'0.82rem', fontWeight:700 }}>
              <PlusCircle size={14} /> New Business
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
              <thead><tr style={{ background:'#F9FAFB' }}>
                {['Business','User ID / Login','Contact','Plan','Status','Last Login','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:'0.75rem', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id} style={{ borderTop:'1px solid #F3F4F6', background: i%2===0?'#fff':'#FAFAFA' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700, color:'#111827' }}>{b.business_name}</div>
                      {b.notes && <div style={{ fontSize:'0.72rem', color:'#9CA3AF', marginTop:1 }}>{b.notes}</div>}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <Hash size={11} color="#6B7280" />
                        <span style={{ fontWeight:700, color:'#374151' }}>{b.user_id}</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
                        <User size={11} color="#6B7280" />
                        <span style={{ color:'#6B7280', fontSize:'0.78rem' }}>{b.username}</span>
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      {b.contact_name && <div style={{ fontWeight:600, color:'#374151' }}>{b.contact_name}</div>}
                      {b.contact_phone && <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.78rem', color:'#6B7280' }}><Phone size={10}/> {b.contact_phone}</div>}
                      {b.contact_email && <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.78rem', color:'#6B7280' }}><Mail size={10}/> {b.contact_email}</div>}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ background:'#EFF6FF', color:'#2563EB', padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{b.plan}</span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ background: STATUS_COLOR[b.status]+'20', color: STATUS_COLOR[b.status], padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700 }}>{b.status}</span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.78rem', color:'#6B7280' }}>
                        <Calendar size={11} /> {ago(b.last_login)}
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => setSelected(b)} title="View" style={{ background:'#EFF6FF', border:'none', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#2563EB', display:'flex' }}><Eye size={13}/></button>
                        <button onClick={() => setSelected(b)} title="Edit" style={{ background:'#F3F4F6', border:'none', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#374151', display:'flex' }}><Edit2 size={13}/></button>
                        {b.status === 'Active'
                          ? <button onClick={async () => { await superAdmin.suspendBusiness(b.id); loadAll(); }} title="Suspend" style={{ background:'#FEF2F2', border:'none', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#DC2626', display:'flex' }}><Ban size={13}/></button>
                          : <button onClick={async () => { await superAdmin.activateBusiness(b.id); loadAll(); }} title="Activate" style={{ background:'#F0FDF4', border:'none', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#16a34a', display:'flex' }}><CheckCircle size={13}/></button>
                        }
                        <button onClick={() => setConfirmDelete(b)} title="Delete" style={{ background:'#FEF2F2', border:'none', borderRadius:6, padding:'5px 8px', cursor:'pointer', color:'#DC2626', display:'flex' }}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ padding:30, textAlign:'center', color:'#9CA3AF' }}>No businesses found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {creating && <BizModal onClose={() => setCreating(false)} onSave={() => { setCreating(false); loadAll(); }} />}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:14, padding:'28px 28px', width:'100%', maxWidth:380 }}>
            <div style={{ fontSize:'1rem', fontWeight:800, color:'#111827', marginBottom:8 }}>Delete Business?</div>
            <div style={{ fontSize:'0.85rem', color:'#6B7280', marginBottom:20 }}>
              This will permanently delete <b>{confirmDelete.business_name}</b>. This cannot be undone.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding:'9px 18px', background:'#F3F4F6', border:'none', borderRadius:8, fontSize:'0.85rem', cursor:'pointer', fontWeight:600 }}>Cancel</button>
              <button onClick={() => deleteBiz(confirmDelete.id)} style={{ padding:'9px 18px', background:'#DC2626', color:'#fff', border:'none', borderRadius:8, fontSize:'0.85rem', fontWeight:700, cursor:'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}
