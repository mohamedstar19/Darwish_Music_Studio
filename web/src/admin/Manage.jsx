import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, uploadWithProgress } from '../api.js';
import { Cover, Empty, ErrorBox, Loading, Modal } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { kindLabel } from '../pages/Browse.jsx';
import { useFetch } from '../hooks.js';
import { useAuth } from '../state/AuthContext.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { timeAgo } from './ui.jsx';

function useSaver(reload) {
  const toast = useToast();
  return async (fn, okMessage = 'اتحفظ') => {
    try {
      const r = await fn();
      toast(okMessage, 'success');
      reload();
      return r;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  };
}

// ---------- Works ----------
export function Works() {
  const { data, loading, error, reload } = useFetch('/api/admin/works');
  const [edit, setEdit] = useState(null);
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const cover = e.target.cover.files[0];
    delete f.cover;
    const w = await save(() => (edit.id ? api.patch(`/api/admin/works/${edit.id}`, f) : api.post('/api/admin/works', f)));
    if (w && cover) {
      const fd = new FormData();
      fd.append('file', cover);
      await save(() => uploadWithProgress(`/api/admin/works/${w.id}/cover`, fd), 'الغلاف اترفع');
    }
    if (w) setEdit(null);
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>الأعمال (كرتون، أنمي، مسلسلات)</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>
          <Icon name="plus" /> عمل جديد
        </button>
      </div>
      {!data.length ? <Empty title="مفيش أعمال لسه">ضيف الكرتون أو الأنمي اللي الأغاني تابعة ليه.</Empty> : null}
      <div className="grid">
        {data.map((w) => (
          <button key={w.id} type="button" className="card card-btn" onClick={() => setEdit(w)}>
            <div className="card-cover">
              <Cover src={w.cover} seed={w.id + 3} />
            </div>
            <div className="card-title">{w.title}</div>
            <div className="card-sub">
              {kindLabel(w.kind)} {w.year ? `· ${w.year}` : ''} · {w.track_count} أغنية
            </div>
          </button>
        ))}
      </div>
      {edit ? (
        <Modal title={edit.id ? `تعديل ${edit.title}` : 'عمل جديد'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={submit}>
            <label>
              الاسم بالعربي
              <input name="title" className="input" defaultValue={edit.title || ''} required />
            </label>
            <label>
              الاسم الأصلي
              <input name="originalTitle" className="input" defaultValue={edit.original_title || ''} dir="auto" />
            </label>
            <div className="form-grid">
              <label>
                النوع
                <select name="kind" className="input" defaultValue={edit.kind || 'cartoon'}>
                  {['cartoon', 'anime', 'series', 'film', 'original', 'other'].map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                سنة العرض
                <input name="year" type="number" className="input" defaultValue={edit.year || ''} />
              </label>
            </div>
            <label>
              الاستوديو / جهة الدبلجة
              <input name="studio" className="input" defaultValue={edit.studio || ''} />
            </label>
            <label>
              نبذة
              <textarea name="description" className="input" rows={3} defaultValue={edit.description || ''} />
            </label>
            <label>
              صورة الغلاف
              <input name="cover" type="file" accept="image/*" className="input" />
            </label>
            <div className="edit-foot">
              {edit.id ? (
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    if (!window.confirm('تمسح العمل ده؟ الأغاني هتفضل بس من غير عمل.')) return;
                    await save(() => api.del(`/api/admin/works/${edit.id}`), 'اتمسح');
                    setEdit(null);
                  }}
                >
                  حذف
                </button>
              ) : null}
              <button className="btn btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------- Categories ----------
export function Categories() {
  const { data, loading, error, reload } = useFetch('/api/admin/categories');
  const [edit, setEdit] = useState(null);
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const r = await save(() => (edit.id ? api.patch(`/api/admin/categories/${edit.id}`, f) : api.post('/api/admin/categories', f)));
    if (r) setEdit(null);
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>التصنيفات</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>
          <Icon name="plus" /> تصنيف جديد
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الرابط</th>
              <th>أغاني</th>
              <th>الترتيب</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr key={c.id}>
                <td>
                  <span className="dot" style={{ background: c.color }} /> {c.name}
                </td>
                <td dir="ltr" className="muted small">/category/{c.slug}</td>
                <td>{c.track_count}</td>
                <td>{c.sort_order}</td>
                <td>
                  <button type="button" className="icon-btn" onClick={() => setEdit(c)} aria-label="تعديل">
                    <Icon name="edit" size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <Modal title={edit.id ? `تعديل ${edit.name}` : 'تصنيف جديد'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={submit}>
            <label>
              الاسم
              <input name="name" className="input" defaultValue={edit.name || ''} required />
            </label>
            <label>
              الرابط (بالإنجليزي)
              <input name="slug" className="input" defaultValue={edit.slug || ''} dir="ltr" />
            </label>
            <label>
              وصف
              <input name="description" className="input" defaultValue={edit.description || ''} />
            </label>
            <div className="form-grid">
              <label>
                اللون
                <input name="color" type="color" className="input" defaultValue={edit.color || '#7c3aed'} />
              </label>
              <label>
                الترتيب
                <input name="sortOrder" type="number" className="input" defaultValue={edit.sort_order ?? 0} />
              </label>
            </div>
            <div className="edit-foot">
              {edit.id ? (
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    if (!window.confirm('تمسح التصنيف؟')) return;
                    await save(() => api.del(`/api/admin/categories/${edit.id}`), 'اتمسح');
                    setEdit(null);
                  }}
                >
                  حذف
                </button>
              ) : null}
              <button className="btn btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------- Stations ----------
export function Stations() {
  const { data, loading, error, reload } = useFetch('/api/admin/stations');
  const [edit, setEdit] = useState(null);
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const submit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const f = Object.fromEntries(fd);
    f.isActive = fd.get('isActive') === 'on';
    f.shuffle = fd.get('shuffle') === 'on';
    const r = await save(() => (edit.id ? api.patch(`/api/admin/stations/${edit.id}`, f) : api.post('/api/admin/stations', f)));
    if (r) setEdit(null);
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>محطات الراديو</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({ isActive: true, shuffle: true, requestsMode: 'moderated' })}>
          <Icon name="plus" /> محطة جديدة
        </button>
      </div>
      <p className="muted">
        المحطة بتشغل الأغاني المنشورة اللي متضافة ليها (من صفحة الأغاني أو أثناء الرفع). كل المستمعين بيسمعوا نفس الأغنية في نفس
        الوقت.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المحطة</th>
              <th>أغاني</th>
              <th>الطلبات</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="dot" style={{ background: s.color }} /> <b>{s.name}</b>
                  <div className="muted small">{s.description}</div>
                </td>
                <td>{s.trackCount}</td>
                <td>{{ off: 'مقفولة', moderated: 'بمراجعة', auto: 'تلقائي' }[s.requestsMode]}</td>
                <td>{s.isActive ? <span className="status status-ready">شغالة</span> : <span className="status">متوقفة</span>}</td>
                <td className="nowrap">
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => save(() => api.post(`/api/admin/stations/${s.id}/skip`), 'اتنقلت للأغنية اللي بعدها')}>
                    تخطي الأغنية
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setEdit(s)} aria-label="تعديل">
                    <Icon name="edit" size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <Modal title={edit.id ? `تعديل ${edit.name}` : 'محطة جديدة'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={submit}>
            <label>
              الاسم
              <input name="name" className="input" defaultValue={edit.name || ''} required />
            </label>
            <label>
              الرابط (بالإنجليزي)
              <input name="slug" className="input" defaultValue={edit.slug || ''} dir="ltr" />
            </label>
            <label>
              وصف
              <input name="description" className="input" defaultValue={edit.description || ''} />
            </label>
            <div className="form-grid">
              <label>
                اللون
                <input name="color" type="color" className="input" defaultValue={edit.color || '#f97316'} />
              </label>
              <label>
                طلبات المستمعين
                <select name="requestsMode" className="input" defaultValue={edit.requestsMode}>
                  <option value="moderated">بمراجعة الإدارة</option>
                  <option value="auto">قبول تلقائي</option>
                  <option value="off">مقفولة</option>
                </select>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" name="shuffle" defaultChecked={edit.shuffle} /> ترتيب عشوائي (بيتغير كل دورة)
            </label>
            <label className="check">
              <input type="checkbox" name="isActive" defaultChecked={edit.isActive} /> المحطة شغالة وظاهرة
            </label>
            <div className="edit-foot">
              {edit.id ? (
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    if (!window.confirm('تمسح المحطة؟')) return;
                    await save(() => api.del(`/api/admin/stations/${edit.id}`), 'اتمسحت');
                    setEdit(null);
                  }}
                >
                  حذف
                </button>
              ) : null}
              <button className="btn btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------- Song requests ----------
export function Requests() {
  const [status, setStatus] = useState('pending');
  const { data, loading, error, reload } = useFetch(`/api/admin/requests?status=${status}`);
  const save = useSaver(reload);
  return (
    <div className="admin-page">
      <h1>طلبات الأغاني</h1>
      <div className="chips">
        {[
          ['pending', 'مستنية'],
          ['approved', 'في الطابور'],
          ['played', 'اتذاعت'],
          ['rejected', 'مرفوضة'],
        ].map(([v, l]) => (
          <button key={v} type="button" className={`chip ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
      </div>
      {loading && !data ? <Loading /> : null}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty icon="radio" title="مفيش طلبات" /> : null}
      {data?.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الأغنية</th>
                <th>المحطة</th>
                <th>من</th>
                <th>رسالة</th>
                <th>إمتى</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{r.track_title}</td>
                  <td>{r.station_name}</td>
                  <td>{r.user_name || '—'}</td>
                  <td className="muted">{r.message}</td>
                  <td className="muted small">{timeAgo(r.created_at)}</td>
                  <td className="nowrap">
                    {r.status === 'pending' ? (
                      <>
                        <button type="button" className="btn btn-small btn-primary" onClick={() => save(() => api.patch(`/api/admin/requests/${r.id}`, { status: 'approved' }), 'اتقبل')}>
                          قبول
                        </button>
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => save(() => api.patch(`/api/admin/requests/${r.id}`, { status: 'rejected' }), 'اترفض')}>
                          رفض
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Reports ----------
const REPORT_KIND = { rights: 'حقوق', broken: 'مش شغالة', metadata: 'بيانات غلط', other: 'أخرى' };

export function Reports() {
  const [status, setStatus] = useState('open');
  const { data, loading, error, reload } = useFetch(`/api/admin/reports?status=${status}`);
  const save = useSaver(reload);
  return (
    <div className="admin-page">
      <h1>البلاغات</h1>
      <p className="muted">بلاغات الحقوق لها أولوية: أوقف نشر الأغنية لحد ما تراجع الطلب.</p>
      <div className="chips">
        {[
          ['open', 'مفتوحة'],
          ['resolved', 'اتحلت'],
          ['dismissed', 'اتجاهلت'],
        ].map(([v, l]) => (
          <button key={v} type="button" className={`chip ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
      </div>
      {loading && !data ? <Loading /> : null}
      <ErrorBox error={error} onRetry={reload} />
      {data?.length === 0 ? <Empty icon="flag" title="مفيش بلاغات" /> : null}
      <div className="report-list">
        {data?.map((r) => (
          <div key={r.id} className={`card-box report report-${r.kind}`}>
            <div className="report-head">
              <span className={`rights ${r.kind === 'rights' ? 'rights-pending' : ''}`}>{REPORT_KIND[r.kind]}</span>
              {r.track_id ? <Link to={`/admin/tracks?edit=${r.track_id}`}>{r.track_title}</Link> : <span className="muted">عام</span>}
              <span className="muted small">{timeAgo(r.created_at)}</span>
            </div>
            <p>{r.message}</p>
            <p className="muted small">
              {r.contact ? `تواصل: ${r.contact}` : ''} {r.user_email ? `· الحساب: ${r.user_email}` : ''}
            </p>
            {r.admin_note ? <p className="muted small">ملاحظة: {r.admin_note}</p> : null}
            {r.status === 'open' ? (
              <div className="page-header-actions">
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={() => {
                    const note = window.prompt('ملاحظة (اختياري):') || '';
                    save(() => api.patch(`/api/admin/reports/${r.id}`, { status: 'resolved', adminNote: note }), 'اتقفل');
                  }}
                >
                  اتحلت
                </button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => save(() => api.patch(`/api/admin/reports/${r.id}`, { status: 'dismissed' }), 'اتجاهل')}>
                  تجاهل
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Users ----------
export function Users() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useFetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const save = useSaver(reload);
  const { user: me } = useAuth();
  const [resetFor, setResetFor] = useState(null);

  return (
    <div className="admin-page">
      <h1>المستخدمين</h1>
      <input className="input" placeholder="بحث بالبريد أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data ? <Loading /> : null}
      <ErrorBox error={error} onRetry={reload} />
      {data ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>الدور</th>
                <th>تشغيل</th>
                <th>آخر دخول</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.displayName}</b>
                    <div className="muted small" dir="ltr">{u.email}</div>
                  </td>
                  <td>
                    <select
                      className="input input-small"
                      value={u.role}
                      disabled={u.id === me.id}
                      onChange={(e) => save(() => api.patch(`/api/admin/users/${u.id}`, { role: e.target.value }), 'الدور اتغير')}
                    >
                      <option value="user">مستخدم</option>
                      <option value="editor">محرر محتوى</option>
                      <option value="admin">مدير</option>
                    </select>
                  </td>
                  <td>{u.plays}</td>
                  <td className="muted small">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</td>
                  <td>
                    {u.isDisabled ? <span className="status status-failed">موقوف</span> : <span className="status status-ready">نشط</span>}
                  </td>
                  <td className="nowrap">
                    {u.id !== me.id ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => save(() => api.patch(`/api/admin/users/${u.id}`, { isDisabled: !u.isDisabled }), u.isDisabled ? 'اتفعل' : 'اتوقف')}
                      >
                        {u.isDisabled ? 'تفعيل' : 'إيقاف'}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setResetFor(u)}>
                      كلمة مرور جديدة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {resetFor ? (
        <Modal title={`كلمة مرور جديدة لـ ${resetFor.displayName}`} onClose={() => setResetFor(null)}>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const pw = new FormData(e.target).get('pw');
              const r = await save(() => api.patch(`/api/admin/users/${resetFor.id}`, { newPassword: pw }), 'كلمة المرور اتغيرت');
              if (r) setResetFor(null);
            }}
          >
            <p className="muted small">ابعت كلمة المرور الجديدة للمستخدم بطريقة آمنة، واطلب منه يغيرها من الإعدادات.</p>
            <input name="pw" type="text" className="input" minLength={8} required autoComplete="off" />
            <button className="btn btn-primary">حفظ</button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------- Artists ----------
export function Artists() {
  const { data, loading, error, reload } = useFetch('/api/admin/artists');
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="admin-page">
      <h1>الفنانين</h1>
      <p className="muted">الفنانين بيتضافوا تلقائيًا من بيانات الملفات أو من تعديل الأغنية.</p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>أغاني</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.track_count}</td>
                <td className="nowrap">
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      const name = window.prompt('الاسم الجديد', a.name);
                      if (name && name !== a.name) save(() => api.patch(`/api/admin/artists/${a.id}`, { name }));
                    }}
                  >
                    تعديل الاسم
                  </button>
                  {!a.track_count ? (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => save(() => api.del(`/api/admin/artists/${a.id}`), 'اتمسح')}>
                      حذف
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Official playlists ----------
export function OfficialPlaylists() {
  const { data, loading, error, reload } = useFetch('/api/admin/playlists');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>القوائم الرسمية</h1>
        <Link to="/playlists" className="btn btn-primary">
          <Icon name="plus" /> قائمة رسمية جديدة
        </Link>
      </div>
      <p className="muted">
        القوائم دي بتظهر في الرئيسية تحت "عيش ذكرياتك من جديد". اعمل قائمة من "قوائمي" وعلّم عليها "قائمة رسمية"، وبعدين ضيف
        ليها أغاني من قائمة الخيارات (⋯) جنب أي أغنية.
      </p>
      {!data.length ? <Empty icon="list" title="مفيش قوائم رسمية لسه" /> : null}
      <ul className="plain-list">
        {data.map((p) => (
          <li key={p.id}>
            <Link to={`/playlist/${p.id}`}>{p.title}</Link> <span className="muted">· {p.trackCount} أغنية</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
