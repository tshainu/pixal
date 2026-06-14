import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Plus, Search, Edit2, Trash2, X, UserCheck, Users, GitBranch, Building2 } from 'lucide-react';

type StaffMember = {
  id: number; name: string; position: string; mobile: string; email: string;
  department_id: number; dept_name: string; team_id: number; team_name: string;
  joined_date: string; status: string; salary: number; notes: string; staff_id: string; address: string;
};
type Department = { id: number; name: string; description: string };
type Team = { id: number; name: string; department_id: number; dept_name: string; description: string };

const sections = [
  { hash: 'list', icon: Users, label: 'Staff List' },
  { hash: 'add', icon: Plus, label: 'Add New' },
  { hash: 'teams', icon: GitBranch, label: 'Teams' },
  { hash: 'departments', icon: Building2, label: 'Departments' },
];

export default function Staff() {
  const loc = useLocation();
  const hash = loc.hash.replace('#', '') || 'list';

  return (
    <div>
      <div className="topbar">
        <h2>Staff Management</h2>
      </div>
      <div className="content">
        {/* Sub-nav */}
        <div className="sub-nav" style={{ marginBottom: 24 }}>
          {sections.map(({ hash: h, icon: Icon, label }) => (
            <a
              key={h}
              href={`#${h}`}
              className={`sub-nav-item ${hash === h ? 'active' : ''}`}
            >
              <Icon size={14} /> {label}
            </a>
          ))}
        </div>

        {hash === 'list' && <StaffTab />}
        {hash === 'add' && <AddStaffTab />}
        {hash === 'teams' && <TeamsTab />}
        {hash === 'departments' && <DepartmentsTab />}
      </div>
    </div>
  );
}

/* ─────────────────────────── STAFF LIST ─────────────────────────── */
function StaffTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'edit'>(null);
  const [form, setForm] = useState<Partial<StaffMember>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ['staff', search],
    queryFn: () => api.getStaff({ search: search || undefined }),
  });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.getDepartments() });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => api.getTeams() });

  const save = useMutation({
    mutationFn: (d: Partial<StaffMember>) => api.updateStaff(d.id!, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['staff'] }); setModal(null); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteStaff(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n || 0);

  const statusColor: Record<string, string> = {
    Active: 'badge-excellent', Inactive: 'badge-needs', On_Leave: 'badge-fair', on_leave: 'badge-fair',
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input className="form-control" style={{ paddingLeft: 32, width: 260 }} placeholder="Search staff…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <a href="#add" className="btn btn-primary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <Plus size={14} /> Add Staff
        </a>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Name</th><th>Position</th><th>Department</th><th>Team</th>
                  <th>Phone</th><th>Status</th><th>Salary</th><th>Joined</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(data as StaffMember[]).length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No staff found</td></tr>
                )}
                {(data as StaffMember[]).map((s: StaffMember) => (
                  <tr key={s.id}>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'monospace' }}>{s.staff_id}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ color: 'var(--text2)', fontSize: '0.8rem' }}>{s.position || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.dept_name || '—'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{s.team_name || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{s.mobile || '—'}</td>
                    <td>
                      <span className={`badge ${statusColor[s.status] || 'badge-fair'}`}>
                        {s.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, fontSize: '0.8rem' }}>{fmt(s.salary)}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text3)' }}>{s.joined_date || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setForm(s); setModal('edit'); }}><Edit2 size={14} /></button>
                        <button className="btn-icon" onClick={() => { if (confirm('Remove staff member?')) del.mutate(s.id); }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <StaffFormModal
          title="Edit Staff Member"
          form={form}
          setForm={setForm}
          departments={departments as Department[]}
          teams={teams as Team[]}
          isPending={save.isPending}
          onClose={() => setModal(null)}
          onSave={() => save.mutate(form)}
        />
      )}
    </>
  );
}

/* ─────────────────────────── ADD NEW ─────────────────────────────── */
function AddStaffTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<StaffMember>>({ status: 'Active', salary: 0, joined_date: today() });
  const [success, setSuccess] = useState(false);

  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.getDepartments() });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: () => api.getTeams() });

  const save = useMutation({
    mutationFn: (d: Partial<StaffMember>) => api.createStaff(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] });
      setForm({ status: 'Active', salary: 0, joined_date: today() });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const filteredTeams = form.department_id
    ? (teams as Team[]).filter(t => t.department_id === Number(form.department_id))
    : (teams as Team[]);

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserCheck size={18} style={{ color: 'var(--red)' }} />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>New Staff Member</h3>
        </div>
      </div>
      <div style={{ padding: '20px 24px' }}>
        {success && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#16a34a', fontSize: '0.82rem', fontWeight: 500 }}>
            Staff member added successfully!
          </div>
        )}
        {save.isError && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--red)', fontSize: '0.82rem' }}>
            Failed to save. Please try again.
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Full Name *</label>
            <input className="form-control" placeholder="e.g. Mr. Joseph Vijai" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Position / Role</label>
            <input className="form-control" placeholder="e.g. Tailor, Supervisor" value={form.position || ''} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Phone</label>
            <input className="form-control" placeholder="07X XXX XXXX" value={form.mobile || ''} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="form-control" type="email" placeholder="name@example.com" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Department</label>
            <select className="form-control" value={form.department_id || ''} onChange={e => setForm(p => ({ ...p, department_id: Number(e.target.value), team_id: undefined }))}>
              <option value="">Select department…</option>
              {(departments as Department[]).map((d: Department) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Team</label>
            <select className="form-control" value={form.team_id || ''} onChange={e => setForm(p => ({ ...p, team_id: Number(e.target.value) }))}>
              <option value="">Select team…</option>
              {filteredTeams.map((t: Team) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Joined Date</label>
            <input className="form-control" type="date" value={form.joined_date || ''} onChange={e => setForm(p => ({ ...p, joined_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select className="form-control" value={form.status || 'Active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On_Leave">On Leave</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Salary (LKR)</label>
            <input className="form-control" type="number" min={0} value={form.salary || ''} onChange={e => setForm(p => ({ ...p, salary: Number(e.target.value) }))} />
          </div>
          <div className="form-group">
            <label>Address</label>
            <input className="form-control" placeholder="Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label>Notes</label>
          <textarea className="form-control" rows={3} placeholder="Any additional notes…" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setForm({ status: 'Active', salary: 0, joined_date: today() })}>Clear</button>
          <button className="btn btn-primary" disabled={save.isPending || !form.name} onClick={() => save.mutate(form)}>
            {save.isPending ? 'Saving…' : 'Add Staff Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── TEAMS ──────────────────────────────── */
function TeamsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [form, setForm] = useState<Partial<Team>>({ name: '', description: '' });

  const { data = [], isLoading } = useQuery({ queryKey: ['teams'], queryFn: () => api.getTeams() });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.getDepartments() });

  const save = useMutation({
    mutationFn: (d: Partial<Team>) => d.id ? api.updateTeam(d.id, d) : api.createTeam(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); setModal(null); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteTeam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Teams</h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text3)' }}>Organise staff into working teams</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ name: '', description: '' }); setModal('add'); }}>
          <Plus size={14} /> New Team
        </button>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Team Name</th><th>Department</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {(data as Team[]).length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No teams yet — create one above</td></tr>
                )}
                {(data as Team[]).map((t: Team) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td><span className="badge badge-fair">{t.dept_name || '—'}</span></td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>{t.description || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setForm(t); setModal('edit'); }}><Edit2 size={14} /></button>
                        <button className="btn-icon" onClick={() => { if (confirm('Delete team?')) del.mutate(t.id); }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'add' ? 'New Team' : 'Edit Team'}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Team Name *</label>
                <input className="form-control" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Department</label>
                <select className="form-control" value={form.department_id || ''} onChange={e => setForm(p => ({ ...p, department_id: Number(e.target.value) }))}>
                  <option value="">Select…</option>
                  {(departments as Department[]).map((d: Department) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(form)}>
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── DEPARTMENTS ────────────────────────── */
function DepartmentsTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [form, setForm] = useState<Partial<Department>>({ name: '', description: '' });

  const { data = [], isLoading } = useQuery({ queryKey: ['departments'], queryFn: () => api.getDepartments() });

  const save = useMutation({
    mutationFn: (d: Partial<Department>) => d.id ? api.updateDepartment(d.id, d) : api.createDepartment(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); setModal(null); },
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteDepartment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Departments</h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text3)' }}>Define organisational departments</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ name: '', description: '' }); setModal('add'); }}>
          <Plus size={14} /> New Department
        </button>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">Loading…</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Department</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {(data as Department[]).length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>No departments yet</td></tr>
                )}
                {(data as Department[]).map((d: Department) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ color: 'var(--text3)', fontSize: '0.78rem' }}>{d.description || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setForm(d); setModal('edit'); }}><Edit2 size={14} /></button>
                        <button className="btn-icon" onClick={() => { if (confirm('Delete department?')) del.mutate(d.id); }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'add' ? 'New Department' : 'Edit Department'}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name *</label>
                <input className="form-control" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate(form)}>
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── SHARED FORM MODAL ─────────────────── */
function StaffFormModal({ title, form, setForm, departments, teams, isPending, onClose, onSave }: {
  title: string;
  form: Partial<StaffMember>;
  setForm: (fn: (p: Partial<StaffMember>) => Partial<StaffMember>) => void;
  departments: Department[];
  teams: Team[];
  isPending: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const filteredTeams = form.department_id
    ? teams.filter(t => t.department_id === Number(form.department_id))
    : teams;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label>Name *</label><input className="form-control" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="form-group"><label>Position</label><input className="form-control" value={form.position || ''} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input className="form-control" value={form.mobile || ''} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} /></div>
            <div className="form-group"><label>Email</label><input className="form-control" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Department</label>
              <select className="form-control" value={form.department_id || ''} onChange={e => setForm(p => ({ ...p, department_id: Number(e.target.value), team_id: undefined }))}>
                <option value="">Select…</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Team</label>
              <select className="form-control" value={form.team_id || ''} onChange={e => setForm(p => ({ ...p, team_id: Number(e.target.value) }))}>
                <option value="">Select…</option>
                {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Joined Date</label><input className="form-control" type="date" value={form.joined_date || ''} onChange={e => setForm(p => ({ ...p, joined_date: e.target.value }))} /></div>
            <div className="form-group">
              <label>Status</label>
              <select className="form-control" value={form.status || 'Active'} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="On_Leave">On Leave</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Salary (LKR)</label><input className="form-control" type="number" value={form.salary || 0} onChange={e => setForm(p => ({ ...p, salary: Number(e.target.value) }))} /></div>
            <div className="form-group"><label>Address</label><input className="form-control" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea className="form-control" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={isPending} onClick={onSave}>
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
