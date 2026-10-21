import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';

function AuthShell({ title, children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/logo-192.png" alt="Darwish Music Studio" width="112" height="112" />
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true);
    setError(null);
    try {
      await login(f.get('email'), f.get('password'));
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="أهلاً بيك تاني">
      <form className="form" onSubmit={submit}>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" className="input" required autoComplete="email" dir="ltr" />
        </label>
        <label>
          كلمة المرور
          <input name="password" type="password" className="input" required autoComplete="current-password" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'لحظة...' : 'دخول'}
        </button>
      </form>
      <p className="muted">
        معندكش حساب؟ <Link to="/register">اعمل حساب جديد</Link>
      </p>
      <p className="muted small">نسيت كلمة المرور؟ تواصل مع الإدارة من صفحة <Link to="/report">الإبلاغ</Link>.</p>
    </AuthShell>
  );
}

export function Register() {
  const { register, allowRegistration } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('password') !== f.get('password2')) {
      setError('كلمتين المرور مش زي بعض');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ email: f.get('email'), password: f.get('password'), displayName: f.get('displayName') });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!allowRegistration) {
    return (
      <AuthShell title="التسجيل مقفول حاليًا">
        <p className="muted">ارجع قريب، أو <Link to="/login">سجل دخول</Link> لو عندك حساب.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="حساب جديد">
      <form className="form" onSubmit={submit}>
        <label>
          اسمك
          <input name="displayName" className="input" maxLength={60} autoComplete="nickname" />
        </label>
        <label>
          البريد الإلكتروني
          <input name="email" type="email" className="input" required autoComplete="email" dir="ltr" />
        </label>
        <label>
          كلمة المرور (8 حروف على الأقل)
          <input name="password" type="password" className="input" required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          أكد كلمة المرور
          <input name="password2" type="password" className="input" required minLength={8} autoComplete="new-password" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'لحظة...' : 'إنشاء الحساب'}
        </button>
        <p className="muted small">
          بإنشاء الحساب إنت موافق على <Link to="/legal">سياسة الخصوصية وشروط الاستخدام</Link>.
        </p>
      </form>
      <p className="muted">
        عندك حساب؟ <Link to="/login">دخول</Link>
      </p>
    </AuthShell>
  );
}
