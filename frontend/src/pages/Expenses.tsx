import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Plus, Search, Edit2, Trash2, X, Check } from 'lucide-react';

type Expense = {
  id: number; category: string; amount: number; paid_by: string;
  expense_date: string; payment_method: string; reference: string; notes: string;
};

type ExpCat = { id: number; name: string };
type ExpPayer = { id: number; name: string };

const EMPTY: Partial<Expense> = { category: '', amount: 0, paid_by: '', expense_date: today(), payment_method: 'cash', reference: '', notes: '' };

// ── Category Manage Modal (Full CRUD list) ───────────────────────────────────
function CatManageModal({ categories, onClose }: { categories: ExpCat[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const addCat = useMutation({
    mutationFn: (name: string) => api.createExpenseCategory(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-categories'] }); setNewName(''); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const updateCat = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.updateExpenseCategory(id, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-categories'] }); setEditingId(null); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const deleteCat = useMutation({
    mutationFn: (id: number) => api.deleteExpenseCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-categories'] }); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const startEdit = (c: ExpCat) => { setEditingId(c.id); setEditName(c.name); };
  const saveEdit = () => { if (editName.trim() && editingId) updateCat.mutate({ id: editingId, name: editName.trim() }); };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, width: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '0.95rem' }}>Manage Categories</h3>
          <button className="btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {/* Existing categories */}
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {categories.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '8px 0' }}>No categories yet. Add one below.</div>
            )}
            {categories.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                {editingId === c.id ? (
                  <>
                    <input
                      className="form-control"
                      style={{ flex: 1, height: 32, fontSize: '0.84rem' }}
                      value={editName}
                      autoFocus
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <button className="btn-icon" onClick={saveEdit} title="Save" style={{ color: 'var(--primary)' }}>
                      <Check size={14} />
                    </button>
                    <button className="btn-icon" onClick={() => setEditingId(null)} title="Cancel">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '0.87rem', color: 'var(--text1)' }}>{c.name}</span>
                    <button className="btn-icon" onClick={() => startEdit(c)} title="Rename"><Edit2 size={13} /></button>
                    <button
                      className="btn-icon"
                      style={{ color: 'var(--red)' }}
                      title="Delete"
                      onClick={() => { if (confirm(`Delete "${c.name}"? Won't affect existing expenses.`)) deleteCat.mutate(c.id); }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new */}
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add New Category</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                placeholder="Category name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addCat.mutate(newName.trim()); }}
              />
              <button
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap' }}
                disabled={addCat.isPending || !newName.trim()}
                onClick={() => addCat.mutate(newName.trim())}
              >
                <Plus size={13} /> Add
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Payer Manage Modal ───────────────────────────────────────────────────────
function PayerManageModal({ payers, onClose }: { payers: ExpPayer[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [newName, setNewName] = useState('');

  const addPayer = useMutation({
    mutationFn: (name: string) => api.createExpensePayer(name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-payers'] }); setNewName(''); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const updatePayer = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.updateExpensePayer(id, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-payers'] }); setEditingId(null); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const deletePayer = useMutation({
    mutationFn: (id: number) => api.deleteExpensePayer(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expense-payers'] }); },
    onError: (e: any) => alert('Failed: ' + (e?.message || 'Unknown error')),
  });

  const startEdit = (p: ExpPayer) => { setEditingId(p.id); setEditName(p.name); };
  const saveEdit = () => { if (editName.trim() && editingId) updatePayer.mutate({ id: editingId, name: editName.trim() }); };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, width: '100%' }}>
        <div className="modal-header">
          <h3 style={{ fontSize: '0.95rem' }}>Manage Payers</h3>
          <button className="btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="modal-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {payers.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: '0.82rem', padding: '8px 0' }}>No payers yet. Add one below.</div>
            )}
            {payers.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                {editingId === p.id ? (
                  <>
                    <input
                      className="form-control"
                      style={{ flex: 1, height: 32, fontSize: '0.84rem' }}
                      value={editName}
                      autoFocus
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    />
                    <button className="btn-icon" onClick={saveEdit} title="Save" style={{ color: 'var(--primary)' }}><Check size={14} /></button>
                    <button className="btn-icon" onClick={() => setEditingId(null)} title="Cancel"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '0.87rem', color: 'var(--text1)' }}>{p.name}</span>
                    <button className="btn-icon" onClick={() => startEdit(p)} title="Rename"><Edit2 size={13} /></button>
                    <button
                      className="btn-icon"
                      style={{ color: 'var(--red)' }}
                      title="Delete"
                      onClick={() => { if (confirm(`Delete "${p.name}"? Won't affect existing expenses.`)) deletePayer.mutate(p.id); }}
                    ><Trash2 size={13} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add New Payer</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                placeholder="Payer name…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addPayer.mutate(newName.trim()); }}
              />
              <button
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap' }}
                disabled={addPayer.isPending || !newName.trim()}
                onClick={() => addPayer.mutate(newName.trim())}
              ><Plus size={13} /> Add</button>
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Expenses() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [form, setForm] = useState<Partial<Expense>>(EMPTY);
  const [managingCats, setManagingCats] = useState(false);
  const [managingPayers, setManagingPayers] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['expenses', search, catFilter, month],
    queryFn: () => api.getExpenses({ search: search || undefined, category: catFilter || undefined, month: month || undefined }),
  });

  const { data: categories = [] } = useQuery<ExpCat[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.getExpenseCategories(),
  });

  const { data: payers = [] } = useQuery<ExpPayer[]>({
    queryKey: ['expense-payers'],
    queryFn: () => api.getExpensePayers(),
  });

  const save = useMutation({
    mutationFn: (d: Partial<Expense>) => d.id ? api.updateExpense(d.id, d) : api.createExpense(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setModal(null); },
    onError: (e: any) => alert('Save failed: ' + (e?.message || 'Unknown error')),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);
  const total = (data as Expense[]).reduce((s: number, e: Expense) => s + (e.amount || 0), 0);

  const byCategory: Record<string, number> = {};
  (data as Expense[]).forEach((e: Expense) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });

  return (
    <div>
      <div className="topbar">
        <h2>Expenses</h2>
        <div className="topbar-right">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY); setModal('add'); }}><Plus size={14} /> Add Expense</button>
        </div>
      </div>
      <div className="content">
        <div className="filter-bar">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-control" style={{ paddingLeft: 32, width: 240 }} placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: 180 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            {(categories as ExpCat[]).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <input className="form-control" type="month" style={{ width: 160 }} value={month} onChange={e => setMonth(e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
          <div className="card">
            {isLoading ? <div className="loading">Loading…</div> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Category</th><th>Paid By</th><th>Date</th><th>Payment</th><th>Amount</th><th></th></tr>
                  </thead>
                  <tbody>
                    {(data as Expense[]).length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 32 }}>No expenses found</td></tr>}
                    {(data as Expense[]).map((e: Expense) => (
                      <tr key={e.id}>
                        <td><span className="badge badge-average">{e.category}</span></td>
                        <td style={{ fontWeight: 500 }}>{e.paid_by || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                        <td style={{ fontSize: '0.78rem' }}>{e.expense_date}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{e.payment_method}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(e.amount)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" onClick={() => { setForm(e); setModal('edit'); }}><Edit2 size={14} /></button>
                            <button className="btn-icon" onClick={() => { if (confirm('Delete expense?')) del.mutate(e.id); }}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Category breakdown sidebar */}
          <div className="card" style={{ alignSelf: 'flex-start' }}>
            <div className="card-title">By Category</div>
            {Object.keys(byCategory).length === 0 && <div style={{ color: 'var(--text3)', fontSize: '0.82rem' }}>No data</div>}
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500 }}>{cat}</span>
                  <span style={{ color: 'var(--text3)' }}>{fmt(amt)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(amt / Math.max(total, 1)) * 100}%`, background: 'var(--red)' }} />
                </div>
              </div>
            ))}
            {total > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.85rem' }}>
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'add' ? 'Add Expense' : 'Edit Expense'}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Category</span>
                    <button type="button" onClick={() => setManagingCats(true)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                      + Manage
                    </button>
                  </label>
                  <select
                    className="form-control"
                    value={form.category || ''}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">Select category…</option>
                    {(categories as ExpCat[]).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount (LKR)</label>
                  <input className="form-control" type="number" value={form.amount === 0 || form.amount == null ? '' : form.amount} placeholder="0" onChange={e => setForm(p => ({ ...p, amount: e.target.value === '' ? 0 : Number(e.target.value) }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input className="form-control" type="date" value={form.expense_date || ''} onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select className="form-control" value={form.payment_method || 'cash'} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Paid By</span>
                  <button type="button" onClick={() => setManagingPayers(true)} style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    + Manage
                  </button>
                </label>
                <select
                  className="form-control"
                  value={form.paid_by || ''}
                  onChange={e => setForm(p => ({ ...p, paid_by: e.target.value }))}
                >
                  <option value="">Select payer…</option>
                  {(payers as ExpPayer[]).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Reference / Receipt No.</label>
                <input className="form-control" value={form.reference || ''} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea className="form-control" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={save.isPending || !form.category || !form.expense_date || !(form.amount! > 0)}
                onClick={() => save.mutate(form)}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category manage modal */}
      {managingCats && (
        <CatManageModal categories={categories as ExpCat[]} onClose={() => setManagingCats(false)} />
      )}

      {/* Payer manage modal */}
      {managingPayers && (
        <PayerManageModal payers={payers as ExpPayer[]} onClose={() => setManagingPayers(false)} />
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
