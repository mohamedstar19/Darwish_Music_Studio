import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { uploadWithProgress } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useAdminBase } from './base.js';

const AUDIO = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|webm|mp4)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const COVER_NAMES = ['cover', 'folder', 'front', 'albumart', 'album', 'poster', 'artwork', 'غلاف', 'صورة', 'صوره', 'بوستر'];
const PARALLEL = 3;

const dirOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');

/** Read files and folders dropped on the page (folders are walked recursively). */
async function filesFromDrop(dataTransfer) {
  const out = [];
  const readEntry = async (entry, prefix) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, relPath: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await readEntry(e, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  const entries = [...dataTransfer.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dataTransfer.files].map((file) => ({ file, relPath: file.name }));
  for (const e of entries) await readEntry(e, '');
  return out;
}

/** Turn picked files into upload jobs: audio only, folder paths kept, one cover per folder. */
function buildJobs(picked) {
  // Drop the chosen root folder's own name ("My Music/أفلام/x.mp3" → "أفلام/x.mp3").
  const firsts = new Set(picked.map((p) => (p.relPath.includes('/') ? p.relPath.split('/')[0] : '')));
  const strip = firsts.size === 1 && [...firsts][0] && picked.every((p) => p.relPath.includes('/'));
  const items = picked.map((p) => ({ ...p, relPath: strip ? p.relPath.slice(p.relPath.indexOf('/') + 1) : p.relPath }));

  const imagesByDir = new Map();
  for (const it of items) {
    if (!IMAGE.test(it.file.name)) continue;
    const d = dirOf(it.relPath);
    if (!imagesByDir.has(d)) imagesByDir.set(d, []);
    imagesByDir.get(d).push(it.file);
  }
  const coverFor = (d) => {
    const list = imagesByDir.get(d) || [];
    for (const want of COVER_NAMES) {
      const hit = list.find((f) => f.name.toLowerCase().includes(want));
      if (hit) return hit;
    }
    return list.length === 1 ? list[0] : null;
  };

  const coverSent = new Set();
  const jobs = [];
  for (const it of items) {
    if (!AUDIO.test(it.file.name)) continue;
    const d = dirOf(it.relPath);
    let cover = null;
    if (!coverSent.has(d)) {
      cover = coverFor(d);
      coverSent.add(d);
    }
    jobs.push({ id: `${it.relPath}-${it.file.size}`, file: it.file, relPath: it.relPath, cover, status: 'waiting' });
  }
  return jobs;
}

export default function BulkUpload({ lookups, onUploaded }) {
  const base = useAdminBase();
  const [opts, setOpts] = useState({
    categoryId: 'auto',
    workId: 'auto',
    stationId: '',
    artistName: '',
    rightsType: 'pending',
    rightsSource: '',
    createMissing: true,
    publish: false,
  });
  const [stats, setStats] = useState({ total: 0, done: 0, imported: 0, duplicates: 0, failed: 0 });
  const [recent, setRecent] = useState([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState(false);
  const queueRef = useRef([]);
  const failedRef = useRef([]);
  const pausedRef = useRef(false);
  const workersRef = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const filesInput = useRef(null);
  const folderInput = useRef(null);

  const set = (k) => (e) => setOpts((o) => ({ ...o, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  // Warn before closing the page in the middle of an upload.
  useEffect(() => {
    if (!running) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const uploadOne = async (job) => {
    const o = optsRef.current;
    const fd = new FormData();
    fd.append('smart', '1');
    fd.append('relPath', job.relPath);
    fd.append('createMissing', o.createMissing ? '1' : '0');
    fd.append('publish', o.publish ? '1' : '0');
    if (o.categoryId !== 'auto') fd.append('categoryId', o.categoryId);
    if (o.workId !== 'auto') fd.append('workId', o.workId);
    if (o.stationId) fd.append('stationId', o.stationId);
    if (o.artistName) fd.append('artistName', o.artistName);
    fd.append('rightsType', o.rightsType);
    if (o.rightsSource) fd.append('rightsSource', o.rightsSource);
    if (job.cover) fd.append('cover', job.cover, job.cover.name);
    fd.append('file', job.file, job.file.name);
    return uploadWithProgress('/api/admin/tracks/upload', fd);
  };

  const worker = async () => {
    workersRef.current += 1;
    while (queueRef.current.length && !pausedRef.current) {
      const job = queueRef.current.shift();
      try {
        const r = await uploadOne(job);
        setStats((s) => ({
          ...s,
          done: s.done + 1,
          imported: s.imported + (r.status === 'imported' ? 1 : 0),
          duplicates: s.duplicates + (r.status === 'duplicate' ? 1 : 0),
        }));
        setRecent((list) => [{ key: job.id, ok: true, dup: r.status === 'duplicate', file: job.relPath, ...r }, ...list].slice(0, 40));
      } catch (err) {
        failedRef.current.push(job);
        setStats((s) => ({ ...s, done: s.done + 1, failed: s.failed + 1 }));
        setRecent((list) => [{ key: job.id, ok: false, file: job.relPath, error: err.message }, ...list].slice(0, 40));
      }
    }
    workersRef.current -= 1;
    if (workersRef.current === 0) {
      // Paused with songs still waiting: stay "running" so the resume button stays visible.
      if (!queueRef.current.length) setRunning(false);
      onUploaded();
    }
  };

  const startWorkers = () => {
    setRunning(true);
    const n = Math.min(PARALLEL, queueRef.current.length) - workersRef.current;
    for (let i = 0; i < n; i += 1) void worker();
  };

  const add = (picked) => {
    const jobs = buildJobs(picked);
    if (!jobs.length) return;
    queueRef.current.push(...jobs);
    setStats((s) => ({ ...s, total: s.total + jobs.length }));
    pausedRef.current = false;
    setPaused(false);
    startWorkers();
  };

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (!next) startWorkers();
  };

  const retryFailed = () => {
    const jobs = failedRef.current.splice(0);
    if (!jobs.length) return;
    queueRef.current.push(...jobs);
    setStats((s) => ({ ...s, failed: s.failed - jobs.length, done: s.done - jobs.length }));
    pausedRef.current = false;
    setPaused(false);
    startWorkers();
  };

  const reset = () => {
    if (running) return;
    failedRef.current = [];
    setStats({ total: 0, done: 0, imported: 0, duplicates: 0, failed: 0 });
    setRecent([]);
  };

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="card-box upload-panel">
      <h3>رفع أغاني (واحدة أو آلاف)</h3>
      <p className="muted small">
        اختار ملفات أو <b>فولدر كامل</b>. النظام هيقرا اسم الأغنية والفنان والسنة من الملف، ويحط كل أغنية في التصنيف المناسب
        من أسماء الفولدرات أو نوع الأغنية (مثلًا فولدر "أفلام" ← أغاني الأفلام)، ويعمل العمل (الفيلم/الكرتون) من اسم
        الفولدر أو الألبوم، وياخد الصورة من جوه الملف أو من صورة <code>cover.jpg</code> اللي جنب الأغاني. الأغنية اللي اترفعت قبل
        كده بتتجاهل.
      </p>

      <div className="form-grid">
        <label>
          التصنيف
          <select className="input" value={opts.categoryId} onChange={set('categoryId')}>
            <option value="auto">تلقائي (من الفولدر والبيانات)</option>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          العمل (فيلم / كرتون)
          <select className="input" value={opts.workId} onChange={set('workId')}>
            <option value="auto">تلقائي (من الفولدر أو الألبوم)</option>
            {lookups.works.map((w) => (
              <option key={w.id} value={w.id}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          ضيفها لمحطة
          <select className="input" value={opts.stationId} onChange={set('stationId')}>
            <option value="">—</option>
            {lookups.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الفنان (لو الملف مفيهوش)
          <input className="input" value={opts.artistName} onChange={set('artistName')} list="artists-list" />
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
          <input className="input" value={opts.rightsSource} onChange={set('rightsSource')} placeholder="مثلاً: عقد رقم ..." />
        </label>
      </div>
      <datalist id="artists-list">
        {lookups.artists.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
      <div className="check-row">
        <label className="check">
          <input type="checkbox" checked={opts.createMissing} onChange={set('createMissing')} /> اعمل تصنيف جديد من اسم الفولدر
          الرئيسي لو مش موجود
        </label>
        <label className="check">
          <input type="checkbox" checked={opts.publish} onChange={set('publish')} disabled={opts.rightsType === 'pending'} /> انشرها
          تلقائي أول ما تجهز
          {opts.rightsType === 'pending' ? <small className="muted"> (محتاج حقوق أصلي أو مرخّص)</small> : null}
        </label>
      </div>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDrag(false);
          add(await filesFromDrop(e.dataTransfer));
        }}
      >
        <Icon name="upload" size={32} />
        <b>اسحب ملفات أو فولدرات هنا</b>
        <div className="page-header-actions" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn-primary" onClick={() => folderInput.current?.click()}>
            اختار فولدر كامل
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => filesInput.current?.click()}>
            اختار ملفات
          </button>
        </div>
        <span className="muted small">
          MP3, M4A, WAV, FLAC, OGG, OPUS · لأكتر من 1000 أغنية الأسهل{' '}
          <Link to={`${base}/import`}>الاستيراد من فولدر على السيرفر</Link>
        </span>
        <input
          ref={filesInput}
          type="file"
          accept="audio/*,image/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.aac"
          multiple
          hidden
          onChange={(e) => {
            add([...e.target.files].map((file) => ({ file, relPath: file.name })));
            e.target.value = '';
          }}
        />
        <input
          ref={folderInput}
          type="file"
          webkitdirectory=""
          directory=""
          multiple
          hidden
          onChange={(e) => {
            add([...e.target.files].map((file) => ({ file, relPath: file.webkitRelativePath || file.name })));
            e.target.value = '';
          }}
        />
      </div>

      {stats.total ? (
        <div className="bulk-progress">
          <div className="bulk-progress-head">
            <b>
              {stats.done} / {stats.total}
            </b>
            <span className="muted small">
              اتضاف {stats.imported} · مكرر {stats.duplicates} · فشل {stats.failed}
            </span>
            <span className="grow" />
            {running ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={togglePause}>
                {paused ? 'كمّل' : 'إيقاف مؤقت'}
              </button>
            ) : null}
            {stats.failed && !running ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={retryFailed}>
                أعد المحاولة للي فشل
              </button>
            ) : null}
            {!running ? (
              <button type="button" className="btn btn-ghost btn-small" onClick={reset}>
                مسح
              </button>
            ) : null}
          </div>
          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>
          {running ? <p className="muted small">خلي الصفحة مفتوحة لحد ما الرفع يخلص. الأغاني بتتجهز على السيرفر بعدها.</p> : null}
          <ul className="upload-results">
            {recent.map((r) => (
              <li key={r.key} className={r.ok ? (r.dup ? 'dup' : 'ok') : 'bad'}>
                <span className="mark">{r.ok ? (r.dup ? '≡' : '✓') : '✗'}</span>
                <span className="grow">
                  <b>{r.ok ? r.title : r.file}</b>
                  <small className="muted">
                    {r.ok
                      ? r.dup
                        ? ' · موجودة قبل كده'
                        : ` · ${[r.category, r.work, r.artist].filter(Boolean).join(' · ') || 'من غير تصنيف'}`
                      : ` · ${r.error}`}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
