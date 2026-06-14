import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Save, ChevronLeft } from 'lucide-react';

// Star rating with hover + click
function StarRating({ value, onChange, max = 5 }: { value: number; onChange: (v: number) => void; max?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="stars" style={{ gap: 6 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map(s => (
          <span
            key={s}
            style={{
              fontSize: '1.6rem', cursor: 'pointer', lineHeight: 1,
              color: s <= (hover || value) ? '#F59E0B' : '#D1D5DB',
              textShadow: s <= (hover || value) ? '0 1px 3px rgba(245,158,11,0.4)' : 'none',
              transition: 'color 0.12s, transform 0.1s',
              transform: s <= (hover || value) ? 'scale(1.15)' : 'scale(1)',
              display: 'inline-block',
            }}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(s)}
          >★</span>
        ))}
      </div>
      {/* Drag slider below stars */}
      <input
        type="range" min={0} max={max} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#F59E0B', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text3)', marginTop: -2 }}>
        <span>0</span><span>{max}</span>
      </div>
    </div>
  );
}

// Slider-only rating (for numeric fields like leave days, minutes)
function SliderRating({ value, onChange, min = 0, max = 10, step = 1, label, score, scoreOf = 10 }:
  { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string; score: number; scoreOf?: number }) {
  const pct = ((value - min) / (max - min)) * 100;
  const scoreColor = score >= 8 ? '#16a34a' : score >= 6 ? '#F59E0B' : score >= 4 ? '#ea580c' : '#dc2626';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text2)' }}>{label}: <strong>{value}</strong></span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: scoreColor, background: scoreColor + '18', padding: '2px 10px', borderRadius: 20 }}>
          Score: {score}/{scoreOf}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#E11D48', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text3)', marginTop: -2 }}>
        <span>{min}</span>
        <div style={{ width: `${Math.min(pct, 98)}%`, textAlign: 'right', fontSize: '0.6rem', color: 'var(--text3)' }}></div>
        <span>{max}</span>
      </div>
    </div>
  );
}

function starsToScore(stars: number, max = 5) { return Math.round((stars / max) * 10); }

// Today's date as YYYY-MM-DD
function today() { return new Date().toISOString().slice(0, 10); }

// Auto-derive month (YYYY-MM) from a date string
function monthFromDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.slice(0, 7); // "2026-06-14" → "2026-06"
}

const blank = {
  employee_id: '', month: '', supervisor_name: '', evaluation_date: today(),
  days_leave_taken: 0, attendance_score: 0, attendance_remark: '',
  late_minutes: 0, punctuality_score: 0, punctuality_remark: '',
  productivity_stars: 0, productivity_score: 0, productivity_remark: '',
  quality_stars: 0, quality_score: 0, quality_remark: '',
  team_respect_supervisors: false, team_cooperation: false, team_follow_instructions: false, team_no_conflicts: false,
  teamwork_score: 0, teamwork_remark: '',
  initiative_stars: 0, initiative_score: 0, initiative_remark: '',
  discipline_phone_stars: 0, discipline_activities_stars: 0, discipline_behaviour_stars: 0,
  discipline_score: 0, discipline_remark: '',
  total_score: 0, percentage: 0, grade: '',
  recommendation: 'No Action', supervisor_comment: '',
};

function calcAttendance(days: number) {
  if (days === 0) return 10;
  if (days === 1) return 8;
  if (days === 2) return 6;
  if (days === 3) return 4;
  return 2;
}
function calcPunctuality(minutes: number) {
  if (minutes === 0) return 10;
  if (minutes <= 10) return 8;
  if (minutes <= 30) return 6;
  if (minutes <= 60) return 4;
  return 2;
}
function calcTeamwork(form: any) {
  const checked = [form.team_respect_supervisors, form.team_cooperation, form.team_follow_instructions, form.team_no_conflicts].filter(Boolean).length;
  return checked * 2.5;
}

export default function Evaluate() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit') ? parseInt(params.get('edit')!) : null;

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: api.getEmployees });
  const { data: existingEval } = useQuery({
    queryKey: ['evaluation', editId],
    queryFn: () => api.getEvaluation(editId!),
    enabled: !!editId,
  });

  const [form, setForm] = useState<any>({ ...blank, month: monthFromDate(today()) });
  const [error, setError] = useState('');

  useEffect(() => {
    if (existingEval) setForm(existingEval);
  }, [existingEval]);

  function update(field: string, value: any) {
    setForm((f: any) => {
      const next = { ...f, [field]: value };

      // Auto-derive month from evaluation_date
      if (field === 'evaluation_date') next.month = monthFromDate(value);
      // Auto-calc scores
      if (field === 'days_leave_taken') next.attendance_score = calcAttendance(value);
      if (field === 'late_minutes') next.punctuality_score = calcPunctuality(value);
      if (field === 'productivity_stars') next.productivity_score = starsToScore(value);
      if (field === 'quality_stars') next.quality_score = starsToScore(value);
      if (field === 'initiative_stars') next.initiative_score = starsToScore(value);
      if (['team_respect_supervisors', 'team_cooperation', 'team_follow_instructions', 'team_no_conflicts'].includes(field)) {
        next.teamwork_score = calcTeamwork(next);
      }
      if (['discipline_phone_stars', 'discipline_activities_stars', 'discipline_behaviour_stars'].includes(field)) {
        const avg = ((next.discipline_phone_stars + next.discipline_activities_stars + next.discipline_behaviour_stars) / 3) * 2;
        next.discipline_score = Math.round(avg * 10) / 10;
      }

      // Recalc total
      const total = (next.attendance_score || 0) + (next.punctuality_score || 0) +
        (next.productivity_score || 0) + (next.quality_score || 0) +
        (next.teamwork_score || 0) + (next.initiative_score || 0) + (next.discipline_score || 0);
      next.total_score = Math.round(total * 10) / 10;
      next.percentage = Math.round((total / 70) * 100 * 10) / 10;

      return next;
    });
  }

  const create = useMutation({ mutationFn: (d: object) => api.createEvaluation(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['evaluations'] }); nav('/evaluations'); } });
  const upd = useMutation({ mutationFn: ({ id, d }: any) => api.updateEvaluation(id, d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['evaluations'] }); nav('/evaluations'); } });

  async function submit() {
    if (!form.employee_id || !form.supervisor_name || !form.evaluation_date) {
      setError('Please fill all required fields: Employee, Evaluation Date, Supervisor');
      return;
    }
    // Ensure month is always set from date
    if (!form.month && form.evaluation_date) form.month = monthFromDate(form.evaluation_date);
    setError('');
    const payload = { ...form, employee_id: parseInt(form.employee_id) };
    if (editId) upd.mutate({ id: editId, d: payload });
    else create.mutate(payload);
  }

  const pct = form.percentage || 0;
  const gradeColor = pct >= 90 ? '#2E7D32' : pct >= 80 ? '#1565C0' : pct >= 70 ? '#F57C00' : pct >= 60 ? '#6A1FA0' : '#C0001A';
  const gradeLabel = pct >= 90 ? 'Excellent' : pct >= 80 ? 'Very Good' : pct >= 70 ? 'Good' : pct >= 60 ? 'Average' : 'Needs Improvement';

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-icon" onClick={() => nav(-1)}><ChevronLeft size={18} /></button>
          <h2>{editId ? 'Edit Evaluation' : 'New Evaluation'}</h2>
        </div>
        <div className="topbar-right">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Live Score</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: '0.7rem', color: gradeColor, fontWeight: 600 }}>{gradeLabel}</div>
          </div>
          <button className="btn btn-primary" onClick={submit} disabled={create.isPending || upd.isPending}>
            <Save size={14} /> {create.isPending || upd.isPending ? 'Saving…' : 'Save Evaluation'}
          </button>
        </div>
      </div>
      <div className="content">
        {error && <div className="alert alert-danger">{error}</div>}

        {/* Basic Info */}
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="card-title">Basic Information</p>
          <div className="form-row">
            <div className="form-group">
              <label>Employee *</label>
              <select className="form-control" value={form.employee_id} onChange={e => update('employee_id', e.target.value)}>
                <option value="">Select employee</option>
                {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name} — {e.department}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Evaluation Date *</label>
              <input type="date" className="form-control" value={form.evaluation_date} onChange={e => update('evaluation_date', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Supervisor Name *</label>
              <input className="form-control" value={form.supervisor_name} onChange={e => update('supervisor_name', e.target.value)} placeholder="Supervisor full name" />
            </div>
            <div className="form-group">
              <label>Month (for summary)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="month"
                  className="form-control"
                  value={form.month}
                  onChange={e => update('month', e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text3)', whiteSpace: 'nowrap' }}>auto-filled from date</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 3 }}>
                All evaluations in the same month are averaged together in the Monthly Summary.
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Attendance */}
          <div className="score-section">
            <h4>📅 Attendance <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <SliderRating
              label="Days Leave Taken" value={form.days_leave_taken}
              onChange={v => update('days_leave_taken', v)}
              min={0} max={15} step={1}
              score={form.attendance_score}
            />
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.attendance_remark} onChange={e => update('attendance_remark', e.target.value)} />
            </div>
          </div>

          {/* Punctuality */}
          <div className="score-section">
            <h4>⏰ Punctuality <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <SliderRating
              label="Total Late Minutes" value={form.late_minutes}
              onChange={v => update('late_minutes', v)}
              min={0} max={120} step={5}
              score={form.punctuality_score}
            />
            <div className="form-group" style={{ marginTop: 12 }}>
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.punctuality_remark} onChange={e => update('punctuality_remark', e.target.value)} />
            </div>
          </div>

          {/* Productivity */}
          <div className="score-section">
            <h4>🏭 Productivity <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Star Rating</label>
            <StarRating value={form.productivity_stars} onChange={v => update('productivity_stars', v)} />
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F59E0B', marginTop: 6 }}>Score: {form.productivity_score}/10</div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.productivity_remark} onChange={e => update('productivity_remark', e.target.value)} />
            </div>
          </div>

          {/* Quality */}
          <div className="score-section">
            <h4>✅ Quality <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Star Rating</label>
            <StarRating value={form.quality_stars} onChange={v => update('quality_stars', v)} />
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F59E0B', marginTop: 6 }}>Score: {form.quality_score}/10</div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.quality_remark} onChange={e => update('quality_remark', e.target.value)} />
            </div>
          </div>

          {/* Teamwork */}
          <div className="score-section">
            <h4>🤝 Team Work <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <div style={{ fontSize: '0.73rem', color: 'var(--text3)', marginBottom: 10 }}>Each checked item = 2.5 points</div>
            <div className="checkbox-group" style={{ marginBottom: 10 }}>
              {[
                { key: 'team_respect_supervisors', label: 'Respects supervisors' },
                { key: 'team_cooperation', label: 'Cooperates with team' },
                { key: 'team_follow_instructions', label: 'Follows instructions' },
                { key: 'team_no_conflicts', label: 'No conflicts reported' },
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-item" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form[key]} onChange={e => update(key, e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--red)', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.82rem' }}>{label}</span>
                </label>
              ))}
            </div>
            {/* Visual score bar */}
            <div style={{ background: '#F3F4F6', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ width: `${(form.teamwork_score / 10) * 100}%`, height: '100%', background: form.teamwork_score >= 8 ? '#16a34a' : form.teamwork_score >= 5 ? '#F59E0B' : '#dc2626', transition: 'width 0.3s, background 0.3s', borderRadius: 8 }} />
            </div>
            <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem', marginBottom: 10 }}>Score: {form.teamwork_score}/10</div>
            <div className="form-group">
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.teamwork_remark} onChange={e => update('teamwork_remark', e.target.value)} />
            </div>
          </div>

          {/* Initiative */}
          <div className="score-section">
            <h4>💡 Initiative & Learning <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10</span></h4>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>Star Rating</label>
            <StarRating value={form.initiative_stars} onChange={v => update('initiative_stars', v)} />
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#F59E0B', marginTop: 6 }}>Score: {form.initiative_score}/10</div>
            <div className="form-group" style={{ marginTop: 10 }}>
              <label>Remark</label>
              <textarea className="form-control" rows={2} value={form.initiative_remark} onChange={e => update('initiative_remark', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Discipline */}
        <div className="score-section" style={{ marginTop: 16 }}>
          <h4>🛡️ Discipline <span style={{ fontSize: '0.76rem', fontWeight: 400, color: 'var(--text3)' }}>/ 10 (avg of 3 sub-scores)</span></h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[
              { key: 'discipline_phone_stars', label: '📱 Phone Usage' },
              { key: 'discipline_activities_stars', label: '🚫 Unauth. Activities' },
              { key: 'discipline_behaviour_stars', label: '😊 Behaviour' },
            ].map(({ key, label }) => (
              <div key={key} style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>{label}</div>
                <StarRating value={form[key]} onChange={v => update(key, v)} />
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 4 }}>{form[key]}/5 stars</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#F3F4F6', borderRadius: 8, height: 8, overflow: 'hidden', margin: '14px 0 6px' }}>
            <div style={{ width: `${(form.discipline_score / 10) * 100}%`, height: '100%', background: form.discipline_score >= 8 ? '#16a34a' : form.discipline_score >= 5 ? '#F59E0B' : '#dc2626', transition: 'width 0.3s', borderRadius: 8 }} />
          </div>
          <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem', marginBottom: 10 }}>Score: {form.discipline_score}/10</div>
          <div className="form-group">
            <label>Remark</label>
            <textarea className="form-control" rows={2} value={form.discipline_remark} onChange={e => update('discipline_remark', e.target.value)} />
          </div>
        </div>

        {/* Summary & Recommendation */}
        <div className="card" style={{ marginTop: 16 }}>
          <p className="card-title">Summary & Recommendation</p>
          <div style={{ display: 'flex', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total Score', value: `${form.total_score}/70` },
              { label: 'Percentage', value: `${form.percentage}%` },
              { label: 'Grade', value: gradeLabel },
            ].map(({ label, value }) => (
              <div key={label} style={{ textAlign: 'center', background: 'var(--bg)', padding: '12px 24px', borderRadius: 8 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{label}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: gradeColor }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Recommendation</label>
              <select className="form-control" value={form.recommendation} onChange={e => update('recommendation', e.target.value)}>
                <option>No Action</option>
                <option>Promote</option>
                <option>Salary Increment</option>
                <option>Training Required</option>
                <option>Warning Issued</option>
                <option>Termination Review</option>
              </select>
            </div>
            <div className="form-group">
              <label>Supervisor Comment</label>
              <textarea className="form-control" rows={2} value={form.supervisor_comment} onChange={e => update('supervisor_comment', e.target.value)} placeholder="Overall comment…" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={submit} disabled={create.isPending || upd.isPending}>
              <Save size={14} /> {create.isPending || upd.isPending ? 'Saving…' : 'Save Evaluation'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
