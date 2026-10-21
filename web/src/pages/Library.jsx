import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, formatDuration } from '../api.js';
import { CountUp, Cover, Empty, ErrorBox, Loading, Modal, PageHeader, Section } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useTheme } from '../components/Layout.jsx';
import { backgroundEnabled, BG_SETTING_EVENT, BG_SETTING_KEY } from '../components/SynthBackground.jsx';
import { PlaylistCard, TrackList } from '../components/Tracks.jsx';
import { useFetch } from '../hooks.js';
import { useAuth } from '../state/AuthContext.jsx';
import { usePlayer } from '../state/PlayerContext.jsx';
import { useInstall } from '../state/Presence.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { PlayAll } from './Browse.jsx';

function NeedLogin({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Empty icon="user" title="سجل دخول الأول">
        <Link to="/login" className="btn btn-primary">
          دخول
        </Link>{' '}
        <Link to="/register" className="btn btn-ghost">
          حساب جديد
        </Link>
      </Empty>
    );
  }
  return children;
}

export function Favorites() {
  return (
    <NeedLogin>
      <FavoritesInner />
    </NeedLogin>
  );
}

function FavoritesInner() {
  const { data, loading, error, reload } = useFetch('/api/me/favorites');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="page">
      <PageHeader kicker="مكتبتي" title="المفضلة" subtitle={`${data.length} أغنية`}>
        <PlayAll tracks={data} />
      </PageHeader>
      {data.length ? <TrackList tracks={data} /> : <Empty icon="heart" title="لسه مفيش مفضلة">دوس على القلب جنب أي أغنية.</Empty>}
    </div>
  );
}

export function History() {
  return (
    <NeedLogin>
      <HistoryInner />
    </NeedLogin>
  );
}

function HistoryInner() {
  const { data, loading, error, reload } = useFetch('/api/me/history');
  const { user } = useAuth();
  const toast = useToast();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const clear = async () => {
    if (!window.confirm('متأكد إنك عايز تمسح سجل الاستماع كله؟')) return;
    await api.del('/api/me/history');
    toast('السجل اتمسح');
    reload();
  };
  const tracks = data.map((h) => h.track);
  return (
    <div className="page">
      <PageHeader kicker="مكتبتي" title="سجل الاستماع">
        {data.length ? (
          <button type="button" className="btn btn-ghost" onClick={clear}>
            <Icon name="trash" /> امسح السجل
          </button>
        ) : null}
      </PageHeader>
      {!user.historyEnabled ? (
        <p className="notice">
          السجل متوقف دلوقتي. تقدر تشغله من <Link to="/settings">الإعدادات</Link>.
        </p>
      ) : null}
      {data.length ? <TrackList tracks={tracks} numbered={false} /> : <Empty icon="history" title="السجل فاضي" />}
    </div>
  );
}

export function Playlists() {
  return (
    <NeedLogin>
      <PlaylistsInner />
    </NeedLogin>
  );
}

function PlaylistsInner() {
  const { data, loading, error, reload } = useFetch('/api/me/playlists');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { isStaff } = useAuth();

  const create = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const p = await api.post('/api/playlists', {
        title: f.get('title'),
        description: f.get('description'),
        isPublic: f.get('isPublic') === 'on',
        isOfficial: f.get('isOfficial') === 'on',
      });
      navigate(`/playlist/${p.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="page">
      <PageHeader kicker="مكتبتي" title="قوائم التشغيل">
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> قائمة جديدة
        </button>
      </PageHeader>
      {data.length ? (
        <div className="grid">
          {data.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </div>
      ) : (
        <Empty icon="list" title="معندكش قوائم لسه">اعمل قائمة لأغاني رمضان، أو أغاني المذاكرة، أو أي مزاج.</Empty>
      )}
      {creating ? (
        <Modal title="قائمة جديدة" onClose={() => setCreating(false)}>
          <form className="form" onSubmit={create}>
            <label>
              الاسم
              <input name="title" className="input" required maxLength={100} autoFocus />
            </label>
            <label>
              وصف (اختياري)
              <input name="description" className="input" maxLength={500} />
            </label>
            <label className="check">
              <input type="checkbox" name="isPublic" /> قائمة عامة (أي حد معاه الرابط يشوفها)
            </label>
            {isStaff ? (
              <label className="check">
                <input type="checkbox" name="isOfficial" /> قائمة رسمية (تظهر في الرئيسية)
              </label>
            ) : null}
            <button className="btn btn-primary">إنشاء</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

export function PlaylistPage() {
  const { id } = useParams();
  const { data, loading, error, reload, setData } = useFetch(`/api/playlists/${id}`);
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const remove = async (track) => {
    await api.del(`/api/playlists/${data.id}/tracks/${track.id}`);
    setData({ ...data, tracks: data.tracks.filter((t) => t.id !== track.id) });
  };

  const move = async (i, dir) => {
    const list = [...data.tracks];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData({ ...data, tracks: list });
    await api.put(`/api/playlists/${data.id}/order`, { trackIds: list.map((t) => t.id) }).catch((e) => toast(e.message, 'error'));
  };

  const save = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const p = await api.patch(`/api/playlists/${data.id}`, {
        title: f.get('title'),
        description: f.get('description'),
        isPublic: f.get('isPublic') === 'on',
      });
      setData({ ...data, ...p, tracks: data.tracks });
      setEditing(false);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const del = async () => {
    if (!window.confirm('تمسح القائمة دي؟')) return;
    await api.del(`/api/playlists/${data.id}`);
    navigate('/playlists');
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('الرابط اتنسخ');
    } catch {
      toast(window.location.href);
    }
  };

  return (
    <div className="page">
      <PageHeader
        cover={data.covers?.[0] || null}
        kicker={data.isOfficial ? 'قائمة رسمية' : data.isPublic ? `قائمة عامة · ${data.ownerName || ''}` : 'قائمة خاصة'}
        title={data.title}
        subtitle={data.description}
      >
        <PlayAll tracks={data.tracks} />
        {data.isPublic || data.isOfficial ? (
          <button type="button" className="btn btn-ghost" onClick={share}>
            مشاركة
          </button>
        ) : null}
        {data.canEdit ? (
          <>
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="تعديل">
              <Icon name="edit" />
            </button>
            <button type="button" className="icon-btn" onClick={del} aria-label="حذف">
              <Icon name="trash" />
            </button>
          </>
        ) : null}
      </PageHeader>
      {data.tracks.length ? (
        <TrackList
          tracks={data.tracks}
          extraActions={
            data.canEdit
              ? (t, i) => [
                  { label: 'لفوق', icon: 'chevron', onClick: () => move(i, -1) },
                  { label: 'لتحت', icon: 'chevron', onClick: () => move(i, 1) },
                  { label: 'شيل من القائمة', icon: 'trash', onClick: () => remove(t) },
                ]
              : undefined
          }
        />
      ) : (
        <Empty icon="list" title="القائمة فاضية">ضيف أغاني من قائمة الخيارات (⋯) جنب أي أغنية.</Empty>
      )}
      {editing ? (
        <Modal title="تعديل القائمة" onClose={() => setEditing(false)}>
          <form className="form" onSubmit={save}>
            <label>
              الاسم
              <input name="title" className="input" defaultValue={data.title} required maxLength={100} />
            </label>
            <label>
              وصف
              <input name="description" className="input" defaultValue={data.description || ''} maxLength={500} />
            </label>
            {!data.isOfficial ? (
              <label className="check">
                <input type="checkbox" name="isPublic" defaultChecked={data.isPublic} /> قائمة عامة
              </label>
            ) : null}
            <button className="btn btn-primary">حفظ</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

const HOURS_LABEL = (h) => (h < 5 ? 'سهران' : h < 12 ? 'صباحي' : h < 17 ? 'بعد الضهر' : h < 21 ? 'بالليل' : 'آخر الليل');

export function Memories() {
  return (
    <NeedLogin>
      <MemoriesInner />
    </NeedLogin>
  );
}

function MemoriesInner() {
  const [days, setDays] = useState(365);
  const { data, loading, error, reload } = useFetch(`/api/me/memories?days=${days}`);
  const player = usePlayer();
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const t = data.totals;
  const peakHour = data.byHour.reduce((best, h) => (h.n > (best?.n || 0) ? h : best), null);
  const maxHour = Math.max(1, ...data.byHour.map((h) => h.n));
  const maxMonth = Math.max(1, ...data.byMonth.map((m) => m.n));

  return (
    <div className="page memories">
      <PageHeader kicker="My Music Memories" title="ذكرياتي الموسيقية">
        <div className="chips">
          {[
            [30, 'آخر شهر'],
            [90, '3 شهور'],
            [365, 'السنة'],
            [3650, 'من الأول'],
          ].map(([d, l]) => (
            <button key={d} type="button" className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>
              {l}
            </button>
          ))}
        </div>
      </PageHeader>

      {!data.historyEnabled ? (
        <p className="notice">
          سجل الاستماع متوقف، فالأرقام دي مش هتزيد. شغله من <Link to="/settings">الإعدادات</Link>.
        </p>
      ) : null}

      {t.plays === 0 ? (
        <Empty icon="sparkle" title="لسه بنجمع ذكرياتك">اسمع شوية أغاني وارجع هنا تشوف ملخصك.</Empty>
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <b>
                <CountUp value={t.songs} />
              </b>
              <span>أغنية مختلفة</span>
            </div>
            <div className="stat">
              <b>
                <CountUp value={t.plays} />
              </b>
              <span>مرة استماع</span>
            </div>
            <div className="stat">
              <b>{formatDuration(t.seconds)}</b>
              <span>وقت استماع تقريبي</span>
            </div>
            {peakHour ? (
              <div className="stat">
                <b>{HOURS_LABEL(peakHour.hour)}</b>
                <span>أكتر وقت بتسمع فيه ({peakHour.hour}:00)</span>
              </div>
            ) : null}
          </div>

          {data.topTracks.length ? (
            <Section
              title="أغانيك الأكتر"
              action={
                <button type="button" className="btn btn-ghost btn-small" onClick={() => player.playList(data.topTracks, 0)}>
                  <Icon name="play" size={16} /> شغلهم
                </button>
              }
            >
              <ol className="top-list">
                {data.topTracks.map((tr, i) => (
                  <li key={tr.id}>
                    <span className="rank">{i + 1}</span>
                    <Cover src={tr.cover} size={48} seed={tr.id} />
                    <div className="grow">
                      <Link to={`/track/${tr.id}`}>{tr.title}</Link>
                      <small className="muted"> {tr.work?.title || tr.artist?.name || ''}</small>
                    </div>
                    <span className="muted">{tr.myPlays} مرة</span>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <div className="two-col">
            {data.topCategories.length ? (
              <Section title="أكتر تصنيفات">
                {data.topCategories.map((c) => (
                  <div key={c.name} className="bar-row">
                    <span>{c.name}</span>
                    <div className="bar">
                      <i style={{ width: `${(c.n / data.topCategories[0].n) * 100}%`, background: c.color }} />
                    </div>
                    <small>{c.n}</small>
                  </div>
                ))}
              </Section>
            ) : null}
            {data.topStations.length ? (
              <Section title="محطاتك">
                {data.topStations.map((s) => (
                  <div key={s.slug} className="bar-row">
                    <span>{s.name}</span>
                    <div className="bar">
                      <i style={{ width: `${(s.seconds / data.topStations[0].seconds) * 100}%`, background: s.color }} />
                    </div>
                    <small>{formatDuration(s.seconds)}</small>
                  </div>
                ))}
              </Section>
            ) : null}
          </div>

          {data.topWorks.length ? (
            <Section title="الأعمال اللي رجعتلها أكتر">
              <div className="grid">
                {data.topWorks.map((w) => (
                  <Link key={w.id} to={`/work/${w.id}`} className="card">
                    <div className="card-cover">
                      <Cover src={w.cover} seed={w.id + 3} />
                    </div>
                    <div className="card-title">{w.title}</div>
                    <div className="card-sub">{w.plays} مرة</div>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}

          <div className="two-col">
            <Section title="بتسمع إمتى؟">
              <div className="hour-chart" dir="ltr" role="img" aria-label="الاستماع حسب ساعات اليوم">
                {Array.from({ length: 24 }, (_, h) => {
                  const n = data.byHour.find((x) => x.hour === h)?.n || 0;
                  return <i key={h} title={`${h}:00 — ${n}`} style={{ height: `${(n / maxHour) * 100}%` }} />;
                })}
              </div>
              <div className="hour-labels" dir="ltr">
                <span>0</span>
                <span>6</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </Section>
            {data.byMonth.length > 1 ? (
              <Section title="على مدار الشهور">
                {data.byMonth.map((m) => (
                  <div key={m.month} className="bar-row">
                    <span dir="ltr">{m.month}</span>
                    <div className="bar">
                      <i style={{ width: `${(m.n / maxMonth) * 100}%` }} />
                    </div>
                    <small>{m.n}</small>
                  </div>
                ))}
              </Section>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export function Settings() {
  return (
    <NeedLogin>
      <SettingsInner />
    </NeedLogin>
  );
}

function SettingsInner() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [theme, setTheme] = useTheme();
  const [bgOn, setBgOn] = useState(backgroundEnabled);
  const { canInstall, install, installed } = useInstall();

  const save = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const body = { displayName: f.get('displayName'), historyEnabled: f.get('historyEnabled') === 'on' };
      if (f.get('newPassword')) {
        body.currentPassword = f.get('currentPassword');
        body.newPassword = f.get('newPassword');
      }
      const { user: u } = await api.patch('/api/auth/me', body);
      setUser(u);
      e.target.reset?.();
      toast('اتحفظ', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('تمسح سجل الاستماع كله؟ ده هيصفّر "ذكرياتي".')) return;
    await api.del('/api/me/history');
    toast('السجل اتمسح');
  };

  return (
    <div className="page narrow">
      <h1 className="page-title">الإعدادات</h1>
      <form className="form card-box" onSubmit={save} key={user.id}>
        <h3>الحساب</h3>
        <label>
          الاسم اللي بيظهر
          <input name="displayName" className="input" defaultValue={user.displayName} maxLength={60} />
        </label>
        <p className="muted small">البريد: {user.email}</p>
        <h3>الخصوصية</h3>
        <label className="check">
          <input type="checkbox" name="historyEnabled" defaultChecked={user.historyEnabled} /> احفظ سجل الاستماع (لازم لـ"ذكرياتي" و"رجعلي اللي كنت بسمعه")
        </label>
        <button type="button" className="btn btn-ghost" onClick={clearHistory}>
          <Icon name="trash" /> امسح سجل الاستماع
        </button>
        <h3>تغيير كلمة المرور</h3>
        <label>
          كلمة المرور الحالية
          <input name="currentPassword" type="password" className="input" autoComplete="current-password" />
        </label>
        <label>
          كلمة المرور الجديدة
          <input name="newPassword" type="password" className="input" minLength={8} autoComplete="new-password" />
        </label>
        <button className="btn btn-primary">حفظ</button>
      </form>

      <div className="form card-box">
        <h3>المظهر</h3>
        <div className="chips">
          {[
            ['dark', 'ليلي'],
            ['light', 'نهاري'],
            ['retro', 'ريترو (كاسيت وراديو قديم)'],
          ].map(([id, label]) => (
            <button key={id} type="button" className={`chip ${theme === id ? 'on' : ''}`} onClick={() => setTheme(id)}>
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={bgOn}
            onChange={(e) => {
              const on = e.target.checked;
              setBgOn(on);
              try {
                localStorage.setItem(BG_SETTING_KEY, on ? 'on' : 'off');
              } catch {
                // storage blocked: the switch still works for this visit
              }
              window.dispatchEvent(new Event(BG_SETTING_EVENT));
            }}
          />
          خلفية السينث ويف المتحركة (بتتحرك مع الأغنية، في الثيم الليلي)
        </label>
        <h3>التطبيق</h3>
        {installed ? (
          <p className="muted">التطبيق متثبت على الجهاز ده ✓</p>
        ) : canInstall ? (
          <button type="button" className="btn btn-primary" onClick={install}>
            ثبّت التطبيق على الجهاز
          </button>
        ) : (
          <p className="muted small">على الموبايل: افتح قائمة المتصفح واختار "إضافة للشاشة الرئيسية".</p>
        )}
      </div>

      <DeleteAccount />
    </div>
  );
}

function DeleteAccount() {
  const { setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('confirm') !== 'امسح') {
      toast('اكتب كلمة "امسح" عشان تأكد', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.del2('/api/auth/me', { password: f.get('password') });
      setUser(null);
      toast('حسابك اتمسح. مع السلامة 👋', 'success');
      navigate('/');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form card-box danger-box" id="delete-account">
      <h3>حذف الحساب</h3>
      <p className="muted small">
        هيتمسح حسابك نهائيًا مع المفضلة وقوائم التشغيل وطلبات الأغاني. سجل الاستماع بيفضل بس كأرقام مجمعة من غير اسمك. مفيش
        رجوع بعد المسح.
      </p>
      {!open ? (
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          عايز أمسح حسابي
        </button>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>
            كلمة المرور
            <input name="password" type="password" className="input" required autoComplete="current-password" />
          </label>
          <label>
            اكتب كلمة "امسح" للتأكيد
            <input name="confirm" className="input" required autoComplete="off" />
          </label>
          <div className="page-header-actions">
            <button className="btn btn-danger" disabled={busy}>
              {busy ? 'لحظة...' : 'امسح حسابي نهائيًا'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Mobile "أنا" hub. */
export function Me() {
  const { user, ready, logout, adminUrl } = useAuth();
  const { canInstall, install } = useInstall();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="page narrow">
      <h1 className="page-title">أهلاً {user.displayName}</h1>
      <div className="me-links">
        <Link to="/memories"><Icon name="sparkle" /> ذكرياتي</Link>
        <Link to="/favorites"><Icon name="heart" /> المفضلة</Link>
        <Link to="/playlists"><Icon name="list" /> قوائمي</Link>
        <Link to="/history"><Icon name="history" /> سجل الاستماع</Link>
        <Link to="/years"><Icon name="calendar" /> آلة الزمن</Link>
        <Link to="/car"><Icon name="car" /> وضع السيارة</Link>
        <Link to="/settings"><Icon name="settings" /> الإعدادات</Link>
        {adminUrl ? <Link to={adminUrl}><Icon name="shield" /> لوحة الإدارة</Link> : null}
        {canInstall ? (
          <button type="button" onClick={install}>
            <Icon name="upload" /> ثبّت التطبيق
          </button>
        ) : null}
        <button type="button" onClick={logout}>
          <Icon name="logout" /> خروج
        </button>
      </div>
    </div>
  );
}
