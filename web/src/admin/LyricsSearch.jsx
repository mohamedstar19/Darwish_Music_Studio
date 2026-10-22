import { useEffect, useState } from 'react';
import { api, formatTime } from '../api.js';
import { Loading, Modal } from '../components/common.jsx';
import { useToast } from '../state/ToastContext.jsx';

/** Find a song's lyrics online (LRCLIB) and save the one you pick. */
export default function LyricsSearch({ track, onApplied, onClose }) {
  const toast = useToast();
  const [title, setTitle] = useState(track.title || '');
  const [artist, setArtist] = useState(track.artistName || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(null);

  const search = async (custom) => {
    setResults(null);
    try {
      const params = new URLSearchParams({ id: String(track.id) });
      if (custom) {
        params.set('q', title);
        if (artist) params.set('artist', artist);
      }
      setResults(await api.get(`/api/admin/lyrics/search?${params}`));
    } catch (err) {
      toast(err.message, 'error');
      setResults([]);
    }
  };

  useEffect(() => {
    search(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (c) => {
    setBusy(c.id);
    try {
      const updated = await api.post('/api/admin/lyrics/apply', { id: track.id, lrclibId: c.id });
      toast(c.synced ? 'الكلمات اتحفظت ومتزامنة مع الأغنية' : 'الكلمات اتحفظت', 'success');
      onApplied(updated);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="كلمات الأغنية من الإنترنت" onClose={onClose} wide>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          search(true);
        }}
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="اسم الأغنية" />
        <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="الفنان" />
        <button className="btn btn-primary">دوّر</button>
      </form>
      <p className="muted small">
        من LRCLIB (مكتبة كلمات مفتوحة). "متزامنة" يعني كل سطر بيظهر في وقته مع الأغنية في المشغل. اتأكد إن المدة قريبة من مدة
        أغنيتك ({formatTime(track.duration)}).
      </p>
      {!results ? <Loading label="بيدوّر..." /> : null}
      {results && !results.length ? <p className="muted">ملقيناش كلمات. جرّب الاسم بطريقة تانية أو بالإنجليزي.</p> : null}
      <div className="lyrics-results">
        {results?.map((c) => (
          <button key={c.id} type="button" className="lyrics-result" onClick={() => apply(c)} disabled={!!busy || c.instrumental}>
            <div className="lyrics-result-head">
              <b>{c.title}</b>
              <span className="muted small">
                {c.artist}
                {c.album ? ` · ${c.album}` : ''} · {formatTime(c.duration)}
              </span>
              <span className="grow" />
              {c.synced ? <span className="status status-ready">متزامنة</span> : null}
              {c.instrumental ? <span className="status">موسيقى بدون كلمات</span> : null}
              {c.score >= 0.85 && c.durationOk ? <span className="status status-approved">مطابقة</span> : null}
            </div>
            {c.preview ? <pre className="lyrics-preview">{c.preview}</pre> : null}
            {busy === c.id ? <span className="muted small">بيحفظ...</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  );
}
