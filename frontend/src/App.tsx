import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import PriceGroups from './pages/PriceGroups';
import AddonItems from './pages/AddonItems';
import Orders from './pages/Orders';
import Staff from './pages/Staff';
import Expenses from './pages/Expenses';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Evaluate from './pages/Evaluate';
import Evaluations from './pages/Evaluations';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10000 } } });

function isLoggedIn() {
  try {
    return !!sessionStorage.getItem('pandora_auth');
  } catch {
    return false;
  }
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Layout onLogout={() => { sessionStorage.removeItem('pandora_auth'); setAuthed(false); }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/price-groups" element={<PriceGroups />} />
            <Route path="/addon-items" element={<AddonItems />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/employees" element={<Employees />} />
            <Route path="/evaluate" element={<Evaluate />} />
            <Route path="/evaluations" element={<Evaluations />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
