import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, formatBytes, formatTime, streamUrl, uploadWithProgress } from '../api.js';
import { Cover, Empty, Loading, Modal } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useDebounced } from '../hooks.js';
import { useToast } from '../state/ToastContext.jsx';
import { RIGHTS_LABEL, STATUS_LABEL } from './ui.jsx';

function Select({ value, onChange, options, empty = '—', className = 'input' }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{empty}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function UploadPanel({ lookups, onUploaded }) {
  const toast = useToast();
  const [defaults, setDefaults] = useState({ categoryId: '', workId: '', stationId: '', rightsType: 'pending', rightsSource: '', artistName: '' });
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const set = (k) => (v) => setDefaults((d) => ({ ...d, [k]: v }));

  const uploadFiles = async (files) => {
    const list = [...files].map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, size: f.size, progress: 0, status: 'waiting', file: f }));
    setItems((prev) => [...list, ...prev].slice(0, 50));
    for (const item of list) {
      setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: 'uploading' } : x)));
      const fd = new FormData();
      Object.entries(defaults).forEach(([k, v]) => v && fd.append(k, v));
      fd.append('file', item.file);
      try {
        await uploadWithProgress('/api/admin/tracks/upload', fd, (p) =>
          setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, progress: p } : x))),
        );
        setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: 'done', progress: 1 } : x)));
        onUploaded();
      } catch (err) {
        setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, status: 'error', error: err.message } : x)));
        toast(`${item.name}: ${err.message}`, 'error');
      }
    }
  };

  return (
    <div className="card-box upload-panel">
      <h3>رفع أغاني</h3>
      <p className="muted small">
        القيم دي هتتطبق على كل الملفات اللي هترفعها. السيرفر هيحوّل كل ملف لـ MP3 بصوت موحّد (Loudness normalization)،
        ويقرا الاسم والمدة والغلاف من الملف لوحده.
      </p>
      <div className="form-grid">
        <label>
          التصنيف
          <Select value={defaults.categoryId} onChange={set('categoryId')} options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))} />
        </label>
        <label>
          العمل (الكرتون/الأنمي)
          <Select value={defaults.workId} onChange={set('workId')} options={lookups.works.map((w) => ({ value: w.id, label: w.title }))} />
        </label>
        <label>
          ضيفها لمحطة
          <Select value={defaults.stationId} onChange={set('stationId')} options={lookups.stations.map((s) => ({ value: s.id, label: s.name }))} />
        </label>
        <label>
          الفنان (لو الملف مفيهوش)
          <input className="input" value={defaults.artistName} onChange={(e) => set('artistName')(e.target.value)} list="artists-list" />
        </label>
        <label>
          حالة الحقوق
          <select className="input" value={defaults.rightsType} onChange={(e) => set('rightsType')(e.target.value)}>
            <option value="pending">قيد المراجعة (مش هتتنشر)</option>
            <option value="original">عمل أصلي</option>
            <option value="licensed">مرخّص</option>
          </select>
        </label>
        <label>
          مصدر الحقوق / الترخيص
          <input className="input" value={defaults.rightsSource} onChange={(e) => set('rightsSource')(e.target.value)} placeholder="مثلاً: عقد رقم ... / إنتاج داخلي" />
        </label>
      </div>
      <datalist id="artists-list">
        {lookups.artists.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      >
        <Icon name="upload" size={32} />
        <b>اسحب ملفات الصوت هنا أو دوس للاختيار</b>
        <span className="muted small">MP3, M4A, WAV, FLAC, OGG, OPUS — ممكن تختار كذا ملف مرة واحدة</span>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.aac"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files.length) uploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {items.length ? (
        <ul className="upload-list">
          {items.map((x) => (
            <li key={x.key} className={`upload-${x.status}`}>
              <span className="grow">{x.name}</span>
              <span className="muted small">{formatBytes(x.size)}</span>
              <div className="bar">
                <i style={{ width: `${x.progress * 100}%` }} />
              </div>
              <small>{x.status === 'done' ? '✓' : x.status === 'error' ? x.error : x.status === 'waiting' ? 'مستني' : `${Math.round(x.progress * 100)}%`}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EditTrack({ id, lookups, onClose, onSaved }) {
  const toast = useToast();
  const [t, setT] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/api/admin/tracks/${id}`).then((d) => {
      setT(d);
      setForm({
        title: d.title,
        artistName: d.artistName || '',
        workId: d.workId || '',
        categoryId: d.categoryId || '',
        year: d.year || '',
        lyrics: d.lyrics || '',
        credits: d.credits || '',
        rightsType: d.rightsType,
        rightsSource: d.rightsSource || '',
        rightsNotes: d.rightsNotes || '',
        licenseScope: d.licenseScope || [],
        licenseRegions: d.licenseRegions || '',
        licenseExpiresAt: d.licenseExpiresAt || '',
        isPublished: d.isPublished,
        stationIds: d.stationIds || [],
      });
    }).catch((e) => toast(e.message, 'error'));
  }, [id, toast]);

  useEffect(load, [load]);

  // Poll while the file is still being processed.
  useEffect(() => {
    if (!t || !['pending', 'processing'].includes(t.processingStatus)) return undefined;
    const timer = setTimeout(() => {
      api.get(`/api/admin/tracks/${id}`).then(setT).catch(() => {});
    }, 2500);
    return () => clearTimeout(timer);
  }, [t, id]);

  if (!t || !form) {
    return (
      <Modal title="تعديل الأغنية" onClose={onClose} wide>
        <Loading />
      </Modal>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const toggleIn = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const updated = await api.patch(`/api/admin/tracks/${id}`, form);
      setT(updated);
      toast('اتحفظ', 'success');
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadCover = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const updated = await uploadWithProgress(`/api/admin/tracks/${id}/cover`, fd);
      setT(updated);
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const resetCover = async () => {
    try {
      setT(await api.del(`/api/admin/tracks/${id}/cover`));
      onSaved();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const reprocess = async () => {
    setT(await api.post(`/api/admin/tracks/${id}/reprocess`));
  };

  const del = async () => {
    if (!window.confirm(`تمسح "${t.title}" نهائيًا؟ الملفات هتتمسح من السيرفر.`)) return;
    await api.del(`/api/admin/tracks/${id}`);
    onSaved();
    onClose();
  };

  const canPublish = form.rightsType !== 'pending' && t.processingStatus === 'ready';

  return (
    <Modal title={`تعديل: ${t.title}`} onClose={onClose} wide>
      <form className="edit-track" onSubmit={save}>
        <div className="edit-side">
          <Cover src={t.cover} size={200} seed={t.id} />
          <p className="muted small cover-source">
            {{
              own: 'صورة خاصة بالأغنية دي',
              artist: 'صورة الفنان (تلقائي)',
              work: 'صورة العمل (تلقائي)',
            }[t.coverSource] || 'من غير صورة'}
          </p>
          <label className="btn btn-ghost btn-small">
            {t.coverSource === 'own' ? 'تغيير صورة الأغنية' : 'صورة مختلفة للأغنية دي'}
            <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && uploadCover(e.target.files[0])} />
          </label>
          {t.coverSource === 'own' ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={resetCover}>
              {t.artistHasPhoto ? 'رجّع لصورة الفنان' : 'شيل صورة الأغنية'}
            </button>
          ) : null}
          <div className={`status status-${t.processingStatus}`}>{STATUS_LABEL[t.processingStatus]}</div>
          {t.processingError ? <p className="form-error small">{t.processingError}</p> : null}
          {t.processingStatus === 'ready' ? (
            <>
              <audio controls preload="none" src={streamUrl(t.id)} className="preview-audio" />
              <p className="muted small">
                {formatTime(t.duration)} · {formatBytes(t.fileSize)} · {t.playCount} تشغيل
              </p>
            </>
          ) : null}
          <button type="button" className="btn btn-ghost btn-small" onClick={reprocess}>
            إعادة معالجة الملف
          </button>
          <button type="button" className="btn btn-danger btn-small" onClick={del}>
            <Icon name="trash" size={16} /> حذف الأغنية
          </button>
        </div>
        <div className="edit-main">
          <div className="form-grid">
            <label className="span-2">
              اسم الأغنية
              <input className="input" value={form.title} onChange={set('title')} required />
            </label>
            <label>
              الفنان
              <input className="input" value={form.artistName} onChange={set('artistName')} list="artists-list-edit" />
              <datalist id="artists-list-edit">
                {lookups.artists.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </label>
            <label>
              سنة الإنتاج
              <input className="input" type="number" min="1900" max="2100" value={form.year} onChange={set('year')} />
            </label>
            <label>
              العمل
              <Select value={form.workId} onChange={set('workId')} options={lookups.works.map((w) => ({ value: w.id, label: w.title }))} />
            </label>
            <label>
              التصنيف
              <Select value={form.categoryId} onChange={set('categoryId')} options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))} />
            </label>
          </div>

          <fieldset className="fieldset">
            <legend>الحقوق والترخيص</legend>
            <div className="form-grid">
              <label>
                نوع الحقوق
                <select className="input" value={form.rightsType} onChange={set('rightsType')}>
                  <option value="pending">قيد المراجعة</option>
                  <option value="original">عمل أصلي</option>
                  <option value="licensed">مرخّص</option>
                </select>
              </label>
              <label>
                الترخيص بينتهي في
                <input className="input" type="date" value={form.licenseExpiresAt} onChange={set('licenseExpiresAt')} />
              </label>
              <label className="span-2">
                مصدر الحقوق / المستند
                <input className="input" value={form.rightsSource} onChange={set('rightsSource')} />
              </label>
              <label>
                المناطق المسموحة
                <input className="input" value={form.licenseRegions} onChange={set('licenseRegions')} placeholder="مثلاً: مصر، الخليج، العالم" />
              </label>
              <div>
                نطاق الترخيص
                <div className="chips">
                  {[
                    ['on_demand', 'استماع حسب الطلب'],
                    ['radio', 'بث راديو'],
                    ['download', 'تنزيل'],
                    ['commercial', 'استخدام تجاري'],
                  ].map(([v, l]) => (
                    <button key={v} type="button" className={`chip ${form.licenseScope.includes(v) ? 'on' : ''}`} onClick={() => toggleIn('licenseScope', v)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <label className="span-2">
                ملاحظات الحقوق (داخلية)
                <textarea className="input" rows={2} value={form.rightsNotes} onChange={set('rightsNotes')} />
              </label>
            </div>
          </fieldset>

          <div>
            المحطات
            <div className="chips">
              {lookups.stations.map((s) => (
                <button key={s.id} type="button" className={`chip ${form.stationIds.includes(s.id) ? 'on' : ''}`} onClick={() => toggleIn('stationIds', s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="form-grid">
            <label>
              الكلمات (لو الحقوق بتسمح)
              <textarea className="input" rows={6} value={form.lyrics} onChange={set('lyrics')} />
            </label>
            <label>
              الاعتمادات (تأليف، ألحان، أداء، توزيع)
              <textarea className="input" rows={6} value={form.credits} onChange={set('credits')} />
            </label>
          </div>

          <div className="edit-foot">
            <label className={`check publish-toggle ${!canPublish ? 'disabled' : ''}`}>
              <input type="checkbox" checked={form.isPublished} onChange={set('isPublished')} disabled={!canPublish && !form.isPublished} />
              منشورة للجمهور
            </label>
            {!canPublish ? <span className="muted small">عشان تنشر: حدد الحقوق (أصلي/مرخّص) واستنى الملف يجهز.</span> : null}
            <button className="btn btn-primary" disabled={busy}>
              حفظ
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Tracks() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [lookups, setLookups] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', rights: '', published: '', category: '', station: '' });
  const dq = useDebounced(filters.q, 300);
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const editId = params.get('edit');

  const loadLookups = useCallback(() => api.get('/api/admin/lookups').then(setLookups), []);
  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ ...filters, q: dq, offset, limit: 50 });
    [...qs.keys()].forEach((k) => !qs.get(k) && qs.delete(k));
    return api.get(`/api/admin/tracks?${qs}`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [filters, dq, offset, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh while uploads are being processed.
  useEffect(() => {
    if (!data?.items.some((t) => ['pending', 'processing'].includes(t.processingStatus))) return undefined;
    const timer = setTimeout(load, 3000);
    return () => clearTimeout(timer);
  }, [data, load]);

  const setF = (k) => (v) => {
    setOffset(0);
    setFilters((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));
  };

  const toggleSel = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const bulk = async (action, value) => {
    if (!selected.size) return;
    if (action === 'delete' && !window.confirm(`تمسح ${selected.size} أغنية نهائيًا؟`)) return;
    try {
      const r = await api.post('/api/admin/tracks/bulk', { ids: [...selected], action, value });
      toast(r.skipped ? `اتنفذ، واتجاهل ${r.skipped} أغنية حقوقها أو ملفها مش جاهز` : 'اتنفذ', r.skipped ? 'info' : 'success');
      setSelected(new Set());
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const quickPublish = async (t) => {
    try {
      await api.patch(`/api/admin/tracks/${t.id}`, { isPublished: !t.isPublished });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!lookups) return <Loading />;

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>مكتبة الأغاني</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowUpload((s) => !s)}>
          <Icon name="upload" /> {showUpload ? 'إخفاء الرفع' : 'رفع أغاني'}
        </button>
      </div>
      {showUpload ? (
        <UploadPanel
          lookups={lookups}
          onUploaded={() => {
            load();
            loadLookups();
          }}
        />
      ) : null}

      <div className="filters">
        <input className="input" placeholder="بحث بالاسم أو الفنان أو العمل" value={filters.q} onChange={setF('q')} />
        <Select value={filters.rights} onChange={setF('rights')} empty="كل الحقوق" options={Object.entries(RIGHTS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <Select value={filters.published} onChange={setF('published')} empty="منشور وغير منشور" options={[{ value: 'yes', label: 'منشور' }, { value: 'no', label: 'غير منشور' }]} />
        <Select value={filters.status} onChange={setF('status')} empty="كل الحالات" options={Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <Select value={filters.category} onChange={setF('category')} empty="كل التصنيفات" options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Select value={filters.station} onChange={setF('station')} empty="كل المحطات" options={lookups.stations.map((s) => ({ value: s.id, label: s.name }))} />
      </div>

      {selected.size ? (
        <div className="bulk-bar">
          <b>{selected.size} متحدد</b>
          <button type="button" className="btn btn-small" onClick={() => bulk('publish')}>نشر</button>
          <button type="button" className="btn btn-small" onClick={() => bulk('unpublish')}>إلغاء النشر</button>
          <Select className="input input-small" value="" onChange={(v) => v && bulk('rights', v)} empty="الحقوق ←" options={Object.entries(RIGHTS_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          <Select className="input input-small" value="" onChange={(v) => v && bulk('category', v)} empty="التصنيف ←" options={lookups.categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select className="input input-small" value="" onChange={(v) => v && bulk('work', v)} empty="العمل ←" options={lookups.works.map((w) => ({ value: w.id, label: w.title }))} />
          <Select className="input input-small" value="" onChange={(v) => v && bulk('station', v)} empty="ضيف لمحطة ←" options={lookups.stations.map((s) => ({ value: s.id, label: s.name }))} />
          <button type="button" className="btn btn-small btn-danger" onClick={() => bulk('delete')}>حذف</button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setSelected(new Set())}>إلغاء التحديد</button>
        </div>
      ) : null}

      {!data ? <Loading /> : null}
      {data && !data.items.length ? <Empty title="مفيش أغاني">ارفع أول أغنية من زرار "رفع أغاني".</Empty> : null}
      {data?.items.length ? (
        <>
          <p className="muted small">
            {data.total} أغنية {data.queue ? `· ${data.queue} في طابور المعالجة` : ''}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="تحديد الكل"
                      checked={data.items.every((t) => selected.has(t.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(data.items.map((t) => t.id)) : new Set())}
                    />
                  </th>
                  <th>الأغنية</th>
                  <th>الحقوق</th>
                  <th>الملف</th>
                  <th>منشورة</th>
                  <th>تشغيل</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((t) => (
                  <tr key={t.id} className={selected.has(t.id) ? 'selected' : ''}>
                    <td>
                      <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} aria-label={`تحديد ${t.title}`} />
                    </td>
                    <td>
                      <button type="button" className="cell-track" onClick={() => setParams({ edit: t.id })}>
                        <Cover src={t.cover} size={40} seed={t.id} />
                        <span>
                          <b>{t.title}</b>
                          <small className="muted">
                            {[t.workTitle, t.artistName, t.categoryName].filter(Boolean).join(' · ') || 'بدون بيانات'}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`rights rights-${t.rightsType}`}>{RIGHTS_LABEL[t.rightsType]}</span>
                      {t.licenseExpiresAt ? <div className="muted small">لحد {t.licenseExpiresAt}</div> : null}
                    </td>
                    <td>
                      <span className={`status status-${t.processingStatus}`}>{STATUS_LABEL[t.processingStatus]}</span>
                      {t.duration ? <div className="muted small">{formatTime(t.duration)}</div> : null}
                    </td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={t.isPublished} onChange={() => quickPublish(t)} aria-label="منشورة" />
                        <span />
                      </label>
                      {t.isPublished && !t.isPlayable ? <div className="form-error small">مخفية</div> : null}
                    </td>
                    <td>{t.playCount}</td>
                    <td>
                      <button type="button" className="icon-btn" onClick={() => setParams({ edit: t.id })} aria-label="تعديل">
                        <Icon name="edit" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-ghost btn-small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 50))}>
              السابق
            </button>
            <span className="muted small">
              {offset + 1}–{Math.min(offset + 50, data.total)} من {data.total}
            </span>
            <button type="button" className="btn btn-ghost btn-small" disabled={offset + 50 >= data.total} onClick={() => setOffset((o) => o + 50)}>
              التالي
            </button>
          </div>
        </>
      ) : null}

      {editId ? (
        <EditTrack
          id={editId}
          lookups={lookups}
          onClose={() => setParams({})}
          onSaved={() => {
            load();
            loadLookups();
          }}
        />
      ) : null}
    </div>
  );
}
