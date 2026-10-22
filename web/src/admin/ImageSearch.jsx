import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Loading, Modal } from '../components/common.jsx';
import { useToast } from '../state/ToastContext.jsx';

/**
 * Search the internet for a picture (artist photo, song cover or film/anime poster)
 * and apply the one you pick. type: 'artist' | 'work' | 'track'.
 */
export default function ImageSearch({ type, id, initialQuery, onApplied, onClose }) {
  const toast = useToast();
  const [q, setQ] = useState(initialQuery || '');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(null);

  const search = async (text) => {
    setResults(null);
    try {
      const params = new URLSearchParams({ type, id: String(id) });
      if (text && text !== initialQuery) params.set('q', text);
      setResults(await api.get(`/api/admin/artwork/search?${params}`));
    } catch (err) {
      toast(err.message, 'error');
      setResults([]);
    }
  };

  useEffect(() => {
    search(initialQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (c) => {
    setBusy(c.url);
    try {
      const r = await api.post('/api/admin/artwork/apply', { type, id, url: c.url });
      toast('الصورة اتحطت', 'success');
      onApplied?.(r.image);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const title = { artist: 'صورة الفنان من الإنترنت', work: 'بوستر العمل من الإنترنت', track: 'غلاف الأغنية من الإنترنت' }[type];

  return (
    <Modal title={title} onClose={onClose} wide>
      <form
        className="row-form"
        onSubmit={(e) => {
          e.preventDefault();
          search(q);
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اكتب الاسم بالعربي أو بالإنجليزي" />
        <button className="btn btn-primary">دوّر</button>
      </form>
      <p className="muted small">
        النتايج من Deezer و iTunes و ويكيبيديا و MyAnimeList. اختار الصورة الصح. لو مفيش نتيجة مناسبة جرّب الاسم بالإنجليزي.
      </p>
      {!results ? <Loading label="بيدوّر..." /> : null}
      {results && !results.length ? <p className="muted">ملقيناش صور. جرّب اسم تاني.</p> : null}
      {results?.length ? (
        <div className="image-results">
          {results.map((c) => (
            <button key={c.url} type="button" className="image-result" onClick={() => apply(c)} disabled={!!busy}>
              <img src={c.thumb || c.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="image-result-label">{c.label}</span>
              <small className="muted">
                {c.source}
                {c.score >= 0.8 ? ' · مطابق' : ''}
              </small>
              {busy === c.url ? <span className="image-result-busy">بيحمّل...</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
