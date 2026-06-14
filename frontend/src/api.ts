const BASE = 'https://pixal.pandoralk.workers.dev';

async function req(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  // ── Employees (legacy) ──────────────────────────────────
  getEmployees: () => req('/employees').then(d => d.employees),
  createEmployee: (data: object) => req('/employees', 'POST', data).then(d => d.employee),
  updateEmployee: (id: number, data: object) => req(`/employees/${id}`, 'PUT', data).then(d => d.employee),
  deleteEmployee: (id: number) => req(`/employees/${id}`, 'DELETE'),

  // ── Evaluations (legacy) ─────────────────────────────────
  getEvaluations: (params?: { month?: string; employeeId?: number }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set('month', params.month);
    if (params?.employeeId) qs.set('employeeId', String(params.employeeId));
    return req(`/evaluations?${qs}`).then(d => d.evaluations);
  },
  getEvaluation: (id: number) => req(`/evaluations/${id}`).then(d => d.evaluation),
  createEvaluation: (data: object) => req('/evaluations', 'POST', data).then(d => d.evaluation),
  updateEvaluation: (id: number, data: object) => req(`/evaluations/${id}`, 'PUT', data).then(d => d.evaluation),
  deleteEvaluation: (id: number) => req(`/evaluations/${id}`, 'DELETE'),
  getEvaluationSummary: (params?: { month?: string }) => {
    const qs = new URLSearchParams();
    if (params?.month) qs.set('month', params.month);
    return req(`/evaluations/summary?${qs}`).then(d => d.summaries as any[]);
  },

  // ── Dashboard ────────────────────────────────────────────
  getDashboard: (month?: string) => req(`/dashboard${month ? `?month=${month}` : ''}`),

  // ── Reports ──────────────────────────────────────────────
  getReport: (type: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams(params || {});
    return req(`/reports/${type}?${qs}`);
  },

  // ── Customers ────────────────────────────────────────────
  getCustomers: (params?: { search?: string; type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.type) qs.set('type', params.type);
    return req(`/customers?${qs}`).then(d => d.customers);
  },
  checkCustomerPhone: (phone: string, excludeId?: number) => {
    const qs = new URLSearchParams({ phone });
    if (excludeId) qs.set('exclude_id', String(excludeId));
    return req(`/customers/check-phone?${qs}`);
  },
  getCustomerTypes: () => req('/customer-types').then(d => d.types as string[]),
  addCustomerType: (name: string) => req('/customer-types', 'POST', { name }).then(d => d.types as string[]),
  getCustomer: (id: number) => req(`/customers/${id}`).then(d => d.customer),
  getCustomerPosData: (id: number) => req(`/customers/${id}/pos`),
  createCustomer: (data: object) => req('/customers', 'POST', data).then(d => d.customer),
  updateCustomer: (id: number, data: object) => req(`/customers/${id}`, 'PUT', data).then(d => d.customer),
  deleteCustomer: (id: number) => req(`/customers/${id}`, 'DELETE'),

  // ── Suppliers ────────────────────────────────────────────
  getSuppliers: (params?: { search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    return req(`/suppliers?${qs}`).then(d => d.suppliers);
  },
  checkSupplierPhone: (phone: string, excludeId?: number) => {
    const qs = new URLSearchParams({ phone });
    if (excludeId) qs.set('exclude_id', String(excludeId));
    return req(`/suppliers/check-phone?${qs}`);
  },
  getSupplier: (id: number) => req(`/suppliers/${id}`).then(d => d.supplier),
  createSupplier: (data: object) => req('/suppliers', 'POST', data).then(d => d.supplier),
  updateSupplier: (id: number, data: object) => req(`/suppliers/${id}`, 'PUT', data).then(d => d.supplier),
  deleteSupplier: (id: number) => req(`/suppliers/${id}`, 'DELETE'),

  // ── Inventory ────────────────────────────────────────────
  getItems: (params?: { search?: string; category?: string; low_stock?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.low_stock) qs.set('low_stock', '1');
    return req(`/items?${qs}`).then(d => d.items);
  },
  getItem: (id: number) => req(`/items/${id}`).then(d => d.item),
  createItem: (data: object) => req('/items', 'POST', data).then(d => d.item),
  updateItem: (id: number, data: object) => req(`/items/${id}`, 'PUT', data).then(d => d.item),
  deleteItem: (id: number) => req(`/items/${id}`, 'DELETE'),
  adjustStock: (id: number, data: { type: 'add' | 'deduct'; qty: number; note?: string }) =>
    req(`/items/${id}/stock`, 'POST', data),
  getStockHistory: (id: number) => req(`/items/${id}/history`).then(d => d.history),
  setItemStatus: (id: number, action: 'suspend' | 'activate' | 'not-for-sale') =>
    req(`/items/${id}/${action}`, 'PUT', {}),

  // ── Purchases ────────────────────────────────────────────
  getPurchases: (params?: { search?: string; supplier_id?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.supplier_id) qs.set('supplier_id', String(params.supplier_id));
    if (params?.status) qs.set('status', params.status);
    return req(`/purchases?${qs}`).then(d => d.purchases);
  },
  getPurchase: (id: number) => req(`/purchases/${id}`), // returns { purchase, items }
  createPurchase: (data: object) => req('/purchases', 'POST', data),
  updatePurchase: (id: number, data: object) => req(`/purchases/${id}`, 'PUT', data),

  // ── Sales / Invoices ─────────────────────────────────────
  getInvoices: (params?: { search?: string; customer_id?: number; status?: string; exclude_ordered?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.customer_id) qs.set('customer_id', String(params.customer_id));
    if (params?.status) qs.set('status', params.status);
    if (params?.exclude_ordered) qs.set('exclude_ordered', '1');
    return req(`/sales?${qs}`).then(d => d.sales);
  },
  getInvoice: (id: number) => req(`/sales/${id}`).then(d => d),
  createInvoice: (data: object) => req('/sales', 'POST', data).then(d => d.sale),
  updateInvoice: (id: number, data: object) => req(`/sales/${id}`, 'PUT', data).then(d => d.sale),
  deleteInvoice: (id: number) => req(`/sales/${id}`, 'DELETE'),

  // ── Quotations ───────────────────────────────────────────
  getQuotations: (params?: { search?: string; customer_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.customer_id) qs.set('customer_id', String(params.customer_id));
    return req(`/quotations?${qs}`).then(d => d.quotations);
  },
  getQuotation: (id: number) => req(`/quotations/${id}`).then(d => d.quotation),
  createQuotation: (data: object) => req('/quotations', 'POST', data).then(d => d.quotation),
  convertQuotation: (id: number) => req(`/quotations/${id}`, 'PUT', { status: 'Converted' }),

  // ── Orders ───────────────────────────────────────────────
  getOrders: (params?: { search?: string; customer_id?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.customer_id) qs.set('customer_id', String(params.customer_id));
    if (params?.status) qs.set('status', params.status);
    return req(`/orders?${qs}`); // returns { orders, stats }
  },
  getOrder: (id: number) => req(`/orders/${id}`), // returns { order, sizes }
  createOrder: (data: object) => req('/orders', 'POST', data),
  updateOrder: (id: number, data: object) => req(`/orders/${id}`, 'PUT', data),
  patchOrder: (id: number, data: object) => req(`/orders/${id}`, 'PATCH', data),
  deleteOrder: (id: number) => req(`/orders/${id}`, 'DELETE'),

  // ── Staff ────────────────────────────────────────────────
  getStaff: (params?: { search?: string; department_id?: number; team_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.department_id) qs.set('department_id', String(params.department_id));
    if (params?.team_id) qs.set('team_id', String(params.team_id));
    return req(`/staff?${qs}`).then(d => d.staff);
  },
  getStaffMember: (id: number) => req(`/staff/${id}`).then(d => d.staff),
  createStaff: (data: object) => req('/staff', 'POST', data).then(d => d.staff),
  updateStaff: (id: number, data: object) => req(`/staff/${id}`, 'PUT', data).then(d => d.staff),
  deleteStaff: (id: number) => req(`/staff/${id}`, 'DELETE'),

  getDepartments: () => req('/departments').then(d => d.departments),
  createDepartment: (data: object) => req('/departments', 'POST', data).then(d => d.department),
  updateDepartment: (id: number, data: object) => req(`/departments/${id}`, 'PUT', data).then(d => d.department),
  deleteDepartment: (id: number) => req(`/departments/${id}`, 'DELETE'),

  getTeams: () => req('/teams').then(d => d.teams),
  createTeam: (data: object) => req('/teams', 'POST', data).then(d => d.team),
  updateTeam: (id: number, data: object) => req(`/teams/${id}`, 'PUT', data).then(d => d.team),
  deleteTeam: (id: number) => req(`/teams/${id}`, 'DELETE'),

  // ── Expenses ─────────────────────────────────────────────
  getExpenses: (params?: { search?: string; category?: string; month?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.month) qs.set('month', params.month);
    return req(`/expenses?${qs}`).then(d => d.expenses);
  },
  createExpense: (data: object) => req('/expenses', 'POST', data).then(d => d.expense),
  updateExpense: (id: number, data: object) => req(`/expenses/${id}`, 'PUT', data).then(d => d.expense),
  deleteExpense: (id: number) => req(`/expenses/${id}`, 'DELETE'),
  getExpenseCategories: () => req('/expense-categories').then(d => d.categories),
  createExpenseCategory: (name: string) => req('/expense-categories', 'POST', { name }).then(d => d.category),
  updateExpenseCategory: (id: number, name: string) => req(`/expense-categories/${id}`, 'PUT', { name }).then(d => d.category),
  deleteExpenseCategory: (id: number) => req(`/expense-categories/${id}`, 'DELETE'),
  getExpensePayers: () => req('/expense-payers').then(d => d.payers),
  createExpensePayer: (name: string) => req('/expense-payers', 'POST', { name }).then(d => d.payer),
  updateExpensePayer: (id: number, name: string) => req(`/expense-payers/${id}`, 'PUT', { name }).then(d => d.payer),
  deleteExpensePayer: (id: number) => req(`/expense-payers/${id}`, 'DELETE'),

  // ── Settings ─────────────────────────────────────────────
  getSettings: () => req('/settings').then(d => d.settings),
  updateSettings: (data: object) => req('/settings', 'PUT', data),

  // ── Price Groups ──────────────────────────────────────────
  getPriceGroups: () => req('/price-groups').then(d => d.price_groups as any[]),
  createPriceGroup: (data: object) => req('/price-groups', 'POST', data),
  updatePriceGroup: (id: number, data: object) => req(`/price-groups/${id}`, 'PUT', data),
  deletePriceGroup: (id: number) => req(`/price-groups/${id}`, 'DELETE'),

  // ── Addon Items ────────────────────────────────────────────
  getOrderProductTypes: () => req('/order-product-types').then(d => d.types as { id: number; name: string }[]),
  createOrderProductType: (name: string) => req('/order-product-types', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderProductType: (id: number, name: string) => req(`/order-product-types/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderProductType: (id: number) => req(`/order-product-types/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  getOrderFabricTypes: () => req('/order-fabric-types').then(d => d.types as { id: number; name: string }[]),
  createOrderFabricType: (name: string) => req('/order-fabric-types', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderFabricType: (id: number, name: string) => req(`/order-fabric-types/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderFabricType: (id: number) => req(`/order-fabric-types/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  // Garment spec types
  getOrderCollarTypes: () => req('/order-collar-types').then(d => d.types as { id: number; name: string }[]),
  createOrderCollarType: (name: string) => req('/order-collar-types', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderCollarType: (id: number, name: string) => req(`/order-collar-types/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderCollarType: (id: number) => req(`/order-collar-types/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  getOrderSleeveTypes: () => req('/order-sleeve-types').then(d => d.types as { id: number; name: string }[]),
  createOrderSleeveType: (name: string) => req('/order-sleeve-types', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderSleeveType: (id: number, name: string) => req(`/order-sleeve-types/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderSleeveType: (id: number) => req(`/order-sleeve-types/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  getOrderButtonTypes: () => req('/order-button-types').then(d => d.types as { id: number; name: string }[]),
  createOrderButtonType: (name: string) => req('/order-button-types', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderButtonType: (id: number, name: string) => req(`/order-button-types/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderButtonType: (id: number) => req(`/order-button-types/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  getOrderTagNames: () => req('/order-tag-names').then(d => d.types as { id: number; name: string }[]),
  createOrderTagName: (name: string) => req('/order-tag-names', 'POST', { name }).then(d => d.types as { id: number; name: string }[]),
  updateOrderTagName: (id: number, name: string) => req(`/order-tag-names/${id}`, 'PUT', { name }).then(d => d.types as { id: number; name: string }[]),
  deleteOrderTagName: (id: number) => req(`/order-tag-names/${id}`, 'DELETE').then(d => d.types as { id: number; name: string }[]),

  getAddonItems: () => req('/addon-items').then(d => d.addon_items as any[]),
  createAddonItem: (data: object) => req('/addon-items', 'POST', data),
  updateAddonItem: (id: number, data: object) => req(`/addon-items/${id}`, 'PUT', data),
  deleteAddonItem: (id: number) => req(`/addon-items/${id}`, 'DELETE'),

  sendWA: (payload: { to: string; message?: string; template_name?: string; template_lang?: string; template_params?: string[] }) =>
    req('/wa/send', 'POST', payload),
  login: (user_id: string, username: string, password: string) => loginUser(user_id, username, password),
};

// ─── AUTH ────────────────────────────────────────────────────────────────────
export async function loginUser(user_id: string, username: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, username, password }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

// ─── SUPER ADMIN ─────────────────────────────────────────────────────────────
function saToken() { return sessionStorage.getItem('sa_token') || ''; }

async function saReq(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Super-Token': saToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const superAdmin = {
  login: async (password: string) => {
    const res = await fetch(`${BASE}/superadmin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data;
  },
  getStats: () => saReq('/superadmin/stats'),
  getBusinesses: () => saReq('/superadmin/businesses').then(d => d.businesses as any[]),
  createBusiness: (data: object) => saReq('/superadmin/businesses', 'POST', data),
  updateBusiness: (id: number, data: object) => saReq(`/superadmin/businesses/${id}`, 'PUT', data),
  suspendBusiness: (id: number) => saReq(`/superadmin/businesses/${id}/suspend`, 'PATCH'),
  activateBusiness: (id: number) => saReq(`/superadmin/businesses/${id}/activate`, 'PATCH'),
  deleteBusiness: (id: number) => saReq(`/superadmin/businesses/${id}`, 'DELETE'),
  getOverview: (id: number) => saReq(`/superadmin/businesses/${id}/overview`),
  getCustomers: (id: number) => saReq(`/superadmin/businesses/${id}/customers`).then(d => d.customers as any[]),
  getStaff: (id: number) => saReq(`/superadmin/businesses/${id}/staff`).then(d => d.staff as any[]),
  getSales: (id: number) => saReq(`/superadmin/businesses/${id}/sales`).then(d => d.sales as any[]),
  getOrders: (id: number) => saReq(`/superadmin/businesses/${id}/orders`).then(d => d.orders as any[]),
};
