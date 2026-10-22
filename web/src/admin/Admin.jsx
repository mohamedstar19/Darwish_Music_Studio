import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loading } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../state/AuthContext.jsx';
import { Dashboard, Live } from './Dashboard.jsx';
import { Artists, Categories, OfficialPlaylists, Reports, Requests, Stations, Users, Works } from './Manage.jsx';
import Tracks from './Tracks.jsx';
import ServerImport from './ServerImport.jsx';
import Health from './Health.jsx';
import { AdminBase } from './base.js';

const NAV = [
  { to: '', icon: 'chart', label: 'نظرة عامة', end: true },
  { to: '/live', icon: 'radio', label: 'مباشر: مين بيسمع' },
  { to: '/tracks', icon: 'music', label: 'الأغاني' },
  { to: '/import', icon: 'upload', label: 'استيراد جماعي' },
  { to: '/health', icon: 'shield', label: 'صحة المكتبة' },
  { to: '/works', icon: 'library', label: 'الأعمال' },
  { to: '/categories', icon: 'list', label: 'التصنيفات' },
  { to: '/artists', icon: 'user', label: 'الفنانين' },
  { to: '/stations', icon: 'radio', label: 'المحطات' },
  { to: '/requests', icon: 'queue', label: 'طلبات الأغاني' },
  { to: '/playlists', icon: 'sparkle', label: 'القوائم الرسمية' },
  { to: '/reports', icon: 'flag', label: 'البلاغات' },
  { to: '/users', icon: 'shield', label: 'المستخدمين', admin: true },
];

export default function Admin({ base }) {
  const { user, ready, isStaff, isAdmin } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (!isStaff) return <Navigate to="/" replace />;

  return (
    <AdminBase.Provider value={base}>
      <div className="admin">
        <aside className="admin-nav">
          <Link to="/" className="admin-brand">
            <Icon name="back" /> درويش · الإدارة
          </Link>
          <nav>
            {NAV.filter((n) => !n.admin || isAdmin).map((n) => (
              <NavLink key={n.to} to={`${base}${n.to}`} end={n.end} className="nav-item">
                <Icon name={n.icon} size={18} /> {n.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="admin-main">
          <div key={location.pathname} className="page-anim">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="live" element={<Live />} />
              <Route path="tracks" element={<Tracks />} />
              <Route path="import" element={<ServerImport />} />
              <Route path="health" element={<Health />} />
              <Route path="works" element={<Works />} />
              <Route path="categories" element={<Categories />} />
              <Route path="artists" element={<Artists />} />
              <Route path="stations" element={<Stations />} />
              <Route path="requests" element={<Requests />} />
              <Route path="playlists" element={<OfficialPlaylists />} />
              <Route path="reports" element={<Reports />} />
              {isAdmin ? <Route path="users" element={<Users />} /> : null}
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </AdminBase.Provider>
  );
}
