import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingCart, Truck,
  Receipt, ClipboardList, FileText, Star, DollarSign,
  Settings, BarChart2, UserCheck, Boxes,
  ShoppingBag, FileCheck, ChevronDown, ChevronRight,
  LayoutGrid, List, FilePlus, Calendar, Plus, GitBranch, Building2, Scan,
  Tag, Package, LogOut
} from 'lucide-react';
import { useState, useEffect } from 'react';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/suppliers', icon: Truck, label: 'Suppliers' },
  { to: '/inventory', icon: Boxes, label: 'Inventory' },
  { to: '/purchases', icon: ShoppingCart, label: 'Purchases' },
  { to: '/expenses', icon: DollarSign, label: 'Expenses' },
  { to: '/reports', icon: BarChart2, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const salesSub = [
  { hash: 'pos', icon: ShoppingBag, label: 'POS', path: null },
  { hash: 'list', icon: FileCheck, label: 'List of Sales', path: null },
  { hash: 'quotations', icon: FileText, label: 'Quotations', path: null },
];
const salesPages = [
  { to: '/price-groups', icon: Tag, label: 'Price Groups' },
  { to: '/addon-items', icon: Package, label: 'Add-on Items' },
];

const ordersSub = [
  { hash: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { hash: 'list', icon: List, label: 'List of Orders' },
  { hash: 'create-sheet', icon: FilePlus, label: 'Create Order Sheet' },
  { hash: 'sheets', icon: FileCheck, label: 'Order Sheets' },
  { hash: 'calendar', icon: Calendar, label: 'Calendar' },
];

const staffSub = [
  { hash: 'list', icon: Users, label: 'Staff List' },
  { hash: 'add', icon: Plus, label: 'Add New' },
  { hash: 'teams', icon: GitBranch, label: 'Teams' },
  { hash: 'departments', icon: Building2, label: 'Departments' },
];

const hrNav = [
  { to: '/employees', icon: Users, label: 'Employees' },
  { to: '/evaluate', icon: Star, label: 'New Evaluation' },
  { to: '/evaluations', icon: FileText, label: 'Evaluations' },
];

export default function Layout({ children, onLogout }: { children: React.ReactNode; onLogout?: () => void }) {
  const loc = useLocation();
  const onSales = loc.pathname === '/sales' || loc.pathname.startsWith('/sales') || loc.pathname === '/price-groups' || loc.pathname === '/addon-items';
  const onOrders = loc.pathname === '/orders' || loc.pathname.startsWith('/orders');
  const onStaff = loc.pathname === '/staff' || loc.pathname.startsWith('/staff');
  const [salesOpen, setSalesOpen] = useState(onSales);
  const [ordersOpen, setOrdersOpen] = useState(onOrders);
  const [staffOpen, setStaffOpen] = useState(onStaff);
  const [companyLogo, setCompanyLogo] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');

  const refreshCompany = () => {
    fetch(`${import.meta.env.VITE_API_BASE || ''}/settings`)
      .then(r => r.json())
      .then((d: any) => {
        const s = d.settings || d;
        if (s) {
          setCompanyLogo(s.company_logo || '');
          setCompanyName(s.name || '');
          localStorage.setItem('pandora_company', JSON.stringify({ logo: s.company_logo || '', name: s.name || '' }));
        }
      }).catch(() => {});
  };

  useEffect(() => {
    // Load logo + name from settings (cached in localStorage for speed)
    const cached = localStorage.getItem('pandora_company');
    if (cached) { try { const c = JSON.parse(cached); setCompanyLogo(c.logo || ''); setCompanyName(c.name || ''); } catch (_) {} }
    // Always refresh from API
    refreshCompany();
    // Listen for settings saved event (dispatched from Settings page)
    const onSettingsSaved = () => refreshCompany();
    window.addEventListener('pandora_settings_saved', onSettingsSaved);
    return () => window.removeEventListener('pandora_settings_saved', onSettingsSaved);
  }, []);

  const isActive = (to: string) =>
    to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(to);

  const activeHash = loc.hash.replace('#', '') || 'pos';

  const expandBtn = (label: string, icon: React.ElementType, isOn: boolean, toggle: () => void, open: boolean) => {
    const Icon = icon;
    return (
      <button
        onClick={toggle}
        className={`sidebar-group-btn${isOn ? ' active' : ''}`}
        style={{ color: isOn ? 'var(--red)' : undefined, borderLeftColor: isOn ? 'var(--red)' : undefined }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={15} /> {label}
        </span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
    );
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '18px 16px 14px', textAlign: 'center' }}>
          {companyLogo
            ? <img src={companyLogo} alt="Logo" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'contain', background: '#fff', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }} />
            : <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0, letterSpacing: '-0.02em' }}>PG</div>
          }
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', lineHeight: 1.2, color: 'var(--text)' }}>{companyName || 'Pandora Garments'}</div>
            <div style={{ fontSize: '0.63rem', color: 'var(--text3)', marginTop: 2 }}>Management System</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {/* Dashboard + Customers + Suppliers + Inventory + Purchases */}
          {nav.slice(0, 5).map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={isActive(to) ? 'active' : ''}>
              <Icon size={15} /> {label}
            </Link>
          ))}

          {/* Sales — expandable */}
          {expandBtn('Sales', Receipt, onSales, () => setSalesOpen(o => !o), salesOpen)}
          {salesOpen && (
            <div style={{ paddingLeft: 12 }}>
              {salesSub.map(({ hash, icon: Icon, label }) => (
                <Link
                  key={hash}
                  to={`/sales#${hash}`}
                  className={`sidebar-sub-item${(onSales && loc.pathname === '/sales' && (activeHash === hash || (hash === 'quotations' && activeHash === 'new-quotation'))) ? ' active' : ''}`}
                >
                  <Icon size={13} /> {label}
                </Link>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 4px 4px 0' }} />
              {salesPages.map(({ to, icon: Icon, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`sidebar-sub-item${loc.pathname === to ? ' active' : ''}`}
                >
                  <Icon size={13} /> {label}
                </Link>
              ))}
            </div>
          )}

          {/* Order Management — expandable */}
          {expandBtn('Order Management', ClipboardList, onOrders, () => setOrdersOpen(o => !o), ordersOpen)}
          {ordersOpen && (
            <div style={{ paddingLeft: 12 }}>
              {ordersSub.map(({ hash, icon: Icon, label }) => (
                <Link
                  key={hash}
                  to={`/orders#${hash}`}
                  className={`sidebar-sub-item${(onOrders && activeHash === hash) ? ' active' : ''}`}
                >
                  <Icon size={13} /> {label}
                </Link>
              ))}
            </div>
          )}

          {/* Staff Management — expandable */}
          {expandBtn('Staff Management', UserCheck, onStaff, () => setStaffOpen(o => !o), staffOpen)}
          {staffOpen && (
            <div style={{ paddingLeft: 12 }}>
              {staffSub.map(({ hash, icon: Icon, label }) => (
                <Link
                  key={hash}
                  to={`/staff#${hash}`}
                  className={`sidebar-sub-item${(onStaff && activeHash === hash) ? ' active' : ''}`}
                >
                  <Icon size={13} /> {label}
                </Link>
              ))}
            </div>
          )}

          {/* Expenses, Reports, Settings */}
          {nav.slice(5).map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={isActive(to) ? 'active' : ''}>
              <Icon size={15} /> {label}
            </Link>
          ))}

          <div style={{ padding: '8px 16px 4px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8 }}>
            HR Module
          </div>
          {hrNav.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={isActive(to) ? 'active' : ''}>
              <Icon size={15} /> {label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.72rem', flexShrink: 0, letterSpacing: '0.02em' }}>AX70</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Admin</div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text3)' }}>Administrator</div>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign out"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3)', padding: 4, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color 0.15s, background 0.15s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main className="main">
        {!(onSales && activeHash === 'pos') && !(onOrders && (activeHash === 'create-sheet')) && (
          <Link
            to="/sales#pos"
            style={{
              position: 'fixed', bottom: 28, right: 28, zIndex: 200,
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--red)', color: '#fff',
              padding: '12px 20px', borderRadius: 50,
              fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(192,0,26,0.45)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(192,0,26,0.55)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(192,0,26,0.45)'; }}
          >
            <Scan size={16} /> POS
          </Link>
        )}
        {children}
      </main>
    </div>
  );
}
