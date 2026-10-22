import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useToast } from '../state/ToastContext.jsx';
import { useAdminBase } from './base.js';
import { Candidate } from './IdentifySong.jsx';

/**
 * Library health card: recognise songs by their sound (AcoustID) or a cleaned-up name,
 * fix the sure ones automatically, and list the rest for a person to accept.
 */
export default function NameFixer({ counts, onChanged }) {
  const base = useAdminBase();
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [key, setKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [job, setJob] = useState(null);
  const [review, setReview] = useState([]);
  const [busy, setBusy] = useState(null);

  const loadReview = useCallback(() => api.get('/api/admin/identify/review').then(setReview).catch(() => {}), []);
  const loadJob = useCallback(() => api.get('/api/admin/identify/status').then(setJob).catch(() => {}), []);

  useEffect(() => {
    api.get('/api/admin/identify/settings').then(setSettings).catch(() => {});
    loadJob();
    loadReview();
  }, [loadJob, loadReview]);

  // Follow the job while it runs; refresh the lists when it ends.
  useEffect(() => {
    if (!job?.running) return undefined;
    const t = setInterval(async () => {
      const s = await api.get('/api/admin/identify/status').catch(() => null);
      if (!s) return;
      setJob(s);
      if (!s.running) {
        loadReview();
        onChanged();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [job?.running, loadReview, onChanged]);

  const saveKey = async (e) => {
    e.preventDefault();
    setSavingKey(true);
    try {
      const r = await api.put('/api/admin/identify/settings', { acoustidKey: key.trim() });
      setSettings((s) => ({ ...s, keySet: r.keySet }));
      setKey('');
      toast(r.keySet ? 'المفتاح اتحفظ. التعرف من الصوت شغال' : 'المفتاح اتشال', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const start = async (scope) => {
    try {
      setJob(await api.post('/api/admin/identify/start', { scope }));
      toast('بدأ التعرف على الأغاني', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const recheck = async () => {
    try {
      const r = await api.post('/api/admin/identify/reset');
      toast(`${r.reset} أغنية هتتراجع تاني`, 'success');
      loadReview();
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const accept = async (item, c) => {
    setBusy(item.id);
    try {
      await api.post('/api/admin/identify/apply', { id: item.id, title: c.title, artist: c.artist, year: item.year ? null : c.year });
      setReview((list) => list.filter((x) => x.id !== item.id));
      toast('الاسم اتصلّح', 'success');
      onChanged();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async (item) => {
    setBusy(item.id);
    try {
      await api.post('/api/admin/identify/dismiss', { id: item.id });
      setReview((list) => list.filter((x) => x.id !== item.id));
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const running = job?.running;

  return (
    <div className="card-box art-box">
      <div className="art-head">
        <Icon name="music" size={22} />
        <div className="grow">
          <b>صلّح أسماء الأغاني الغلط</b>
          <p className="muted small">
            زي Shazam: النظام بيسمع كل أغنية اسمها شكله غلط (فيه اسم موقع، أو "Track 01"، أو من غير فنان) ويعرف هي إيه من صوتها،
            وكمان بيشيل الكلام الزيادة من الاسم ويدوّر بيه. اللي متأكد منه بيصلّحه لوحده، والباقي بيظهرلك تحت تختار منه.
          </p>
          <p className="small">
            <Link to={`${base}/tracks?missing=name`}>{counts.bad_name} أغنية اسمها شكله غلط</Link>
            {' · '}
            {counts.bad_name_unchecked} لسه متراجعتش
          </p>
        </div>
        {running ? (
          <button type="button" className="btn btn-danger btn-small" onClick={() => api.post('/api/admin/identify/stop').then(setJob)}>
            إيقاف
          </button>
        ) : (
          <div className="stack-btns">
            <button type="button" className="btn btn-primary" onClick={() => start('suspicious')} disabled={!counts.bad_name_unchecked}>
              صلّح الأسماء الغلط
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => start('all')}>
              راجع كل الأغاني
            </button>
          </div>
        )}
      </div>

      {settings && !settings.keySet ? (
        <div className="note-box small">
          <b>التعرف من الصوت محتاج مفتاح مجاني من AcoustID</b> (من غيره النظام بيصلّح بالاسم بس):
          <ol className="id-steps">
            <li>
              افتح{' '}
              <a href="https://acoustid.org/new-application" target="_blank" rel="noreferrer">
                acoustid.org/new-application
              </a>{' '}
              وادخل بنفس حسابك.
            </li>
            <li>اكتب اسم التطبيق Darwish Music Studio والنسخة 1.0 واضغط Register.</li>
            <li>
              انسخ <b>Application API key</b> وحطه هنا. (مفتاح صفحة حسابك "User API key" مش هيشتغل.)
            </li>
          </ol>
          <form className="id-key-form" onSubmit={saveKey}>
            <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Application API key" required />
            <button className="btn btn-primary btn-small" disabled={savingKey}>
              {savingKey ? 'بيتأكد...' : 'احفظ المفتاح'}
            </button>
          </form>
        </div>
      ) : null}
      {settings?.keySet ? (
        <p className="muted small">
          ✓ التعرف من الصوت شغال (AcoustID)
          {settings.fpcalc ? '' : ' · أداة البصمة مش موجودة على السيرفر'}
          {!settings.keyFromEnv ? (
            <>
              {' · '}
              <button type="button" className="link-btn" onClick={() => api.put('/api/admin/identify/settings', { acoustidKey: '' }).then((r) => setSettings((s) => ({ ...s, keySet: r.keySet })))}>
                غيّر المفتاح
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {job?.startedAt ? (
        <div className="bulk-progress">
          <div className="bulk-progress-head">
            <b>
              {running ? 'شغال...' : 'خلص'} {job.done} / {job.total}
            </b>
            <span className="muted small">
              اتصلّح {job.applied} · محتاج رأيك {job.suggested} · ملقاش {job.none}
              {job.current ? ` · دلوقتي: ${job.current}` : ''}
            </span>
          </div>
          <div className="bar">
            <i style={{ width: `${job.total ? Math.round((job.done / job.total) * 100) : 0}%` }} />
          </div>
          {job.error ? <p className="form-error small">{job.error}</p> : null}
          {job.recent.length ? (
            <ul className="upload-results">
              {[...job.recent].reverse().map((r) => (
                <li key={r.id} className="ok">
                  <span className="mark">✓</span>
                  <span className="grow">
                    <small className="muted">{r.from}</small> ← <b>{r.to}</b>
                    <small className="muted"> · {r.source === 'AcoustID' ? 'من الصوت' : r.source}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {review.length ? (
        <div className="id-review">
          <div className="id-review-head">
            <b>محتاج رأيك ({review.length})</b>
            <span className="muted small">اختار الاسم الصح، أو "سيبها" لو الاسم الحالي صح.</span>
          </div>
          {review.map((item) => (
            <div key={item.id} className="id-review-item">
              <div className="id-review-head">
                <span className="grow">
                  الحالي: <b>{item.title}</b>
                  {item.artist ? <span className="muted"> — {item.artist}</span> : null}
                </span>
                <Link to={`${base}/tracks?edit=${item.id}`} className="btn btn-ghost btn-small">
                  افتحها
                </Link>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => dismiss(item)} disabled={busy === item.id}>
                  سيبها
                </button>
              </div>
              <div className="id-list">
                {item.candidates.map((c, i) => (
                  <Candidate key={i} c={c} busy={busy === item.id} onPick={(cand) => accept(item, cand)} pickLabel="ده الصح" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!running && counts.bad_name && !counts.bad_name_unchecked ? (
        <p className="muted small">
          كل الأغاني اللي اسمها شكله غلط اتراجعت.{' '}
          <button type="button" className="link-btn" onClick={recheck}>
            راجعها تاني
          </button>{' '}
          (مفيد بعد ما تحط مفتاح AcoustID).
        </p>
      ) : null}
    </div>
  );
}
