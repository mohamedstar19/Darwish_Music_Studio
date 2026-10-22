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
import { useAdminBase } from './base.js';
import ImageSearch from './ImageSearch.jsx';

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
  const [findFor, setFindFor] = useState(null);
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
            {edit.id ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setFindFor(edit)}>
                <Icon name="search" size={16} /> دوّر على بوستر من الإنترنت
              </button>
            ) : null}
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
      {findFor ? (
        <ImageSearch
          type="work"
          id={findFor.id}
          initialQuery={findFor.title}
          onApplied={(img) => {
            setEdit((e) => (e && e.id === findFor.id ? { ...e, cover: img } : e));
            reload();
          }}
          onClose={() => setFindFor(null)}
        />
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
function StreamTest({ url, onInfo }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);
  const run = async () => {
    if (!url) return;
    setBusy(true);
    setInfo(null);
    try {
      const r = await api.post('/api/admin/stations/test-stream', { url });
      setInfo(r);
      onInfo?.(r);
    } catch (err) {
      setInfo({ ok: false, error: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stream-test">
      <button type="button" className="btn btn-ghost btn-small" onClick={run} disabled={busy || !url}>
        {busy ? 'بيختبر...' : 'اختبار الرابط'}
      </button>
      {info ? (
        info.ok ? (
          <div className="stream-ok">
            <b>✓ الرابط شغال</b>
            <span>
              {[info.name, info.genre, info.bitrate ? `${info.bitrate} kbps` : null, info.isHls ? 'HLS' : info.contentType]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {info.title ? <span className="muted">بيذيع دلوقتي: {info.title}</span> : null}
            {info.resolvedFrom ? <span className="muted">الرابط كان قائمة تشغيل، واستخدمنا رابط البث اللي جواها.</span> : null}
          </div>
        ) : (
          <div className="stream-bad">
            <b>✗ {info.error || 'الرابط مش شغال'}</b>
            <span className="muted">
              ممكن يشتغل في المتصفح برضه لو السيرفر بتاعه قديم (Shoutcast v1). احفظ وجرب تشغله من صفحة المحطة.
            </span>
          </div>
        )
      ) : null}
    </div>
  );
}

function BulkStations({ onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post('/api/admin/stations/bulk', { text });
      setResults(r.results);
      onDone();
    } catch (err) {
      setResults([{ ok: false, line: '', error: err.message }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="إضافة كذا محطة بالروابط" onClose={onClose} wide>
      {!results ? (
        <form className="form" onSubmit={submit}>
          <p className="muted small">
            حط كل محطة في سطر. ممكن تكتب الرابط لوحده (هنجيب الاسم من المحطة نفسها)، أو الاسم وبعده | وبعدين الرابط. روابط
            ‎.pls و ‎.m3u و ‎.m3u8 شغالة.
          </p>
          <textarea
            className="input mono"
            rows={9}
            dir="ltr"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'https://stream.example.com/live\nإذاعة الأغاني | https://radio.example.com/listen.pls\nAnime FM | https://example.com/hls/live.m3u8'}
            required
          />
          <button className="btn btn-primary" disabled={busy || !text.trim()}>
            {busy ? 'بيضيف ويختبر الروابط...' : 'إضافة المحطات'}
          </button>
        </form>
      ) : (
        <div className="bulk-results">
          <p>
            اتضاف {results.filter((r) => r.ok).length} من {results.length}
          </p>
          <ul className="plain-list">
            {results.map((r, i) => (
              <li key={i}>
                {r.ok ? (
                  <>
                    <b>✓ {r.station.name}</b>
                    {r.warning ? <span className="form-error small"> · اتضافت بس الاختبار قال: {r.warning}</span> : null}
                  </>
                ) : (
                  <>
                    <b className="form-error">✗</b> <span dir="ltr">{r.line}</span> <span className="muted small">{r.error}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            تمام
          </button>
        </div>
      )}
    </Modal>
  );
}

export function Stations() {
  const { data, loading, error, reload } = useFetch('/api/admin/stations');
  const [edit, setEdit] = useState(null);
  const [bulk, setBulk] = useState(false);
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const setE = (k) => (e) => setEdit((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const submit = async (e) => {
    e.preventDefault();
    const logo = e.target.logo?.files?.[0];
    const body = {
      name: edit.name,
      slug: edit.slug,
      description: edit.description,
      color: edit.color,
      requestsMode: edit.kind === 'external' ? 'off' : edit.requestsMode,
      shuffle: !!edit.shuffle,
      isActive: !!edit.isActive,
      kind: edit.kind,
      streamUrl: edit.kind === 'external' ? edit.streamUrl : undefined,
      homepage: edit.homepage || null,
    };
    const s = await save(() => (edit.id ? api.patch(`/api/admin/stations/${edit.id}`, body) : api.post('/api/admin/stations', body)));
    if (s && logo) {
      const fd = new FormData();
      fd.append('file', logo);
      await save(() => uploadWithProgress(`/api/admin/stations/${s.id}/logo`, fd), 'اللوجو اترفع');
    }
    if (s) setEdit(null);
  };

  // Fill empty fields from what the stream says about itself.
  const applyInfo = (info) => {
    if (!info?.ok) return;
    setEdit((s) => ({
      ...s,
      name: s.name || (info.name && !/\.(mp3|aac|ogg|opus|m3u8?|pls)$/i.test(info.name) ? info.name : ''),
      description: s.description || [info.genre, info.description].filter(Boolean).join(' · '),
      homepage: s.homepage || info.homepage || '',
      streamUrl: info.resolvedFrom ? info.url : s.streamUrl,
    }));
  };

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>محطات الراديو</h1>
        <div className="page-header-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setBulk(true)}>
            <Icon name="list" /> إضافة كذا محطة بالروابط
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setEdit({ kind: 'external', isActive: true, shuffle: true, requestsMode: 'off', color: '#ff2d9b' })}
          >
            <Icon name="plus" /> محطة جديدة
          </button>
        </div>
      </div>
      <p className="muted">
        نوعين: <b>رابط بث</b> لمحطة شغالة على الإنترنت، أو <b>من مكتبتك</b> بتشغل الأغاني اللي رفعتها وكل المستمعين بيسمعوا نفس
        الأغنية في نفس اللحظة. ضيف بس المحطات اللي مسموحلك تعرضها.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المحطة</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="cell-track">
                    {s.logo ? <img className="station-logo" src={s.logo} alt="" /> : <span className="dot" style={{ background: s.color }} />}
                    <span>
                      <b>{s.name}</b>
                      <small className="muted">{s.description}</small>
                    </span>
                  </div>
                </td>
                <td>
                  {s.kind === 'external' ? (
                    <>
                      رابط بث
                      <div className="muted small ellipsis" dir="ltr" title={s.streamUrl}>
                        {s.streamUrl}
                      </div>
                    </>
                  ) : (
                    <>
                      من مكتبتك
                      <div className="muted small">{s.trackCount} أغنية</div>
                    </>
                  )}
                </td>
                <td>{s.isActive ? <span className="status status-ready">ظاهرة</span> : <span className="status">مخفية</span>}</td>
                <td className="nowrap">
                  <Link to={`/radio/${s.slug}`} className="btn btn-ghost btn-small">
                    فتح
                  </Link>
                  {s.kind !== 'external' ? (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => save(() => api.post(`/api/admin/stations/${s.id}/skip`), 'اتنقلت للأغنية اللي بعدها')}>
                      تخطي الأغنية
                    </button>
                  ) : null}
                  <button type="button" className="icon-btn" onClick={() => setEdit({ ...s })} aria-label="تعديل">
                    <Icon name="edit" size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bulk ? <BulkStations onClose={() => setBulk(false)} onDone={reload} /> : null}

      {edit ? (
        <Modal title={edit.id ? `تعديل ${edit.name}` : 'محطة جديدة'} onClose={() => setEdit(null)}>
          <form className="form" onSubmit={submit}>
            <div className="seg" role="radiogroup" aria-label="نوع المحطة">
              <button type="button" className={edit.kind === 'external' ? 'on' : ''} onClick={() => setE('kind')('external')}>
                رابط بث من الإنترنت
              </button>
              <button type="button" className={edit.kind !== 'external' ? 'on' : ''} onClick={() => setE('kind')('synced')}>
                من أغاني مكتبتي
              </button>
            </div>

            {edit.kind === 'external' ? (
              <>
                <label>
                  رابط البث
                  <input
                    className="input"
                    dir="ltr"
                    value={edit.streamUrl || ''}
                    onChange={setE('streamUrl')}
                    placeholder="https://stream.example.com/live  أو  ‎.pls / .m3u / .m3u8"
                    required
                  />
                </label>
                <StreamTest url={edit.streamUrl} onInfo={applyInfo} />
              </>
            ) : null}

            <label>
              الاسم
              <input className="input" value={edit.name || ''} onChange={setE('name')} required />
            </label>
            <label>
              وصف
              <input className="input" value={edit.description || ''} onChange={setE('description')} />
            </label>
            {edit.kind === 'external' ? (
              <label>
                موقع المحطة (اختياري)
                <input className="input" dir="ltr" value={edit.homepage || ''} onChange={setE('homepage')} />
              </label>
            ) : null}
            <div className="form-grid">
              <label>
                اللون
                <input type="color" className="input" value={edit.color || '#f97316'} onChange={setE('color')} />
              </label>
              <label>
                لوجو المحطة
                <input name="logo" type="file" accept="image/*" className="input" />
              </label>
            </div>
            <label>
              الرابط على موقعنا (بالإنجليزي، اختياري)
              <input className="input" dir="ltr" value={edit.slug || ''} onChange={setE('slug')} placeholder="مثلاً: anime-fm" />
            </label>
            {edit.kind !== 'external' ? (
              <>
                <label>
                  طلبات المستمعين
                  <select className="input" value={edit.requestsMode || 'moderated'} onChange={setE('requestsMode')}>
                    <option value="moderated">بمراجعة الإدارة</option>
                    <option value="auto">قبول تلقائي</option>
                    <option value="off">مقفولة</option>
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={!!edit.shuffle} onChange={setE('shuffle')} /> ترتيب عشوائي (بيتغير كل دورة)
                </label>
              </>
            ) : null}
            <label className="check">
              <input type="checkbox" checked={!!edit.isActive} onChange={setE('isActive')} /> المحطة ظاهرة للناس
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
  const base = useAdminBase();
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
              {r.track_id ? <Link to={`${base}/tracks?edit=${r.track_id}`}>{r.track_title}</Link> : <span className="muted">عام</span>}
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
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState(null);
  const [findPhoto, setFindPhoto] = useState(false);
  const save = useSaver(reload);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const close = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setEdit(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const photo = f.get('photo');
    const body = { name: f.get('name'), bio: f.get('bio') };
    const a = await save(() => (edit.id ? api.patch(`/api/admin/artists/${edit.id}`, body) : api.post('/api/admin/artists', body)));
    if (a && photo && photo.size) {
      const fd = new FormData();
      fd.append('file', photo);
      await save(() => uploadWithProgress(`/api/admin/artists/${a.id}/photo`, fd), 'الصورة اترفعت');
    }
    if (a) close();
  };

  const shown = data.filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()));
  const missing = data.filter((a) => !a.photo).length;

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>الفنانين</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEdit({})}>
          <Icon name="plus" /> فنان جديد
        </button>
      </div>
      <p className="muted">
        الفنانين بيتضافوا لوحدهم من بيانات ملفات الأغاني، أو لما تكتب اسم الفنان في تعديل الأغنية. دوس على أي فنان عشان تضيف
        صورته ونبذة عنه.
        {missing ? ` (${missing} من غير صورة)` : ''}
      </p>
      <input className="input" placeholder="دوّر على فنان" value={q} onChange={(e) => setQ(e.target.value)} />
      {!data.length ? <Empty icon="user" title="مفيش فنانين لسه" /> : null}
      <div className="artist-grid">
        {shown.map((a) => (
          <button key={a.id} type="button" className="artist-tile" onClick={() => setEdit(a)}>
            <Cover src={a.photo} round seed={a.id + 7} />
            <b>{a.name}</b>
            <small className="muted">
              {a.track_count} أغنية {a.photo ? '' : '· من غير صورة'}
            </small>
          </button>
        ))}
      </div>

      {edit ? (
        <Modal title={edit.id ? `تعديل ${edit.name}` : 'فنان جديد'} onClose={close}>
          <form className="form" onSubmit={submit}>
            <div className="artist-photo-edit">
              <Cover src={preview || edit.photo} round size={120} seed={(edit.id || 0) + 7} />
              <div className="artist-photo-actions">
                <label className="btn btn-ghost btn-small">
                  {edit.photo || preview ? 'تغيير الصورة' : 'اختار صورة'}
                  <input
                    name="photo"
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (preview) URL.revokeObjectURL(preview);
                      setPreview(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                </label>
                {edit.photo && !preview ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={async () => {
                      await save(() => api.del(`/api/admin/artists/${edit.id}/photo`), 'الصورة اتشالت');
                      setEdit({ ...edit, photo: null });
                    }}
                  >
                    شيل الصورة
                  </button>
                ) : null}
                {edit.id ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setFindPhoto(true)}>
                    <Icon name="search" size={16} /> دوّر على صورة من الإنترنت
                  </button>
                ) : null}
                <small className="muted">صورة مربعة أحسن. هتتقص دايرة وهتتصغر لوحدها.</small>
              </div>
            </div>
            <p className="muted small">
              صورة الفنان بتظهر تلقائي على كل أغانيه. الأغنية اللي ليها صورة خاصة بيها (من تعديل الأغنية) بتفضل بصورتها.
            </p>
            {edit.id && edit.photo && edit.own_cover_count ? (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={async () => {
                  const r = await save(() => api.post(`/api/admin/artists/${edit.id}/apply-photo`), 'اتطبقت');
                  if (r) setEdit({ ...edit, own_cover_count: 0 });
                }}
              >
                طبّق صورة الفنان على كل أغانيه ({edit.own_cover_count} أغنية ليها صورة خاصة)
              </button>
            ) : null}
            <label>
              الاسم
              <input name="name" className="input" defaultValue={edit.name || ''} required maxLength={120} />
            </label>
            <label>
              نبذة (اختياري)
              <textarea name="bio" className="input" rows={4} defaultValue={edit.bio || ''} maxLength={3000} />
            </label>
            <div className="edit-foot">
              {edit.id && !edit.track_count ? (
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={async () => {
                    await save(() => api.del(`/api/admin/artists/${edit.id}`), 'اتمسح');
                    close();
                  }}
                >
                  حذف الفنان
                </button>
              ) : (
                <span />
              )}
              <button className="btn btn-primary">حفظ</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {findPhoto && edit?.id ? (
        <ImageSearch
          type="artist"
          id={edit.id}
          initialQuery={edit.name}
          onApplied={(img) => {
            setEdit((e) => (e ? { ...e, photo: img } : e));
            reload();
          }}
          onClose={() => setFindPhoto(false)}
        />
      ) : null}
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
