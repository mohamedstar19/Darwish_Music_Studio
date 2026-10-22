import { useCallback, useEffect, useState } from 'react';
import { api, formatBytes } from '../api.js';
import { Loading } from '../components/common.jsx';
import Icon from '../components/Icon.jsx';
import { useFetch } from '../hooks.js';
import { useToast } from '../state/ToastContext.jsx';
import { StatTile } from './ui.jsx';

/**
 * Import hundreds or thousands of songs from a folder on the server: copy them into
 * ~/apps/Darwish_Music_Studio/data/import (any folder structure), scan, then start.
 */
export default function ServerImport() {
  const toast = useToast();
  const lookups = useFetch('/api/admin/lookups');
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState(null);
  const [opts, setOpts] = useState({
    categoryId: '',
    stationId: '',
    rightsType: 'pending',
    rightsSource: '',
    createMissing: true,
    publish: false,
    moveFiles: true,
    fetchArt: true,
  });
  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const doScan = useCallback(async () => {
    setScanning(true);
    try {
      setScan(await api.get('/api/admin/import/scan'));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setScanning(false);
    }
  }, [toast]);

  const loadStatus = useCallback(() => api.get('/api/admin/import/status').then(setStatus).catch(() => {}), []);

  useEffect(() => {
    doScan();
    loadStatus();
  }, [doScan, loadStatus]);

  // Poll while an import runs.
  useEffect(() => {
    if (!status?.running) return undefined;
    const t = setInterval(loadStatus, 2000);
    return () => clearInterval(t);
  }, [status?.running, loadStatus]);

  // Refresh the folder count when an import finishes.
  useEffect(() => {
    if (status && !status.running && status.finishedAt) doScan();
  }, [status?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const body = {
        ...opts,
        categoryId: opts.categoryId || null,
        stationId: opts.stationId || null,
        publish: opts.publish && opts.rightsType !== 'pending',
      };
      setStatus(await api.post('/api/admin/import/start', body));
      toast('الاستيراد بدأ', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const stop = async () => setStatus(await api.post('/api/admin/import/stop'));

  if (!lookups.data || !status) return <Loading />;
  const L = lookups.data;
  const pct = status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <div className="admin-page">
      <h1>استيراد جماعي من السيرفر</h1>
      <p className="muted">
        الطريقة الأسهل لمئات أو آلاف الأغاني: انسخ الأغاني (بأي ترتيب فولدرات) في الفولدر ده على السيرفر، وبعدين دوس "ابدأ
        الاستيراد". السيرفر بيكمل لوحده حتى لو قفلت الصفحة.
      </p>
      <div className="card-box">
        <div className="import-path">
          <Icon name="library" />
          <code dir="ltr">~/apps/Darwish_Music_Studio/data/import</code>
        </div>
        <p className="muted small">
          ترتيب الفولدرات مقترح (مش إجباري): <code dir="ltr">أغاني الأفلام / اسم الفيلم / الأغنية.mp3</code> و{' '}
          <code dir="ltr">أنمي / كابتن ماجد / الشارة.mp3</code>. الفولدر الأول بيحدد التصنيف، والفولدر اللي فيه الأغنية بيبقى
          العمل، وصورة <code>cover.jpg</code> أو <code>poster.jpg</code> جوه فولدر العمل بتبقى غلافه.
        </p>
        <p className="muted small">
          تقدر تنسخ الأغاني للسيرفر بـ WinSCP أو FileZilla (SFTP على <code dir="ltr">192.168.1.116</code> باليوزر <code>mk</code>)،
          أو اطلب مني أنقلها من جهازك.
        </p>
      </div>

      {scanning && !scan ? <Loading /> : null}
      {scan ? (
        <>
          <div className="stat-row">
            <StatTile label="أغنية في فولدر الاستيراد" value={scan.files} />
            <StatTile label="الحجم" value={formatBytes(scan.bytes)} />
            <StatTile label="فولدرات فيها صورة غلاف" value={scan.foldersWithCover} />
          </div>
          {scan.topFolders.length ? (
            <div className="chips" style={{ marginBottom: 12 }}>
              {scan.topFolders.map((f) => (
                <span key={f.name} className="chip">
                  {f.name} <small className="muted">({f.files})</small>
                </span>
              ))}
            </div>
          ) : null}
          <button type="button" className="btn btn-ghost btn-small" onClick={doScan} disabled={scanning}>
            {scanning ? 'بيدوّر...' : 'تحديث'}
          </button>
        </>
      ) : null}

      <div className="card-box" style={{ marginTop: 16 }}>
        <h3>الإعدادات</h3>
        <div className="form-grid">
          <label>
            التصنيف
            <select className="input" value={opts.categoryId} onChange={set('categoryId')}>
              <option value="">تلقائي (من الفولدر والبيانات)</option>
              {L.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ضيفها لمحطة
            <select className="input" value={opts.stationId} onChange={set('stationId')}>
              <option value="">—</option>
              {L.stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            حالة الحقوق
            <select className="input" value={opts.rightsType} onChange={set('rightsType')}>
              <option value="pending">قيد المراجعة (مش هتتنشر)</option>
              <option value="original">عمل أصلي</option>
              <option value="licensed">مرخّص</option>
            </select>
          </label>
          <label>
            مصدر الحقوق / الترخيص
            <input className="input" value={opts.rightsSource} onChange={set('rightsSource')} />
          </label>
        </div>
        <div className="check-row">
          <label className="check">
            <input type="checkbox" checked={opts.createMissing} onChange={set('createMissing')} /> اعمل تصنيف جديد من اسم الفولدر
            الرئيسي لو مش موجود
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.publish} onChange={set('publish')} disabled={opts.rightsType === 'pending'} /> انشرها
            تلقائي أول ما تجهز
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.fetchArt} onChange={set('fetchArt')} /> بعد الاستيراد دوّر على صور الفنانين
            والبوسترات الناقصة من الإنترنت
          </label>
          <label className="check">
            <input type="checkbox" checked={opts.moveFiles} onChange={set('moveFiles')} /> شيل الملفات من فولدر الاستيراد بعد ما
            تتضاف (عشان ما تاخدش مساحة مرتين)
          </label>
        </div>
        <div className="page-header-actions">
          {status.running ? (
            <button type="button" className="btn btn-danger" onClick={stop}>
              إيقاف الاستيراد
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={start} disabled={!scan?.files}>
              <Icon name="upload" /> ابدأ الاستيراد ({scan?.files || 0} أغنية)
            </button>
          )}
        </div>
      </div>

      {status.startedAt ? (
        <div className="card-box bulk-progress">
          <div className="bulk-progress-head">
            <b>
              {status.running ? 'شغال...' : 'خلص'} {status.done} / {status.total}
            </b>
            <span className="muted small">
              اتضاف {status.imported} · مكرر {status.duplicates} · فشل {status.failed}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          {status.current ? (
            <p className="muted small" dir="auto">
              دلوقتي: {status.current}
            </p>
          ) : null}
          <p className="muted small">
            بعد الاستيراد، الأغاني بتتحول لنفس مستوى الصوت على السيرفر (أغنيتين في نفس الوقت). تابع "في الطابور" في صفحة الأغاني.
          </p>
          {status.recent.length ? (
            <ul className="upload-results">
              {[...status.recent].reverse().map((r, i) => (
                <li key={`${r.trackId}-${i}`} className="ok">
                  <span className="mark">✓</span>
                  <span className="grow">
                    <b>{r.title}</b>
                    <small className="muted"> · {[r.category, r.work, r.artist].filter(Boolean).join(' · ') || 'من غير تصنيف'}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {status.errors.length ? (
            <>
              <h4 className="sub-head">ملفات فشلت</h4>
              <ul className="upload-results">
                {status.errors.map((e, i) => (
                  <li key={i} className="bad">
                    <span className="mark">✗</span>
                    <span className="grow" dir="auto">
                      <b>{e.file}</b> <small className="muted">· {e.error}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
