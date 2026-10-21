import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Loading } from '../components/common.jsx';
import { useAuth } from '../state/AuthContext.jsx';

const Admin = lazy(() => import('./Admin.jsx'));

function StandaloneNotFound() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <img className="auth-logo" src="/logo-192.png" alt="" width="112" height="112" />
        <h1>الصفحة دي مش موجودة</h1>
        <p className="muted">ممكن الرابط اتكتب غلط أو الصفحة اتشالت.</p>
        <Link to="/" className="btn btn-primary">
          ارجع للرئيسية
        </Link>
      </div>
    </div>
  );
}

/**
 * Catches unknown first-level paths. If the path is the secret admin path, show the
 * admin panel (or the login page first); anything else is a normal 404.
 */
export default function AdminGate() {
  const { gate } = useParams();
  const { user, ready, adminUrl } = useAuth();
  const location = useLocation();
  const [check, setCheck] = useState(null); // null = checking, true/false = result

  const isOurs = adminUrl === `/${gate}`;

  useEffect(() => {
    if (!ready || isOurs || user) {
      setCheck(null);
      return;
    }
    // Signed out: ask the server whether this is the admin URL so we can offer the login page.
    let alive = true;
    api
      .post('/api/admin-gate', { path: gate })
      .then((r) => alive && setCheck(!!r.ok))
      .catch(() => alive && setCheck(false));
    return () => {
      alive = false;
    };
  }, [gate, ready, isOurs, user]);

  if (!ready) return <Loading />;
  if (isOurs) {
    return (
      <Suspense fallback={<Loading />}>
        <Admin base={adminUrl} />
      </Suspense>
    );
  }
  if (!user) {
    if (check === null) return <Loading />;
    if (check) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <StandaloneNotFound />;
}
