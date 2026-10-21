import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import Icon from './Icon.jsx';
import PlayerBar from './PlayerBar.jsx';

const THEMES = [
  { id: 'dark', label: 'ليلي' },
  { id: 'light', label: 'نهاري' },
  { id: 'retro', label: 'ريترو' },
];

export function useTheme() {
  const [theme, setThemeState] = useState(() => document.documentElement.dataset.theme || 'dark');
  const setTheme = (t) => {
    setThemeState(t);
    try {
      localStorage.setItem('dms.theme', t);
    } catch {
      // ignore
    }
    document.documentElement.dataset.theme = t;
  };
  return [theme, setTheme];
}

function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Darwish Music Studio">
      <span className="logo-mark">
        <Icon name="music" size={20} />
      </span>
      <span className="logo-text">
        <b>درويش</b>
        <small>Music Studio</small>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/', icon: 'home', label: 'الرئيسية', end: true },
  { to: '/explore', icon: 'library', label: 'استكشف' },
  { to: '/radio', icon: 'radio', label: 'الراديو' },
  { to: '/years', icon: 'calendar', label: 'آلة الزمن' },
  { to: '/quiz', icon: 'game', label: 'خمّن الشارة' },
];

const MY_NAV = [
  { to: '/memories', icon: 'sparkle', label: 'ذكرياتي' },
  { to: '/favorites', icon: 'heart', label: 'المفضلة' },
  { to: '/playlists', icon: 'list', label: 'قوائمي' },
  { to: '/history', icon: 'history', label: 'سجل الاستماع' },
];

function Sidebar() {
  const { isStaff } = useAuth();
  const [theme, setTheme] = useTheme();
  return (
    <aside className="sidebar">
      <Logo />
      <nav aria-label="التنقل الرئيسي">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-item">
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
        <div className="nav-label">مكتبتي</div>
        {MY_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className="nav-item">
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
        <div className="nav-label">أوضاع</div>
        <NavLink to="/car" className="nav-item">
          <Icon name="car" /> وضع السيارة
        </NavLink>
        {isStaff ? (
          <NavLink to="/admin" className="nav-item nav-admin">
            <Icon name="shield" /> لوحة الإدارة
          </NavLink>
        ) : null}
      </nav>
      <div className="theme-switch" role="group" aria-label="المظهر">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={theme === t.id ? 'on' : ''} onClick={() => setTheme(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="sidebar-foot">
        <Link to="/legal">الخصوصية والحقوق</Link> · <Link to="/report">إبلاغ</Link>
      </div>
    </aside>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(location.pathname === '/search' ? params.get('q') || '' : '');
  const { user, logout } = useAuth();
  const player = usePlayer();
  const toast = useToast();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (location.pathname !== '/search') setQ('');
    setMenu(false);
  }, [location.pathname]);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const surprise = async () => {
    try {
      const t = await player.surprise();
      toast(`🎲 ${t.title}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-logo">
        <Logo />
      </div>
      <form className="search-box" onSubmit={submit} role="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="دوّر على أغنية، كرتون، أنمي أو فنان..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (location.pathname === '/search') {
              navigate(`/search?q=${encodeURIComponent(e.target.value)}`, { replace: true });
            }
          }}
          aria-label="بحث"
        />
      </form>
      <button type="button" className="btn btn-surprise" onClick={surprise}>
        <Icon name="dice" size={18} /> <span>فاجئني</span>
      </button>
      {user ? (
        <div className="menu-wrap">
          <button type="button" className="avatar" onClick={() => setMenu((m) => !m)} aria-label="حسابي" aria-expanded={menu}>
            {user.displayName.slice(0, 1)}
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <div className="menu-label">{user.displayName}</div>
              <Link role="menuitem" to="/settings">
                <Icon name="settings" size={16} /> الإعدادات
              </Link>
              <Link role="menuitem" to="/memories">
                <Icon name="sparkle" size={16} /> ذكرياتي
              </Link>
              <button
                role="menuitem"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                <Icon name="logout" size={16} /> خروج
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <Link to="/login" className="btn btn-ghost">
          دخول
        </Link>
      )}
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="التنقل">
      <NavLink to="/" end>
        <Icon name="home" />
        <span>الرئيسية</span>
      </NavLink>
      <NavLink to="/explore">
        <Icon name="library" />
        <span>استكشف</span>
      </NavLink>
      <NavLink to="/radio">
        <Icon name="radio" />
        <span>الراديو</span>
      </NavLink>
      <NavLink to="/quiz">
        <Icon name="game" />
        <span>العب</span>
      </NavLink>
      <NavLink to="/me">
        <Icon name="user" />
        <span>أنا</span>
      </NavLink>
    </nav>
  );
}

export default function Layout() {
  const location = useLocation();
  useEffect(() => {
    document.querySelector('.main')?.scrollTo({ top: 0 });
  }, [location.pathname]);
  return (
    <div className="app">
      <Sidebar />
      <div className="main-col">
        <TopBar />
        <main className="main">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <BottomNav />
    </div>
  );
}
