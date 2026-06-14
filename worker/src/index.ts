export interface Env { pandora_db: D1Database; ASSETS: Fetcher; SUPER_ADMIN_PASSWORD?: string; }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}
function err(msg: string, status = 400) { return json({ error: msg }, status); }

function gradeLabel(pct: number) {
  if (pct >= 90) return 'Excellent';
  if (pct >= 80) return 'Very Good';
  if (pct >= 70) return 'Good';
  if (pct >= 60) return 'Average';
  return 'Needs Improvement';
}

async function nextSeq(db: D1Database, field: string, prefix: string): Promise<string> {
  const row = await db.prepare(`SELECT ${field}, ${field.replace('_seq','_prefix')} as pfx FROM company_settings WHERE id=1`).first<any>();
  const seq = (row?.[field] ?? 1);
  const pfx = row?.pfx ?? prefix;
  await db.prepare(`UPDATE company_settings SET ${field}=${field}+1 WHERE id=1`).run();
  return `${pfx}-${String(seq).padStart(4,'0')}`;
}

async function nextInvoiceNo(db: D1Database): Promise<string> {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const currentMonth = `${mm}${yy}`;

  const row = await db.prepare(`SELECT invoice_seq, invoice_month FROM company_settings WHERE id=1`).first<any>();
  let seq = row?.invoice_seq ?? 1;

  // Reset sequence if month changed
  if ((row?.invoice_month ?? '') !== currentMonth) {
    seq = 1;
    await db.prepare(`UPDATE company_settings SET invoice_seq=2, invoice_month=? WHERE id=1`).bind(currentMonth).run();
  } else {
    await db.prepare(`UPDATE company_settings SET invoice_seq=invoice_seq+1 WHERE id=1`).run();
  }

  return `${currentMonth}${String(seq).padStart(3, '0')}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // Browser navigation requests (page loads / refreshes / deep links) want HTML.
    // Serve the SPA for these even when the path collides with an API route name,
    // so client-side routes like /customers work on direct load & refresh.
    const isNavigation =
      method === 'GET' &&
      (request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
        (request.headers.get('Accept') || '').includes('text/html'));
    if (isNavigation && path !== '/' && !path.startsWith('/assets/')) {
      return env.ASSETS.fetch(request);
    }

    if (path === '/health') return json({ status: 'ok' });

    // ─── AUTH: LOGIN ─────────────────────────────────────────────────────────
    if (method === 'POST' && path === '/auth/login') {
      const b: any = await request.json();
      const { user_id, username, password } = b;
      if (!user_id || !username || !password) return err('All fields required', 400);
      const row = await env.pandora_db.prepare(
        `SELECT id, user_id, username, business_name, status FROM businesses WHERE user_id=? AND username=? AND password_hash=?`
      ).bind(user_id, username, password).first<any>();
      if (!row) return err('Invalid User ID, username or password', 401);
      if (row.status !== 'Active') return err('Account suspended. Contact administrator.', 403);
      await env.pandora_db.prepare(`UPDATE businesses SET last_login=datetime('now') WHERE id=?`).bind(row.id).run();
      return json({ ok: true, user: { id: row.id, user_id: row.user_id, username: row.username, business_name: row.business_name } });
    }

    // ─── SUPERADMIN AUTH ─────────────────────────────────────────────────────
    const SUPER_PWD = env.SUPER_ADMIN_PASSWORD || 'Pandora@SuperAdmin2025';
    if (method === 'POST' && path === '/superadmin/login') {
      const b: any = await request.json();
      if (b.password !== SUPER_PWD) return err('Invalid password', 401);
      return json({ ok: true, token: 'sa_' + btoa(SUPER_PWD).slice(0,16) });
    }

    // Protect all /superadmin/* routes
    if (path.startsWith('/superadmin/') && path !== '/superadmin/login') {
      const auth = request.headers.get('X-Super-Token');
      const expected = 'sa_' + btoa(SUPER_PWD).slice(0,16);
      if (auth !== expected) return err('Unauthorized', 401);
    }

    // ─── SUPERADMIN: BUSINESSES ───────────────────────────────────────────────
    if (path === '/superadmin/businesses') {
      if (method === 'GET') {
        const rows = await env.pandora_db.prepare(`SELECT id, user_id, username, business_name, contact_name, contact_email, contact_phone, plan, status, notes, created_at, last_login FROM businesses ORDER BY created_at DESC`).all<any>();
        return json({ businesses: rows.results });
      }
      if (method === 'POST') {
        const b: any = await request.json();
        const { user_id, username, password, business_name, contact_name, contact_email, contact_phone, plan, notes } = b;
        if (!user_id || !username || !password || !business_name) return err('user_id, username, password, business_name required', 400);
        const existing = await env.pandora_db.prepare(`SELECT id FROM businesses WHERE user_id=? OR username=?`).bind(user_id, username).first<any>();
        if (existing) return err('User ID or username already exists', 409);
        const r = await env.pandora_db.prepare(
          `INSERT INTO businesses (user_id,username,password_hash,business_name,contact_name,contact_email,contact_phone,plan,notes) VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(user_id, username, password, business_name, contact_name||null, contact_email||null, contact_phone||null, plan||'Standard', notes||null).run();
        const row = await env.pandora_db.prepare(`SELECT * FROM businesses WHERE id=?`).bind(r.meta.last_row_id).first<any>();
        return json({ business: row }, 201);
      }
    }

    if (path.startsWith('/superadmin/businesses/')) {
      const parts = path.split('/');
      const biz_id = parseInt(parts[3]);
      const sub = parts[4] || '';
      if (isNaN(biz_id)) return err('Invalid id', 400);

      if (method === 'PUT' && !sub) {
        const b: any = await request.json();
        const allowed = ['business_name','contact_name','contact_email','contact_phone','plan','notes','password_hash'];
        const fields: string[] = [];
        const vals: any[] = [];
        for (const k of allowed) { if (b[k] !== undefined) { fields.push(`${k}=?`); vals.push(b[k]); } }
        if (b.password) { fields.push('password_hash=?'); vals.push(b.password); }
        if (!fields.length) return err('Nothing to update', 400);
        vals.push(biz_id);
        await env.pandora_db.prepare(`UPDATE businesses SET ${fields.join(',')} WHERE id=?`).bind(...vals).run();
        const row = await env.pandora_db.prepare(`SELECT id,user_id,username,business_name,contact_name,contact_email,contact_phone,plan,status,notes,created_at,last_login FROM businesses WHERE id=?`).bind(biz_id).first<any>();
        return json({ business: row });
      }

      if (method === 'PATCH' && sub === 'suspend') {
        await env.pandora_db.prepare(`UPDATE businesses SET status='Suspended' WHERE id=?`).bind(biz_id).run();
        return json({ ok: true, status: 'Suspended' });
      }
      if (method === 'PATCH' && sub === 'activate') {
        await env.pandora_db.prepare(`UPDATE businesses SET status='Active' WHERE id=?`).bind(biz_id).run();
        return json({ ok: true, status: 'Active' });
      }
      if (method === 'DELETE' && !sub) {
        await env.pandora_db.prepare(`DELETE FROM businesses WHERE id=?`).bind(biz_id).run();
        return json({ ok: true });
      }

      // ── Per-business data views ──────────────────────────────────────────
      if (method === 'GET' && sub === 'overview') {
        const [cust, staff, sales, orders, expenses, topCust, recentOrders, monthlySales] = await Promise.all([
          env.pandora_db.prepare(`SELECT COUNT(*) c FROM customers WHERE status='Active'`).first<any>(),
          env.pandora_db.prepare(`SELECT COUNT(*) c FROM staff WHERE status='Active'`).first<any>(),
          env.pandora_db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total_amount),0) s FROM sales`).first<any>(),
          env.pandora_db.prepare(`SELECT COUNT(*) c FROM orders WHERE status NOT IN ('Delivered','Collected','Cancelled')`).first<any>(),
          env.pandora_db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM expenses`).first<any>(),
          env.pandora_db.prepare(`SELECT c.name, COUNT(s.id) cnt, COALESCE(SUM(s.total_amount),0) rev FROM sales s JOIN customers c ON c.id=s.customer_id GROUP BY c.id ORDER BY rev DESC LIMIT 5`).all<any>(),
          env.pandora_db.prepare(`SELECT o.order_no, c.name customer, o.total_amount, o.status, o.created_at FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 10`).all<any>(),
          env.pandora_db.prepare(`SELECT strftime('%Y-%m',sale_date) m, ROUND(SUM(total_amount),2) total FROM sales GROUP BY m ORDER BY m DESC LIMIT 12`).all<any>(),
        ]);
        return json({
          customers: cust?.c ?? 0,
          staff: staff?.c ?? 0,
          total_sales: sales?.c ?? 0,
          total_revenue: sales?.s ?? 0,
          active_orders: orders?.c ?? 0,
          total_expenses: expenses?.s ?? 0,
          top_customers: topCust.results,
          recent_orders: recentOrders.results,
          monthly_sales: monthlySales.results,
        });
      }

      if (method === 'GET' && sub === 'customers') {
        const rows = await env.pandora_db.prepare(`SELECT id,customer_code,name,company_name,mobile,city,status,created_at FROM customers ORDER BY created_at DESC LIMIT 200`).all<any>();
        return json({ customers: rows.results });
      }
      if (method === 'GET' && sub === 'staff') {
        const rows = await env.pandora_db.prepare(`SELECT s.id,s.staff_id,s.name,s.position,s.mobile,s.status,d.name dept FROM staff s LEFT JOIN departments d ON d.id=s.department_id ORDER BY s.name LIMIT 200`).all<any>();
        return json({ staff: rows.results });
      }
      if (method === 'GET' && sub === 'sales') {
        const rows = await env.pandora_db.prepare(`SELECT s.id,s.invoice_no,c.name customer,s.sale_date,s.total_amount,s.payment_status FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ORDER BY s.sale_date DESC LIMIT 200`).all<any>();
        return json({ sales: rows.results });
      }
      if (method === 'GET' && sub === 'orders') {
        const rows = await env.pandora_db.prepare(`SELECT o.id,o.order_no,c.name customer,o.order_date,o.delivery_date,o.total_amount,o.status FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 200`).all<any>();
        return json({ orders: rows.results });
      }
    }

    // ─── SUPERADMIN: PLATFORM STATS ───────────────────────────────────────────
    if (method === 'GET' && path === '/superadmin/stats') {
      const auth = request.headers.get('X-Super-Token');
      const expected = 'sa_' + btoa(SUPER_PWD).slice(0,16);
      if (auth !== expected) return err('Unauthorized', 401);
      const [total, active, suspended, recent, totalRev, totalCust, totalOrders] = await Promise.all([
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM businesses`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM businesses WHERE status='Active'`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM businesses WHERE status='Suspended'`).first<any>(),
        env.pandora_db.prepare(`SELECT id,user_id,business_name,status,created_at,last_login FROM businesses ORDER BY created_at DESC LIMIT 5`).all<any>(),
        env.pandora_db.prepare(`SELECT COALESCE(SUM(total_amount),0) s FROM sales`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM customers`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM orders`).first<any>(),
      ]);
      return json({
        total_businesses: total?.c ?? 0,
        active_businesses: active?.c ?? 0,
        suspended_businesses: suspended?.c ?? 0,
        recent_businesses: recent.results,
        platform_revenue: totalRev?.s ?? 0,
        total_customers: totalCust?.c ?? 0,
        total_orders: totalOrders?.c ?? 0,
      });
    }



    // ─── DASHBOARD ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/dashboard') {
      const month = url.searchParams.get('month') ?? '';
      const mf = month ? `WHERE strftime('%Y-%m', sale_date)='${month}'` : '';
      const emf = month ? `WHERE strftime('%Y-%m', expense_date)='${month}'` : '';
      const omf = month ? `WHERE strftime('%Y-%m', order_date)='${month}'` : '';

      const curMonth = new Date().toISOString().slice(0, 7);
      const thisMonth = month || curMonth;

      const [
        totalCustomers, activeOrders, monthlySales, monthlyExpenses,
        totalStaff, avgKpi, lowStock, pendingQuotations,
        ordersDueWeek, salesTrend, expenseTrend, orderStatusDist,
        topCustomers, gradeDistRaw, deptPerf, topEmployees,
        evaluatedCount, avgScore, excellent, needsImprovement,
        attendanceIssues, promotionCandidates, salaryIncrementCandidates,
        delayedOrders, uncollectedOrders, upcomingDeliveries, recentOrders,
        dailySales, dailyExpenses,
        monthTotalOrders, undeliveredOrders, outstandingAmount, newCustomers, monthAvgKpi
      ] = await Promise.all([
        env.pandora_db.prepare("SELECT COUNT(*) c FROM customers WHERE status='Active'").first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM orders WHERE status NOT IN ('Delivered','Collected','Cancelled')").first<any>(),
        env.pandora_db.prepare(`SELECT COALESCE(SUM(total_amount),0) s FROM sales ${mf}`).first<any>(),
        env.pandora_db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM expenses ${emf}`).first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM staff WHERE status='Active'").first<any>(),
        env.pandora_db.prepare("SELECT ROUND(AVG(percentage),1) a FROM evaluations").first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM items WHERE manage_stock=1 AND stock_qty<=reorder_level AND status='Active'").first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM quotations WHERE status IN ('Draft','Sent')").first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM orders WHERE delivery_date BETWEEN date('now') AND date('now','+7 days') AND status NOT IN ('Delivered','Collected','Cancelled')").first<any>(),
        env.pandora_db.prepare("SELECT strftime('%Y-%m',sale_date) m, ROUND(SUM(total_amount),2) total FROM sales GROUP BY m ORDER BY m DESC LIMIT 12").all(),
        env.pandora_db.prepare("SELECT strftime('%Y-%m',expense_date) m, ROUND(SUM(amount),2) total FROM expenses GROUP BY m ORDER BY m DESC LIMIT 12").all(),
        env.pandora_db.prepare("SELECT status, COUNT(*) c FROM orders GROUP BY status").all(),
        env.pandora_db.prepare(`
          WITH cstats AS (
            SELECT
              c.id, c.name,
              COALESCE(c.quality_rating, 100) quality_rating,
              julianday('now') - julianday(c.created_at) AS days_as_customer,
              COALESCE((SELECT SUM(s2.total_amount) FROM sales s2 WHERE s2.customer_id=c.id), 0) AS total_revenue,
              COALESCE((SELECT COUNT(*) FROM orders o2 WHERE o2.customer_id=c.id), 0) AS order_count,
              COALESCE((SELECT SUM(o3.total_qty) FROM orders o3 WHERE o3.customer_id=c.id), 0) AS total_pcs,
              COALESCE((SELECT SUM(s3.total_amount - COALESCE(s3.paid_amount,0)) FROM sales s3 WHERE s3.customer_id=c.id AND s3.payment_status IN ('Due','Partial')), 0) AS outstanding,
              COALESCE((
                SELECT ROUND(100.0 * SUM(CASE WHEN o4.status IN ('Delivered','Collected') AND o4.delivery_date >= date(o4.created_at) THEN 1 ELSE 0 END) / MAX(COUNT(*),1), 0)
                FROM orders o4 WHERE o4.customer_id=c.id AND o4.status IN ('Delivered','Collected')
              ), 100) AS ontime_pct
            FROM customers c WHERE c.status='Active'
          ),
          max_vals AS (
            SELECT
              MAX(total_revenue)+1 mr, MAX(order_count)+1 mo, MAX(total_pcs)+1 mp,
              MAX(days_as_customer)+1 md
            FROM cstats
          ),
          scored AS (
            SELECT cs.*,
              ROUND(
                (cs.total_revenue / mv.mr) * 30 +
                (cs.order_count / mv.mo) * 15 +
                (cs.total_pcs / mv.mp) * 15 +
                (CASE WHEN cs.outstanding = 0 THEN 20 ELSE ROUND(20.0 * (1 - MIN(cs.outstanding / (cs.total_revenue+1), 1)),1) END) +
                (cs.ontime_pct / 100.0) * 10 +
                (cs.days_as_customer / mv.md) * 5 +
                (cs.quality_rating / 100.0) * 5
              , 1) AS rank_score
            FROM cstats cs, max_vals mv
          )
          SELECT name, total_revenue AS total, order_count, total_pcs, outstanding, ontime_pct, days_as_customer, quality_rating, rank_score
          FROM scored ORDER BY rank_score DESC LIMIT 5
        `).all(),
        env.pandora_db.prepare(`SELECT grade, COUNT(*) count FROM evaluations ${month ? `WHERE month LIKE '${month}%'` : ''} GROUP BY grade`).all(),
        env.pandora_db.prepare("SELECT d.name department, ROUND(AVG(ev.percentage),1) avgScore FROM evaluations ev JOIN employees e ON e.id=ev.employee_id JOIN departments d ON d.name=e.department GROUP BY d.name").all(),
        env.pandora_db.prepare(`SELECT ev.id, emp.name employeeName, emp.department, ev.month, ev.percentage, ev.grade FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.month=? ORDER BY ev.percentage DESC LIMIT 5`).bind(thisMonth).all(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations ${month ? `WHERE month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT ROUND(AVG(percentage),1) a FROM evaluations ${month ? `WHERE month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations WHERE percentage>=90 ${month ? `AND month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations WHERE percentage<60 ${month ? `AND month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations WHERE days_leave_taken>=3 ${month ? `AND month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations WHERE recommendation='Promote' ${month ? `AND month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM evaluations WHERE percentage>=80 ${month ? `AND month='${month}'` : ''}`).first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM orders WHERE delivery_date < date('now') AND status NOT IN ('Delivered','Collected','Cancelled')").first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) c FROM orders WHERE status='Ready'").first<any>(),
        env.pandora_db.prepare("SELECT o.id,o.order_no,c.name customer_name,o.delivery_date,o.status FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.delivery_date BETWEEN date('now') AND date('now','+7 days') AND o.status NOT IN ('Delivered','Collected','Cancelled') ORDER BY o.delivery_date ASC LIMIT 10").all(),
        env.pandora_db.prepare("SELECT o.id,o.order_no,c.name customer_name,o.delivery_date,o.status FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 10").all(),
        env.pandora_db.prepare(`SELECT CAST(strftime('%d', sale_date) AS INTEGER) d, ROUND(SUM(total_amount),2) total FROM sales WHERE strftime('%Y-%m', sale_date)=${month ? "?" : "strftime('%Y-%m','now')"} GROUP BY d`).bind(...(month ? [month] : [])).all(),
        env.pandora_db.prepare(`SELECT CAST(strftime('%d', expense_date) AS INTEGER) d, ROUND(SUM(amount),2) total FROM expenses WHERE strftime('%Y-%m', expense_date)=${month ? "?" : "strftime('%Y-%m','now')"} GROUP BY d`).bind(...(month ? [month] : [])).all(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM orders WHERE strftime('%Y-%m',order_date)=?`).bind(thisMonth).first<any>(),
        env.pandora_db.prepare("SELECT COUNT(*) orders_c, COALESCE(SUM(total_qty),0) pcs_c FROM orders WHERE status NOT IN ('Delivered','Collected','Cancelled')").first<any>(),
        env.pandora_db.prepare("SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount,0)),0) amt FROM sales WHERE payment_status IN ('Due','Partial')").first<any>(),
        env.pandora_db.prepare(`SELECT COUNT(*) c FROM customers WHERE strftime('%Y-%m',created_at)=?`).bind(thisMonth).first<any>(),
        env.pandora_db.prepare(`SELECT ROUND(AVG(percentage),1) a FROM evaluations WHERE month=?`).bind(thisMonth).first<any>(),
      ]);

      // Build a full 1..daysInMonth daily series for revenue vs expenses
      const dtMonth = month || new Date().toISOString().slice(0, 7);
      const [dtY, dtM] = dtMonth.split('-').map(Number);
      const daysInMonth = new Date(dtY, dtM, 0).getDate();
      const dSalesMap: Record<number, number> = {};
      const dExpMap: Record<number, number> = {};
      (dailySales.results as any[]).forEach(r => { dSalesMap[r.d] = r.total; });
      (dailyExpenses.results as any[]).forEach(r => { dExpMap[r.d] = r.total; });
      const dailyTrend = Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        return { day, revenue: dSalesMap[day] || 0, expenses: dExpMap[day] || 0 };
      });

      const monthlySalesVal = monthlySales?.s ?? 0;
      const monthlyExpensesVal = monthlyExpenses?.s ?? 0;
      const gradeColors: Record<string,string> = { 'Excellent':'#2E7D32','Very Good':'#1565C0','Good':'#F57C00','Average':'#6A1FA0','Needs Improvement':'#C0001A' };

      return json({
        // summary
        totalCustomers: totalCustomers?.c ?? 0,
        activeOrders: activeOrders?.c ?? 0,
        ordersDueWeek: ordersDueWeek?.c ?? 0,
        monthlySales: monthlySalesVal,
        monthlyExpenses: monthlyExpensesVal,
        monthlyProfit: Math.round((monthlySalesVal - monthlyExpensesVal) * 100) / 100,
        totalStaff: totalStaff?.c ?? 0,
        avgKpi: avgKpi?.a ?? 0,
        lowStock: lowStock?.c ?? 0,
        pendingQuotations: pendingQuotations?.c ?? 0,
        delayedOrders: delayedOrders?.c ?? 0,
        uncollectedOrders: uncollectedOrders?.c ?? 0,
        // charts
        salesTrend: salesTrend.results.reverse(),
        expenseTrend: expenseTrend.results.reverse(),
        dailyTrend,
        orderStatusDist: orderStatusDist.results,
        topCustomers: topCustomers.results,
        // KPI
        totalEmployees: 5,
        evaluatedCount: evaluatedCount?.c ?? 0,
        avgScore: avgScore?.a ?? 0,
        excellent: excellent?.c ?? 0,
        needsImprovement: needsImprovement?.c ?? 0,
        attendanceIssues: attendanceIssues?.c ?? 0,
        promotionCandidates: promotionCandidates?.c ?? 0,
        salaryIncrementCandidates: salaryIncrementCandidates?.c ?? 0,
        gradeDistribution: (gradeDistRaw.results as any[]).map((g:any) => ({ ...g, color: gradeColors[g.grade] ?? '#999' })),
        topEmployees: topEmployees.results,
        deptPerformance: deptPerf.results,
        upcomingDeliveries: upcomingDeliveries.results,
        recentOrders: recentOrders.results,
        // new KPI fields
        monthTotalOrders: monthTotalOrders?.c ?? 0,
        undeliveredOrders: undeliveredOrders?.orders_c ?? 0,
        undeliveredPcs: undeliveredOrders?.pcs_c ?? 0,
        outstandingAmount: outstandingAmount?.amt ?? 0,
        newCustomers: newCustomers?.c ?? 0,
        monthAvgKpi: monthAvgKpi?.a ?? 0,
      });
    }

    // ─── CUSTOMERS ───────────────────────────────────────────────────────────
    // Phone duplicate check
    if (method === 'GET' && path === '/customers/check-phone') {
      const phone = url.searchParams.get('phone') || '';
      const excludeId = url.searchParams.get('exclude_id');
      if (!phone) return json({ exists: false });
      let q = `SELECT id,name,phone FROM customers WHERE (phone=? OR mobile=?)`;
      if (excludeId) q += ` AND id != ${Number(excludeId)}`;
      const row = await env.pandora_db.prepare(q).bind(phone, phone).first<any>();
      return json({ exists: !!row, customer: row || null });
    }
    // Customer types
    // ── Order Product Types ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/order-product-types') {
      const rows = await env.pandora_db.prepare('SELECT id, name FROM order_product_types ORDER BY id ASC').all();
      return json({ types: rows.results });
    }
    if (method === 'POST' && path === '/order-product-types') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const r = await env.pandora_db.prepare('INSERT INTO order_product_types (name) VALUES (?)').bind(b.name.trim()).run();
      const rows = await env.pandora_db.prepare('SELECT id, name FROM order_product_types ORDER BY id ASC').all();
      return json({ types: rows.results });
    }
    const optMatch = path.match(/^\/order-product-types\/(\d+)$/);
    if (optMatch) {
      const id = Number(optMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        if (!b.name) return err('Name required');
        await env.pandora_db.prepare('UPDATE order_product_types SET name=? WHERE id=?').bind(b.name.trim(), id).run();
        const rows = await env.pandora_db.prepare('SELECT id, name FROM order_product_types ORDER BY id ASC').all();
        return json({ types: rows.results });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM order_product_types WHERE id=?').bind(id).run();
        const rows = await env.pandora_db.prepare('SELECT id, name FROM order_product_types ORDER BY id ASC').all();
        return json({ types: rows.results });
      }
    }

    // ── Order Fabric Types ────────────────────────────────────────────────────
    if (method === 'GET' && path === '/order-fabric-types') {
      const rows = await env.pandora_db.prepare('SELECT id, name FROM order_fabric_types ORDER BY id ASC').all();
      return json({ types: rows.results });
    }
    if (method === 'POST' && path === '/order-fabric-types') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      await env.pandora_db.prepare('INSERT INTO order_fabric_types (name) VALUES (?)').bind(b.name.trim()).run();
      const rows = await env.pandora_db.prepare('SELECT id, name FROM order_fabric_types ORDER BY id ASC').all();
      return json({ types: rows.results });
    }
    const oftMatch = path.match(/^\/order-fabric-types\/(\d+)$/);
    if (oftMatch) {
      const id = Number(oftMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        if (!b.name) return err('Name required');
        await env.pandora_db.prepare('UPDATE order_fabric_types SET name=? WHERE id=?').bind(b.name.trim(), id).run();
        const rows = await env.pandora_db.prepare('SELECT id, name FROM order_fabric_types ORDER BY id ASC').all();
        return json({ types: rows.results });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM order_fabric_types WHERE id=?').bind(id).run();
        const rows = await env.pandora_db.prepare('SELECT id, name FROM order_fabric_types ORDER BY id ASC').all();
        return json({ types: rows.results });
      }
    }


    // ── Garment spec types (collar / sleeve / button / tag) ──────────────────
    for (const [seg, col] of [
      ['order-collar-types', 'order_collar_types'],
      ['order-sleeve-types', 'order_sleeve_types'],
      ['order-button-types', 'order_button_types'],
      ['order-tag-names', 'order_tag_names'],
    ] as [string, string][]) {
      if (method === 'GET' && path === `/${seg}`) {
        const rows = await env.pandora_db.prepare(`SELECT id, name FROM ${col} ORDER BY id ASC`).all();
        return json({ types: rows.results });
      }
      if (method === 'POST' && path === `/${seg}`) {
        const b = await request.json() as any;
        if (!b.name) return err('Name required');
        await env.pandora_db.prepare(`INSERT INTO ${col} (name) VALUES (?)`).bind(b.name.trim()).run();
        const rows = await env.pandora_db.prepare(`SELECT id, name FROM ${col} ORDER BY id ASC`).all();
        return json({ types: rows.results });
      }
      const m2 = path.match(new RegExp(`^\\/${seg}\\/(\\d+)$`));
      if (m2) {
        const id = Number(m2[1]);
        if (method === 'PUT') {
          const b = await request.json() as any;
          if (!b.name) return err('Name required');
          await env.pandora_db.prepare(`UPDATE ${col} SET name=? WHERE id=?`).bind(b.name.trim(), id).run();
          const rows = await env.pandora_db.prepare(`SELECT id, name FROM ${col} ORDER BY id ASC`).all();
          return json({ types: rows.results });
        }
        if (method === 'DELETE') {
          await env.pandora_db.prepare(`DELETE FROM ${col} WHERE id=?`).bind(id).run();
          const rows = await env.pandora_db.prepare(`SELECT id, name FROM ${col} ORDER BY id ASC`).all();
          return json({ types: rows.results });
        }
      }
    }


    if (method === 'GET' && path === '/customer-types') {
      const rows = await env.pandora_db.prepare('SELECT name FROM customer_types ORDER BY id ASC').all();
      return json({ types: rows.results.map((r: any) => r.name) });
    }
    if (method === 'POST' && path === '/customer-types') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      await env.pandora_db.prepare('INSERT OR IGNORE INTO customer_types (name) VALUES (?)').bind(b.name.trim()).run();
      const rows = await env.pandora_db.prepare('SELECT name FROM customer_types ORDER BY id ASC').all();
      return json({ types: rows.results.map((r: any) => r.name) });
    }
    if (method === 'GET' && path === '/customers') {
      const search = url.searchParams.get('search') || '';
      const type = url.searchParams.get('type') || '';
      let where = 'WHERE 1=1';
      if (search) where += ` AND (c.name LIKE '%${search}%' OR c.phone LIKE '%${search}%' OR c.email LIKE '%${search}%' OR c.mobile LIKE '%${search}%')`;
      if (type) where += ` AND c.type='${type}'`;
      const rows = await env.pandora_db.prepare(`
        SELECT c.*,
          COALESCE(c.phone, c.mobile) phone,
          COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id),0) total_orders,
          COALESCE((SELECT SUM(total_amount)-SUM(COALESCE(paid_amount,0)) FROM sales s WHERE s.customer_id=c.id),0) outstanding_balance
        FROM customers c ${where} ORDER BY c.created_at DESC`).all();
      return json({ customers: rows.results });
    }
    if (method === 'POST' && path === '/customers') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const code = `CUS-${Date.now().toString().slice(-6)}`;
      const phone = b.phone || b.mobile || null;
      const r = await env.pandora_db.prepare(
        `INSERT INTO customers (customer_code,name,company_name,contact_person,phone,mobile,email,address,city,notes,type,credit_limit,credit_balance,opening_balance,status,quality_rating)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(code,b.name,b.company_name||null,b.contact_person||null,phone,phone,b.email||null,b.address||null,b.city||null,b.notes||null,b.type||'retail',b.credit_limit||0,0,b.opening_balance||0,b.status||'Active',b.quality_rating!=null?b.quality_rating:100).run();
      const row = await env.pandora_db.prepare('SELECT * FROM customers WHERE id=?').bind(r.meta.last_row_id).first();
      return json({ customer: row }, 201);
    }
    // POS customer data endpoint
    const custPosMatch = path.match(/^\/customers\/(\d+)\/pos$/);
    if (custPosMatch && method === 'GET') {
      const id = Number(custPosMatch[1]);
      const c = await env.pandora_db.prepare('SELECT * FROM customers WHERE id=?').bind(id).first() as any;
      if (!c) return err('Not found', 404);
      const totalBiz = await env.pandora_db.prepare(
        `SELECT COALESCE(SUM(total_amount),0) v FROM sales WHERE customer_id=?`
      ).bind(id).first<any>();
      const totalDue = await env.pandora_db.prepare(
        `SELECT COALESCE(SUM(total_amount)-SUM(COALESCE(paid_amount,0)),0) v FROM sales WHERE customer_id=?`
      ).bind(id).first<any>();
      const lastSales = await env.pandora_db.prepare(
        `SELECT s.invoice_no, s.sale_date, s.total_amount, s.paid_amount, s.payment_status,
         COALESCE((SELECT SUM(si.qty) FROM sale_items si WHERE si.sale_id=s.id),0) no_of_pcs
         FROM sales s WHERE s.customer_id=? ORDER BY s.created_at DESC LIMIT 10`
      ).bind(id).all();
      return json({
        customer: c,
        total_business: totalBiz?.v || 0,
        total_due: totalDue?.v || 0,
        last_sales: lastSales.results
      });
    }

    const custMatch = path.match(/^\/customers\/(\d+)$/);
    if (custMatch) {
      const id = Number(custMatch[1]);
      if (method === 'GET') {
        const c = await env.pandora_db.prepare('SELECT * FROM customers WHERE id=?').bind(id).first();
        if (!c) return err('Not found', 404);
        const orders = await env.pandora_db.prepare('SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all();
        const sales = await env.pandora_db.prepare('SELECT * FROM sales WHERE customer_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all();
        return json({ customer: c, orders: orders.results, sales: sales.results });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        const phone = b.phone || b.mobile || null;
        await env.pandora_db.prepare(
          `UPDATE customers SET name=?,company_name=?,contact_person=?,phone=?,mobile=?,email=?,address=?,city=?,notes=?,type=?,credit_limit=?,opening_balance=?,status=?,quality_rating=? WHERE id=?`
        ).bind(b.name,b.company_name||null,b.contact_person||null,phone,phone,b.email||null,b.address||null,b.city||null,b.notes||null,b.type||'retail',b.credit_limit||0,b.opening_balance||0,b.status||'Active',b.quality_rating!=null?b.quality_rating:100,id).run();
        return json({ customer: await env.pandora_db.prepare('SELECT * FROM customers WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM customers WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── SUPPLIERS ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/suppliers/check-phone') {
      const phone = url.searchParams.get('phone') || '';
      const excludeId = url.searchParams.get('exclude_id');
      if (!phone) return json({ exists: false });
      let q = `SELECT id,name,mobile FROM suppliers WHERE mobile=?`;
      if (excludeId) q += ` AND id != ${Number(excludeId)}`;
      const row = await env.pandora_db.prepare(q).bind(phone).first<any>();
      return json({ exists: !!row, supplier: row || null });
    }
    if (method === 'GET' && path === '/suppliers') {
      const search = url.searchParams.get('search') || '';
      let where = 'WHERE 1=1';
      if (search) where += ` AND (s.name LIKE '%${search}%' OR s.company LIKE '%${search}%' OR s.mobile LIKE '%${search}%')`;
      const rows = await env.pandora_db.prepare(`
        SELECT s.*, COALESCE((SELECT SUM(total_amount) FROM purchases p WHERE p.supplier_id=s.id),0) total_business,
        COALESCE((SELECT SUM(total_amount)-SUM(paid_amount) FROM purchases p WHERE p.supplier_id=s.id),0) outstanding
        FROM suppliers s ${where} ORDER BY s.created_at DESC`).all();
      return json({ suppliers: rows.results });
    }
    if (method === 'POST' && path === '/suppliers') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const r = await env.pandora_db.prepare(
        `INSERT INTO suppliers (name,company,contact_person,mobile,email,address,category,notes) VALUES (?,?,?,?,?,?,?,?)`
      ).bind(b.name,b.company||null,b.contact_person||null,b.mobile||b.phone||null,b.email||null,b.address||null,b.category||null,b.notes||null).run();
      return json({ supplier: await env.pandora_db.prepare('SELECT * FROM suppliers WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const supMatch = path.match(/^\/suppliers\/(\d+)$/);
    if (supMatch) {
      const id = Number(supMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE suppliers SET name=?,company=?,contact_person=?,mobile=?,email=?,address=?,category=?,notes=? WHERE id=?`)
          .bind(b.name,b.company||null,b.contact_person||null,b.mobile||b.phone||null,b.email||null,b.address||null,b.category||null,b.notes||null,id).run();
        return json({ supplier: await env.pandora_db.prepare('SELECT * FROM suppliers WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM suppliers WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
      if (method === 'GET') {
        const s = await env.pandora_db.prepare('SELECT * FROM suppliers WHERE id=?').bind(id).first();
        const purchases = await env.pandora_db.prepare('SELECT * FROM purchases WHERE supplier_id=? ORDER BY created_at DESC').bind(id).all();
        return json({ supplier: s, purchases: purchases.results });
      }
    }

    // ─── INVENTORY ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/items') {
      const category = url.searchParams.get('category');
      let q = 'SELECT * FROM items';
      if (category) q += ` WHERE category='${category}'`;
      q += ' ORDER BY created_at DESC';
      const rows = await env.pandora_db.prepare(q).all();
      const stats = await env.pandora_db.prepare(`
        SELECT 
          ROUND(SUM(CASE WHEN manage_stock=1 THEN stock_qty*cost_price ELSE 0 END),2) total_value,
          COUNT(CASE WHEN manage_stock=1 AND stock_qty<=reorder_level AND stock_qty>0 THEN 1 END) low_stock,
          COUNT(CASE WHEN manage_stock=1 AND stock_qty=0 THEN 1 END) out_of_stock
        FROM items WHERE status='Active'`).first<any>();
      return json({ items: rows.results, stats });
    }
    if (method === 'POST' && path === '/items') {
      const b = await request.json() as any;
      if (!b.name || !b.category) return err('Name and category required');
      let code = b.item_code;
      if (!code) {
        const last = await env.pandora_db.prepare(`SELECT item_code FROM items WHERE item_code LIKE 'P%' ORDER BY id DESC LIMIT 1`).first<any>();
        let nextNum = 1;
        if (last?.item_code) {
          const n = parseInt(last.item_code.replace(/^P0*/, ''), 10);
          if (!isNaN(n)) nextNum = n + 1;
        }
        code = `P${String(nextNum).padStart(3, '0')}`;
      }
      const r = await env.pandora_db.prepare(
        `INSERT INTO items (item_code,name,category,unit,cost_price,selling_price,wholesale_price,manage_stock,stock_qty,reorder_level,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(code,b.name,b.category,b.unit||'pcs',b.cost_price||0,b.selling_price||0,b.wholesale_price||0,b.manage_stock?1:0,b.stock_qty||0,b.reorder_level||0,b.notes||null).run();
      return json({ item: await env.pandora_db.prepare('SELECT * FROM items WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const itemMatch = path.match(/^\/items\/(\d+)$/);
    if (itemMatch) {
      const id = Number(itemMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE items SET name=?,category=?,unit=?,cost_price=?,selling_price=?,wholesale_price=?,manage_stock=?,stock_qty=?,reorder_level=?,notes=?,status=? WHERE id=?`)
          .bind(b.name,b.category,b.unit||'pcs',b.cost_price||0,b.selling_price||0,b.wholesale_price||0,b.manage_stock?1:0,b.stock_qty||0,b.reorder_level||0,b.notes||null,b.status||'Active',id).run();
        return json({ item: await env.pandora_db.prepare('SELECT * FROM items WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM items WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── STOCK HISTORY ───────────────────────────────────────────────────────
    const stockHistMatch = path.match(/^\/items\/(\d+)\/stock$/);
    if (stockHistMatch) {
      const itemId = Number(stockHistMatch[1]);
      if (method === 'POST') {
        const b = await request.json() as any;
        const type = b.type === 'deduct' ? 'deduct' : 'add';
        const qty = Math.abs(Number(b.qty) || 0);
        if (!qty) return err('Qty required');
        const delta = type === 'deduct' ? -qty : qty;
        await env.pandora_db.prepare(`UPDATE items SET stock_qty=MAX(0,stock_qty+?) WHERE id=?`).bind(delta, itemId).run();
        await env.pandora_db.prepare(`INSERT INTO stock_history (item_id,type,qty,note,by) VALUES (?,?,?,?,?)`).bind(itemId, type, qty, b.note||null, b.by||'Admin').run();
        const item = await env.pandora_db.prepare('SELECT * FROM items WHERE id=?').bind(itemId).first();
        return json({ item });
      }
    }
    const stockHistGetMatch = path.match(/^\/items\/(\d+)\/history$/);
    if (stockHistGetMatch && method === 'GET') {
      const itemId = Number(stockHistGetMatch[1]);
      const rows = await env.pandora_db.prepare('SELECT * FROM stock_history WHERE item_id=? ORDER BY created_at DESC LIMIT 100').bind(itemId).all();
      return json({ history: rows.results });
    }
    // Item status toggle
    const itemStatusMatch = path.match(/^\/items\/(\d+)\/(suspend|activate|not-for-sale)$/);
    if (itemStatusMatch) {
      const itemId = Number(itemStatusMatch[1]);
      const action = itemStatusMatch[2];
      const statusMap: Record<string,string> = { suspend: 'Suspended', activate: 'Active', 'not-for-sale': 'Not For Sale' };
      await env.pandora_db.prepare(`UPDATE items SET status=? WHERE id=?`).bind(statusMap[action], itemId).run();
      return json({ item: await env.pandora_db.prepare('SELECT * FROM items WHERE id=?').bind(itemId).first() });
    }

    // ─── PURCHASES ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/purchases') {
      const rows = await env.pandora_db.prepare(`
        SELECT p.*, s.name supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.created_at DESC`).all();
      return json({ purchases: rows.results });
    }
    if (method === 'POST' && path === '/purchases') {
      const b = await request.json() as any;
      const pno = await nextSeq(env.pandora_db, 'order_seq', 'PUR');
      const total = (b.items||[]).reduce((s:number,i:any)=>s+(i.qty*i.unit_price),0);
      const r = await env.pandora_db.prepare(
        `INSERT INTO purchases (purchase_no,supplier_id,purchase_date,total_amount,paid_amount,payment_status,payment_mode,notes) VALUES (?,?,?,?,?,?,?,?)`
      ).bind(pno,b.supplier_id||null,b.purchase_date,total,b.paid_amount||0,b.payment_status||'Unpaid',b.payment_mode||null,b.notes||null).run();
      const pid = r.meta.last_row_id;
      for (const item of (b.items||[])) {
        await env.pandora_db.prepare(`INSERT INTO purchase_items (purchase_id,item_id,qty,unit_price,total) VALUES (?,?,?,?,?)`)
          .bind(pid,item.item_id,item.qty,item.unit_price,item.qty*item.unit_price).run();
        if (item.update_stock !== false) {
          await env.pandora_db.prepare(`UPDATE items SET stock_qty=stock_qty+? WHERE id=? AND manage_stock=1`).bind(item.qty,item.item_id).run();
          const managed = await env.pandora_db.prepare('SELECT manage_stock FROM items WHERE id=?').bind(item.item_id).first<any>();
          if (managed?.manage_stock) {
            await env.pandora_db.prepare(`INSERT INTO stock_history (item_id,type,qty,note,by) VALUES (?,?,?,?,?)`)
              .bind(item.item_id,'purchase',item.qty,`Purchase ${pno}`,'Purchase').run();
          }
        }
      }
      const purchase = await env.pandora_db.prepare('SELECT * FROM purchases WHERE id=?').bind(pid).first();
      const items = await env.pandora_db.prepare('SELECT pi.*, i.name item_name, i.unit FROM purchase_items pi JOIN items i ON i.id=pi.item_id WHERE pi.purchase_id=?').bind(pid).all();
      return json({ purchase, items: items.results }, 201);
    }
    const purMatch = path.match(/^\/purchases\/(\d+)$/);
    if (purMatch) {
      const id = Number(purMatch[1]);
      if (method === 'GET') {
        const p = await env.pandora_db.prepare('SELECT p.*,s.name supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?').bind(id).first();
        const items = await env.pandora_db.prepare('SELECT pi.*,i.name item_name,i.unit FROM purchase_items pi JOIN items i ON i.id=pi.item_id WHERE pi.purchase_id=?').bind(id).all();
        return json({ purchase: p, items: items.results });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        const cur = await env.pandora_db.prepare('SELECT * FROM purchases WHERE id=?').bind(id).first<any>();
        if (!cur) return err('Not found', 404);
        await env.pandora_db.prepare(`UPDATE purchases SET supplier_id=?,purchase_date=?,paid_amount=?,payment_status=?,payment_mode=?,notes=? WHERE id=?`)
          .bind(
            b.supplier_id ?? cur.supplier_id,
            b.purchase_date ?? cur.purchase_date,
            b.paid_amount !== undefined ? b.paid_amount : cur.paid_amount,
            b.payment_status ?? cur.payment_status,
            b.payment_mode ?? cur.payment_mode,
            b.notes !== undefined ? b.notes : cur.notes,
            id
          ).run();
        return json({ purchase: await env.pandora_db.prepare('SELECT * FROM purchases WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM purchases WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── QUOTATIONS ──────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/quotations') {
      const rows = await env.pandora_db.prepare(`
        SELECT q.*, c.name customer_name FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id ORDER BY q.created_at DESC`).all();
      return json({ quotations: rows.results });
    }
    if (method === 'POST' && path === '/quotations') {
      const b = await request.json() as any;
      const qno = await nextSeq(env.pandora_db, 'quotation_seq', 'QUO');
      const total = (b.items||[]).reduce((s:number,i:any)=>s+(i.qty*i.unit_price),0);
      const r = await env.pandora_db.prepare(
        `INSERT INTO quotations (quotation_no,customer_id,quotation_date,expiry_date,status,total_amount,notes) VALUES (?,?,?,?,?,?,?)`
      ).bind(qno,b.customer_id||null,b.quotation_date,b.expiry_date||null,b.status||'Draft',total,b.notes||null).run();
      const qid = r.meta.last_row_id;
      for (const item of (b.items||[])) {
        await env.pandora_db.prepare(`INSERT INTO quotation_items (quotation_id,item_id,description,qty,unit_price,total) VALUES (?,?,?,?,?,?)`)
          .bind(qid,item.item_id||null,item.description||null,item.qty,item.unit_price,item.qty*item.unit_price).run();
      }
      return json({ quotation: await env.pandora_db.prepare('SELECT * FROM quotations WHERE id=?').bind(qid).first() }, 201);
    }
    const quoMatch = path.match(/^\/quotations\/(\d+)$/);
    if (quoMatch) {
      const id = Number(quoMatch[1]);
      if (method === 'GET') {
        const q = await env.pandora_db.prepare('SELECT q.*,c.name customer_name FROM quotations q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=?').bind(id).first();
        const items = await env.pandora_db.prepare('SELECT qi.*,i.name item_name FROM quotation_items qi LEFT JOIN items i ON i.id=qi.item_id WHERE qi.quotation_id=?').bind(id).all();
        return json({ quotation: q, items: items.results });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE quotations SET customer_id=?,quotation_date=?,expiry_date=?,status=?,notes=? WHERE id=?`)
          .bind(b.customer_id||null,b.quotation_date,b.expiry_date||null,b.status||'Draft',b.notes||null,id).run();
        return json({ quotation: await env.pandora_db.prepare('SELECT * FROM quotations WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM quotations WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── SALES ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/sales') {
      const search = url.searchParams.get('search') || '';
      const status = url.searchParams.get('status') || '';
      const conditions: string[] = [];
      const binds: unknown[] = [];
      if (search) {
        conditions.push(`(s.invoice_no LIKE ? OR c.name LIKE ?)`);
        binds.push(`%${search}%`, `%${search}%`);
      }
      if (status) { conditions.push(`s.payment_status = ?`); binds.push(status); }
      if (url.searchParams.get('exclude_ordered') === '1') {
        conditions.push(`(s.is_ordered IS NULL OR s.is_ordered = 0)`);
        conditions.push(`s.payment_status != 'Draft'`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await env.pandora_db.prepare(`
        SELECT s.*, c.name customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id ${where} ORDER BY s.created_at DESC`).bind(...binds).all();
      return json({ sales: rows.results });
    }
    if (method === 'POST' && path === '/sales') {
      const b = await request.json() as any;
      const ino = await nextInvoiceNo(env.pandora_db);
      const itemsTotal = (b.items||[]).reduce((s:number,i:any)=>s+(i.qty*i.unit_price - (i.discount||0)),0);
      const addonTotal = (b.addons||[]).reduce((s:number,a:any)=>s+(a.qty||1)*(a.unit_price||0),0);
      const total = itemsTotal + addonTotal - (b.discount||0);
      // payment_status: Draft | Unpaid (credit) | Paid | Partial
      let pstatus = b.payment_status || 'Paid';
      if (pstatus === 'Draft') { /* keep as Draft */ }
      else if (pstatus === 'Unpaid' || pstatus === 'Credit') { pstatus = 'Unpaid'; }
      else { pstatus = total <= (b.paid_amount || total) ? 'Paid' : 'Partial'; }
      const r = await env.pandora_db.prepare(
        `INSERT INTO sales (invoice_no,customer_id,sale_date,total_amount,discount,paid_amount,payment_type,payment_status,notes) VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(ino,b.customer_id||null,b.sale_date,total,b.discount||0,pstatus==='Unpaid'?0:(b.paid_amount||total),b.payment_type||'Cash',pstatus,b.notes||null).run();
      const sid = r.meta.last_row_id;

      // Batch all inserts + stock updates in one round trip
      const stmts: D1PreparedStatement[] = [];
      for (const item of (b.items||[])) {
        stmts.push(env.pandora_db.prepare(`INSERT INTO sale_items (sale_id,item_id,description,qty,unit_price,discount,total) VALUES (?,?,?,?,?,?,?)`)
          .bind(sid,item.item_id||null,item.description||item.item_name||null,item.qty,item.unit_price,item.discount||0,item.qty*item.unit_price-(item.discount||0)));
        if (item.item_id) {
          stmts.push(env.pandora_db.prepare(`UPDATE items SET stock_qty=MAX(0,stock_qty-?) WHERE id=? AND manage_stock=1`).bind(item.qty,item.item_id));
        }
      }
      for (const addon of (b.addons||[])) {
        stmts.push(env.pandora_db.prepare(`INSERT INTO sale_items (sale_id,item_id,description,qty,unit_price,discount,total) VALUES (?,?,?,?,?,?,?)`)
          .bind(sid,null,`[Add-on] ${addon.name||''}`,addon.qty||1,addon.unit_price||0,0,(addon.qty||1)*(addon.unit_price||0)));
      }
      if (stmts.length) await env.pandora_db.batch(stmts);

      // Record payment history
      const paidAmt = pstatus === 'Unpaid' ? 0 : (b.paid_amount || total);
      if (paidAmt > 0) {
        await env.pandora_db.prepare(`INSERT INTO sale_payments (sale_id,amount,method,paid_at) VALUES (?,?,?,?)`).bind(sid, paidAmt, b.payment_type||'Cash', b.sale_date).run();
      }

      const sale = await env.pandora_db.prepare('SELECT s.*,c.name customer_name,COALESCE(c.phone,c.mobile) customer_phone,(SELECT o.order_no FROM orders o WHERE o.sale_id=s.id LIMIT 1) order_no FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?').bind(sid).first();
      const items = await env.pandora_db.prepare('SELECT si.*,i.name item_name FROM sale_items si LEFT JOIN items i ON i.id=si.item_id WHERE si.sale_id=?').bind(sid).all();
      return json({ sale, items: items.results }, 201);
    }
    const saleMatch = path.match(/^\/sales\/(\d+)$/);
    if (saleMatch) {
      const id = Number(saleMatch[1]);
      if (method === 'GET') {
        const s = await env.pandora_db.prepare('SELECT s.*,c.name customer_name,COALESCE(c.phone,c.mobile) customer_phone,(SELECT o.order_no FROM orders o WHERE o.sale_id=s.id LIMIT 1) order_no FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?').bind(id).first();
        const items = await env.pandora_db.prepare('SELECT si.*,i.name item_name FROM sale_items si LEFT JOIN items i ON i.id=si.item_id WHERE si.sale_id=?').bind(id).all();
        await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS sale_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'Cash', paid_at TEXT NOT NULL DEFAULT (date('now')), FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE)`).run();
        const payments = await env.pandora_db.prepare('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY paid_at ASC, id ASC').bind(id).all();
        return json({ sale: s, items: items.results, payments: payments.results });
      }
      if (method === 'PUT') {
        const b: any = await request.json();
        const itemsArr: any[] = b.items || [];
        const addonArr: any[] = (b.addons || []);
        const addonTotal = addonArr.reduce((s: number, a: any) => s + (a.qty || 1) * (a.unit_price || 0), 0);
        const itemsTotal = itemsArr.reduce((s: number, l: any) => s + (l.qty || 1) * (l.unit_price || 0) - (l.discount || 0), 0);
        const total = itemsTotal + addonTotal - (b.bill_discount || 0);
        const discount = itemsArr.reduce((s: number, l: any) => s + (l.discount || 0), 0) + (b.bill_discount || 0);
        const paid = b.paid_amount ?? 0;
        const status = paid >= total ? 'Paid' : paid > 0 ? 'Partial' : b.payment_status || 'Unpaid';
        // Track new payment if paid_amount increased
        const prev = await env.pandora_db.prepare('SELECT paid_amount FROM sales WHERE id=?').bind(id).first<any>();
        const prevPaid = Number(prev?.paid_amount || 0);
        await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS sale_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'Cash', paid_at TEXT NOT NULL DEFAULT (date('now')), FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE)`).run();
        if (paid > prevPaid) {
          await env.pandora_db.prepare(`INSERT INTO sale_payments (sale_id,amount,method,paid_at) VALUES (?,?,?,?)`).bind(id, paid - prevPaid, b.payment_type||'Cash', b.sale_date||new Date().toISOString().slice(0,10)).run();
        }
        await env.pandora_db.prepare(
          `UPDATE sales SET customer_id=?,sale_date=?,total_amount=?,discount=?,paid_amount=?,payment_type=?,payment_status=?,notes=? WHERE id=?`
        ).bind(b.customer_id||null, b.sale_date, total, discount, paid, b.payment_type||'Cash', status, b.notes||null, id).run();
        // Replace line items
        await env.pandora_db.prepare('DELETE FROM sale_items WHERE sale_id=?').bind(id).run();
        const stmts = [];
        for (const l of itemsArr) {
          stmts.push(env.pandora_db.prepare(
            `INSERT INTO sale_items (sale_id,item_id,description,qty,unit_price,discount,total) VALUES (?,?,?,?,?,?,?)`
          ).bind(id, l.item_id||null, l.item_name||l.description||'', l.qty||1, l.unit_price||0, l.discount||0, (l.qty||1)*(l.unit_price||0)-(l.discount||0)));
        }
        for (const addon of addonArr) {
          stmts.push(env.pandora_db.prepare(
            `INSERT INTO sale_items (sale_id,item_id,description,qty,unit_price,discount,total) VALUES (?,NULL,?,?,?,0,?)`
          ).bind(id, `[Add-on] ${addon.name||''}`, addon.qty||1, addon.unit_price||0, (addon.qty||1)*(addon.unit_price||0)));
        }
        if (stmts.length) await env.pandora_db.batch(stmts);
        const updated = await env.pandora_db.prepare('SELECT s.*,c.name customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?').bind(id).first();
        return json({ sale: updated });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM sales WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── COLLECT PAYMENT ─────────────────────────────────────────────────────
    const collectMatch = path.match(/^\/sales\/(\d+)\/payment$/);
    if (collectMatch && method === 'POST') {
      const sid = Number(collectMatch[1]);
      const b: any = await request.json();
      const amount = Number(b.amount || 0);
      const method2 = b.method || 'Cash';
      const paidAt = b.paid_at || new Date().toISOString().slice(0, 10);
      if (amount <= 0) return err('Amount must be > 0', 400);
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS sale_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'Cash', paid_at TEXT NOT NULL DEFAULT (date('now')), FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE)`).run();
      await env.pandora_db.prepare(`INSERT INTO sale_payments (sale_id,amount,method,paid_at) VALUES (?,?,?,?)`).bind(sid, amount, method2, paidAt).run();
      const sale = await env.pandora_db.prepare('SELECT * FROM sales WHERE id=?').bind(sid).first<any>();
      const newPaid = Number(sale?.paid_amount || 0) + amount;
      const total = Number(sale?.total_amount || 0);
      const newStatus = newPaid >= total ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
      await env.pandora_db.prepare(`UPDATE sales SET paid_amount=?,payment_status=?,payment_type=? WHERE id=?`).bind(newPaid, newStatus, method2, sid).run();
      const updated = await env.pandora_db.prepare('SELECT s.*,c.name customer_name,COALESCE(c.phone,c.mobile) customer_phone FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?').bind(sid).first();
      const payments = await env.pandora_db.prepare('SELECT * FROM sale_payments WHERE sale_id=? ORDER BY paid_at ASC, id ASC').bind(sid).all();
      return json({ sale: updated, payments: payments.results });
    }

    // ─── ORDERS ──────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/orders') {
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search') || '';
      let where = '';
      const conditions: string[] = [];
      if (status) conditions.push(`o.status='${status}'`);
      if (search) conditions.push(`(c.name LIKE '%${search}%' OR o.order_no LIKE '%${search}%' OR o.product LIKE '%${search}%' OR s.invoice_no LIKE '%${search}%')`);
      if (conditions.length) where = ' WHERE ' + conditions.join(' AND ');
      let q = `SELECT o.*, c.name customer_name, c.phone customer_phone, c.mobile customer_mobile, s.invoice_no FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sale_id${where} ORDER BY o.created_at DESC`;
      const rows = await env.pandora_db.prepare(q).all();
      const [stats, trend] = await Promise.all([
        env.pandora_db.prepare(`
          SELECT
            COUNT(*) total,
            COUNT(CASE WHEN status='New' THEN 1 END) new_orders,
            COUNT(CASE WHEN status='In Progress' OR status='Confirmed' THEN 1 END) ongoing,
            COUNT(CASE WHEN status NOT IN ('Delivered','Collected','Cancelled') THEN 1 END) active,
            COUNT(CASE WHEN status IN ('Delivered','Collected') THEN 1 END) completed,
            COUNT(CASE WHEN status='Ready' THEN 1 END) uncollected,
            COUNT(CASE WHEN status='Cancelled' THEN 1 END) cancelled,
            COUNT(CASE WHEN delivery_date < date('now') AND status NOT IN ('Delivered','Collected','Cancelled') THEN 1 END) overdue,
            COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled') THEN total_amount ELSE 0 END),0) total_value,
            COALESCE(SUM(CASE WHEN status IN ('Delivered','Collected') THEN total_qty ELSE 0 END),0) delivered_pcs
          FROM orders`).first<any>(),
        env.pandora_db.prepare(`
          SELECT strftime('%d', order_date) day,
            COUNT(*) total,
            COUNT(CASE WHEN status='Cancelled' THEN 1 END) cancelled,
            COUNT(CASE WHEN status IN ('Delivered','Collected') THEN 1 END) completed
          FROM orders
          WHERE strftime('%Y-%m', order_date) = strftime('%Y-%m', 'now')
          GROUP BY day ORDER BY day ASC`).all(),
      ]);
      return json({ orders: rows.results, stats, trend: trend.results.reverse() });
    }
    if (method === 'POST' && path === '/orders') {
      const b = await request.json() as any;
      const ono = await nextSeq(env.pandora_db, 'order_seq', 'ORD');
      const r = await env.pandora_db.prepare(
        `INSERT INTO orders (order_no,customer_id,order_date,delivery_date,status,production_status,progress,product,design_reference,fabric_details,printing_details,embroidery_details,accessories,production_notes,total_qty,total_amount,notes,sale_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(ono,b.customer_id||null,b.order_date,b.delivery_date||null,'New','Pending',0,b.product||null,b.design_reference||null,b.fabric_details||null,b.printing_details||null,b.embroidery_details||null,b.accessories||null,b.production_notes||null,b.total_qty||0,b.total_amount||0,b.notes||null,b.sale_id||null).run();
      const oid = r.meta.last_row_id;
      // Mark the linked invoice as ordered so it won't appear in future searches
      if (b.sale_id) {
        await env.pandora_db.prepare(`UPDATE sales SET is_ordered=1 WHERE id=?`).bind(b.sale_id).run();
      }
      for (const sz of (b.sizes||[])) {
        await env.pandora_db.prepare(`INSERT INTO order_sizes (order_id,size,qty,half,full,other,other_desc) VALUES (?,?,?,?,?,?,?)`).bind(oid,sz.size,sz.qty||0,sz.half||0,sz.full||0,sz.other||0,sz.other_desc||'').run();
      }
      const order = await env.pandora_db.prepare('SELECT o.*,c.name customer_name,c.phone customer_phone,c.mobile customer_mobile,s.invoice_no FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sale_id WHERE o.id=?').bind(oid).first();
      const sizes = await env.pandora_db.prepare('SELECT * FROM order_sizes WHERE order_id=?').bind(oid).all();
      return json({ order, sizes: sizes.results }, 201);
    }
    const ordMatch = path.match(/^\/orders\/(\d+)$/);
    if (ordMatch) {
      const id = Number(ordMatch[1]);
      if (method === 'GET') {
        const o = await env.pandora_db.prepare('SELECT o.*,c.name customer_name,c.phone customer_phone,c.mobile customer_mobile,s.invoice_no FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sale_id WHERE o.id=?').bind(id).first();
        if (!o) return err('Not found', 404);
        const sizes = await env.pandora_db.prepare('SELECT * FROM order_sizes WHERE order_id=?').bind(id).all();
        return json({ order: o, sizes: sizes.results });
      }
      if (method === 'PATCH') {
        const b = await request.json() as any;
        if (b.status !== undefined) await env.pandora_db.prepare(`UPDATE orders SET status=? WHERE id=?`).bind(b.status, id).run();
        if (b.production_status !== undefined) await env.pandora_db.prepare(`UPDATE orders SET production_status=? WHERE id=?`).bind(b.production_status, id).run();
        if (b.progress !== undefined) await env.pandora_db.prepare(`UPDATE orders SET progress=? WHERE id=?`).bind(b.progress, id).run();
        const order = await env.pandora_db.prepare('SELECT o.*,c.name customer_name,c.phone customer_phone,c.mobile customer_mobile,s.invoice_no FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sale_id WHERE o.id=?').bind(id).first();
        const sizes = await env.pandora_db.prepare('SELECT * FROM order_sizes WHERE order_id=?').bind(id).all();
        return json({ order, sizes: sizes.results });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE orders SET customer_id=?,order_date=?,delivery_date=?,status=?,production_status=?,progress=?,product=?,design_reference=?,fabric_details=?,printing_details=?,embroidery_details=?,accessories=?,production_notes=?,total_qty=?,total_amount=?,notes=? WHERE id=?`)
          .bind(b.customer_id||null,b.order_date,b.delivery_date||null,b.status||'New',b.production_status||'Pending',b.progress||0,b.product||null,b.design_reference||null,b.fabric_details||null,b.printing_details||null,b.embroidery_details||null,b.accessories||null,b.production_notes||null,b.total_qty||0,b.total_amount||0,b.notes||null,id).run();
        await env.pandora_db.prepare('DELETE FROM order_sizes WHERE order_id=?').bind(id).run();
        for (const sz of (b.sizes||[])) {
          await env.pandora_db.prepare(`INSERT INTO order_sizes (order_id,size,qty,half,full,other,other_desc) VALUES (?,?,?,?,?,?,?)`).bind(id,sz.size,sz.qty||0,sz.half||0,sz.full||0,sz.other||0,sz.other_desc||'').run();
        }
        const order = await env.pandora_db.prepare('SELECT o.*,c.name customer_name,c.phone customer_phone,c.mobile customer_mobile,s.invoice_no FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN sales s ON s.id=o.sale_id WHERE o.id=?').bind(id).first();
        const sizes = await env.pandora_db.prepare('SELECT * FROM order_sizes WHERE order_id=?').bind(id).all();
        return json({ order, sizes: sizes.results });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM orders WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── STAFF ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/staff') {
      const rows = await env.pandora_db.prepare(`
        SELECT s.*, d.name dept_name, t.name team_name FROM staff s
        LEFT JOIN departments d ON d.id=s.department_id
        LEFT JOIN teams t ON t.id=s.team_id
        ORDER BY s.created_at DESC`).all();
      return json({ staff: rows.results });
    }
    if (method === 'POST' && path === '/staff') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const sid = b.staff_id || `STF-${Date.now().toString().slice(-6)}`;
      const r = await env.pandora_db.prepare(
        `INSERT INTO staff (staff_id,name,department_id,team_id,position,mobile,email,address,salary,joined_date,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(sid,b.name,b.department_id||null,b.team_id||null,b.position||null,b.mobile||null,b.email||null,b.address||null,b.salary||0,b.joined_date||null,b.status||'Active',b.notes||null).run();
      return json({ staff: await env.pandora_db.prepare('SELECT * FROM staff WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const staffMatch = path.match(/^\/staff\/(\d+)$/);
    if (staffMatch) {
      const id = Number(staffMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE staff SET name=?,department_id=?,team_id=?,position=?,mobile=?,email=?,address=?,salary=?,joined_date=?,status=?,notes=? WHERE id=?`)
          .bind(b.name,b.department_id||null,b.team_id||null,b.position||null,b.mobile||null,b.email||null,b.address||null,b.salary||0,b.joined_date||null,b.status||'Active',b.notes||null,id).run();
        return json({ staff: await env.pandora_db.prepare('SELECT * FROM staff WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM staff WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── DEPARTMENTS ─────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/departments') {
      const rows = await env.pandora_db.prepare('SELECT * FROM departments ORDER BY name').all();
      return json({ departments: rows.results });
    }
    if (method === 'POST' && path === '/departments') {
      const b = await request.json() as any;
      const r = await env.pandora_db.prepare('INSERT INTO departments (name) VALUES (?)').bind(b.name).run();
      return json({ department: await env.pandora_db.prepare('SELECT * FROM departments WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    if (path.match(/^\/departments\/(\d+)$/) && method === 'DELETE') {
      const id = Number(path.split('/')[2]);
      await env.pandora_db.prepare('DELETE FROM departments WHERE id=?').bind(id).run();
      return json({ message: 'Deleted' });
    }
    if (path.match(/^\/departments\/(\d+)$/) && method === 'PUT') {
      const id = Number(path.split('/')[2]);
      const b = await request.json() as any;
      await env.pandora_db.prepare('UPDATE departments SET name=? WHERE id=?').bind(b.name, id).run();
      return json({ department: await env.pandora_db.prepare('SELECT * FROM departments WHERE id=?').bind(id).first() });
    }

    // ─── TEAMS ───────────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/teams') {
      const rows = await env.pandora_db.prepare('SELECT t.*,d.name dept_name FROM teams t LEFT JOIN departments d ON d.id=t.department_id ORDER BY t.name').all();
      return json({ teams: rows.results });
    }
    if (method === 'POST' && path === '/teams') {
      const b = await request.json() as any;
      const r = await env.pandora_db.prepare('INSERT INTO teams (name,department_id) VALUES (?,?)').bind(b.name,b.department_id||null).run();
      return json({ team: await env.pandora_db.prepare('SELECT * FROM teams WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    if (path.match(/^\/teams\/(\d+)$/) && method === 'DELETE') {
      const id = Number(path.split('/')[2]);
      await env.pandora_db.prepare('DELETE FROM teams WHERE id=?').bind(id).run();
      return json({ message: 'Deleted' });
    }
    if (path.match(/^\/teams\/(\d+)$/) && method === 'PUT') {
      const id = Number(path.split('/')[2]);
      const b = await request.json() as any;
      await env.pandora_db.prepare('UPDATE teams SET name=?,department_id=? WHERE id=?').bind(b.name, b.department_id||null, id).run();
      return json({ team: await env.pandora_db.prepare('SELECT t.*,d.name dept_name FROM teams t LEFT JOIN departments d ON d.id=t.department_id WHERE t.id=?').bind(id).first() });
    }

    // ─── EXPENSE CATEGORIES ──────────────────────────────────────────────────
    if (path === '/expense-categories' || path.startsWith('/expense-categories/')) {
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS expense_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`).run();
    }
    if (method === 'GET' && path === '/expense-categories') {
      const rows = await env.pandora_db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
      return json({ categories: rows.results });
    }
    if (method === 'POST' && path === '/expense-categories') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const r = await env.pandora_db.prepare('INSERT INTO expense_categories (name) VALUES (?)').bind(b.name.trim()).run();
      return json({ category: await env.pandora_db.prepare('SELECT * FROM expense_categories WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const ecMatch = path.match(/^\/expense-categories\/(\d+)$/);
    if (ecMatch) {
      const id = Number(ecMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare('UPDATE expense_categories SET name=? WHERE id=?').bind(b.name.trim(), id).run();
        return json({ category: await env.pandora_db.prepare('SELECT * FROM expense_categories WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM expense_categories WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── EXPENSE PAYERS ──────────────────────────────────────────────────────
    if (path === '/expense-payers' || path.startsWith('/expense-payers/')) {
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS expense_payers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`).run();
    }
    if (method === 'GET' && path === '/expense-payers') {
      const rows = await env.pandora_db.prepare('SELECT * FROM expense_payers ORDER BY name').all();
      return json({ payers: rows.results });
    }
    if (method === 'POST' && path === '/expense-payers') {
      const b = await request.json() as any;
      if (!b.name) return err('Name required');
      const r = await env.pandora_db.prepare('INSERT INTO expense_payers (name) VALUES (?)').bind(b.name.trim()).run();
      return json({ payer: await env.pandora_db.prepare('SELECT * FROM expense_payers WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const epMatch = path.match(/^\/expense-payers\/(\d+)$/);
    if (epMatch) {
      const id = Number(epMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare('UPDATE expense_payers SET name=? WHERE id=?').bind(b.name.trim(), id).run();
        return json({ payer: await env.pandora_db.prepare('SELECT * FROM expense_payers WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM expense_payers WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── EXPENSES ────────────────────────────────────────────────────────────
    // Self-migrate: add paid_by column if missing
    try { await env.pandora_db.prepare('ALTER TABLE expenses ADD COLUMN paid_by TEXT').run(); } catch (_) {}

    if (method === 'GET' && path === '/expenses') {
      const month = url.searchParams.get('month');
      let q = 'SELECT * FROM expenses';
      if (month) q += ` WHERE strftime('%Y-%m',expense_date)='${month}'`;
      q += ' ORDER BY expense_date DESC';
      const rows = await env.pandora_db.prepare(q).all();
      const stats = await env.pandora_db.prepare(`SELECT category, ROUND(SUM(amount),2) total FROM expenses ${month?`WHERE strftime('%Y-%m',expense_date)='${month}'`:''} GROUP BY category`).all();
      return json({ expenses: rows.results, stats: stats.results });
    }
    if (method === 'POST' && path === '/expenses') {
      const b = await request.json() as any;
      if (!b.expense_date || !b.category || b.amount == null || b.amount === '') return err('Date, category, amount required');
      const r = await env.pandora_db.prepare(`INSERT INTO expenses (expense_date,category,amount,notes,paid_by) VALUES (?,?,?,?,?)`)
        .bind(b.expense_date,b.category,b.amount,b.notes||null,b.paid_by||null).run();
      return json({ expense: await env.pandora_db.prepare('SELECT * FROM expenses WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const expMatch = path.match(/^\/expenses\/(\d+)$/);
    if (expMatch) {
      const id = Number(expMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        await env.pandora_db.prepare(`UPDATE expenses SET expense_date=?,category=?,amount=?,notes=?,paid_by=? WHERE id=?`)
          .bind(b.expense_date,b.category,b.amount,b.notes||null,b.paid_by||null,id).run();
        return json({ expense: await env.pandora_db.prepare('SELECT * FROM expenses WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM expenses WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── SETTINGS ────────────────────────────────────────────────────────────
    if (path === '/settings') {
      // Ensure app_settings KV table exists (self-migrating)
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`).run();
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS sale_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'Cash', paid_at TEXT NOT NULL DEFAULT (date('now')), FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE)`).run();
      // Self-migrate: add quality_rating to customers if missing
      try { await env.pandora_db.prepare('ALTER TABLE customers ADD COLUMN quality_rating INTEGER NOT NULL DEFAULT 100').run(); } catch(_){};

      if (method === 'GET') {
        const cs = await env.pandora_db.prepare('SELECT * FROM company_settings WHERE id=1').first<any>();
        const kvRows = await env.pandora_db.prepare('SELECT key, value FROM app_settings').all<any>();
        const kv: Record<string,string> = {};
        for (const r of (kvRows.results || [])) kv[r.key] = r.value;
        // expose logo_url as company_logo for frontend compatibility
        return json({ settings: { ...cs, ...kv, company_logo: cs?.logo_url || '' } });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        // logo: stored in company_settings.logo_url column; frontend sends as company_logo
        const logoVal = b.company_logo !== undefined ? (b.company_logo || null) : undefined;
        // Core company_settings columns
        if (logoVal !== undefined) {
          await env.pandora_db.prepare(`UPDATE company_settings SET name=?,address=?,phone=?,email=?,logo_url=?,order_prefix=?,invoice_prefix=?,quotation_prefix=?,order_seq=?,invoice_seq=?,quotation_seq=? WHERE id=1`)
            .bind(b.name||null,b.address||null,b.phone||null,b.email||null,logoVal,b.order_prefix||'ORD',b.invoice_prefix||'INV',b.quotation_prefix||'QUO',Number(b.order_seq)||1,Number(b.invoice_seq)||1,Number(b.quotation_seq)||1).run();
        } else {
          await env.pandora_db.prepare(`UPDATE company_settings SET name=?,address=?,phone=?,email=?,order_prefix=?,invoice_prefix=?,quotation_prefix=?,order_seq=?,invoice_seq=?,quotation_seq=? WHERE id=1`)
            .bind(b.name||null,b.address||null,b.phone||null,b.email||null,b.order_prefix||'ORD',b.invoice_prefix||'INV',b.quotation_prefix||'QUO',Number(b.order_seq)||1,Number(b.invoice_seq)||1,Number(b.quotation_seq)||1).run();
        }
        // Extra settings → app_settings KV
        const extraKeys = ['currency_symbol','date_format','print_paper_size','print_show_images','print_show_elements','print_show_sizes','receipt_header_url','cal_capacity','default_order_status','wa_enabled','wa_country_code','wa_btn_position','wa_auto_confirmed','wa_auto_ready','wa_tpl_order_confirmation','wa_tpl_order_ready','wa_tpl_order_delivered','wa_tpl_payment_reminder','wa_reminder_enabled','wa_reminder_duration_days','wa_reminder_interval_days','wa_api_enabled','wa_api_phone_number_id','wa_api_access_token','wa_api_version'];
        for (const k of extraKeys) {
          if (b[k] !== undefined) {
            await env.pandora_db.prepare(`INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k, String(b[k])).run();
          }
        }
        // Return merged settings — expose logo_url as company_logo for frontend
        const cs = await env.pandora_db.prepare('SELECT * FROM company_settings WHERE id=1').first<any>();
        const kvRows = await env.pandora_db.prepare('SELECT key, value FROM app_settings').all<any>();
        const kv: Record<string,string> = {};
        for (const r of (kvRows.results || [])) kv[r.key] = r.value;
        const merged = { ...cs, ...kv, company_logo: cs?.logo_url || '' };
        return json({ settings: merged });
      }
    }

    // ─── KPI (existing employees + evaluations) ───────────────────────────────
    if (method === 'GET' && path === '/employees') {
      const rows = await env.pandora_db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all();
      return json({ employees: rows.results });
    }
    if (method === 'POST' && path === '/employees') {
      const b = await request.json() as any;
      const { name, department, position, employee_id } = b;
      if (!name || !department || !position || !employee_id) return err('name, department, position, employee_id required');
      const existing = await env.pandora_db.prepare('SELECT id FROM employees WHERE employee_id=?').bind(employee_id).first();
      if (existing) return err('Employee ID already exists', 409);
      const r = await env.pandora_db.prepare('INSERT INTO employees (name,department,position,employee_id) VALUES (?,?,?,?)').bind(name,department,position,employee_id).run();
      return json({ employee: await env.pandora_db.prepare('SELECT * FROM employees WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    const empMatch = path.match(/^\/employees\/(\d+)$/);
    if (empMatch) {
      const id = Number(empMatch[1]);
      if (method === 'PUT') {
        const b = await request.json() as any;
        const conflict = await env.pandora_db.prepare('SELECT id FROM employees WHERE employee_id=? AND id!=?').bind(b.employee_id,id).first();
        if (conflict) return err('Employee ID already used', 409);
        await env.pandora_db.prepare('UPDATE employees SET name=?,department=?,position=?,employee_id=? WHERE id=?').bind(b.name,b.department,b.position,b.employee_id,id).run();
        return json({ employee: await env.pandora_db.prepare('SELECT * FROM employees WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM employees WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // Evaluations
    if (method === 'GET' && path === '/evaluations') {
      const month = url.searchParams.get('month');
      const employeeId = url.searchParams.get('employeeId');
      let q = `SELECT ev.*, emp.name as employee_name, emp.department FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id`;
      const wheres: string[] = [];
      if (month) wheres.push(`ev.month='${month}'`);
      if (employeeId) wheres.push(`ev.employee_id=${employeeId}`);
      if (wheres.length) q += ' WHERE ' + wheres.join(' AND ');
      q += ' ORDER BY ev.created_at DESC';
      const rows = await env.pandora_db.prepare(q).all();
      return json({ evaluations: rows.results });
    }
    if (method === 'POST' && path === '/evaluations') {
      const b = await request.json() as any;
      const emp = await env.pandora_db.prepare('SELECT id FROM employees WHERE id=?').bind(b.employee_id).first();
      if (!emp) return err('Employee not found', 404);
      const teamwork_score = ((b.team_respect_supervisors?1:0)+(b.team_cooperation?1:0)+(b.team_follow_instructions?1:0)+(b.team_no_conflicts?1:0))*2.5;
      const discipline_score = parseFloat((((b.discipline_phone_stars+b.discipline_activities_stars+b.discipline_behaviour_stars)/15)*10).toFixed(2));
      const total_score = (b.attendance_score||0)+(b.punctuality_score||0)+(b.productivity_score||0)+(b.quality_score||0)+teamwork_score+(b.initiative_score||0)+discipline_score;
      const percentage = parseFloat(((total_score/70)*100).toFixed(2));
      const grade = gradeLabel(percentage);
      const r = await env.pandora_db.prepare(`INSERT INTO evaluations (employee_id,month,supervisor_name,evaluation_date,days_leave_taken,attendance_score,attendance_remark,late_minutes,punctuality_score,punctuality_remark,productivity_stars,productivity_score,productivity_remark,quality_stars,quality_score,quality_remark,team_respect_supervisors,team_cooperation,team_follow_instructions,team_no_conflicts,teamwork_score,teamwork_remark,initiative_stars,initiative_score,initiative_remark,discipline_phone_stars,discipline_activities_stars,discipline_behaviour_stars,discipline_score,discipline_remark,total_score,percentage,grade,recommendation,supervisor_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(b.employee_id,b.month,b.supervisor_name,b.evaluation_date,b.days_leave_taken||0,b.attendance_score||0,b.attendance_remark||null,b.late_minutes||0,b.punctuality_score||0,b.punctuality_remark||null,b.productivity_stars||0,b.productivity_score||0,b.productivity_remark||null,b.quality_stars||0,b.quality_score||0,b.quality_remark||null,b.team_respect_supervisors?1:0,b.team_cooperation?1:0,b.team_follow_instructions?1:0,b.team_no_conflicts?1:0,teamwork_score,b.teamwork_remark||null,b.initiative_stars||0,b.initiative_score||0,b.initiative_remark||null,b.discipline_phone_stars||0,b.discipline_activities_stars||0,b.discipline_behaviour_stars||0,discipline_score,b.discipline_remark||null,total_score,percentage,grade,b.recommendation||'No Action',b.supervisor_comment||null).run();
      return json({ evaluation: await env.pandora_db.prepare('SELECT * FROM evaluations WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
    }
    // Monthly summary: aggregate multiple evaluations per employee per month → AVG
    if (method === 'GET' && path === '/evaluations/summary') {
      const month = url.searchParams.get('month');
      const wheres: string[] = [];
      if (month) wheres.push(`ev.month='${month}'`);
      const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
      const rows = await env.pandora_db.prepare(`
        SELECT
          ev.employee_id,
          emp.name AS employee_name,
          emp.department,
          emp.employee_id AS emp_code,
          ev.month,
          COUNT(ev.id) AS eval_count,
          ROUND(AVG(ev.attendance_score),1) AS avg_attendance,
          ROUND(AVG(ev.punctuality_score),1) AS avg_punctuality,
          ROUND(AVG(ev.productivity_score),1) AS avg_productivity,
          ROUND(AVG(ev.quality_score),1) AS avg_quality,
          ROUND(AVG(ev.teamwork_score),1) AS avg_teamwork,
          ROUND(AVG(ev.initiative_score),1) AS avg_initiative,
          ROUND(AVG(ev.discipline_score),1) AS avg_discipline,
          ROUND(AVG(ev.total_score),1) AS avg_total,
          ROUND(AVG(ev.percentage),1) AS avg_percentage,
          ROUND(AVG(ev.days_leave_taken),1) AS avg_leave,
          ROUND(AVG(ev.late_minutes),1) AS avg_late_minutes
        FROM evaluations ev
        JOIN employees emp ON emp.id = ev.employee_id
        ${where}
        GROUP BY ev.employee_id, ev.month
        ORDER BY ev.month DESC, avg_percentage DESC
      `).all();
      // Compute grade for each row
      const summaries = (rows.results || []).map((r: any) => ({
        ...r,
        grade: gradeLabel(r.avg_percentage),
      }));
      return json({ summaries });
    }

    const evMatch = path.match(/^\/evaluations\/(\d+)$/);
    if (evMatch) {
      const id = Number(evMatch[1]);
      if (method === 'GET') {
        const ev = await env.pandora_db.prepare(`SELECT ev.*,emp.name as employee_name,emp.department FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.id=?`).bind(id).first();
        if (!ev) return err('Not found', 404);
        return json({ evaluation: ev });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        const teamwork_score = ((b.team_respect_supervisors?1:0)+(b.team_cooperation?1:0)+(b.team_follow_instructions?1:0)+(b.team_no_conflicts?1:0))*2.5;
        const discipline_score = parseFloat((((b.discipline_phone_stars+b.discipline_activities_stars+b.discipline_behaviour_stars)/15)*10).toFixed(2));
        const total_score = (b.attendance_score||0)+(b.punctuality_score||0)+(b.productivity_score||0)+(b.quality_score||0)+teamwork_score+(b.initiative_score||0)+discipline_score;
        const percentage = parseFloat(((total_score/70)*100).toFixed(2));
        const grade = gradeLabel(percentage);
        await env.pandora_db.prepare(`UPDATE evaluations SET employee_id=?,month=?,supervisor_name=?,evaluation_date=?,days_leave_taken=?,attendance_score=?,attendance_remark=?,late_minutes=?,punctuality_score=?,punctuality_remark=?,productivity_stars=?,productivity_score=?,productivity_remark=?,quality_stars=?,quality_score=?,quality_remark=?,team_respect_supervisors=?,team_cooperation=?,team_follow_instructions=?,team_no_conflicts=?,teamwork_score=?,teamwork_remark=?,initiative_stars=?,initiative_score=?,initiative_remark=?,discipline_phone_stars=?,discipline_activities_stars=?,discipline_behaviour_stars=?,discipline_score=?,discipline_remark=?,total_score=?,percentage=?,grade=?,recommendation=?,supervisor_comment=? WHERE id=?`)
          .bind(b.employee_id,b.month,b.supervisor_name,b.evaluation_date,b.days_leave_taken||0,b.attendance_score||0,b.attendance_remark||null,b.late_minutes||0,b.punctuality_score||0,b.punctuality_remark||null,b.productivity_stars||0,b.productivity_score||0,b.productivity_remark||null,b.quality_stars||0,b.quality_score||0,b.quality_remark||null,b.team_respect_supervisors?1:0,b.team_cooperation?1:0,b.team_follow_instructions?1:0,b.team_no_conflicts?1:0,teamwork_score,b.teamwork_remark||null,b.initiative_stars||0,b.initiative_score||0,b.initiative_remark||null,b.discipline_phone_stars||0,b.discipline_activities_stars||0,b.discipline_behaviour_stars||0,discipline_score,b.discipline_remark||null,total_score,percentage,grade,b.recommendation||'No Action',b.supervisor_comment||null,id).run();
        return json({ evaluation: await env.pandora_db.prepare('SELECT * FROM evaluations WHERE id=?').bind(id).first() });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM evaluations WHERE id=?').bind(id).run();
        return json({ message: 'Deleted' });
      }
    }

    // ─── KPI REPORTS ─────────────────────────────────────────────────────────
    const reportMatch = path.match(/^\/reports\/([a-z_-]+)$/);
    if (method === 'GET' && reportMatch) {
      const type = reportMatch[1];
      const month = url.searchParams.get('month');
      const mf = month ? `WHERE ev.month='${month}'` : '';
      const mf2 = month ? `AND ev.month='${month}'` : '';

      if (type === 'top-performers') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.percentage,ev.grade,ev.recommendation FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id ${mf} ORDER BY ev.percentage DESC LIMIT 20`).all();
        return json({ data: rows.results });
      }
      if (type === 'attendance') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.days_leave_taken,ev.attendance_score,ev.attendance_remark FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.days_leave_taken>=3 ${mf2} ORDER BY ev.days_leave_taken DESC`).all();
        return json({ data: rows.results });
      }
      if (type === 'discipline') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.discipline_score,ev.discipline_remark FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.discipline_score<6 ${mf2} ORDER BY ev.discipline_score ASC`).all();
        return json({ data: rows.results });
      }
      if (type === 'salary-increment') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.percentage,ev.grade,ev.recommendation FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.percentage>=80 ${mf2} ORDER BY ev.percentage DESC`).all();
        return json({ data: rows.results });
      }
      if (type === 'training-needs') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.initiative_score,ev.initiative_remark FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.initiative_score<6 ${mf2} ORDER BY ev.initiative_score ASC`).all();
        return json({ data: rows.results });
      }
      if (type === 'risk-employees') {
        const rows = await env.pandora_db.prepare(`SELECT ev.id,emp.name employeeName,emp.department,ev.month,ev.percentage,ev.grade,ev.recommendation FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id WHERE ev.percentage<60 ${mf2} ORDER BY ev.percentage ASC`).all();
        return json({ data: rows.results });
      }
      // Sales reports
      if (type === 'sales-report') {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        let where = '';
        if (from && to) where = `WHERE s.sale_date >= '${from}' AND s.sale_date <= '${to}'`;
        else if (month) where = `WHERE strftime('%Y-%m',s.sale_date)='${month}'`;
        const rows = await env.pandora_db.prepare(
          `SELECT s.*, c.name customer_name,
            COALESCE(s.paid_amount,0) amount_paid,
            ROUND(COALESCE(s.total_amount,0) - COALESCE(s.paid_amount,0), 2) due_amount,
            CAST((julianday('now') - julianday(s.sale_date)) AS INTEGER) days_since
           FROM sales s LEFT JOIN customers c ON c.id=s.customer_id
           ${where} ORDER BY s.sale_date DESC`
        ).all();
        return json({ data: rows.results });
      }
      if (type === 'purchase-report') {
        const rows = await env.pandora_db.prepare(`SELECT p.*,s.name supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id ${month?`WHERE strftime('%Y-%m',purchase_date)='${month}'`:''} ORDER BY purchase_date DESC`).all();
        return json({ data: rows.results });
      }
      if (type === 'stock-report') {
        const rows = await env.pandora_db.prepare(`SELECT * FROM items WHERE manage_stock=1 AND status='Active' ORDER BY stock_qty ASC`).all();
        return json({ data: rows.results });
      }
      if (type === 'order-report') {
        const status = url.searchParams.get('status');
        const rows = await env.pandora_db.prepare(`SELECT o.*,c.name customer_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ${status?`WHERE o.status='${status}'`:''} ORDER BY o.created_at DESC`).all();
        return json({ data: rows.results });
      }
      if (type === 'expense-report') {
        const rows = await env.pandora_db.prepare(`SELECT * FROM expenses ${month?`WHERE strftime('%Y-%m',expense_date)='${month}'`:''} ORDER BY expense_date DESC`).all();
        const summary = await env.pandora_db.prepare(`SELECT category,ROUND(SUM(amount),2) total FROM expenses ${month?`WHERE strftime('%Y-%m',expense_date)='${month}'`:''} GROUP BY category`).all();
        return json({ data: rows.results, summary: summary.results });
      }
      if (type === 'production-report') {
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const statusFilter = url.searchParams.get('status') || 'Delivered';
        let where = `WHERE o.status='${statusFilter}'`;
        if (from && to) where += ` AND o.order_date >= '${from}' AND o.order_date <= '${to}'`;
        else if (month) where += ` AND strftime('%Y-%m',o.order_date)='${month}'`;

        // Summary by product type
        const byProduct = await env.pandora_db.prepare(`
          SELECT
            COALESCE(o.product,'Unspecified') product,
            COUNT(DISTINCT o.id) order_count,
            SUM(o.total_qty) total_pcs,
            SUM(o.total_amount) total_amount
          FROM orders o
          ${where}
          GROUP BY COALESCE(o.product,'Unspecified')
          ORDER BY total_pcs DESC
        `).all();

        // Size breakdown across all orders in period
        const bySizes = await env.pandora_db.prepare(`
          SELECT
            os.size,
            COALESCE(o.product,'Unspecified') product,
            SUM(os.qty) total_qty,
            SUM(os.half) half_qty,
            SUM(os.full) full_qty,
            SUM(os.other) other_qty
          FROM order_sizes os
          JOIN orders o ON o.id=os.order_id
          ${where}
          GROUP BY os.size, COALESCE(o.product,'Unspecified')
          ORDER BY COALESCE(o.product,'Unspecified'), os.size
        `).all();

        // Detail rows
        const detail = await env.pandora_db.prepare(`
          SELECT
            o.order_no, o.product, o.delivery_date, o.order_date,
            o.total_qty, o.total_amount, o.status, o.production_status,
            c.name customer_name
          FROM orders o
          LEFT JOIN customers c ON c.id=o.customer_id
          ${where}
          ORDER BY o.delivery_date DESC
        `).all();

        // Totals
        const totals = await env.pandora_db.prepare(`
          SELECT COUNT(DISTINCT o.id) total_orders, SUM(o.total_qty) total_pcs, SUM(o.total_amount) total_amount
          FROM orders o ${where}
        `).first<any>();

        return json({ byProduct: byProduct.results, bySizes: bySizes.results, detail: detail.results, totals });
      }
      if (type === 'profit-report') {
        const rows = await env.pandora_db.prepare(`
          SELECT m.month,
            COALESCE(s.sales,0) sales,
            COALESCE(e.expenses,0) expenses,
            ROUND(COALESCE(s.sales,0)-COALESCE(e.expenses,0),2) profit
          FROM (
            SELECT strftime('%Y-%m',sale_date) month FROM sales
            UNION SELECT strftime('%Y-%m',expense_date) FROM expenses
          ) m
          LEFT JOIN (SELECT strftime('%Y-%m',sale_date) month, ROUND(SUM(total_amount),2) sales FROM sales GROUP BY month) s ON s.month=m.month
          LEFT JOIN (SELECT strftime('%Y-%m',expense_date) month, ROUND(SUM(amount),2) expenses FROM expenses GROUP BY month) e ON e.month=m.month
          GROUP BY m.month ORDER BY m.month DESC LIMIT 12`).all();
        return json({ data: rows.results });
      }
      return err('Unknown report type', 404);
    }

    // ─── WHATSAPP CLOUD API SEND ──────────────────────────────────────────────
    if (method === 'POST' && path === '/wa/send') {
      const b = await request.json() as any;
      // Load API credentials from settings
      const getSetting = async (key: string) => {
        const row = await env.pandora_db.prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first<any>();
        return row?.value || '';
      };
      const apiEnabled = await getSetting('wa_api_enabled');
      if (apiEnabled !== 'true') return err('WhatsApp API not enabled', 400);
      const phoneNumberId = await getSetting('wa_api_phone_number_id');
      const accessToken   = await getSetting('wa_api_access_token');
      const apiVersion    = await getSetting('wa_api_version') || 'v19.0';
      if (!phoneNumberId || !accessToken) return err('WhatsApp API credentials not configured', 400);

      const { to, message, template_name, template_lang, template_params } = b;
      if (!to) return err('Missing recipient phone number', 400);

      let payload: any;
      if (template_name) {
        // Template message (for reminders / outbound)
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template_name,
            language: { code: template_lang || 'en' },
            components: template_params ? [{
              type: 'body',
              parameters: (template_params as string[]).map((t: string) => ({ type: 'text', text: t })),
            }] : [],
          },
        };
      } else if (message) {
        // Free-form text (within 24hr window)
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        };
      } else {
        return err('Provide either message or template_name', 400);
      }

      const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as any;
      if (!res.ok) return json({ ok: false, error: data }, res.status);
      return json({ ok: true, data });
    }

    // ─── PRICE GROUPS ────────────────────────────────────────────────────────
    if (path === '/price-groups') {
      if (method === 'GET') {
        const rows = await env.pandora_db.prepare('SELECT * FROM price_groups ORDER BY id').all();
        return json({ price_groups: rows.results });
      }
      if (method === 'POST') {
        const b: any = await request.json();
        const r = await env.pandora_db.prepare(
          'INSERT INTO price_groups (name, description, status) VALUES (?,?,?)'
        ).bind(b.name, b.description || null, b.status || 'Active').run();
        return json({ id: r.meta.last_row_id });
      }
    }
    if (path.match(/^\/price-groups\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') {
        const b: any = await request.json();
        await env.pandora_db.prepare(
          'UPDATE price_groups SET name=?, description=?, status=? WHERE id=?'
        ).bind(b.name, b.description || null, b.status || 'Active', id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM price_groups WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── ADDON ITEMS ─────────────────────────────────────────────────────────
    if (path === '/addon-items') {
      if (method === 'GET') {
        const rows = await env.pandora_db.prepare("SELECT * FROM addon_items WHERE status='Active' ORDER BY name").all();
        return json({ addon_items: rows.results });
      }
      if (method === 'POST') {
        const b: any = await request.json();
        const r = await env.pandora_db.prepare(
          'INSERT INTO addon_items (name, default_price, unit, status) VALUES (?,?,?,?)'
        ).bind(b.name, b.default_price || 0, b.unit || 'pcs', b.status || 'Active').run();
        return json({ id: r.meta.last_row_id });
      }
    }
    if (path.match(/^\/addon-items\/\d+$/)) {
      const id = parseInt(path.split('/')[2]);
      if (method === 'PUT') {
        const b: any = await request.json();
        await env.pandora_db.prepare(
          'UPDATE addon_items SET name=?, default_price=?, unit=?, status=? WHERE id=?'
        ).bind(b.name, b.default_price || 0, b.unit || 'pcs', b.status || 'Active', id).run();
        return json({ ok: true });
      }
      if (method === 'DELETE') {
        await env.pandora_db.prepare('DELETE FROM addon_items WHERE id=?').bind(id).run();
        return json({ ok: true });
      }
    }

    // ─── PAYMENT REMINDERS ───────────────────────────────────────────────────
    if (method === 'GET' && path === '/payment-reminders/due') {
      // Self-migrate
      await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS payment_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER UNIQUE,
        customer_id INTEGER,
        invoice_no TEXT,
        due_amount REAL,
        last_sent TEXT,
        send_count INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (date('now'))
      )`).run();

      const rows = await env.pandora_db.prepare(`
        SELECT pr.*, c.name customer_name, c.phone customer_phone
        FROM payment_reminders pr
        LEFT JOIN customers c ON c.id = pr.customer_id
        WHERE pr.active = 1
        ORDER BY pr.created_at DESC
      `).all<any>();
      return json({ reminders: rows.results || [] });
    }

    // ─── STATIC ASSETS / SPA ─────────────────────────────────────────────────
    // Known API prefixes return JSON 404; everything else serves the frontend.
    const API_PREFIXES = [
      '/health', '/dashboard', '/customers', '/customer-types', '/suppliers',
      '/items', '/inventory', '/stock-history', '/purchases', '/purchase-items',
      '/sales', '/sale-items', '/quotations', '/quotation-items', '/orders',
      '/staff', '/teams', '/departments', '/employees', '/evaluations',
      '/expenses', '/expense-categories', '/reports', '/settings', '/company-settings', '/price-groups',
      '/addon-items', '/order-', '/payment-reminders',
    ];
    if (API_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p))) {
      return err('Not found', 404);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    // Self-migrate payment_reminders table
    await env.pandora_db.prepare(`CREATE TABLE IF NOT EXISTS payment_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER UNIQUE,
      customer_id INTEGER,
      invoice_no TEXT,
      due_amount REAL,
      last_sent TEXT,
      send_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (date('now'))
    )`).run();

    // Load reminder settings
    const settingsRows = await env.pandora_db.prepare(
      `SELECT key, value FROM app_settings WHERE key IN ('wa_reminder_enabled','wa_reminder_duration_days','wa_reminder_interval_days')`
    ).all<any>();
    const settings: Record<string, string> = {};
    for (const r of (settingsRows.results || [])) settings[r.key] = r.value;

    if (settings['wa_reminder_enabled'] !== 'true') return;

    const durationDays = parseInt(settings['wa_reminder_duration_days'] || '60', 10);
    const intervalDays = parseInt(settings['wa_reminder_interval_days'] || '7', 10);

    // Deactivate reminders for paid sales
    await env.pandora_db.prepare(`
      UPDATE payment_reminders SET active = 0
      WHERE sale_id IN (
        SELECT id FROM sales WHERE payment_status = 'Paid'
      ) AND active = 1
    `).run();

    // Find Delivered orders with Due/Partial payment within duration window
    const due = await env.pandora_db.prepare(`
      SELECT s.id sale_id, s.customer_id, s.invoice_no,
             (s.total_amount - COALESCE(s.paid_amount,0)) due_amount,
             o.delivery_date
      FROM sales s
      JOIN orders o ON o.id = s.order_id
      WHERE s.payment_status IN ('Due','Partial')
        AND o.status = 'Delivered'
        AND o.delivery_date IS NOT NULL
        AND julianday('now') - julianday(o.delivery_date) <= ?
        AND julianday('now') - julianday(o.delivery_date) >= 0
    `).bind(durationDays).all<any>();

    for (const row of (due.results || [])) {
      // Check existing reminder
      const existing = await env.pandora_db.prepare(
        `SELECT id, last_sent, active FROM payment_reminders WHERE sale_id = ?`
      ).bind(row.sale_id).first<any>();

      if (existing) {
        // Already deactivated → skip
        if (!existing.active) continue;
        // Check interval
        if (existing.last_sent) {
          const daysSinceLast = Math.floor((Date.now() - new Date(existing.last_sent).getTime()) / 86400000);
          if (daysSinceLast < intervalDays) continue;
        }
        // Update: mark due (reset last_sent to today so frontend knows it's fresh)
        await env.pandora_db.prepare(
          `UPDATE payment_reminders SET due_amount=?, last_sent=date('now'), send_count=send_count+1, active=1 WHERE sale_id=?`
        ).bind(row.due_amount, row.sale_id).run();
      } else {
        // Insert new reminder
        await env.pandora_db.prepare(
          `INSERT INTO payment_reminders (sale_id, customer_id, invoice_no, due_amount, active) VALUES (?,?,?,?,1)`
        ).bind(row.sale_id, row.customer_id, row.invoice_no, row.due_amount).run();
      }
    }
  },
};
