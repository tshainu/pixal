import { useState } from 'react';
import { Eye, EyeOff, Lock, User, Hash } from 'lucide-react';
import { api } from '../api';

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(userId.trim(), username.trim(), password);
      sessionStorage.setItem('pandora_auth', JSON.stringify(res.user));
      onLogin();
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const inp = (err: boolean): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px 10px 36px',
    border: `1.5px solid ${err ? '#EF4444' : '#E5E7EB'}`,
    borderRadius: 10, fontSize: '0.88rem', color: '#111827',
    outline: 'none', background: '#F9FAFB', transition: 'border-color 0.15s',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a0000 0%, #3d0000 40%, #1a0000 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top:'-120px', right:'-120px', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(220,38,38,0.18) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'-100px', left:'-100px', width:350, height:350, borderRadius:'50%', background:'radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{
        background: '#fff', borderRadius: 20, padding: '48px 44px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(220,38,38,0.15)',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/pandora-logo.png" alt="Pandora" style={{ width: 220, height: 'auto', display: 'block', margin: '0 auto' }} />
          <div style={{ marginTop: 12, fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.14em', color: '#9CA3AF', textTransform: 'uppercase' }}>Management System</div>
        </div>

        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, #E5E7EB, transparent)', marginBottom: 28 }} />
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', marginBottom: 4 }}>Welcome back</div>
        <div style={{ fontSize: '0.82rem', color: '#6B7280', marginBottom: 24 }}>Sign in to your account to continue</div>

        <form onSubmit={submit}>
          {/* User ID */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>User ID</label>
            <div style={{ position: 'relative' }}>
              <Hash size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', pointerEvents:'none' }} />
              <input type="text" autoComplete="off" value={userId} onChange={e => { setUserId(e.target.value); setError(''); }}
                placeholder="e.g. AX70" style={inp(!!error)}
                onFocus={e => { e.target.style.borderColor='#DC2626'; e.target.style.background='#fff'; }}
                onBlur={e => { e.target.style.borderColor=error?'#EF4444':'#E5E7EB'; e.target.style.background='#F9FAFB'; }} />
            </div>
          </div>

          {/* Username */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', pointerEvents:'none' }} />
              <input type="text" autoComplete="username" value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
                placeholder="Enter username" style={inp(!!error)}
                onFocus={e => { e.target.style.borderColor='#DC2626'; e.target.style.background='#fff'; }}
                onBlur={e => { e.target.style.borderColor=error?'#EF4444':'#E5E7EB'; e.target.style.background='#F9FAFB'; }} />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#9CA3AF', pointerEvents:'none' }} />
              <input type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter password" style={{ ...inp(!!error), paddingRight: 40 }}
                onFocus={e => { e.target.style.borderColor='#DC2626'; e.target.style.background='#fff'; }}
                onBlur={e => { e.target.style.borderColor=error?'#EF4444':'#E5E7EB'; e.target.style.background='#F9FAFB'; }} />
              <button type="button" onClick={() => setShowPw(p => !p)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:4, display:'flex', alignItems:'center' }}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: '0.8rem', fontWeight: 500 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !userId || !username || !password} style={{
            marginTop: 20, width: '100%', padding: '12px',
            background: loading || !userId || !username || !password ? '#F87171' : 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
            color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.92rem', fontWeight: 700,
            cursor: loading || !userId || !username || !password ? 'not-allowed' : 'pointer',
            letterSpacing: '0.02em',
            boxShadow: loading || !userId || !username || !password ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
            transition: 'all 0.15s',
          }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Pandora Garment © {new Date().getFullYear()}</div>
        </div>
      </div>
    </div>
  );
}
