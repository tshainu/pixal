export interface Env { pandora_db: D1Database; ASSETS: Fetcher; }

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

    // ─── DASHBOARD ───────────────────────────────────────────────────────────
    if (method === 'GET' && path === '/dashboard') {
      const month = url.searchParams.get('month') ?? '';
      const mf = month ? `WHERE strftime('%Y-%m', sale_date)='${month}'` : '';
      const emf = month ? `WHERE strftime('%Y-%m', expense_date)='${month}'` : '';
      const omf = month ? `WHERE strftime('%Y-%m', order_date)='${month}'` : '';

      const [
        totalCustomers, activeOrders, monthlySales, monthlyExpenses,
        totalStaff, avgKpi, lowStock, pendingQuotations,
        ordersDueWeek, salesTrend, expenseTrend, orderStatusDist,
        topCustomers, gradeDistRaw, deptPerf, topEmployees,
        evaluatedCount, avgScore, excellent, needsImprovement,
        attendanceIssues, promotionCandidates, salaryIncrementCandidates,
        delayedOrders, uncollectedOrders, upcomingDeliveries, recentOrders,
        dailySales, dailyExpenses
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
        env.pandora_db.prepare("SELECT c.name, COALESCE(SUM(s.total_amount),0) total FROM customers c LEFT JOIN sales s ON s.customer_id=c.id GROUP BY c.id ORDER BY total DESC LIMIT 5").all(),
        env.pandora_db.prepare(`SELECT grade, COUNT(*) count FROM evaluations ${month ? `WHERE month LIKE '${month}%'` : ''} GROUP BY grade`).all(),
        env.pandora_db.prepare("SELECT d.name department, ROUND(AVG(ev.percentage),1) avgScore FROM evaluations ev JOIN employees e ON e.id=ev.employee_id JOIN departments d ON d.name=e.department GROUP BY d.name").all(),
        env.pandora_db.prepare(`SELECT ev.id, emp.name employeeName, emp.department, ev.month, ev.percentage, ev.grade FROM evaluations ev JOIN employees emp ON emp.id=ev.employee_id ${month ? `WHERE ev.month='${month}'` : ''} ORDER BY ev.percentage DESC LIMIT 10`).all(),
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
        `INSERT INTO customers (customer_code,name,company_name,contact_person,phone,mobile,email,address,city,notes,type,credit_limit,credit_balance,opening_balance,status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(code,b.name,b.company_name||null,b.contact_person||null,phone,phone,b.email||null,b.address||null,b.city||null,b.notes||null,b.type||'retail',b.credit_limit||0,0,b.opening_balance||0,b.status||'Active').run();
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
          `UPDATE customers SET name=?,company_name=?,contact_person=?,phone=?,mobile=?,email=?,address=?,city=?,notes=?,type=?,credit_limit=?,opening_balance=?,status=? WHERE id=?`
        ).bind(b.name,b.company_name||null,b.contact_person||null,phone,phone,b.email||null,b.address||null,b.city||null,b.notes||null,b.type||'retail',b.credit_limit||0,b.opening_balance||0,b.status||'Active',id).run();
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

      const sale = await env.pandora_db.prepare('SELECT * FROM sales WHERE id=?').bind(sid).first();
      const items = await env.pandora_db.prepare('SELECT si.*,i.name item_name FROM sale_items si LEFT JOIN items i ON i.id=si.item_id WHERE si.sale_id=?').bind(sid).all();
      return json({ sale, items: items.results }, 201);
    }
    const saleMatch = path.match(/^\/sales\/(\d+)$/);
    if (saleMatch) {
      const id = Number(saleMatch[1]);
      if (method === 'GET') {
        const s = await env.pandora_db.prepare('SELECT s.*,c.name customer_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?').bind(id).first();
        const items = await env.pandora_db.prepare('SELECT si.*,i.name item_name FROM sale_items si LEFT JOIN items i ON i.id=si.item_id WHERE si.sale_id=?').bind(id).all();
        return json({ sale: s, items: items.results });
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
            COALESCE(SUM(CASE WHEN status NOT IN ('Cancelled') THEN total_amount ELSE 0 END),0) total_value
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

      if (method === 'GET') {
        const cs = await env.pandora_db.prepare('SELECT * FROM company_settings WHERE id=1').first<any>();
        const kvRows = await env.pandora_db.prepare('SELECT key, value FROM app_settings').all<any>();
        const kv: Record<string,string> = {};
        for (const r of (kvRows.results || [])) kv[r.key] = r.value;
        return json({ settings: { ...cs, ...kv } });
      }
      if (method === 'PUT') {
        const b = await request.json() as any;
        // Core company_settings columns
        await env.pandora_db.prepare(`UPDATE company_settings SET name=?,address=?,phone=?,email=?,order_prefix=?,invoice_prefix=?,quotation_prefix=?,order_seq=?,invoice_seq=?,quotation_seq=? WHERE id=1`)
          .bind(b.name,b.address||null,b.phone||null,b.email||null,b.order_prefix||'ORD',b.invoice_prefix||'INV',b.quotation_prefix||'QUO',Number(b.order_seq)||1,Number(b.invoice_seq)||1,Number(b.quotation_seq)||1).run();
        // Extra settings → app_settings KV
        const extraKeys = ['currency_symbol','date_format','print_paper_size','print_show_images','print_show_elements','print_show_sizes','cal_capacity','default_order_status','wa_enabled','wa_country_code','wa_btn_position','wa_auto_confirmed','wa_auto_ready','wa_tpl_order_confirmation','wa_tpl_order_ready','wa_tpl_order_delivered','wa_tpl_payment_reminder'];
        for (const k of extraKeys) {
          if (b[k] !== undefined) {
            await env.pandora_db.prepare(`INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k, String(b[k])).run();
          }
        }
        // Return merged settings
        const cs = await env.pandora_db.prepare('SELECT * FROM company_settings WHERE id=1').first<any>();
        const kvRows = await env.pandora_db.prepare('SELECT key, value FROM app_settings').all<any>();
        const kv: Record<string,string> = {};
        for (const r of (kvRows.results || [])) kv[r.key] = r.value;
        return json({ settings: { ...cs, ...kv } });
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
      const dup = await env.pandora_db.prepare('SELECT id FROM evaluations WHERE employee_id=? AND month=?').bind(b.employee_id,b.month).first();
      if (dup) return err('Evaluation already exists for this employee and month', 409);
      const teamwork_score = ((b.team_respect_supervisors?1:0)+(b.team_cooperation?1:0)+(b.team_follow_instructions?1:0)+(b.team_no_conflicts?1:0))*2.5;
      const discipline_score = parseFloat((((b.discipline_phone_stars+b.discipline_activities_stars+b.discipline_behaviour_stars)/15)*10).toFixed(2));
      const total_score = (b.attendance_score||0)+(b.punctuality_score||0)+(b.productivity_score||0)+(b.quality_score||0)+teamwork_score+(b.initiative_score||0)+discipline_score;
      const percentage = parseFloat(((total_score/70)*100).toFixed(2));
      const grade = gradeLabel(percentage);
      const r = await env.pandora_db.prepare(`INSERT INTO evaluations (employee_id,month,supervisor_name,evaluation_date,days_leave_taken,attendance_score,attendance_remark,late_minutes,punctuality_score,punctuality_remark,productivity_stars,productivity_score,productivity_remark,quality_stars,quality_score,quality_remark,team_respect_supervisors,team_cooperation,team_follow_instructions,team_no_conflicts,teamwork_score,teamwork_remark,initiative_stars,initiative_score,initiative_remark,discipline_phone_stars,discipline_activities_stars,discipline_behaviour_stars,discipline_score,discipline_remark,total_score,percentage,grade,recommendation,supervisor_comment) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(b.employee_id,b.month,b.supervisor_name,b.evaluation_date,b.days_leave_taken||0,b.attendance_score||0,b.attendance_remark||null,b.late_minutes||0,b.punctuality_score||0,b.punctuality_remark||null,b.productivity_stars||0,b.productivity_score||0,b.productivity_remark||null,b.quality_stars||0,b.quality_score||0,b.quality_remark||null,b.team_respect_supervisors?1:0,b.team_cooperation?1:0,b.team_follow_instructions?1:0,b.team_no_conflicts?1:0,teamwork_score,b.teamwork_remark||null,b.initiative_stars||0,b.initiative_score||0,b.initiative_remark||null,b.discipline_phone_stars||0,b.discipline_activities_stars||0,b.discipline_behaviour_stars||0,discipline_score,b.discipline_remark||null,total_score,percentage,grade,b.recommendation||'No Action',b.supervisor_comment||null).run();
      return json({ evaluation: await env.pandora_db.prepare('SELECT * FROM evaluations WHERE id=?').bind(r.meta.last_row_id).first() }, 201);
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
        const dup = await env.pandora_db.prepare('SELECT id FROM evaluations WHERE employee_id=? AND month=? AND id!=?').bind(b.employee_id,b.month,id).first();
        if (dup) return err('Evaluation already exists for this employee and month', 409);
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
            COALESCE(s.amount_paid,0) amount_paid,
            ROUND(COALESCE(s.total_amount,0) - COALESCE(s.amount_paid,0), 2) due_amount,
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

    // ─── STATIC ASSETS / SPA ─────────────────────────────────────────────────
    // Known API prefixes return JSON 404; everything else serves the frontend.
    const API_PREFIXES = [
      '/health', '/dashboard', '/customers', '/customer-types', '/suppliers',
      '/items', '/inventory', '/stock-history', '/purchases', '/purchase-items',
      '/sales', '/sale-items', '/quotations', '/quotation-items', '/orders',
      '/staff', '/teams', '/departments', '/employees', '/evaluations',
      '/expenses', '/expense-categories', '/reports', '/settings', '/company-settings', '/price-groups',
      '/addon-items', '/order-',
    ];
    if (API_PREFIXES.some(p => path === p || path.startsWith(p + '/') || path.startsWith(p))) {
      return err('Not found', 404);
    }
    return env.ASSETS.fetch(request);
  },
};
